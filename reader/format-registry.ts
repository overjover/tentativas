import { initKf8File, initMobiFile } from "@lingo-reader/mobi-parser";
import * as FileSystem from "expo-file-system/legacy";
import { File, FileMode } from "expo-file-system";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import JSZip from "jszip";
import { Platform } from "react-native";

import type { ImportedFile, LibraryBook, LibraryKind, ReaderChapter, ReaderContent, ReaderFormat } from "./types";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp"]);
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp",
};
const MAX_JSZIP_BYTES = 48 * 1024 * 1024;
const MAX_EPUB_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_EPUB_TEXT_BYTES = 32 * 1024 * 1024;
const MAX_EPUB_EXPANDED_BYTES = 512 * 1024 * 1024;
const MAX_EPUB_COVER_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 24 * 1024 * 1024;
const MAX_MOBI_BYTES = 48 * 1024 * 1024;
const MAX_COMIC_PAGES = 2000;
const MAX_COMIC_BYTES = 1024 * 1024 * 1024;

export const SUPPORTED_FORMATS = [
  { label: "PDF", extensions: [".pdf"], family: "Livro/documento · OCR ainda não incluído" },
  { label: "EPUB", extensions: [".epub"], family: "Livro digital · ZIP em blocos · texto até 32 MB" },
  { label: "MOBI / AZW3", extensions: [".mobi", ".azw", ".azw3"], family: "Livro digital sem DRM · até 48 MB" },
  { label: "Mangá compactado", extensions: [".cbz", ".cbr", ".rar", ".zip"], family: "CBZ/ZIP/RAR/CBR · páginas extraídas no aparelho" },
  { label: "FB2", extensions: [".fb2"], family: "Livro digital" },
  { label: "DOCX", extensions: [".docx"], family: "Documento" },
  { label: "RTF", extensions: [".rtf"], family: "Documento" },
  { label: "TXT / Markdown / HTML", extensions: [".txt", ".md", ".markdown", ".html", ".htm"], family: "Texto · até 24 MB" },
  { label: "Imagens", extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"], family: "Página única" },
];

type ComicResult = { imagePages: string[]; coverUri?: string };

export function getExtension(fileName: string): string {
  return fileName.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";
}

export function getFormat(extension: string): ReaderFormat | null {
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  const formats: Record<string, ReaderFormat> = {
    pdf: "pdf", epub: "epub", cbz: "cbz", cbr: "cbr", rar: "rar", zip: "zip",
    mobi: "mobi", azw: "mobi", azw3: "azw3", txt: "txt", md: "md", markdown: "md",
    html: "html", htm: "html", fb2: "fb2", docx: "docx", rtf: "rtf",
  };
  return formats[extension] ?? null;
}

export function inferKind(format: ReaderFormat): LibraryKind {
  if (["cbz", "cbr", "rar", "zip"].includes(format)) return "comic";
  if (format === "image") return "image";
  if (["txt", "md", "html", "fb2", "docx", "rtf", "epub", "mobi", "azw3"].includes(format)) return "book";
  return "document";
}

function safeStem(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_").slice(0, 90).trim() || "leitura";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => { const c = Number(n); return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : ""; })
    .replace(/&#x([\da-f]+);/gi, (_, n: string) => { const c = parseInt(n, 16); return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : ""; });
}

function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section|\/article)\b[^>]*>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ").replace(/[\t ]+/g, " ").replace(/\n[\t ]+/g, "\n").trim());
}

function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<(?:(?:dc|opf):)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:dc|opf):)?${tag}\\s*>`, "i"));
  return match?.[1] ? decodeEntities(match[1].replace(/<[^>]+>/g, "").trim()) : undefined;
}

function nativePath(uri: string): string {
  const path = uri.replace(/^file:\/\//, "");
  try { return decodeURIComponent(path); } catch { return path; }
}

function asFileUri(path: string): string { return path.startsWith("file://") ? path : `file://${path}`; }

async function fileSize(uri: string): Promise<number | undefined> {
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  return info?.exists ? info.size : undefined;
}

async function readBase64(uri: string): Promise<string> {
  const size = await fileSize(uri);
  if (size !== undefined && size > MAX_JSZIP_BYTES) throw new Error("Este EPUB/DOCX tem mais de 48 MB. Para evitar travamentos por falta de memória, arquivos ZIP grandes não são carregados de uma vez.");
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

async function readBoundedText(uri: string): Promise<string> {
  const size = await fileSize(uri);
  if (size !== undefined && size > MAX_TEXT_BYTES) throw new Error("Este documento de texto tem mais de 24 MB; foi interrompido para proteger a memória do aparelho.");
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

async function appFolder(): Promise<string> {
  const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!root) throw new Error("O armazenamento local de arquivos não está disponível neste dispositivo.");
  const folder = `${root}leitorplay/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
  return folder;
}

async function saveArchiveImage(bookId: string, fileName: string, base64: string): Promise<string> {
  const ext = getExtension(fileName) || "jpg";
  if (Platform.OS === "web") {
    const binary = typeof atob === "function" ? atob(base64) : "";
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: MIME_BY_EXTENSION[ext] ?? "image/jpeg" }));
  }
  const path = `${await appFolder()}${bookId}-${safeStem(fileName)}.${ext}`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

async function loadZip(uri: string): Promise<JSZip> {
  return JSZip.loadAsync(await readBase64(uri), { base64: true, checkCRC32: false });
}

function normalizeZipName(input: string): string | null {
  if (input.startsWith("/")) return null;
  const segments: string[] = [];
  for (const segment of input.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
    } else segments.push(segment);
  }
  return segments.join("/");
}

function resolveZipPath(base: string, reference: string): string | null {
  const clean = reference.split(/[?#]/, 1)[0];
  let decoded: string;
  try { decoded = decodeURIComponent(clean); } catch { return null; }
  return normalizeZipName(`${base}${decoded}`);
}

type ZipChunkHandler = (chunk: Uint8Array, final: boolean) => void;

async function streamZipEntries(uri: string, onEntry: (name: string) => ZipChunkHandler | null): Promise<void> {
  const input = new File(uri);
  if (!input.exists) throw new Error("Este arquivo compactado não está mais disponível. Reimporte-o para continuar.");
  if (input.size > MAX_EPUB_ARCHIVE_BYTES) throw new Error("O arquivo EPUB tem mais de 256 MB; ele não será carregado para proteger a memória do aparelho.");
  let entryCount = 0;
  let expandedBytes = 0;
  let failure: Error | null = null;
  const unzip = new Unzip((entry) => {
    entryCount += 1;
    if (entryCount > 5000) { failure = new Error("O EPUB tem mais de 5.000 arquivos internos."); return; }
    const name = normalizeZipName(entry.name);
    if (!name) { failure = new Error("O EPUB contém um caminho interno inseguro."); return; }
    const handler = name.endsWith("/") ? null : onEntry(name);
    entry.ondata = (error, chunk, final) => {
      if (error) { if (handler) failure = error; return; }
      if (chunk) {
        expandedBytes += chunk.byteLength;
        if (expandedBytes > MAX_EPUB_EXPANDED_BYTES) { failure = new Error("O EPUB se expande para mais de 512 MB; interrompi para proteger o aparelho."); return; }
        handler?.(chunk, final);
      } else if (final) handler?.(new Uint8Array(), true);
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  const handle = input.open(FileMode.ReadOnly);
  let finalChunk = false;
  try {
    while (!finalChunk) {
      const bytes = await handle.readBytes(64 * 1024);
      finalChunk = bytes.byteLength === 0;
      unzip.push(bytes, finalChunk);
      if (failure) throw failure;
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error("Não foi possível ler o ZIP do EPUB.");
  } finally { handle.close(); }
  if (failure) throw failure;
  if (!entryCount) throw new Error("O EPUB não contém um arquivo ZIP legível.");
}

const EPUB_TEXT_EXTENSIONS = new Set(["xml", "opf", "xhtml", "html", "htm"]);

async function readEpubMarkup(uri: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  let totalTextBytes = 0;
  if (Platform.OS === "web") {
    const zip = await loadZip(uri);
    for (const [path, file] of Object.entries(zip.files)) {
      const name = normalizeZipName(path);
      if (!name || file.dir || !EPUB_TEXT_EXTENSIONS.has(getExtension(name))) continue;
      const text = await file.async("string");
      totalTextBytes += new TextEncoder().encode(text).byteLength;
      if (totalTextBytes > MAX_EPUB_TEXT_BYTES) throw new Error("O texto interno do EPUB passa de 32 MB.");
      result.set(name, text);
    }
    return result;
  }

  const filesSeen = new Set<string>();
  await streamZipEntries(uri, (name) => {
    if (filesSeen.has(name)) throw new Error("O EPUB contém arquivos internos repetidos.");
    filesSeen.add(name);
    if (!EPUB_TEXT_EXTENSIONS.has(getExtension(name))) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    return (chunk, final) => {
      size += chunk.byteLength;
      totalTextBytes += chunk.byteLength;
      if (totalTextBytes > MAX_EPUB_TEXT_BYTES) throw new Error("O texto interno do EPUB passa de 32 MB.");
      chunks.push(chunk);
      if (final) {
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
        result.set(name, strFromU8(bytes));
      }
    };
  });
  return result;
}

function sortImageNames(names: string[]): string[] {
  return names.sort((a, b) => {
    const rank = (name: string) => /(^|\/)cover\./i.test(name) ? 0 : /front|(^|\/)0*1\./i.test(name) ? 1 : 2;
    return rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
}

async function archivePagesWeb(uri: string, bookId: string): Promise<ComicResult> {
  const zip = await loadZip(uri);
  const names = sortImageNames(Object.keys(zip.files).filter((name) => !zip.files[name].dir && IMAGE_EXTENSIONS.has(getExtension(name))));
  if (!names.length) throw new Error("Este arquivo não contém páginas de imagem reconhecíveis.");
  if (names.length > MAX_COMIC_PAGES) throw new Error("O mangá tem mais de 2.000 imagens; reduza o arquivo para manter a navegação segura.");
  const pages: string[] = [];
  for (const name of names) {
    const image = zip.file(name);
    if (image) pages.push(await saveArchiveImage(bookId, name, await image.async("base64")));
  }
  return { imagePages: pages, coverUri: pages[0] };
}

async function archivePagesNative(uri: string, bookId: string): Promise<ComicResult> {
  if (Platform.OS === "web") throw new Error("CBR/RAR precisam de um build nativo Android/iOS. O Preview Web não contém o descompactador nativo.");
  const module = await import("react-native-unarchive");
  const folder = await appFolder();
  const outputUri = `${folder}${bookId}-pages/`;
  await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => undefined);
  try {
    const result = await module.unarchive(nativePath(uri), nativePath(outputUri));
    const files = result.files.filter((file) => IMAGE_EXTENSIONS.has(getExtension(file.name)));
    const unpackedSize = files.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0);
    if (files.length > MAX_COMIC_PAGES || unpackedSize > MAX_COMIC_BYTES) throw new Error("O arquivo de mangá excede o limite de 2.000 páginas ou 1 GB de imagens.");
    const sorted = sortImageNames(files.map((file) => file.relativePath));
    const byName = new Map(files.map((file) => [file.relativePath, asFileUri(file.path)]));
    const imagePages = sorted.map((name) => byName.get(name)).filter((path): path is string => Boolean(path));
    if (!imagePages.length) throw new Error("Este arquivo compactado não contém páginas de imagem reconhecíveis.");
    return { imagePages, coverUri: imagePages[0] };
  } catch (error) {
    await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => undefined);
    throw error instanceof Error ? error : new Error("Não foi possível descompactar este mangá.");
  }
}

/** Regenerates a comic's sandbox pages after restore or when its extracted files have gone missing. */
export async function rebuildComicPages(book: LibraryBook): Promise<ComicResult> {
  if (Platform.OS === "web") return archivePagesWeb(book.uri, book.id);
  return archivePagesNative(book.uri, book.id);
}

function getEpubPackage(files: Map<string, string>): { opfPath: string; opf: string } {
  const container = files.get("META-INF/container.xml");
  if (!container) throw new Error("Este EPUB está incompleto: não encontrei META-INF/container.xml.");
  if (XMLValidator.validate(container) !== true) throw new Error("O índice do EPUB (container.xml) está inválido.");
  const packageRef = container.match(/full-path=["']([^"']+)["']/i)?.[1];
  const opfPath = packageRef ? resolveZipPath("", packageRef) : null;
  if (!opfPath) throw new Error("Este EPUB não aponta para um pacote OPF válido.");
  const opf = files.get(opfPath);
  if (!opf) throw new Error("O pacote OPF indicado pelo EPUB não existe.");
  if (XMLValidator.validate(opf) !== true) throw new Error("Os metadados do EPUB (OPF) estão inválidos.");
  return { opfPath, opf };
}

async function saveEpubCover(uri: string, bookId: string, archivePath: string): Promise<string | undefined> {
  const extension = getExtension(archivePath);
  if (!IMAGE_EXTENSIONS.has(extension)) return undefined;
  if (Platform.OS === "web") {
    const image = (await loadZip(uri)).file(archivePath);
    return image ? saveArchiveImage(bookId, `cover.${extension}`, await image.async("base64")) : undefined;
  }

  const output = new File(`${await appFolder()}${bookId}-cover.${extension}`);
  let handle: ReturnType<File["open"]> | undefined;
  let imageBytes = 0;
  let found = false;
  try {
    output.create({ intermediates: true, overwrite: true });
    handle = output.open(FileMode.WriteOnly);
    await streamZipEntries(uri, (name) => name === archivePath ? (chunk, final) => {
      imageBytes += chunk.byteLength;
      if (imageBytes > MAX_EPUB_COVER_BYTES) throw new Error("A capa do EPUB passa de 8 MB.");
      if (chunk.byteLength) handle?.writeBytes(chunk);
      if (final) found = true;
    } : null);
    handle.close();
    if (!found || !imageBytes) { output.delete(); return undefined; }
    return output.uri;
  } catch {
    handle?.close();
    output.delete();
    return undefined;
  }
}

async function epubDetails(uri: string, bookId: string): Promise<{ title?: string; author?: string; coverUri?: string }> {
  const files = await readEpubMarkup(uri);
  const { opfPath, opf } = getEpubPackage(files);
  const title = extractTag(opf, "title");
  const author = extractTag(opf, "creator");
  const coverId = opf.match(/<meta\b[^>]*name=["']cover["'][^>]*content=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1];
  const items = [...opf.matchAll(/<item\b[^>]*\/?\s*>/gi)].map((match) => match[0]);
  const coverItem = items.find((item) => (coverId && new RegExp(`id=["']${coverId}["']`, "i").test(item)) || /properties=["'][^"']*cover-image/i.test(item));
  const href = coverItem?.match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) return { title, author };
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const archivePath = resolveZipPath(base, href);
  if (!archivePath) throw new Error("O caminho da capa no OPF está inválido.");
  return { title, author, coverUri: await saveEpubCover(uri, bookId, archivePath) };
}

async function epubChapters(uri: string): Promise<ReaderChapter[]> {
  const files = await readEpubMarkup(uri);
  const { opfPath, opf } = getEpubPackage(files);
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const manifest = new Map<string, string>();
  for (const match of opf.matchAll(/<item\b([^>]+)\/?\s*>/gi)) {
    const id = match[1].match(/id=["']([^"']+)["']/i)?.[1];
    const href = match[1].match(/href=["']([^"']+)["']/i)?.[1];
    if (!id || !href) continue;
    const path = resolveZipPath(base, href);
    if (!path) throw new Error("O caminho de um capítulo no OPF está inválido.");
    manifest.set(id, path);
  }
  const spine = [...opf.matchAll(/<itemref\b[^>]*idref=["']([^"']+)["'][^>]*\/?\s*>/gi)].map((match) => match[1]);
  if (!spine.length) throw new Error("O EPUB não contém uma ordem de leitura (spine) válida.");
  const chapters: ReaderChapter[] = [];
  for (const [index, id] of spine.entries()) {
    const path = manifest.get(id);
    if (!path) throw new Error(`O spine aponta para o item “${id}”, ausente do manifesto do EPUB.`);
    const html = files.get(path);
    if (html === undefined) throw new Error(`A parte ${index + 1} do EPUB não foi encontrada no ZIP.`);
    const text = htmlToText(html);
    if (text) chapters.push({ title: `Parte ${index + 1}`, syntheticTitle: true, text });
  }
  if (!chapters.length) throw new Error("Não encontrei texto legível nas partes listadas pelo spine deste EPUB.");
  return chapters;
}

async function persistMobiCover(url: string, bookId: string): Promise<string | undefined> {
  if (Platform.OS === "web") return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > 8 * 1024 * 1024) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.byteLength > 8 * 1024 * 1024) return undefined;
    const mime = response.headers.get("content-type") ?? "image/jpeg";
    const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
    const output = new File(`${await appFolder()}${bookId}-cover.${extension}`);
    output.create({ intermediates: true, overwrite: true });
    const handle = output.open(FileMode.WriteOnly);
    try { handle.writeBytes(bytes); } finally { handle.close(); }
    return output.uri;
  } catch { return undefined; }
}

async function mobiContent(uri: string, format: "mobi" | "azw3", bookId?: string) {
  const size = await fileSize(uri);
  if (size !== undefined && size > MAX_MOBI_BYTES) throw new Error("MOBI/AZW3 com mais de 48 MB não será carregado de uma vez, para evitar falta de memória. Converta-o para EPUB/TXT ou reduza o arquivo.");
  const bytes = await new File(uri).bytes();
  const parser = format === "azw3" ? await initKf8File(bytes) : await initMobiFile(bytes);
  try {
    const metadata = parser.getMetadata();
    const spine = parser.getSpine();
    if (!spine.length) throw new Error("Este MOBI/AZW3 não contém uma sequência de leitura reconhecida.");
    const chapters: ReaderChapter[] = [];
    for (const [index, item] of spine.entries()) {
      const chapter = parser.loadChapter(item.id);
      const text = chapter ? htmlToText(chapter.html) : "";
      if (text) chapters.push({ title: `Parte ${index + 1}`, syntheticTitle: true, text });
    }
    if (!chapters.length) throw new Error("Não encontrei texto legível. Arquivos com DRM ou proteção podem não ser compatíveis.");
    let coverUri: string | undefined;
    if (bookId) {
      try { const cover = parser.getCoverImage(); if (cover) coverUri = await persistMobiCover(cover, bookId); } catch { coverUri = undefined; }
    }
    return { chapters, title: metadata.title, author: metadata.author?.filter(Boolean).join(", "), coverUri };
  } finally { parser.destroy(); }
}

export async function createBookFromFile(file: ImportedFile): Promise<LibraryBook> {
  const extension = getExtension(file.name);
  const format = getFormat(extension);
  if (!format) throw new Error(`O formato .${extension || "desconhecido"} ainda não é compatível.`);
  if (Platform.OS === "web" && ["cbr", "rar"].includes(extension)) throw new Error("CBR/RAR precisa do build nativo Android/iOS; escolha CBZ/ZIP no Preview Web.");
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let uri = file.uri;
  if (typeof document === "undefined") {
    const folder = await appFolder();
    const destination = `${folder}${id}.${extension}`;
    if (uri !== destination) {
      await FileSystem.copyAsync({ from: uri, to: destination });
      uri = destination;
    }
  }

  const book: LibraryBook = {
    id, uri, fileName: file.name, title: safeStem(file.name), format, kind: inferKind(format),
    importedAt: Date.now(), progress: 0, position: 0, favorite: false,
  };

  try {
    if (format === "epub") {
      const details = await epubDetails(uri, id);
      book.title = details.title || book.title;
      book.author = details.author;
      book.coverUri = details.coverUri;
    }
    if (["mobi", "azw3"].includes(format)) {
      const details = await mobiContent(uri, format as "mobi" | "azw3", id);
      book.title = details.title || book.title;
      book.author = details.author;
      book.coverUri = details.coverUri;
    }
    if (["cbz", "cbr", "rar", "zip"].includes(format)) {
      const comic = await rebuildComicPages(book);
      book.pageUris = comic.imagePages;
      book.coverUri = comic.coverUri;
    }
    if (format === "image") book.coverUri = uri;
  } catch (error) {
    if (uri !== file.uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    throw error instanceof Error ? error : new Error("Não foi possível processar este arquivo.");
  }
  return book;
}

function rtfToText(source: string): string {
  return decodeEntities(source.replace(/\\'[0-9a-f]{2}/gi, " ").replace(/\\par[d]?\b/g, "\n\n")
    .replace(/\\line\b/g, "\n").replace(/\\'[0-9a-f]{2}/gi, "").replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "").replace(/\n{3,}/g, "\n\n").trim());
}

async function docxText(uri: string): Promise<string> {
  const zip = await loadZip(uri);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("O documento DOCX não contém o corpo esperado.");
  return htmlToText(xml.replace(/<w:tab\b[^>]*\/>/g, "\t").replace(/<\/w:p>/g, "\n\n"));
}

async function webZipPages(book: LibraryBook): Promise<string[]> {
  const zip = await loadZip(book.uri);
  const names = sortImageNames(Object.keys(zip.files).filter((name) => !zip.files[name].dir && IMAGE_EXTENSIONS.has(getExtension(name))));
  if (!names.length) throw new Error("Nenhuma página de imagem foi encontrada no arquivo.");
  if (names.length > MAX_COMIC_PAGES) throw new Error("O mangá excede o limite de 2.000 páginas.");
  const pages: string[] = [];
  for (const name of names) {
    const entry = zip.file(name);
    if (entry) pages.push(await saveArchiveImage(book.id, name, await entry.async("base64")));
  }
  return pages;
}

export async function loadReaderContent(book: LibraryBook): Promise<ReaderContent> {
  if (book.format === "pdf") return {};
  if (book.format === "image") return { imagePages: [book.uri] };
  if (["cbz", "cbr", "rar", "zip"].includes(book.format)) {
    if (book.pageUris?.length) {
      const pathsToCheck = [book.pageUris[0], book.pageUris[book.pageUris.length - 1]];
      const valid = await Promise.all(pathsToCheck.map(async (path) => (await FileSystem.getInfoAsync(path).catch(() => null))?.exists ?? false));
      if (valid.every(Boolean)) return { imagePages: book.pageUris };
    }
    return Platform.OS === "web" ? { imagePages: await webZipPages(book) } : await rebuildComicPages(book);
  }
  if (book.format === "epub") return { chapters: await epubChapters(book.uri) };
  if (book.format === "mobi" || book.format === "azw3") return { chapters: (await mobiContent(book.uri, book.format)).chapters };
  if (book.format === "docx") return { text: await docxText(book.uri) };
  const raw = await readBoundedText(book.uri);
  if (book.format === "html") return { text: htmlToText(raw) };
  if (book.format === "rtf") return { text: rtfToText(raw) };
  if (book.format === "fb2") {
    const paragraphs = [...raw.matchAll(/<(?:p|v)\b[^>]*>([\s\S]*?)<\/(?:p|v)>/gi)].map((match) => htmlToText(match[1]));
    const title = extractTag(raw, "book-title");
    return { text: [title, ...paragraphs].filter(Boolean).join("\n\n") || htmlToText(raw) };
  }
  if (book.format === "md") {
    return { text: raw.replace(/^#{1,6}\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/`([^`]+)`/g, "$1") };
  }
  return { text: raw };
}

export function imageMime(uri: string): string { return MIME_BY_EXTENSION[getExtension(uri)] ?? "image/jpeg"; }
