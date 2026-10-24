import { describe, expect, it } from "vitest";

import { addExcerptToList, addReadingSecondsInList, editExcerptInList, removeBookFromList, removeExcerptFromList, toggleFavoriteInList, updateNarrationInList, updateProgressInList } from "./library-state";
import type { LibraryBook, SavedExcerpt } from "./types";

const book: LibraryBook = { id: "book-1", uri: "file:///book.txt", fileName: "book.txt", title: "Book", format: "txt", kind: "book", importedAt: 1, progress: 0, position: 0, favorite: false };

describe("library state transitions", () => {
  it("clamps reading progress and keeps a non-negative page/scroll offset", () => {
    expect(updateProgressInList([book], book.id, 150, -3, 9)[0]).toMatchObject({ progress: 100, position: 0, lastOpenedAt: 9 });
    expect(updateProgressInList([book], book.id, -20, 6, 10)[0]).toMatchObject({ progress: 0, position: 6, lastOpenedAt: 10 });
  });

  it("toggles a favorite and records actual narration position and accumulated time", () => {
    const favorite = toggleFavoriteInList([book], book.id)[0];
    const narrated = updateNarrationInList([favorite], book.id, 4, 20, 13)[0];
    const timed = addReadingSecondsInList([narrated], book.id, 32)[0];
    expect(timed).toMatchObject({ favorite: true, spokenPosition: 4, spokenOffset: 13, readingSeconds: 32, lastOpenedAt: 20 });
    expect(updateNarrationInList([favorite], book.id, 4, 21, Number.NaN)[0].spokenOffset).toBe(0);
    expect(addReadingSecondsInList([timed], book.id, -8)[0].readingSeconds).toBe(32);
  });

  it("creates, edits and deletes annotations without losing their source or page", () => {
    const item = addExcerptToList([], book.id, "  Um trecho importante  ", 7, 30, "excerpt-1")[0];
    expect(item).toMatchObject({ id: "excerpt-1", bookId: book.id, quote: "Um trecho importante", page: 7, createdAt: 30 });
    const edited = editExcerptInList([item], item.id, "  Alterado  ");
    expect(edited[0].quote).toBe("Alterado");
    expect(removeExcerptFromList(edited, item.id)).toEqual([]);
    expect(addExcerptToList([item], book.id, " \n ")).toEqual([item]);
  });

  it("removing a book also removes its dependent annotations", () => {
    const excerpt: SavedExcerpt = { id: "e1", bookId: book.id, quote: "Text", page: 1, createdAt: 1 };
    expect(removeBookFromList([book], [excerpt], book.id)).toEqual({ books: [], excerpts: [] });
  });
});
