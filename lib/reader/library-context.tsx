import * as DocumentPicker from "expo-document-picker";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Platform } from "react-native";

import { createBookFromFile } from "./format-registry";
import { pickAndRestoreLibraryBackup, shareLibraryBackup } from "./backup";
import { readBooks, readExcerpts, writeBooks, writeExcerpts } from "./library-store";
import { addExcerptToList, addReadingSecondsInList, editExcerptInList, removeBookFromList, removeExcerptFromList, toggleFavoriteInList, updateNarrationInList, updateProgressInList } from "./library-state";
import type { ImportedFile, LibraryBook, SavedExcerpt } from "./types";

type LibraryContextValue = {
  books: LibraryBook[];
  excerpts: SavedExcerpt[];
  ready: boolean;
  importFiles: () => Promise<void>;
  exportBackup: () => Promise<void>;
  restoreBackup: () => Promise<void>;
  toggleFavorite: (id: string) => void;
  openBook: (id: string) => void;
  updateProgress: (id: string, progress: number, position: number) => void;
  updateNarrationPosition: (id: string, position: number, charOffset?: number) => void;
  recordReadingSeconds: (id: string, seconds: number) => void;
  addExcerpt: (bookId: string, quote: string, page?: number) => void;
  editExcerpt: (id: string, quote: string) => void;
  removeExcerpt: (id: string) => void;
  removeBook: (id: string) => void;
  confirmRemoveBook: (id: string) => void;
  bookById: (id: string) => LibraryBook | undefined;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

function announce(message: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(message);
  } else {
    Alert.alert("LeitorPlay", message);
  }
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [excerpts, setExcerpts] = useState<SavedExcerpt[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([readBooks(), readExcerpts()]).then(([storedBooks, storedExcerpts]) => {
      if (!alive) return;
      setBooks(storedBooks);
      setExcerpts(storedExcerpts);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  const persistBooks = useCallback((next: LibraryBook[]) => {
    setBooks(next);
    void writeBooks(next);
  }, []);
  const persistExcerpts = useCallback((next: SavedExcerpt[]) => {
    setExcerpts(next);
    void writeExcerpts(next);
  }, []);

  const exportBackup = useCallback(async () => {
    try { await shareLibraryBackup(books, excerpts); }
    catch (error) { announce(error instanceof Error ? error.message : "Não foi possível criar o backup."); }
  }, [books, excerpts]);

  const restoreBackup = useCallback(async () => {
    try {
      const restored = await pickAndRestoreLibraryBackup(books);
      if (!restored) return;
      const knownBookIds = new Set(books.map((book) => book.id));
      const importedBooks = restored.books.filter((book) => !knownBookIds.has(book.id));
      const knownExcerptIds = new Set(excerpts.map((excerpt) => excerpt.id));
      const importedExcerpts = restored.excerpts.map((excerpt) => knownExcerptIds.has(excerpt.id)
        ? { ...excerpt, id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` }
        : excerpt);
      persistBooks([...importedBooks, ...books]);
      persistExcerpts([...importedExcerpts, ...excerpts]);
      announce(`${importedBooks.length} item(ns) restaurado(s) sem substituir a biblioteca atual.`);
    } catch (error) { announce(error instanceof Error ? error.message : "Não foi possível restaurar o backup."); }
  }, [books, excerpts, persistBooks, persistExcerpts]);

  const importFiles = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const imported: LibraryBook[] = [];
    const failures: string[] = [];
    for (const asset of result.assets) {
      const input: ImportedFile = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
        file: (asset as typeof asset & { file?: File }).file,
      };
      try {
        imported.push(await createBookFromFile(input));
      } catch (error) {
        failures.push(`${asset.name}: ${error instanceof Error ? error.message : "não foi possível importar"}`);
      }
    }
    if (imported.length) {
      persistBooks([...imported, ...books]);
      announce(`${imported.length} arquivo(s) adicionado(s) à sua biblioteca.`);
    }
    if (failures.length) announce(failures.slice(0, 3).join("\n"));
  }, [books, persistBooks]);

  const toggleFavorite = useCallback((id: string) => {
    persistBooks(toggleFavoriteInList(books, id));
  }, [books, persistBooks]);

  const openBook = useCallback((id: string) => {
    persistBooks(books.map((book) => book.id === id ? { ...book, lastOpenedAt: Date.now() } : book));
  }, [books, persistBooks]);

  const updateProgress = useCallback((id: string, progress: number, position: number) => {
    persistBooks(updateProgressInList(books, id, progress, position));
  }, [books, persistBooks]);

  const updateNarrationPosition = useCallback((id: string, position: number, charOffset = 0) => {
    setBooks((current) => {
      const next = updateNarrationInList(current, id, position, Date.now(), charOffset);
      void writeBooks(next);
      return next;
    });
  }, []);

  const recordReadingSeconds = useCallback((id: string, seconds: number) => {
    const increment = Math.max(0, Math.floor(seconds));
    if (!increment) return;
    setBooks((current) => {
      const next = addReadingSecondsInList(current, id, increment);
      void writeBooks(next);
      return next;
    });
  }, []);

  const addExcerpt = useCallback((bookId: string, quote: string, page?: number) => {
    persistExcerpts(addExcerptToList(excerpts, bookId, quote, page));
  }, [excerpts, persistExcerpts]);

  const editExcerpt = useCallback((id: string, quote: string) => {
    persistExcerpts(editExcerptInList(excerpts, id, quote));
  }, [excerpts, persistExcerpts]);

  const removeExcerpt = useCallback((id: string) => {
    persistExcerpts(removeExcerptFromList(excerpts, id));
  }, [excerpts, persistExcerpts]);

  const removeBook = useCallback((id: string) => {
    const next = removeBookFromList(books, excerpts, id);
    persistBooks(next.books);
    persistExcerpts(next.excerpts);
  }, [books, excerpts, persistBooks, persistExcerpts]);

  const confirmRemoveBook = useCallback((id: string) => {
    const proceed = () => removeBook(id);
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Remover este item da biblioteca? O arquivo original não será apagado.")) proceed();
      return;
    }
    Alert.alert("Remover da biblioteca?", "O arquivo original do aparelho não será apagado.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: proceed },
    ]);
  }, [removeBook]);

  const value = useMemo<LibraryContextValue>(() => ({
    books, excerpts, ready, importFiles, exportBackup, restoreBackup, toggleFavorite, openBook, updateProgress, updateNarrationPosition, recordReadingSeconds, addExcerpt,
    editExcerpt, removeExcerpt, removeBook, confirmRemoveBook,
    bookById: (id) => books.find((book) => book.id === id),
  }), [books, excerpts, ready, importFiles, exportBackup, restoreBackup, toggleFavorite, openBook, updateProgress, updateNarrationPosition, recordReadingSeconds, addExcerpt,
    editExcerpt, removeExcerpt, removeBook, confirmRemoveBook]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("useLibrary precisa estar dentro de LibraryProvider.");
  return value;
}
