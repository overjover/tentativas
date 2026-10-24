import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { BookCard, ExcerptCard } from "@/components/library/LibraryCards";
import { ExcerptEditor } from "@/components/reader/ExcerptEditor";
import { useLibrary } from "@/lib/reader/library-context";
import type { SavedExcerpt } from "@/lib/reader/types";

const C = { bg: "#060914", panel: "#0c1024", text: "#f4f5ff", muted: "#a2aac4", pink: "#e333ff", cyan: "#12ddff", line: "#292451" };

export default function FavoritesScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { books, excerpts, toggleFavorite, editExcerpt, removeExcerpt, updateProgress } = useLibrary();
  const favorites = books.filter((book) => book.favorite);
  const cardWidth = Math.min(215, (width - 44) / 2);
  const [editing, setEditing] = useState<SavedExcerpt | null>(null);

  const openBook = (id: string, page?: number) => {
    const book = books.find((item) => item.id === id);
    if (!book) return;
    if (page) updateProgress(id, book.progress, book.format === "pdf" ? Math.max(0, page - 1) : Math.max(0, (page - 1) * height));
    router.push({ pathname: "/reader/[id]", params: { id } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(112, insets.bottom + 96) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Pressable onPress={() => router.navigate("/(tabs)")} style={styles.back} accessibilityLabel="Voltar para a biblioteca"><Ionicons name="chevron-back" size={24} color={C.cyan} /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Favoritos</Text>
            <Text style={styles.subtitle}>Seus livros e trechos salvos</Text>
          </View>
        </View>

        <SectionTitle title="Livros favoritos" count={favorites.length} />
        {favorites.length ? (
          <View style={styles.grid}>
            {favorites.map((book) => (
              <BookCard key={book.id} book={book} width={cardWidth} onOpen={() => openBook(book.id)} onFavorite={() => toggleFavorite(book.id)} />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="star-outline" size={28} color={C.pink} />
            <Text style={styles.emptyTitle}>Sua lista favorita está vazia</Text>
            <Text style={styles.emptyText}>Toque na estrela de um livro na Biblioteca para guardá-lo aqui.</Text>
            <Pressable style={styles.action} onPress={() => router.navigate("/(tabs)")}><Text style={styles.actionText}>Ir para biblioteca</Text></Pressable>
          </View>
        )}

        <SectionTitle title="Trechos marcados" count={excerpts.length} accent="#b7ff41" />
        {excerpts.length ? excerpts.map((excerpt, index) => (
          <ExcerptCard
            key={excerpt.id}
            excerpt={excerpt}
            index={index}
            book={books.find((book) => book.id === excerpt.bookId)}
            onOpen={() => openBook(excerpt.bookId, excerpt.page)}
            onEdit={() => setEditing(excerpt)}
            onRemove={() => removeExcerpt(excerpt.id)}
          />
        )) : (
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={27} color={C.cyan} />
            <Text style={styles.emptyTitle}>Guarde uma frase que merece voltar</Text>
            <Text style={styles.emptyText}>No leitor, toque em “Marcar trecho” para salvar uma citação com o livro e a página.</Text>
          </View>
        )}
      </ScrollView>
      <ExcerptEditor key={editing?.id ?? "no-excerpt"} visible={!!editing} initialValue={editing?.quote ?? ""} onCancel={() => setEditing(null)} onSave={(quote) => { if (editing) editExcerpt(editing.id, quote); setEditing(null); }} />
    </SafeAreaView>
  );
}

function SectionTitle({ title, count, accent = C.pink }: { title: string; count: number; accent?: string }) {
  return <View style={styles.section}><View style={[styles.sectionBar, { backgroundColor: accent }]} /><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.count}>{count}</Text></View>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.bg }, content: { paddingHorizontal: 16, paddingTop: 5, paddingBottom: 25 }, pageHeader: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 33, minHeight: 78 }, back: { width: 45, height: 45, alignItems: "center", justifyContent: "center", borderColor: C.cyan, borderWidth: 1, borderRadius: 10, backgroundColor: C.panel }, title: { color: C.text, fontSize: 36, fontWeight: "800", letterSpacing: -1 }, subtitle: { color: "#b1cce6", fontSize: 13, marginTop: 4 }, section: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 14, marginTop: 2 }, sectionBar: { width: 6, height: 27, borderRadius: 2 }, sectionTitle: { color: C.text, fontSize: 21, fontWeight: "700", flex: 1 }, count: { color: C.muted, fontSize: 12 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 13, marginBottom: 28 }, empty: { minHeight: 150, alignItems: "center", justifyContent: "center", padding: 19, borderWidth: 1, borderColor: C.line, borderRadius: 13, backgroundColor: C.panel, marginBottom: 28 }, emptyTitle: { color: C.text, fontSize: 15, fontWeight: "700", textAlign: "center", marginTop: 9 }, emptyText: { color: C.muted, fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 6 }, action: { marginTop: 12, borderWidth: 1, borderColor: C.cyan, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 }, actionText: { color: C.text, fontWeight: "700", fontSize: 12 } });
