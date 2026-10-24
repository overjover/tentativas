import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import type { LibraryBook } from "@/lib/reader/types";

const NEON = { pink: "#e128ff", cyan: "#12ddff", ink: "#080b1a", panel: "#15132d" };

export function BookCover({ book, height = 176 }: { book: LibraryBook; height?: number }) {
  return (
    <View style={[styles.frame, { height }]}>
      {book.coverUri ? (
        <Image source={{ uri: book.coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} />
      ) : (
        <View style={styles.placeholder}>
          <View style={styles.cornerGlow} />
          <Text style={styles.monogram} numberOfLines={1}>{book.title.slice(0, 2).toUpperCase()}</Text>
          <Text style={styles.placeholderTitle} numberOfLines={3}>{book.title}</Text>
          <Text style={styles.format}>{book.format.toUpperCase()} · SEM CAPA</Text>
        </View>
      )}
      <View pointerEvents="none" style={styles.neonTop} />
      <View pointerEvents="none" style={styles.neonBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", overflow: "hidden", borderRadius: 13, borderWidth: 1, borderColor: "#383166", backgroundColor: NEON.panel },
  placeholder: { flex: 1, padding: 12, justifyContent: "center", alignItems: "center", overflow: "hidden", backgroundColor: NEON.panel },
  cornerGlow: { position: "absolute", width: 150, height: 150, borderRadius: 100, backgroundColor: "#5931a3", opacity: 0.24, top: -60, right: -50 },
  monogram: { color: "#e7e3ff", fontSize: 29, fontWeight: "700", letterSpacing: 2, marginBottom: 8 },
  placeholderTitle: { color: "#c7c9db", fontSize: 12, textAlign: "center", lineHeight: 16 },
  format: { color: NEON.cyan, fontSize: 8, letterSpacing: 1.4, marginTop: 12 },
  neonTop: { position: "absolute", top: 0, left: 0, width: 45, height: 2, backgroundColor: NEON.cyan },
  neonBottom: { position: "absolute", bottom: 0, right: 0, width: 48, height: 2, backgroundColor: NEON.pink },
});
