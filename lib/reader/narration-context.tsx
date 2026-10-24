import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { useLibrary } from "./library-context";
import { TIMER_PRESETS_MINUTES, profileForSegment, wordRangeAt, type SpeechSegment, type TimerPreset } from "./speech-queue";

const SETTINGS_KEY = "leitorplay.narration-settings.v1";
const PLAYING_CATEGORY = "leitorplay-narration-playing";
const PAUSED_CATEGORY = "leitorplay-narration-paused";
type SpeechBoundaryEvent = Parameters<NonNullable<Speech.SpeechOptions["onBoundary"]>>[0];

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

type NarrationStatus = "idle" | "playing" | "paused" | "stopped" | "finished" | "error";
type NarrationSettings = { voiceId: string | null; rate: number; pitch: number; timerMinutes: TimerPreset; expressive: boolean };
type PlaybackState = {
  status: NarrationStatus;
  bookId: string | null;
  title: string;
  segmentIndex: number;
  totalSegments: number;
  secondsLeft: number;
  error: string;
  pausePending: boolean;
  stopPending: boolean;
  currentCharStart: number;
  currentCharLength: number;
};
type QueueSession = {
  bookId: string;
  title: string;
  segments: SpeechSegment[];
  index: number;
  offset: number;
  pauseRequested: boolean;
  stopRequested: boolean;
  stopReason: string;
  notStarted: boolean;
  lastBoundaryStart: number;
  boundaryCount: number;
  lastPersistAt: number;
};
type NarrationContextValue = {
  status: NarrationStatus;
  bookId: string | null;
  title: string;
  segmentIndex: number;
  totalSegments: number;
  secondsLeft: number;
  error: string;
  pausePending: boolean;
  stopPending: boolean;
  currentCharStart: number;
  currentCharLength: number;
  voices: Speech.Voice[];
  voiceId: string | null;
  rate: number;
  pitch: number;
  timerMinutes: TimerPreset;
  expressive: boolean;
  start: (bookId: string, title: string, segments: SpeechSegment[], startAt?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  previousSegment: () => void;
  nextSegment: () => void;
  setVoice: (voiceId: string | null) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setTimer: (minutes: TimerPreset) => void;
  setExpressive: (enabled: boolean) => void;
};

const DEFAULT_SETTINGS: NarrationSettings = { voiceId: null, rate: 0.92, pitch: 1, timerMinutes: null, expressive: true };
const IDLE: PlaybackState = { status: "idle", bookId: null, title: "", segmentIndex: 0, totalSegments: 0, secondsLeft: 0, error: "", pausePending: false, stopPending: false, currentCharStart: 0, currentCharLength: 0 };
const NarrationContext = createContext<NarrationContextValue | null>(null);

function safeStop() {
  void Speech.stop().catch(() => undefined);
}

function allowedTimer(value: unknown): TimerPreset {
  return typeof value === "number" && TIMER_PRESETS_MINUTES.includes(value as (typeof TIMER_PRESETS_MINUTES)[number])
    ? value as TimerPreset
    : null;
}

export function NarrationProvider({ children }: { children: React.ReactNode }) {
  const { bookById, updateNarrationPosition, recordReadingSeconds } = useLibrary();
  const [playback, setPlayback] = useState<PlaybackState>(IDLE);
  const [settings, setSettings] = useState<NarrationSettings>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const voicesRef = useRef(voices);
  const playbackRef = useRef(playback);
  const queueRef = useRef<QueueSession | null>(null);
  const settingsRef = useRef(settings);
  const generationRef = useRef(0);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerLeftRef = useRef(0);
  const notificationIdRef = useRef<string | null>(null);
  const notificationPermissionRef = useRef<boolean | null>(null);
  const lastBoundaryPaintRef = useRef(0);
  playbackRef.current = playback;
  settingsRef.current = settings;
  voicesRef.current = voices;

  const persistSettings = useCallback((patch: Partial<NarrationSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const finalizeAtSafeBoundary = useCallback((queue: QueueSession, offset: number, error = "") => {
    queue.offset = Math.max(0, Math.min(queue.segments[queue.index]?.text.length ?? 0, offset));
    queue.stopRequested = false;
    queue.pauseRequested = false;
    void updateNarrationPosition(queue.bookId, queue.index, queue.offset);
    generationRef.current += 1;
    safeStop();
    queueRef.current = null;
    if (delayRef.current !== null) clearTimeout(delayRef.current);
    delayRef.current = null;
    stopTimer();
    timerLeftRef.current = 0;
    setPlayback({
      status: "stopped", bookId: queue.bookId, title: queue.title, segmentIndex: queue.index,
      totalSegments: queue.segments.length, secondsLeft: 0, error, pausePending: false,
      stopPending: false, currentCharStart: queue.offset, currentCharLength: 0,
    });
  }, [stopTimer, updateNarrationPosition]);

  const getSafeOffset = useCallback((queue: QueueSession) => (
    queue.boundaryCount > 0 ? queue.lastBoundaryStart : queue.offset
  ), []);

  const startTimer = useCallback(() => {
    stopTimer();
    if (!settingsRef.current.timerMinutes || timerLeftRef.current <= 0) return;
    timerRef.current = setInterval(() => {
      timerLeftRef.current = Math.max(0, timerLeftRef.current - 1);
      setPlayback((current) => ({ ...current, secondsLeft: timerLeftRef.current }));
      if (timerLeftRef.current === 0) {
        stopTimer();
        const queue = queueRef.current;
        if (queue) {
          queue.stopRequested = true;
          queue.stopReason = "Timer de leitura concluído.";
          queue.pauseRequested = false;
          if (delayRef.current !== null) {
            clearTimeout(delayRef.current);
            delayRef.current = null;
            finalizeAtSafeBoundary(queue, 0, queue.stopReason);
          } else {
            setPlayback((current) => ({ ...current, secondsLeft: 0, pausePending: false, stopPending: true }));
          }
          return;
        }
        setPlayback((current) => ({ ...current, status: "stopped", secondsLeft: 0, pausePending: false, stopPending: false, error: "Timer de leitura concluído." }));
      }
    }, 1000);
  }, [finalizeAtSafeBoundary, stopTimer]);

  const speakCurrent = useCallback((generation: number) => {
    const queue = queueRef.current;
    if (!queue || queue.index >= queue.segments.length || generation !== generationRef.current) return;
    const segment = queue.segments[queue.index];
    queue.notStarted = false;
    const selectedVoice = voicesRef.current.find((voice) => voice.identifier === settingsRef.current.voiceId);
    const profile = profileForSegment(segment, { rate: settingsRef.current.rate, pitch: settingsRef.current.pitch }, settingsRef.current.expressive);
    queue.lastBoundaryStart = queue.offset;
    queue.boundaryCount = 0;
    lastBoundaryPaintRef.current = 0;
    setPlayback((current) => ({
      ...current,
      status: "playing",
      bookId: queue.bookId,
      title: queue.title,
      segmentIndex: queue.index,
      totalSegments: queue.segments.length,
      currentCharStart: queue.offset,
      currentCharLength: 0,
      pausePending: false,
      stopPending: false,
      error: "",
    }));
    const spokenFrom = queue.offset;
    try {
      Speech.speak(segment.text.slice(spokenFrom), {
        voice: selectedVoice?.identifier,
        language: selectedVoice?.language || "pt-BR",
        rate: profile.rate,
        pitch: profile.pitch,
        volume: profile.volume,
        onBoundary: (event: SpeechBoundaryEvent) => {
          if (generation !== generationRef.current) return;
          const active = queueRef.current;
          if (!active || active.index !== queue.index) return;
          const suffix = segment.text.slice(spokenFrom);
          const charIndex = typeof event.charIndex === "number" ? event.charIndex : 0;
          const charLength = "charLength" in event && typeof event.charLength === "number" ? event.charLength : 0;
          const relativeRange = wordRangeAt(suffix, charIndex, charLength);
          const absoluteStart = Math.max(spokenFrom, Math.min(segment.text.length, spokenFrom + relativeRange.start));
          const absoluteLength = Math.max(0, Math.min(segment.text.length - absoluteStart, relativeRange.length));
          active.boundaryCount += 1;
          active.lastBoundaryStart = absoluteStart;

          if (active.stopRequested) {
            finalizeAtSafeBoundary(active, absoluteStart, active.stopReason);
            return;
          }
          if (active.pauseRequested) {
            active.pauseRequested = false;
            active.offset = absoluteStart;
            stopTimer();
            generationRef.current += 1;
            safeStop();
            void updateNarrationPosition(active.bookId, active.index, active.offset);
            setPlayback((current) => ({ ...current, status: "paused", pausePending: false, currentCharStart: absoluteStart, currentCharLength: absoluteLength }));
            return;
          }

          const now = Date.now();
          if (now - lastBoundaryPaintRef.current >= 150) {
            lastBoundaryPaintRef.current = now;
            setPlayback((current) => ({ ...current, currentCharStart: absoluteStart, currentCharLength: absoluteLength }));
          }
          if (now - active.lastPersistAt >= 1000) {
            active.lastPersistAt = now;
            void updateNarrationPosition(active.bookId, active.index, absoluteStart);
          }
        },
        onDone: () => {
          if (generation !== generationRef.current) return;
          const active = queueRef.current;
          if (!active) return;
          const nextIndex = active.index + 1;
          active.index = nextIndex;
          active.offset = 0;
          active.notStarted = nextIndex < active.segments.length;
          active.lastBoundaryStart = 0;
          active.boundaryCount = 0;
          active.lastPersistAt = Date.now();
          void updateNarrationPosition(active.bookId, nextIndex, 0);

          if (active.stopRequested) {
            if (nextIndex >= active.segments.length) {
              const completedReason = active.stopReason;
              active.stopRequested = false;
              stopTimer();
              timerLeftRef.current = 0;
              setPlayback((current) => ({ ...current, status: "finished", segmentIndex: active.segments.length, secondsLeft: 0, pausePending: false, stopPending: false, error: completedReason, currentCharStart: 0, currentCharLength: 0 }));
              return;
            }
            finalizeAtSafeBoundary(active, 0, active.stopReason);
            return;
          }
          if (active.pauseRequested) {
            active.pauseRequested = false;
            stopTimer();
            setPlayback((current) => ({ ...current, status: "paused", segmentIndex: nextIndex, pausePending: false, currentCharStart: 0, currentCharLength: 0 }));
            return;
          }
          if (nextIndex >= active.segments.length) {
            stopTimer();
            timerLeftRef.current = 0;
            setPlayback((current) => ({ ...current, status: "finished", segmentIndex: active.segments.length, secondsLeft: 0, currentCharStart: 0, currentCharLength: 0 }));
            return;
          }
          setPlayback((current) => ({ ...current, segmentIndex: nextIndex, currentCharStart: 0, currentCharLength: 0 }));
          delayRef.current = setTimeout(() => {
            delayRef.current = null;
            speakCurrent(generation);
          }, segment.pauseAfterMs);
        },
        onError: (error) => {
          if (generation !== generationRef.current) return;
          stopTimer();
          setPlayback((current) => ({ ...current, status: "error", pausePending: false, stopPending: false, error: error.message || "O motor de voz não conseguiu ler este trecho." }));
        },
      });
    } catch (error) {
      if (generation !== generationRef.current) return;
      setPlayback((current) => ({ ...current, status: "error", pausePending: false, stopPending: false, error: error instanceof Error ? error.message : "Falha ao iniciar o motor de voz." }));
    }
  }, [finalizeAtSafeBoundary, stopTimer, updateNarrationPosition]);

  const start = useCallback((bookId: string, title: string, segments: SpeechSegment[], startAt = 0) => {
    if (!segments.length) {
      setPlayback((current) => ({ ...current, status: "error", pausePending: false, stopPending: false, error: "Este arquivo não contém texto para narração." }));
      return;
    }
    const previous = queueRef.current;
    if (previous) void updateNarrationPosition(previous.bookId, previous.index, getSafeOffset(previous));
    generationRef.current += 1;
    if (delayRef.current !== null) clearTimeout(delayRef.current);
    delayRef.current = null;
    stopTimer();
    safeStop();
    const storedBook = bookById(bookId);
    const requestedPosition = storedBook?.spokenPosition ?? startAt;
    const index = requestedPosition >= segments.length ? 0 : Math.max(0, Math.min(Math.floor(requestedPosition), segments.length - 1));
    const offset = Math.max(0, Math.min(segments[index].text.length, Math.floor(storedBook?.spokenOffset ?? 0)));
    queueRef.current = { bookId, title, segments, index, offset, pauseRequested: false, stopRequested: false, stopReason: "", notStarted: false, lastBoundaryStart: offset, boundaryCount: 0, lastPersistAt: Date.now() };
    timerLeftRef.current = settingsRef.current.timerMinutes ? settingsRef.current.timerMinutes * 60 : 0;
    setPlayback({ status: "playing", bookId, title, segmentIndex: index, totalSegments: segments.length, secondsLeft: timerLeftRef.current, error: "", pausePending: false, stopPending: false, currentCharStart: offset, currentCharLength: 0 });
    startTimer();
    speakCurrent(generationRef.current);
  }, [bookById, getSafeOffset, speakCurrent, startTimer, stopTimer, updateNarrationPosition]);

  const stop = useCallback(() => {
    const queue = queueRef.current;
    if (!queue) {
      stopTimer();
      timerLeftRef.current = 0;
      safeStop();
      setPlayback({ ...IDLE, status: "stopped" });
      return;
    }
    if (playbackRef.current.stopPending) return;
    if (playbackRef.current.status === "playing" && delayRef.current === null) {
      queue.stopRequested = true;
      queue.stopReason = "";
      queue.pauseRequested = false;
      setPlayback((current) => ({ ...current, pausePending: false, stopPending: true }));
      return;
    }
    finalizeAtSafeBoundary(queue, delayRef.current === null ? getSafeOffset(queue) : 0);
  }, [finalizeAtSafeBoundary, getSafeOffset, stopTimer]);

  const pause = useCallback(() => {
    const queue = queueRef.current;
    if (!queue || playbackRef.current.status !== "playing" || playbackRef.current.pausePending || playbackRef.current.stopPending) return;
    if (delayRef.current !== null) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
      queue.pauseRequested = false;
      queue.offset = 0;
      stopTimer();
      void updateNarrationPosition(queue.bookId, queue.index, 0);
      setPlayback((current) => ({ ...current, status: "paused", pausePending: false, stopPending: false, currentCharStart: 0, currentCharLength: 0 }));
      return;
    }
    queue.pauseRequested = true;
    setPlayback((current) => ({ ...current, pausePending: true }));
  }, [stopTimer, updateNarrationPosition]);

  const resume = useCallback(() => {
    const queue = queueRef.current;
    if (!queue || playbackRef.current.status !== "paused" || playbackRef.current.stopPending) return;
    generationRef.current += 1;
    queue.pauseRequested = false;
    queue.stopRequested = false;
    queue.stopReason = "";
    timerLeftRef.current = playbackRef.current.secondsLeft || timerLeftRef.current;
    startTimer();
    speakCurrent(generationRef.current);
  }, [speakCurrent, startTimer]);

  const seek = useCallback((direction: -1 | 1) => {
    const queue = queueRef.current;
    const status = playbackRef.current.status;
    if (!queue || (status !== "playing" && status !== "paused") || playbackRef.current.stopPending) return;
    const target = direction < 0
      ? Math.max(0, queue.index - 1)
      : Math.min(queue.segments.length, queue.index + (queue.notStarted ? 0 : 1));
    if (target >= queue.segments.length) {
      queue.index = queue.segments.length;
      queue.offset = 0;
      void updateNarrationPosition(queue.bookId, queue.index, 0);
      generationRef.current += 1;
      safeStop();
      if (delayRef.current !== null) clearTimeout(delayRef.current);
      delayRef.current = null;
      stopTimer();
      timerLeftRef.current = 0;
      setPlayback((current) => ({ ...current, status: "finished", segmentIndex: queue.segments.length, secondsLeft: 0, pausePending: false, stopPending: false, currentCharStart: 0, currentCharLength: 0 }));
      return;
    }
    generationRef.current += 1;
    const generation = generationRef.current;
    if (delayRef.current !== null) clearTimeout(delayRef.current);
    delayRef.current = null;
    safeStop();
    queue.index = target;
    queue.offset = 0;
    queue.pauseRequested = false;
    queue.stopRequested = false;
    queue.stopReason = "";
    queue.lastBoundaryStart = 0;
    queue.boundaryCount = 0;
    queue.lastPersistAt = Date.now();
    void updateNarrationPosition(queue.bookId, target, 0);
    if (status === "playing") {
      speakCurrent(generation);
    } else {
      setPlayback((current) => ({ ...current, status: "paused", segmentIndex: target, pausePending: false, stopPending: false, currentCharStart: 0, currentCharLength: 0 }));
    }
  }, [speakCurrent, stopTimer, updateNarrationPosition]);

  const previousSegment = useCallback(() => seek(-1), [seek]);
  const nextSegment = useCallback(() => seek(1), [seek]);

  const setVoice = useCallback((voiceId: string | null) => persistSettings({ voiceId }), [persistSettings]);
  const setRate = useCallback((rate: number) => persistSettings({ rate: Math.max(0.65, Math.min(1.2, Math.round(rate * 100) / 100)) }), [persistSettings]);
  const setPitch = useCallback((pitch: number) => persistSettings({ pitch: Math.max(0.8, Math.min(1.2, Math.round(pitch * 100) / 100)) }), [persistSettings]);
  const setExpressive = useCallback((expressive: boolean) => persistSettings({ expressive }), [persistSettings]);

  const setTimer = useCallback((timerMinutes: TimerPreset) => {
    persistSettings({ timerMinutes });
    timerLeftRef.current = timerMinutes ? timerMinutes * 60 : 0;
    setPlayback((current) => ({ ...current, secondsLeft: timerLeftRef.current }));
    if (playbackRef.current.status === "playing") startTimer();
    else stopTimer();
  }, [persistSettings, startTimer, stopTimer]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      if (!active || !raw) return;
      try {
        const saved = JSON.parse(raw) as Partial<NarrationSettings>;
        persistSettings({
          voiceId: typeof saved.voiceId === "string" ? saved.voiceId : null,
          rate: typeof saved.rate === "number" ? Math.max(0.65, Math.min(1.2, saved.rate)) : DEFAULT_SETTINGS.rate,
          pitch: typeof saved.pitch === "number" ? Math.max(0.8, Math.min(1.2, saved.pitch)) : DEFAULT_SETTINGS.pitch,
          timerMinutes: allowedTimer(saved.timerMinutes),
          expressive: typeof saved.expressive === "boolean" ? saved.expressive : DEFAULT_SETTINGS.expressive,
        });
      } catch { /* Keep safe defaults when preferences are malformed. */ }
    });
    void Speech.getAvailableVoicesAsync().then((available) => { if (active) setVoices(available); }).catch(() => undefined);
    const responseSubscription = Platform.OS === "web" ? null : Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier === "pause") pause();
      else if (response.actionIdentifier === "resume") resume();
      else if (response.actionIdentifier === "stop") stop();
    });
    if (Platform.OS !== "web") {
      void Notifications.setNotificationCategoryAsync(PLAYING_CATEGORY, [
        { identifier: "pause", buttonTitle: "Pausar" },
        { identifier: "stop", buttonTitle: "Parar", options: { isDestructive: true } },
      ]).catch(() => undefined);
      void Notifications.setNotificationCategoryAsync(PAUSED_CATEGORY, [
        { identifier: "resume", buttonTitle: "Retomar" },
        { identifier: "stop", buttonTitle: "Parar", options: { isDestructive: true } },
      ]).catch(() => undefined);
    }
    return () => { active = false; responseSubscription?.remove(); };
  }, [pause, persistSettings, resume, stop]);

  const syncNotification = useCallback(async (current: PlaybackState) => {
    if (Platform.OS === "web") return;
    try {
      if (notificationPermissionRef.current !== true) {
        const existing = await Notifications.getPermissionsAsync();
        const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
        notificationPermissionRef.current = permission.granted;
        if (!permission.granted) return;
      }
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("leitorplay-reading", { name: "Leitura em voz alta", importance: Notifications.AndroidImportance.LOW, vibrationPattern: [], enableVibrate: false, sound: null });
      }
      const oldId = notificationIdRef.current;
      if (oldId) await Notifications.dismissNotificationAsync(oldId).catch(() => undefined);
      const paused = current.status === "paused";
      const body = current.stopPending
        ? `${current.title} · encerrando no próximo limite seguro`
        : current.pausePending
          ? `${current.title} · pausa no próximo limite seguro`
          : `${current.title} · frase ${Math.min(current.segmentIndex + 1, current.totalSegments)} de ${current.totalSegments}`;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: paused ? "LeitorPlay · Narração pausada" : "LeitorPlay · Lendo em voz alta",
          body,
          categoryIdentifier: current.stopPending || current.pausePending ? undefined : paused ? PAUSED_CATEGORY : PLAYING_CATEGORY,
          sticky: true,
          autoDismiss: false,
          sound: false,
          data: { bookId: current.bookId, playbackStatus: current.status, segmentIndex: current.segmentIndex },
        },
        trigger: null,
      });
      notificationIdRef.current = id;
    } catch { /* Notification permission/platform limits never change actual playback state. */ }
  }, []);

  useEffect(() => {
    if (playback.status === "playing" || playback.status === "paused") {
      void syncNotification(playback);
      return;
    }
    const id = notificationIdRef.current;
    notificationIdRef.current = null;
    if (id && Platform.OS !== "web") void Notifications.dismissNotificationAsync(id).catch(() => undefined);
  }, [playback.status, playback.title, playback.bookId, playback.segmentIndex, playback.totalSegments, playback.pausePending, playback.stopPending, syncNotification]);

  useEffect(() => {
    if (playback.status !== "playing" || !playback.bookId) return;
    const activeBookId = playback.bookId;
    const interval = setInterval(() => recordReadingSeconds(activeBookId, 15), 15000);
    return () => clearInterval(interval);
  }, [playback.bookId, playback.status, recordReadingSeconds]);

  useEffect(() => () => {
    generationRef.current += 1;
    if (delayRef.current !== null) clearTimeout(delayRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    safeStop();
  }, []);

  const value = useMemo<NarrationContextValue>(() => ({
    status: playback.status,
    bookId: playback.bookId,
    title: playback.title,
    segmentIndex: playback.segmentIndex,
    totalSegments: playback.totalSegments,
    secondsLeft: playback.secondsLeft,
    error: playback.error,
    pausePending: playback.pausePending,
    stopPending: playback.stopPending,
    currentCharStart: playback.currentCharStart,
    currentCharLength: playback.currentCharLength,
    voices,
    voiceId: settings.voiceId,
    rate: settings.rate,
    pitch: settings.pitch,
    timerMinutes: settings.timerMinutes,
    expressive: settings.expressive,
    start,
    pause,
    resume,
    stop,
    previousSegment,
    nextSegment,
    setVoice,
    setRate,
    setPitch,
    setTimer,
    setExpressive,
  }), [playback, voices, settings, start, pause, resume, stop, previousSegment, nextSegment, setVoice, setRate, setPitch, setTimer, setExpressive]);

  return <NarrationContext.Provider value={value}>{children}</NarrationContext.Provider>;
}

export function useNarration() {
  const value = useContext(NarrationContext);
  if (!value) throw new Error("useNarration precisa estar dentro de NarrationProvider.");
  return value;
}
