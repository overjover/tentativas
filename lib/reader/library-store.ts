import AsyncStorage from "@react-native-async-storage/async-storage";

import type { LibraryBook, SavedExcerpt } from "./types";

const BOOKS_KEY = "leitorplay.library.v1";
const EXCERPTS_KEY = "leitorplay.excerpts.v1";

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

export const readBooks = () => readJson<LibraryBook[]>(BOOKS_KEY, []);
export const writeBooks = (books: LibraryBook[]) => AsyncStorage.setItem(BOOKS_KEY, JSON.stringify(books));
export const readExcerpts = () => readJson<SavedExcerpt[]>(EXCERPTS_KEY, []);
export const writeExcerpts = (excerpts: SavedExcerpt[]) => AsyncStorage.setItem(EXCERPTS_KEY, JSON.stringify(excerpts));
