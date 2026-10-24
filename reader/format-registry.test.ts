import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

const fs = vi.hoisted(() => ({ files: new Map<string, { text?: string; base64?: string; size?: number }>() }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@lingo-reader/mobi-parser", () => ({ initKf8File: vi.fn(), initMobiFile: vi.fn() }));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  makeDirectoryAsync: vi.fn(async () => undefined),
  getInfoAsync: vi.fn(async (uri: string) => {
    const found = fs.files.get(uri);
    return found ? { exists: true, size: found.size ?? found.text?.length ?? 1 } : { exists: false, size: 0 };
  }),
  readAsStringAsync: vi.fn(async (uri: string, options: { encoding: string }) => {
    const found = fs.files.get(uri);
    if (!found) throw new Error("Arquivo ausente");
    if (options.encoding === "base64") return found.base64 ?? "";
    return found.text ?? "";
  }),
  copyAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
    const source = fs.files.get(from);
    if (!source) throw new Error("Origem inexistente");
    fs.files.set(to, { ...source });
  }),
  writeAsStringAsync: vi.fn(async (uri: string, text: string) => { fs.files.set(uri, { text, size: text.length }); }),
  deleteAsync: vi.fn(async (uri: string) => { fs.files.delete(uri); }),
}));

vi.mock("expo-file-system", () => ({
  File: class {
    constructor(readonly uri: string) {}
    get exists() { return fs.files.has(this.uri); }
    get size() { const item = fs.files.get(this.uri); return item?.size ?? (item?.base64 ? Buffer.from(item.base64, "base64").byteLength : item?.text?.length ?? 0); }
    create({ overwrite = false }: { overwrite?: boolean } = {}) { if (this.exists && !overwrite) throw new Error("File exists"); fs.files.set(this.uri, { base64: "", size: 0 }); }
    delete() { fs.files.delete(this.uri); }
    open(mode: string) {
      let offset = 0;
      if (mode === "writeOnly" && !this.exists) this.create();
      return {
        readBytes: async (count: number) => { const item = fs.files.get(this.uri); const bytes = Buffer.from(item?.base64 ?? "", "base64"); const chunk = bytes.subarray(offset, offset + count); offset += chunk.byteLength; return new Uint8Array(chunk); },
        writeBytes: (chunk: Uint8Array) => { const old = Buffer.from(fs.files.get(this.uri)?.base64 ?? "", "base64"); const next = Buffer.concat([old, Buffer.from(chunk)]); fs.files.set(this.uri, { base64: next.toString("base64"), size: next.byteLength }); },
        close: () => undefined,
      };
    }
    async bytes() { const item = fs.files.get(this.uri); return new Uint8Array(Buffer.from(item?.base64 ?? "", "base64")); }
  },
  FileMode: { ReadOnly: "readOnly", WriteOnly: "writeOnly" },
}));

import { createBookFromFile, getFormat, loadReaderContent } from "./format-registry";
import type { LibraryBook } from "./types";

function inputFile(name: string, uri: string) { return { name, uri }; }
async function epubArchive(opf = `<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Livro de teste</dc:title><dc:creator>Ana</dc:creator></metadata><manifest><item id="one" href="text/one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="text/two.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>`) {
  const zip = new JSZip();
  zip.file("META-INF/container.xml", `<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>`);
  zip.file("OPS/book.opf", opf);
  zip.file("OPS/text/one.xhtml", `<html><body><h1>Início</h1><p>Primeira parte.</p></body></html>`);
  zip.file("OPS/text/two.xhtml", `<html><body><p>Segunda parte.</p></body></html>`);
  zip.file("OPS/images/cover.jpg", "imagem-de-teste");
  return zip.generateAsync({ type: "base64" });
}

describe("format registry regression", () => {
  beforeEach(() => fs.files.clear());

  it("detects free book/comic formats and rejects unknown extensions", () => {
    expect(getFormat("pdf")).toBe("pdf");
    expect(getFormat("epub")).toBe("epub");
    expect(getFormat("cbr")).toBe("cbr");
    expect(getFormat("rar")).toBe("rar");
    expect(getFormat("mobi")).toBe("mobi");
    expect(getFormat("azw3")).toBe("azw3");
    expect(getFormat("7z")).toBeNull();
  });

  it("opens a local TXT and preserves PDF route metadata", async () => {
    fs.files.set("file:///in/sample.txt", { text: "Texto local", size: 11 });
    const textBook = await createBookFromFile(inputFile("sample.txt", "file:///in/sample.txt"));
    expect(await loadReaderContent(textBook)).toEqual({ text: "Texto local" });
    fs.files.set("file:///in/document.pdf", { size: 10 });
    const pdf = await createBookFromFile(inputFile("document.pdf", "file:///in/document.pdf"));
    expect(pdf.format).toBe("pdf");
    expect(await loadReaderContent(pdf)).toEqual({});
  });

  it("reads EPUB title/author/cover and follows OPF spine order without inventing chapter names", async () => {
    fs.files.set("file:///in/novel.epub", { base64: await epubArchive(), size: 500 });
    const book = await createBookFromFile(inputFile("novel.epub", "file:///in/novel.epub"));
    expect(book).toMatchObject({ title: "Livro de teste", author: "Ana", format: "epub" });
    expect(book.coverUri).toContain("cover.jpg");
    const content = await loadReaderContent(book);
    expect(content.chapters?.map((chapter) => chapter.title)).toEqual(["Parte 1", "Parte 2"]);
    expect(content.chapters?.map((chapter) => chapter.text)).toEqual(["Início\n\nPrimeira parte.", "Segunda parte."]);
  });

  it("rejects a malformed OPF at import rather than silently adding a broken EPUB", async () => {
    fs.files.set("file:///in/broken.epub", { base64: await epubArchive("<package><spine>").catch(() => ""), size: 20 });
    await expect(createBookFromFile(inputFile("broken.epub", "file:///in/broken.epub"))).rejects.toThrow(/OPF|metadados/i);
  });

  it("keeps scanned PDFs explicitly outside OCR and propagates missing local documents", async () => {
    const absent: LibraryBook = { id: "gone", uri: "file:///missing.txt", fileName: "gone.txt", title: "Gone", format: "txt", kind: "book", importedAt: 1, progress: 0, position: 0, favorite: false };
    await expect(loadReaderContent(absent)).rejects.toThrow(/ausente/i);
  });
});
