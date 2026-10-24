import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { ExcerptEditor } from "@/components/reader/ExcerptEditor";
import { NarrationTextSection } from "@/components/reader/NarrationTextSection";
import { PdfViewer } from "@/components/reader/PdfViewer";
import { loadReaderContent } from "@/lib/reader/format-registry";
import { readReaderPreferences, writeReaderPreferences, type ReaderPreferences } from "@/lib/reader/preferences";
import { buildSpeechPlan } from "@/lib/reader/speech-queue";
import { useLibrary } from "@/lib/reader/library-context";
import { useNarration } from "@/lib/reader/narration-context";
import type { ReaderContent } from "@/lib/reader/types";

const C = { bg: "#060914", panel: "#0d1125", text: "#f2f4ff", muted: "#a4abc5", pink: "#e333ff", cyan: "#12ddff", line: "#302858" };

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { books, toggleFavorite, updateProgress, addExcerpt, recordReadingSeconds } = useLibrary();
  const narration = useNarration();
  const book = books.find((item) => item.id === id);
  const bookRef = useRef(book);
  useEffect(() => { bookRef.current = book; }, [book]);
  const bookId = book?.id;
  const fileUri = book?.uri;
  const [content, setContent] = useState<ReaderContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [pdfPages, setPdfPages] = useState(0);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [prefs, setPrefs] = useState<ReaderPreferences>({ direction: "rtl", fontSize: 18 });
  const [quoteModal, setQuoteModal] = useState(false);
  const [visibleTextPage, setVisibleTextPage] = useState(1);
  const scrollRef = useRef<ScrollView>(null);
  const restored = useRef(false);

  useEffect(() => { void readReaderPreferences().then(setPrefs); }, []);
  useEffect(() => {
    const currentBook = bookRef.current;
    if (!currentBook) return;
    let active = true;
    restored.current = false;
    void Promise.resolve().then(() => {
      if (!active) return null;
      setLoading(true); setError(""); setContent(null);
      return loadReaderContent(currentBook);
    }).then((result) => { if (active && result) { setPage(currentBook.position || 0); setContent(result); setLoading(false); } })
      .catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : "Não foi possível abrir este arquivo."); setLoading(false); } });
    return () => { active = false; };
  }, [bookId, fileUri]);

  const speechPlan = useMemo(() => {
    if (content?.chapters?.length) return buildSpeechPlan(content.chapters.map((chapter) => ({ title: chapter.title, syntheticTitle: chapter.syntheticTitle, text: chapter.text })));
    return buildSpeechPlan(content?.text ? [{ title: "", text: content.text }] : []);
  }, [content]);
  const imagePages = useMemo(() => content?.imagePages ?? [], [content]);
  const textReady = speechPlan.segments.length > 0;

  useEffect(() => {
    if (!content || restored.current) return;
    restored.current = true;
    const savedY = Math.max(0, book?.position ?? 0);
    if (savedY) setTimeout(() => scrollRef.current?.scrollTo({ y: savedY, animated: false }), 180);
  }, [content, book?.position]);

  useEffect(() => {
    if (!bookId || loading || error || (narration.bookId === bookId && narration.status === "playing")) return;
    const activeBookId = bookId;
    const interval = setInterval(() => recordReadingSeconds(activeBookId, 15), 15000);
    return () => clearInterval(interval);
  }, [bookId, error, loading, narration.bookId, narration.status, recordReadingSeconds]);

  const onTextScroll = (event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const max = Math.max(1, contentSize.height - layoutMeasurement.height);
    const progress = Math.min(99, Math.max(0, Math.round((contentOffset.y / max) * 100)));
    if (book) updateProgress(book.id, progress, Math.round(contentOffset.y));
    const nextPage = Math.max(1, Math.floor(contentOffset.y / Math.max(1, layoutMeasurement.height)) + 1);
    setVisibleTextPage((current) => current === nextPage ? current : nextPage);
  };

  const setDirection = async () => setPrefs(await writeReaderPreferences({ direction: prefs.direction === "rtl" ? "ltr" : "rtl" }));
  const changeFont = async (delta: number) => setPrefs(await writeReaderPreferences({ fontSize: Math.max(14, Math.min(30, prefs.fontSize + delta)) }));
  const moveComicPage = (delta: number) => {
    if (!book || !imagePages.length) return;
    const next = Math.max(0, Math.min(imagePages.length - 1, page + delta));
    setPage(next);
    const progress = Math.round(((next + 1) / imagePages.length) * 100);
    updateProgress(book.id, progress, next);
  };
  const speakingThisBook = narration.bookId === book?.id && narration.status === "playing";
  const playingThisBook = speakingThisBook;
  const pausedThisBook = narration.bookId === book?.id && narration.status === "paused";
  const narrationActive = speakingThisBook || pausedThisBook;
  const activeSectionIndex = narrationActive
    ? speechPlan.sections.findIndex((section) => section.pieces.some((piece) => piece.segmentIndex === narration.segmentIndex))
    : -1;

  const speak = () => {
    if (!book) return;
    const sameBook = narration.bookId === book.id;
    if (sameBook && narration.status === "playing") { narration.pause(); return; }
    if (sameBook && narration.status === "paused") { narration.resume(); return; }
    if (!speechPlan.segments.length) { setError("Este arquivo não contém texto para narração."); return; }
    narration.start(book.id, book.title, speechPlan.segments, book.spokenPosition ?? 0);
  };

  const saveExcerpt = (quote: string) => {
    if (book) addExcerpt(book.id, quote, book.format === "pdf" ? page + 1 : visibleTextPage);
    setQuoteModal(false);
  };

  if (!book) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.message}>Este item não está mais na biblioteca.</Text><Pressable style={styles.primary} onPress={() => router.back()}><Text style={styles.buttonText}>Voltar</Text></Pressable></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Voltar"><Ionicons name="chevron-back" size={23} color={C.cyan} /></Pressable>
        <View style={styles.headerCopy}><Text numberOfLines={1} style={styles.title}>{book.title}</Text><Text numberOfLines={1} style={styles.subtitle}>{book.author || book.format.toUpperCase()}</Text></View>
        <Pressable onPress={() => toggleFavorite(book.id)} style={styles.iconButton} accessibilityLabel={book.favorite ? "Desfavoritar" : "Favoritar"}><Ionicons name={book.favorite ? "star" : "star-outline"} size={21} color={book.favorite ? "#ffdb4d" : C.pink} /></Pressable>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={C.cyan} /><Text style={styles.message}>Preparando sua leitura…</Text></View> : null}
      {!loading && error ? <View style={styles.center}><Ionicons name="alert-circle-outline" size={34} color={C.pink} /><Text style={styles.message}>{error}</Text><Text style={styles.detail}>Confirme se o arquivo não está corrompido ou protegido por DRM.</Text></View> : null}

      {!loading && !error && book.format === "pdf" ? (
        <PdfViewer uri={book.uri} initialPage={book.position + 1} onPageChanged={(current, total) => { setPage(current - 1); setPdfPages(total); if (total > 0) updateProgress(book.id, Math.round((current / total) * 100), current - 1); }} onLoaded={setPdfPages} onError={setError} />
      ) : null}

      {!loading && !error && imagePages.length ? (
        <View style={styles.comicArea}>
          <View style={styles.imageStage}>
            <Image source={{ uri: imagePages[Math.max(0, Math.min(page, imagePages.length - 1))] }} style={[styles.comicPage, { width: width - 14 }]} contentFit={fitMode} transition={100} />
            <Pressable onPress={() => moveComicPage(prefs.direction === "rtl" ? 1 : -1)} style={[styles.tapZone, styles.leftZone]} accessibilityLabel={prefs.direction === "rtl" ? "Próxima página" : "Página anterior"} />
            <Pressable onPress={() => moveComicPage(prefs.direction === "rtl" ? -1 : 1)} style={[styles.tapZone, styles.rightZone]} accessibilityLabel={prefs.direction === "rtl" ? "Página anterior" : "Próxima página"} />
          </View>
          <View style={styles.comicToolbar}>
            <Pressable onPress={() => moveComicPage(-1)} style={styles.pageButton} accessibilityLabel="Página anterior"><Ionicons name="chevron-back" size={22} color={C.text} /></Pressable>
            <Text style={styles.pageLabel}>{page + 1} / {imagePages.length}</Text>
            <Pressable onPress={() => moveComicPage(1)} style={styles.pageButton} accessibilityLabel="Próxima página"><Ionicons name="chevron-forward" size={22} color={C.text} /></Pressable>
            <Pressable onPress={() => setFitMode(fitMode === "contain" ? "cover" : "contain")} style={styles.smallButton}><Ionicons name="scan-outline" size={17} color={C.cyan} /></Pressable>
            {book.kind === "comic" ? <Pressable onPress={() => void setDirection()} style={styles.smallButton}><Ionicons name="swap-horizontal" size={17} color={C.pink} /></Pressable> : null}
          </View>
          <View style={styles.progressLine}><View style={[styles.progressFill, { width: `${Math.round(((page + 1) / Math.max(1, imagePages.length)) * 100)}%` }]} /></View>
        </View>
      ) : null}

      {!loading && !error && book.format !== "pdf" && !imagePages.length ? (
        <>
          <ScrollView ref={scrollRef} style={styles.textScroll} contentContainerStyle={styles.textContent} onScroll={onTextScroll} scrollEventThrottle={700}>
            {speechPlan.sections.map((section, index) => {
              const first = section.pieces[0]?.segmentIndex ?? -1;
              const last = section.pieces[section.pieces.length - 1]?.segmentIndex ?? -1;
              const belongsToActiveSection = activeSectionIndex === index;
              const activeSegmentIndex = belongsToActiveSection && narration.segmentIndex >= first && narration.segmentIndex <= last
                ? narration.segmentIndex
                : -1;
              return <NarrationTextSection
                key={`${section.title}-${index}`}
                title={section.title}
                pieces={section.pieces}
                segments={speechPlan.segments}
                activeSegmentIndex={activeSegmentIndex}
                currentCharStart={activeSegmentIndex >= 0 ? narration.currentCharStart : 0}
                currentCharLength={activeSegmentIndex >= 0 ? narration.currentCharLength : 0}
                fontSize={prefs.fontSize}
              />;
            })}
            {!textReady ? <Text selectable style={[styles.bookText, { fontSize: prefs.fontSize }]}>Não há texto legível neste arquivo.</Text> : null}
          </ScrollView>
          {narrationActive ? <View style={styles.transportRow}>
            <Pressable onPress={narration.previousSegment} style={styles.transportButton} disabled={narration.pausePending || narration.stopPending} accessibilityLabel="Frase anterior"><Ionicons name="play-skip-back" size={17} color={C.cyan} /><Text style={styles.transportText}>Anterior</Text></Pressable>
            <Text style={styles.transportCounter}>Frase {Math.min(narration.segmentIndex + 1, narration.totalSegments)} / {narration.totalSegments}</Text>
            <Pressable onPress={narration.nextSegment} style={styles.transportButton} disabled={narration.pausePending || narration.stopPending} accessibilityLabel="Próxima frase"><Text style={styles.transportText}>Próxima</Text><Ionicons name="play-skip-forward" size={17} color={C.cyan} /></Pressable>
          </View> : null}
          <View style={styles.textToolbar}>
            <Pressable onPress={() => void changeFont(-1)} style={styles.smallButton}><Text style={styles.toolbarText}>A−</Text></Pressable>
            <Pressable onPress={() => setQuoteModal(true)} style={styles.bookmarkButton}><Ionicons name="bookmark-outline" size={17} color={C.cyan} /><Text style={styles.toolbarText}>Marcar</Text></Pressable>
            <Pressable onPress={speak} style={styles.speakButton} disabled={(narration.pausePending || narration.stopPending) && speakingThisBook} accessibilityLabel={narration.stopPending ? "Encerrando no próximo limite seguro" : narration.pausePending ? "Aguardando limite seguro da frase" : undefined}><Ionicons name={playingThisBook ? "pause" : pausedThisBook ? "play" : "volume-high"} size={17} color={C.pink} /><Text style={styles.toolbarText}>{narration.stopPending && speakingThisBook ? "Encerrando…" : narration.pausePending && speakingThisBook ? "Pausando…" : playingThisBook ? "Pausar" : pausedThisBook ? "Retomar" : "Ouvir"}</Text></Pressable>
            {narrationActive ? <Pressable onPress={narration.stop} style={styles.smallButton} disabled={narration.stopPending} accessibilityLabel={narration.stopPending ? "Aguardando limite seguro para parar" : "Parar narração"}><Ionicons name="stop" size={15} color={C.pink} /></Pressable> : null}
            {narration.secondsLeft > 0 && narrationActive ? <Text style={styles.timerLabel}>{`${Math.floor(narration.secondsLeft / 60)}:${String(narration.secondsLeft % 60).padStart(2, "0")}`}</Text> : null}
            <Pressable onPress={() => void changeFont(1)} style={styles.smallButton}><Text style={styles.toolbarText}>A+</Text></Pressable>
          </View>
          {narration.bookId === book.id && narration.error ? <Text style={styles.speechError}>{narration.error}</Text> : null}
        </>
      ) : null}
      {book.format === "pdf" && !loading && !error ? <View style={styles.pdfToolbar}><Text style={styles.pageLabel}>{pdfPages ? `Página ${page + 1} de ${pdfPages}` : "PDF local"}</Text><Pressable onPress={() => setQuoteModal(true)} style={styles.bookmarkButton}><Ionicons name="bookmark-outline" size={16} color={C.cyan} /><Text style={styles.toolbarText}>Marcar trecho</Text></Pressable></View> : null}

      <ExcerptEditor key={`${book.id}-${quoteModal ? "open" : "closed"}`} visible={quoteModal} initialValue="" onCancel={() => setQuoteModal(false)} onSave={saveExcerpt} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { height: 57, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  iconButton: { width: 39, height: 39, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line, borderRadius: 9, backgroundColor: C.panel },
  headerCopy: { flex: 1 }, title: { color: C.text, fontSize: 15, fontWeight: "700" }, subtitle: { color: C.muted, fontSize: 10, marginTop: 3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 26, gap: 10 }, message: { color: C.text, fontSize: 14, textAlign: "center", lineHeight: 21 }, detail: { color: C.muted, fontSize: 11, textAlign: "center" },
  primary: { marginTop: 8, borderWidth: 1, borderColor: C.cyan, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 10 }, buttonText: { color: C.text, fontWeight: "700" },
  comicArea: { flex: 1, justifyContent: "center", backgroundColor: C.bg, paddingBottom: 6 }, imageStage: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" }, comicPage: { height: "100%" },
  tapZone: { position: "absolute", top: 0, bottom: 0, width: "22%" }, leftZone: { left: 0 }, rightZone: { right: 0 }, comicToolbar: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 15, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.panel },
  pageButton: { width: 38, height: 36, alignItems: "center", justifyContent: "center" }, pageLabel: { color: C.text, fontSize: 12, fontWeight: "600" }, smallButton: { minWidth: 34, height: 33, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: C.line, paddingHorizontal: 7 },
  progressLine: { height: 3, backgroundColor: "#242942" }, progressFill: { height: 3, backgroundColor: C.pink },
  textScroll: { flex: 1 }, textContent: { paddingHorizontal: 22, paddingTop: 25, paddingBottom: 35 }, bookText: { color: "#e4dfd1", lineHeight: 31, letterSpacing: 0.2 },
  transportRow: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.panel },
  transportButton: { minWidth: 82, minHeight: 35, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: "#17485d", borderRadius: 8, paddingHorizontal: 7 },
  transportText: { color: C.text, fontSize: 10, fontWeight: "600" }, transportCounter: { color: C.cyan, fontSize: 10, fontVariant: ["tabular-nums"] },
  textToolbar: { minHeight: 55, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-around", gap: 7, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.panel, paddingHorizontal: 7, paddingVertical: 6 },
  bookmarkButton: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: "#17485d", borderRadius: 8 },
  speakButton: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: "#51234f", borderRadius: 8 },
  toolbarText: { color: C.text, fontSize: 11, fontWeight: "600" }, timerLabel: { color: C.cyan, fontSize: 10, fontVariant: ["tabular-nums"] }, speechError: { color: "#ff829b", fontSize: 10, backgroundColor: C.panel, paddingHorizontal: 12, paddingBottom: 7 },
  pdfToolbar: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: C.panel, borderTopWidth: 1, borderColor: C.line },
});
