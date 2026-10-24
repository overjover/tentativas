import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BookCover } from "./BookCover";
import type { LibraryBook, SavedExcerpt } from "@/lib/reader/types";

const C = { bg: "#060914", panel: "#0c1024", text: "#f3f3ff", muted: "#a4abc4", pink: "#e333ff", cyan: "#12ddff", line: "#292451" };

export function BookCard({ book, width, onOpen, onFavorite, onRemove }: {
  book: LibraryBook; width: number; onOpen: () => void; onFavorite: () => void; onRemove?: () => void;
}) {
  return (
    <View style={[styles.bookCard, { width }]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Abrir ${book.title}`}>
        <BookCover book={book} height={width * 0.86} />
      </Pressable>
      <View style={styles.bookInfo}>
        <View style={styles.bookTitleRow}>
          <Text numberOfLines={1} style={styles.bookTitle}>{book.title}</Text>
          <Pressable onPress={onFavorite} hitSlop={8} accessibilityRole="button" accessibilityLabel={book.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
            <Ionicons name={book.favorite ? "star" : "star-outline"} size={19} color={book.favorite ? "#ffdb4d" : C.cyan} />
          </Pressable>
        </View>
        <Text numberOfLines={1} style={styles.bookAuthor}>{book.author || `${book.format.toUpperCase()} · ${book.progress}% lido`}</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${book.progress}%` }]} /></View>
        <View style={styles.actions}>
          <Pressable onPress={onOpen} style={styles.continueButton} accessibilityRole="button">
            <Ionicons name="play" size={17} color={C.cyan} />
            <Text style={styles.continueText}>{book.progress ? "Continuar" : "Ler agora"}</Text>
          </Pressable>
          {onRemove ? <Pressable onPress={onRemove} style={styles.removeButton} hitSlop={10} accessibilityLabel="Remover da biblioteca"><Ionicons name="close" size={20} color={C.muted} /></Pressable> : null}
        </View>
      </View>
    </View>
  );
}

const quoteColors = ["#b7ff41", "#e56aff", "#24d9ff", "#ff8d51"];
export function ExcerptCard({ excerpt, book, index, onOpen, onEdit, onRemove }: {
  excerpt: SavedExcerpt; book?: LibraryBook; index: number; onOpen: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const accent = quoteColors[index % quoteColors.length];
  return (
    <View style={[styles.excerptCard, { borderColor: accent }]}>
      <Pressable style={styles.excerptBody} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Abrir trecho de ${book?.title ?? "livro"}`}>
        <Text style={[styles.quoteMark, { color: accent }]}>“</Text>
        <Text numberOfLines={4} style={styles.quoteText}>{excerpt.quote}</Text>
        <Text numberOfLines={1} style={styles.quoteSource}>— {book?.title ?? "Livro removido"}{book?.author ? ` · ${book.author}` : ""}{excerpt.page ? ` · Pág. ${excerpt.page}` : ""}</Text>
      </Pressable>
      <View style={styles.excerptActions}>
        <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Editar trecho"><Ionicons name="pencil" size={16} color={accent} /></Pressable>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remover trecho"><Ionicons name="trash-outline" size={16} color={accent} /></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bookCard: { backgroundColor: C.panel, borderRadius: 15, borderWidth: 1, borderColor: C.line, padding: 8, overflow: "hidden" },
  bookInfo: { paddingHorizontal: 3, paddingTop: 9, paddingBottom: 3 },
  bookTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bookTitle: { flex: 1, color: C.text, fontSize: 15, fontWeight: "700" },
  bookAuthor: { color: C.muted, marginTop: 5, fontSize: 12 },
  progressTrack: { height: 5, marginTop: 12, borderRadius: 99, backgroundColor: "#20263d", overflow: "hidden" },
  progressFill: { height: 5, borderRadius: 99, backgroundColor: C.pink },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  continueButton: { flex: 1, minHeight: 41, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9, borderColor: "#4b31a1", borderWidth: 1, borderRadius: 9, backgroundColor: "#181135" },
  continueText: { color: C.text, fontSize: 13, fontWeight: "600" },
  removeButton: { width: 31, height: 40, alignItems: "center", justifyContent: "center" },
  excerptCard: { backgroundColor: "#111329", borderWidth: 1.5, borderRadius: 13, padding: 15, marginBottom: 12, shadowColor: "#be42ff", shadowOpacity: 0.15, shadowRadius: 9 },
  excerptBody: { paddingRight: 3 },
  quoteMark: { fontSize: 31, fontWeight: "800", lineHeight: 34 },
  quoteText: { color: C.text, fontSize: 17, fontWeight: "600", lineHeight: 25, marginTop: -3 },
  quoteSource: { color: C.muted, marginTop: 12, fontSize: 12 },
  excerptActions: { flexDirection: "row", justifyContent: "flex-end", gap: 18, paddingTop: 9 },
});
