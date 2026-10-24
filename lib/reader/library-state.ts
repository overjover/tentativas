import type { LibraryBook, SavedExcerpt } from "./types";

export function toggleFavoriteInList(books: LibraryBook[], id: string): LibraryBook[] {
  return books.map((book) => book.id === id ? { ...book, favorite: !book.favorite } : book);
}

export function updateProgressInList(books: LibraryBook[], id: string, progress: number, position: number, now = Date.now()): LibraryBook[] {
  return books.map((book) => book.id === id
    ? { ...book, progress: Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0)), position: Math.max(0, Math.floor(Number.isFinite(position) ? position : 0)), lastOpenedAt: now }
    : book);
}

export function updateNarrationInList(books: LibraryBook[], id: string, position: number, now = Date.now(), offset = 0): LibraryBook[] {
  return books.map((book) => book.id === id
    ? { ...book, spokenPosition: Math.max(0, Math.floor(Number.isFinite(position) ? position : 0)), spokenOffset: Math.max(0, Math.floor(Number.isFinite(offset) ? offset : 0)), lastOpenedAt: now }
    : book);
}

export function addReadingSecondsInList(books: LibraryBook[], id: string, seconds: number): LibraryBook[] {
  const increment = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  if (!increment) return books;
  return books.map((book) => book.id === id ? { ...book, readingSeconds: (book.readingSeconds ?? 0) + increment } : book);
}

export function addExcerptToList(excerpts: SavedExcerpt[], bookId: string, quote: string, page?: number, now = Date.now(), id = `${now}-${Math.random().toString(36).slice(2, 7)}`): SavedExcerpt[] {
  const clean = quote.trim();
  if (!clean) return excerpts;
  const pageNumber = page === undefined ? undefined : Math.max(1, Math.floor(Number.isFinite(page) ? page : 1));
  return [{ id, bookId, quote: clean, page: pageNumber, createdAt: now }, ...excerpts];
}

export function editExcerptInList(excerpts: SavedExcerpt[], id: string, quote: string): SavedExcerpt[] {
  const clean = quote.trim();
  if (!clean) return excerpts;
  return excerpts.map((item) => item.id === id ? { ...item, quote: clean } : item);
}

export function removeExcerptFromList(excerpts: SavedExcerpt[], id: string): SavedExcerpt[] {
  return excerpts.filter((item) => item.id !== id);
}

export function removeBookFromList(books: LibraryBook[], excerpts: SavedExcerpt[], id: string) {
  return { books: books.filter((book) => book.id !== id), excerpts: excerpts.filter((item) => item.bookId !== id) };
}
