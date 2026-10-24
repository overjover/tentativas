import { beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const fs = vi.hoisted(() => ({ files: new Map<string, Uint8Array>() }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

vi.mock("expo-file-system", () => {
  class MockFile {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      const first = parts[0];
      this.uri = typeof first === "string" ? (parts[1] ? `${first.replace(/\/$/, "")}/${parts[1]}` : first) : first?.uri ?? "";
    }
    get exists() { return fs.files.has(this.uri); }
    get size() { return fs.files.get(this.uri)?.byteLength ?? 0; }
    create({ overwrite = false }: { intermediates?: boolean; overwrite?: boolean } = {}) {
      if (this.exists && !overwrite) throw new Error("File exists");
      fs.files.set(this.uri, new Uint8Array());
    }
    open(mode: string) {
      let offset = 0;
      if (mode === "writeOnly" && !this.exists) fs.files.set(this.uri, new Uint8Array());
      return {
        readBytes: async (length: number) => {
          const data = fs.files.get(this.uri) ?? new Uint8Array();
          const chunk = data.slice(offset, offset + length);
          offset += chunk.byteLength;
          return chunk;
        },
        writeBytes: (chunk: Uint8Array) => {
          const current = fs.files.get(this.uri) ?? new Uint8Array();
          const next = new Uint8Array(current.byteLength + chunk.byteLength);
          next.set(current);
          next.set(chunk, current.byteLength);
          fs.files.set(this.uri, next);
        },
        close: () => undefined,
      };
    }
    delete() { fs.files.delete(this.uri); }
  }
  return { File: MockFile, FileMode: { ReadOnly: "readOnly", WriteOnly: "writeOnly" }, Paths: { cache: "file:///cache/", document: "file:///documents/" } };
});

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  makeDirectoryAsync: async () => undefined,
  copyAsync: async ({ from, to }: { from: string; to: string }) => {
    const bytes = fs.files.get(from);
    if (!bytes) throw new Error(`missing source ${from}`);
    fs.files.set(to, bytes.slice());
  },
  deleteAsync: async (uri: string) => {
    for (const path of fs.files.keys()) if (path === uri || path.startsWith(uri)) fs.files.delete(path);
  },
}));

vi.mock("expo-document-picker", () => ({ getDocumentAsync: vi.fn() }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: async () => true, shareAsync: async () => undefined }));

import { createLibraryBackup, restoreLibraryBackup } from "./backup";
import type { LibraryBook, SavedExcerpt } from "./types";

const sourceUri = "file:///documents/source.txt";
const book: LibraryBook = {
  id: "book-1", uri: sourceUri, fileName: "source.txt", title: "Livro de teste", author: "Ana",
  format: "txt", kind: "book", importedAt: 2, lastOpenedAt: 10, progress: 42, position: 15,
  spokenPosition: 5, readingSeconds: 120, favorite: true, pageUris: ["file:///stale/page.jpg"],
};
const excerpt: SavedExcerpt = { id: "excerpt-1", bookId: book.id, quote: "Nota salva", page: 3, createdAt: 12 };

describe("library backup and restore", () => {
  beforeEach(() => fs.files.clear());

  it("streams a ZIP and restores documents plus serialised state without stale page URIs", async () => {
    const source = strToU8("texto original do livro");
    fs.files.set(sourceUri, source);
    const backupUri = await createLibraryBackup([book], [excerpt]);
    const archive = fs.files.get(backupUri);
    expect(archive).toBeDefined();
    const entries = unzipSync(archive!);
    const manifest = JSON.parse(strFromU8(entries["manifest.json"])) as { books: Array<Record<string, unknown>> };
    expect(strFromU8(entries["books/book-1.txt"])).toBe("texto original do livro");
    expect(manifest.books[0]).not.toHaveProperty("uri");
    expect(manifest.books[0]).not.toHaveProperty("pageUris");

    const restored = await restoreLibraryBackup(backupUri, []);
    expect(restored.books).toHaveLength(1);
    expect(restored.books[0]).toMatchObject({ title: book.title, favorite: true, progress: 42, position: 15, spokenPosition: 5, readingSeconds: 120 });
    expect(restored.books[0].pageUris).toBeUndefined();
    expect(fs.files.get(restored.books[0].uri)).toEqual(source);
    expect(restored.excerpts).toEqual([excerpt]);
  });

  it("merges a colliding identifier with a new ID and remaps its saved excerpts", async () => {
    fs.files.set(sourceUri, strToU8("conteúdo"));
    const backupUri = await createLibraryBackup([book], [excerpt]);
    const existing: LibraryBook = { ...book, title: "Já existe", uri: "file:///documents/book-1.txt" };
    const restored = await restoreLibraryBackup(backupUri, [existing]);
    expect(restored.books[0].id).not.toBe(book.id);
    expect(restored.excerpts[0].bookId).toBe(restored.books[0].id);
  });

  it("rejects ZIP traversal paths before they are copied outside the staging folder", async () => {
    const manifest = strToU8(JSON.stringify({ app: "LeitorPlay", version: 1, books: [], excerpts: [] }));
    const badZip = zipSync({ "manifest.json": manifest, "../escape.txt": strToU8("no") });
    const uri = "file:///cache/unsafe.zip";
    fs.files.set(uri, badZip);
    await expect(restoreLibraryBackup(uri, [])).rejects.toThrow(/caminho|seguro/i);
    expect(fs.files.has("file:///documents/escape.txt")).toBe(false);
  });
});
