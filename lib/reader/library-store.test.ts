import { beforeEach, describe, expect, it, vi } from "vitest";

const values = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
  },
}));

import { readBooks, readExcerpts, writeBooks, writeExcerpts } from "./library-store";
import type { LibraryBook, SavedExcerpt } from "./types";

const book: LibraryBook = { id: "book-1", uri: "file:///app/book.epub", fileName: "book.epub", title: "Book", author: "Writer", format: "epub", kind: "book", coverUri: "file:///app/cover.jpg", importedAt: 5, lastOpenedAt: 10, progress: 42, position: 9, spokenPosition: 3, spokenOffset: 27, readingSeconds: 91, favorite: true };
const excerpt: SavedExcerpt = { id: "excerpt-1", bookId: book.id, quote: "Trecho", page: 4, createdAt: 11 };

describe("library serialization", () => {
  beforeEach(() => values.clear());

  it("round-trips book progress, favorite, narration position and actual reading time", async () => {
    await writeBooks([book]);
    expect(await readBooks()).toEqual([book]);
  });

  it("round-trips annotations with their book and page", async () => {
    await writeExcerpts([excerpt]);
    expect(await readExcerpts()).toEqual([excerpt]);
  });

  it("falls back to an empty collection instead of crashing on corrupt JSON", async () => {
    values.set("leitorplay.library.v1", "{bad json");
    values.set("leitorplay.excerpts.v1", "null");
    expect(await readBooks()).toEqual([]);
    expect(await readExcerpts()).toEqual([]);
  });
});
