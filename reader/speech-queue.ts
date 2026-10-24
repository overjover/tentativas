export type SpeechCue = "neutral" | "dialogue" | "thought" | "whisper" | "shout" | "suspense" | "action" | "sad" | "joy" | "anger" | "surprise" | "irony";

export type SpeechSegment = {
  /** Exact source slice sent to the system TTS; punctuation and whitespace are not rewritten. */
  text: string;
  /** UTF-16 source offsets, end-exclusive, suitable for Android Speech.onBoundary charIndex. */
  start: number;
  end: number;
  pauseAfterMs: number;
  cue: SpeechCue;
};

export const TIMER_PRESETS_MINUTES = [15, 30, 45, 60] as const;
export type TimerPreset = (typeof TIMER_PRESETS_MINUTES)[number] | null;

export type SpeechBaseProfile = { rate: number; pitch: number };
export type SpeechProfile = SpeechBaseProfile & { volume: number };

const CLOSING_MARKS = new Set(["\"", "'", "”", "’", "»", ")", "]", "}", "】", "」", "』", "〉", "》", "）", "］", "｝", "〗", "〙", "〛"]);
const SENTENCE_MARKS = new Set([".", "!", "?", "…", "。", "！", "？", "؟", "．"]);
const SCENE_CUE = /^(?:[\s"“‘—–]*)?(?:de repente\b|naquele instante\b|no instante seguinte\b|enquanto isso\b|no mesmo momento\b|horas depois\b|dias depois\b|anos depois\b|na manhã seguinte\b|naquela noite\b|foi então que\b)/iu;
const REVEAL_CUE = /\b(?:descobriu que|foi quando|era exatamente|o que viu|a verdade era|sem que percebesse|ninguém esperava|revelou que)\b/iu;

function isWhitespace(character: string) {
  return /\s/u.test(character);
}

function findParagraphEnd(source: string, index: number): number | null {
  if (source[index] !== "\n" && source[index] !== "\r") return null;
  let cursor = index;
  let lineBreaks = 0;
  while (cursor < source.length) {
    if (source[cursor] === "\r" && source[cursor + 1] === "\n") {
      lineBreaks += 1;
      cursor += 2;
    } else if (source[cursor] === "\n" || source[cursor] === "\r") {
      lineBreaks += 1;
      cursor += 1;
    } else if (source[cursor] === " " || source[cursor] === "\t") {
      cursor += 1;
    } else {
      break;
    }
  }
  return lineBreaks >= 2 ? cursor : null;
}

function sentenceEnd(source: string, index: number): number | null {
  const character = source[index];
  if (!SENTENCE_MARKS.has(character)) return null;
  const before = source[index - 1] ?? "";
  const after = source[index + 1] ?? "";
  if ((character === "." || character === "．") && /\d/u.test(before) && /\d/u.test(after)) return null;
  if (character === "." && after === ".") return null;
  if (character === "." && /\b(?:sr|sra|dr|dra|prof|profa|etc|vs)\.$/iu.test(source.slice(Math.max(0, index - 12), index + 1))) return null;

  let end = index + 1;
  while (CLOSING_MARKS.has(source[end] ?? "")) end += 1;
  const next = source[end] ?? "";
  if (next && !isWhitespace(next) && next !== "—" && next !== "–") return null;
  return end;
}

function classifyCue(source: string, start: number, end: number): SpeechCue {
  const context = source.slice(Math.max(0, start - 100), Math.min(source.length, end + 100)).toLocaleLowerCase("pt-BR");
  if (/\b(?:sussurr\w*|murmur\w*|cochich\w*|falou baixinho|em voz baixa)\b/u.test(context)) return "whisper";
  if (/\b(?:grit\w*|berr\w*|brad\w*|vocifer\w*|aos berros)\b/u.test(context)) return "shout";
  if (/\b(?:ironicamente|com ironia|sarcasticamente|com sarcasmo)\b/u.test(context)) return "irony";
  if (/\b(?:pensou|refletiu|ponderou|imaginou|concluiu em pensamento|perguntou a si mesmo|disse a si mesmo)\b/u.test(context)) return "thought";
  if (/\b(?:temeu|temia|medo|apavor\w*|horror|terror|tremia|em pânico)\b/u.test(context)) return "suspense";
  if (/\b(?:furios\w*|raiva|irritad\w*|rancor|rangeu os dentes)\b/u.test(context)) return "anger";
  if (/\b(?:triste\w*|chorou|soluç\w*|lágrimas|desolad\w*|de luto)\b/u.test(context)) return "sad";
  if (/\b(?:sorriu|rindo|risada|alegr\w*|feliz|eufóric\w*)\b/u.test(context)) return "joy";
  if (/\b(?:surpres\w*|espantad\w*|atônit\w*|assombrad\w*)\b/u.test(context)) return "surprise";
  if (/\b(?:disse|respondeu|perguntou|questionou|indagou|falou|comentou|explicou)\b/u.test(context)) return "dialogue";
  if (/\b(?:avançou|disparou|atacou|correu|investiu|lançou-se|saltou sobre)\b/u.test(context)) return "action";
  return "neutral";
}

function pauseForBoundary(segment: string, boundary: "sentence" | "paragraph" | "forced" | "end") {
  if (boundary === "paragraph") return 420;
  if (boundary === "forced" || boundary === "end") return 0;
  const trimmed = segment.trimEnd();
  let end = trimmed.length;
  while (end > 0 && CLOSING_MARKS.has(trimmed[end - 1] ?? "")) end -= 1;
  const punctuation = trimmed.slice(0, end);
  const ending = punctuation.slice(-1);
  if (ending === "…" || punctuation.endsWith("...")) return 240;
  if (ending === "!" || ending === "?" || ending === "！" || ending === "？" || ending === "؟") return 95;
  if (ending === "." || ending === "。" || ending === "．") return 65;
  return 0;
}

/**
 * Creates technical TTS chunks while retaining an exact, ordered cover of the source string.
 * Commas, semicolons, dialogue dashes, and ellipses remain inside sentences; the native voice
 * handles their normal prosody. Only long paragraphs, sentence ends, and hard size limits split.
 */
export function buildSpeechQueue(input: string, maxCharacters = 680): SpeechSegment[] {
  if (!input || !/\S/u.test(input)) return [];
  const limit = Math.max(40, Math.floor(Number.isFinite(maxCharacters) ? maxCharacters : 680));
  const segments: SpeechSegment[] = [];
  let start = 0;

  const flush = (end: number, boundary: "sentence" | "paragraph" | "forced" | "end") => {
    if (end <= start) return;
    const text = input.slice(start, end);
    if (/\S/u.test(text)) {
      segments.push({ text, start, end, pauseAfterMs: pauseForBoundary(text, boundary), cue: "neutral" });
      start = end;
      return;
    }
    const previous = segments[segments.length - 1];
    if (previous) {
      previous.text += text;
      previous.end = end;
      previous.pauseAfterMs = Math.max(previous.pauseAfterMs, pauseForBoundary(text, boundary));
      start = end;
    }
  };

  for (let index = 0; index < input.length; index += 1) {
    const paragraphEnd = findParagraphEnd(input, index);
    if (paragraphEnd !== null) {
      flush(paragraphEnd, "paragraph");
      index = paragraphEnd - 1;
      continue;
    }

    const endOfSentence = sentenceEnd(input, index);
    if (endOfSentence !== null) {
      flush(endOfSentence, "sentence");
      index = endOfSentence - 1;
      continue;
    }

    if (index - start + 1 >= limit) {
      const searchFrom = Math.max(start + 1, index - Math.floor(limit * 0.4));
      let whitespace = -1;
      for (let cursor = index; cursor >= searchFrom; cursor -= 1) {
        if (isWhitespace(input[cursor] ?? "")) { whitespace = cursor; break; }
      }
      const end = whitespace >= start ? whitespace + 1 : index + 1;
      flush(end, "forced");
      index = end - 1;
    }
  }
  flush(input.length, "end");

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    segment.cue = classifyCue(input, segment.start, segment.end);
    const nextText = segments[index + 1]?.text ?? "";
    if (SCENE_CUE.test(nextText) || REVEAL_CUE.test(nextText)) segment.pauseAfterMs = Math.max(segment.pauseAfterMs, 520);
    else if (/^[\s"“‘—–]*—/u.test(nextText) && segment.pauseAfterMs > 0) segment.pauseAfterMs = Math.max(segment.pauseAfterMs, 130);
  }
  return segments;
}

/** Small, bounded changes only; they never choose or replace the user's voice. */
export function profileForSegment(segment: SpeechSegment, base: SpeechBaseProfile, enabled: boolean): SpeechProfile {
  if (!enabled) return { ...base, volume: 1 };
  const modifiers: Record<SpeechCue, [number, number, number]> = {
    neutral: [1, 1, 1], dialogue: [1, 1, 1], thought: [0.985, 0.99, 0.99], whisper: [0.93, 0.97, 0.86], shout: [1.04, 1.035, 1],
    suspense: [0.94, 0.99, 0.96], action: [1.035, 1.015, 1], sad: [0.93, 0.97, 0.98],
    joy: [1.02, 1.025, 1], anger: [1.025, 1.015, 1], surprise: [1.025, 1.035, 1], irony: [0.99, 1.01, 1],
  };
  const [rateFactor, pitchFactor, volume] = modifiers[segment.cue];
  return {
    rate: Math.max(0.65, Math.min(1.2, base.rate * rateFactor)),
    pitch: Math.max(0.8, Math.min(1.2, base.pitch * pitchFactor)),
    volume,
  };
}

export type SpeechPlanInput = { title: string; text: string; syntheticTitle?: boolean };
export type SpeechVisiblePiece = { segmentIndex: number; segmentOffset: number; length: number };
export type SpeechPlanSection = { title: string; pieces: SpeechVisiblePiece[] };
export type SpeechPlan = { segments: SpeechSegment[]; sections: SpeechPlanSection[] };

/** Build a single ordered player queue while keeping each rendered book section addressable.
 * Synthetic UI titles are never inserted into spoken text; chapter boundaries receive one
 * natural pause and do not require a second concatenated copy of a large book. */
export function buildSpeechPlan(sections: SpeechPlanInput[], maxCharacters = 680): SpeechPlan {
  const segments: SpeechSegment[] = [];
  const plannedSections: SpeechPlanSection[] = [];
  sections.forEach((section, sectionIndex) => {
    const chapterSegments = buildSpeechQueue(section.text, maxCharacters);
    if (sectionIndex < sections.length - 1 && chapterSegments.length) {
      const lastIndex = chapterSegments.length - 1;
      chapterSegments[lastIndex] = { ...chapterSegments[lastIndex], pauseAfterMs: Math.max(420, chapterSegments[lastIndex].pauseAfterMs) };
    }
    const baseIndex = segments.length;
    plannedSections.push({
      title: section.syntheticTitle ? "" : section.title,
      pieces: chapterSegments.map((segment, index) => ({ segmentIndex: baseIndex + index, segmentOffset: 0, length: segment.text.length })),
    });
    for (const segment of chapterSegments) segments.push(segment);
  });
  return { segments, sections: plannedSections };
}

export function wordRangeAt(text: string, charIndex: number, charLength: number) {
  const safeIndex = Math.max(0, Math.min(text.length, Math.floor(Number.isFinite(charIndex) ? charIndex : 0)));
  const safeLength = Math.max(0, Math.min(text.length - safeIndex, Math.floor(Number.isFinite(charLength) ? charLength : 0)));
  if (safeLength) return { start: safeIndex, length: safeLength };
  const isWord = (character: string) => /[A-Za-zÀ-ÖØ-öø-ÿ0-9_’'-]/u.test(character);
  let start = safeIndex;
  let end = safeIndex;
  while (start > 0 && isWord(text[start - 1] ?? "")) start -= 1;
  while (end < text.length && isWord(text[end] ?? "")) end += 1;
  return { start, length: Math.max(0, end - start) };
}
