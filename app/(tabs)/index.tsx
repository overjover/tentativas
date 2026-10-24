import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { BookCard } from "@/components/library/LibraryCards";
import { useLibrary } from "@/lib/reader/library-context";
import type { LibraryBook } from "@/lib/reader/types";

const C = { bg: "#060914", panel: "#0b1023", panel2: "#15102e", text: "#f5f6ff", muted: "#9da7c4", pink: "#e523ff", cyan: "#14dfff", purple: "#6b36ec", line: "#2e2859" };
const SURPRISE_BOOK_ART = "/manus-storage/async-images/ti7dLf0jBtnXmIMCCeVSQw/image-1.webp";

export default function LibraryScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { books, ready, importFiles, toggleFavorite, openBook } = useLibrary();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Tudo");
  const gap = 13;
  const cardWidth = Math.max(124, Math.min(190, (width - 42 - gap) / 2));
  const brandSize = Math.min(34, Math.max(26, (width - 120) / 7));

  const visible = useMemo(() => books
    .filter((book) => {
      const matchesQuery = `${book.title} ${book.author ?? ""} ${book.fileName}`.toLowerCase().includes(query.toLowerCase());
      const matchesFilter = filter === "Tudo" ||
        (filter === "Livros" && book.kind === "book") ||
        (filter === "Mangás" && book.kind === "comic") ||
        (filter === "PDF" && book.format === "pdf") ||
        (filter === "Imagens" && book.kind === "image");
      return matchesQuery && matchesFilter;
    })
    .sort((a, b) => (b.lastOpenedAt ?? b.importedAt) - (a.lastOpenedAt ?? a.importedAt)),
  [books, filter, query]);

  const open = (book: LibraryBook) => {
    openBook(book.id);
    router.push({ pathname: "/reader/[id]", params: { id: book.id } });
  };
  const surprise = () => {
    if (!visible.length) {
      void importFiles();
      return;
    }
    const book = visible[Math.floor(Math.random() * visible.length)];
    open(book);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(112, insets.bottom + 96) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Ionicons name="book-outline" size={31} color={C.pink} />
              <Ionicons name="play" size={14} color={C.cyan} style={styles.brandPlay} />
            </View>
            <View style={styles.brandCopy}>
              <Text style={[styles.wordmark, { fontSize: brandSize }]} numberOfLines={1}><Text style={styles.wordWhite}>Leitor</Text><Text style={styles.wordPink}>P</Text><Text style={styles.wordCyan}>lay</Text></Text>
              <Text style={styles.tagline} numberOfLines={2}>Sua biblioteca pessoal · leitura e narração offline</Text>
            </View>
          </View>
          <Pressable onPress={() => router.navigate("/(tabs)/more")} style={styles.profileButton} accessibilityLabel="Abrir Mais e configurações">
            <Ionicons name="person" color={C.text} size={20} />
          </Pressable>
        </View>

        <View style={styles.searchFrame}>
          <Ionicons name="search" size={20} color={C.cyan} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar na sua biblioteca..."
            placeholderTextColor="#a2a9c4"
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel="Buscar na biblioteca"
          />
          {query ? <Pressable onPress={() => setQuery("")} accessibilityLabel="Limpar busca"><Ionicons name="close-circle" size={19} color={C.muted} /></Pressable> : null}
        </View>

        <Pressable onPress={surprise} style={styles.surpriseCard} accessibilityRole="button">
          <View style={styles.sparkleBadge}><Ionicons name="sparkles" color="#fff" size={28} /></View>
          <View style={styles.surpriseCopy}>
            <Text style={styles.surpriseTitle}>SURPREENDA-ME</Text>
            <Text style={styles.surpriseSub}>{books.length ? "Descubra sua próxima leitura" : "Adicione um arquivo para começar"}</Text>
          </View>
          {width >= 370 ? (
            <View pointerEvents="none" style={styles.drawnBook}>
              <Ionicons name="book" size={28} color={C.cyan} />
              <Ionicons name="sparkles" size={13} color="#f5a6ff" style={styles.tinySparkle} />
              {Platform.OS === "web" ? <Image source={{ uri: SURPRISE_BOOK_ART }} style={styles.surpriseArt} contentFit="contain" transition={180} accessibilityLabel="Ilustração original de um livro aberto" /> : null}
            </View>
          ) : null}
          <View style={styles.sortButton}><Text style={styles.sortText}>{books.length ? "SORTEAR" : "ADICIONAR"}</Text><Ionicons name="chevron-forward" size={15} color={C.text} /></View>
        </Pressable>

        <SectionTitle title="Continuar lendo" count={books.length} onPress={() => setFilter("Tudo")} />
        {ready && books.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.continueRail}>
            {books.slice().sort((a, b) => (b.lastOpenedAt ?? b.importedAt) - (a.lastOpenedAt ?? a.importedAt)).slice(0, 8).map((book) => (
              <View key={`continue-${book.id}`} style={{ width: Math.min(250, width * 0.71) }}>
                <BookCard book={book} width={Math.min(250, width * 0.71) - 4} onOpen={() => open(book)} onFavorite={() => toggleFavorite(book.id)} />
              </View>
            ))}
          </ScrollView>
        ) : <EmptyShelf loading={!ready} onAdd={importFiles} />}

        <SectionTitle title="Sua coleção" count={visible.length} onPress={() => setQuery("")} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {["Tudo", "Livros", "Mangás", "PDF", "Imagens"].map((item) => (
            <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filterChip, filter === item && styles.filterChipActive]}>
              <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {ready && visible.length ? (
          <View style={[styles.collectionGrid, { gap }]}>
            {visible.map((book) => <BookCard key={book.id} book={book} width={cardWidth} onOpen={() => open(book)} onFavorite={() => toggleFavorite(book.id)} />)}
          </View>
        ) : ready && books.length > 0 ? (
          <View style={styles.emptySearch}><Ionicons name="search-outline" size={27} color={C.muted} /><Text style={styles.emptyTitle}>Nada por aqui</Text><Text style={styles.emptySub}>Tente outra busca ou categoria.</Text></View>
        ) : ready ? (
          <View style={styles.emptySearch}><Ionicons name="library-outline" size={29} color={C.pink} /><Text style={styles.emptyTitle}>Sua estante começa com um arquivo</Text><Text style={styles.emptySub}>PDF, EPUB, mangá em CBZ, texto e imagens — tudo no seu aparelho.</Text></View>
        ) : null}

        <Pressable onPress={() => void importFiles()} style={styles.addButton} accessibilityRole="button" accessibilityLabel="Adicionar livros, mangás ou imagens">
          <Ionicons name="add" size={25} color={C.text} /><Text style={styles.addText}>Adicionar</Text>
        </Pressable>
        <Text style={styles.privacyNote}><Ionicons name="lock-closed" size={11} color={C.cyan} /> Seus arquivos ficam no aparelho. Sem chaves ou upload.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title, count, onPress }: { title: string; count: number; onPress: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionAccent}><View style={styles.accentPink} /><View style={styles.accentCyan} /></View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{count}</Text>
      <Pressable onPress={onPress} hitSlop={10} accessibilityLabel={`Ver ${title}`}><Ionicons name="chevron-forward" size={21} color={C.muted} /></Pressable>
    </View>
  );
}

function EmptyShelf({ loading, onAdd }: { loading: boolean; onAdd: () => void }) {
  return (
    <Pressable style={styles.emptyShelf} onPress={() => void onAdd()}>
      <Ionicons name={loading ? "hourglass-outline" : "book-outline"} size={27} color={C.cyan} />
      <View style={{ flex: 1 }}>
        <Text style={styles.emptyShelfTitle}>{loading ? "Abrindo sua biblioteca…" : "Ainda não há leituras em andamento"}</Text>
        <Text style={styles.emptyShelfSub}>{loading ? "" : "Toque para escolher um livro ou mangá."}</Text>
      </View>
      {!loading ? <Ionicons name="add-circle-outline" size={23} color={C.pink} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, content: { paddingHorizontal: 15, paddingTop: 5, paddingBottom: 24 },
  header: { minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 17 }, brandRow: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 }, brandCopy: { flex: 1, minWidth: 0 },
  brandMark: { width: 43, height: 48, alignItems: "center", justifyContent: "center", marginRight: 6, flexShrink: 0 }, brandPlay: { position: "absolute", top: 16, left: 22 }, wordmark: { fontStyle: "italic", fontWeight: "900", letterSpacing: -1.5 }, wordWhite: { color: C.text }, wordPink: { color: C.pink }, wordCyan: { color: C.cyan },
  tagline: { color: "#bac3dc", fontSize: 10, marginTop: 1, flexShrink: 1 }, profileButton: { width: 42, height: 42, borderWidth: 1, borderColor: C.purple, borderRadius: 9, backgroundColor: C.panel, alignItems: "center", justifyContent: "center", marginLeft: 7, flexShrink: 0 },
  searchFrame: { minHeight: 51, borderWidth: 1, borderColor: C.cyan, borderRadius: 13, backgroundColor: C.panel, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: C.pink, shadowOpacity: 0.28, shadowRadius: 9, marginBottom: 20 }, searchInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 11 },
  surpriseCard: { minHeight: 94, borderRadius: 15, borderWidth: 1, borderColor: C.pink, backgroundColor: "#38109a", padding: 13, flexDirection: "row", alignItems: "center", marginBottom: 24, overflow: "hidden", shadowColor: C.pink, shadowOpacity: 0.22, shadowRadius: 10 }, sparkleBadge: { width: 41, height: 41, alignItems: "center", justifyContent: "center", marginRight: 10 }, surpriseCopy: { flex: 1 }, surpriseTitle: { color: C.text, fontSize: 15, fontWeight: "800", letterSpacing: 0.3 }, surpriseSub: { color: "#ddd7ff", fontSize: 12, marginTop: 5 }, drawnBook: { position: "absolute", width: 78, height: 72, right: 91, top: 10, alignItems: "center", justifyContent: "center" }, surpriseArt: { ...StyleSheet.absoluteFill }, tinySparkle: { position: "absolute", top: -5, right: -5 }, sortButton: { borderWidth: 1, borderColor: C.cyan, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#17142f" }, sortText: { color: C.text, fontSize: 10, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 12, marginTop: 1 }, sectionAccent: { width: 6, height: 27, overflow: "hidden", borderRadius: 2 }, accentPink: { height: 14, backgroundColor: C.pink }, accentCyan: { height: 13, backgroundColor: C.cyan }, sectionTitle: { color: C.text, fontSize: 19, fontWeight: "700", flex: 1 }, sectionCount: { color: C.muted, fontSize: 12, marginRight: 4 }, continueRail: { gap: 10, paddingBottom: 23, paddingRight: 4 },
  emptyShelf: { minHeight: 82, borderColor: C.line, borderWidth: 1, borderRadius: 12, backgroundColor: C.panel, marginBottom: 23, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 }, emptyShelfTitle: { color: C.text, fontSize: 13, fontWeight: "700" }, emptyShelfSub: { color: C.muted, fontSize: 11, marginTop: 4 },
  filters: { gap: 8, paddingBottom: 13 }, filterChip: { borderRadius: 99, borderWidth: 1, borderColor: C.line, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: C.panel }, filterChipActive: { borderColor: C.cyan, backgroundColor: "#12243a" }, filterText: { color: C.muted, fontSize: 11 }, filterTextActive: { color: C.text, fontWeight: "700" }, collectionGrid: { flexDirection: "row", flexWrap: "wrap", paddingBottom: 4 },
  emptySearch: { minHeight: 124, borderColor: C.line, borderWidth: 1, borderRadius: 12, backgroundColor: C.panel, alignItems: "center", justifyContent: "center", paddingHorizontal: 25, marginBottom: 15 }, emptyTitle: { color: C.text, fontSize: 14, fontWeight: "700", marginTop: 8, textAlign: "center" }, emptySub: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 5, textAlign: "center" },
  addButton: { minHeight: 51, borderColor: C.pink, borderWidth: 1.4, borderRadius: 11, backgroundColor: "#29106d", marginTop: 20, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 12 }, addText: { color: C.text, fontSize: 15, fontWeight: "700" }, privacyNote: { color: C.muted, textAlign: "center", fontSize: 10, marginTop: 13 },
});
