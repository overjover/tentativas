import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { File, FileMode, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Unzip, UnzipInflate, UnzipPassThrough, Zip, ZipPassThrough, strFromU8, strToU8 } from "fflate";
import { Platform } from "react-native";

import { getExtension, getFormat, rebuildComicPages } from "./format-registry";
import type { LibraryBook, ReaderFormat, SavedExcerpt } from "./types";

const BACKUP_VERSION = 1;
const CHUNK_BYTES = 64 * 1024;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const SAFE_ID = /^[a-zA-Z0-9-]{1,100}$/;
const VALID_KINDS = new Set(["book", "comic", "image", "document"]);

type BookManifest = Omit<LibraryBook, "uri" | "coverUri" | "pageUris"> & { hasCover: boolean; coverExtension?: string };
type BackupManifest = { app: "LeitorPlay"; version: number; createdAt: number; books: BookManifest[]; excerpts: SavedExcerpt[] };
type RestoredLibrary = { books: LibraryBook[]; excerpts: SavedExcerpt[] };

function nativeOnly() {
  if (Platform.OS === "web") throw new Error("Backup ZIP de arquivos só está disponível na instalação Android/iOS. A biblioteca e os itens continuam disponíveis no Preview Web.");
}

function requireRoot() {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error("O armazenamento local seguro não está disponível.");
  return root;
}

function safeBookExtension(book: Pick<LibraryBook, "fileName" | "format">): string {
  const extension = getExtension(book.fileName) || book.format;
  if (!/^[a-z0-9]{1,10}$/.test(extension)) throw new Error("Um arquivo tem extensão inválida para o backup.");
  return extension;
}

function generatedId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
function safeStoredPosition(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; }

function buildManifest(books: LibraryBook[], excerpts: SavedExcerpt[]): BackupManifest {
  if (books.length > MAX_ENTRIES || excerpts.length > MAX_ENTRIES * 10) throw new Error("A biblioteca excede o limite seguro deste arquivo de backup.");
  const bookIds = new Set(books.map((book) => book.id));
  return {
    app: "LeitorPlay",
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    books: books.map((book) => {
      if (!SAFE_ID.test(book.id)) throw new Error(`O item “${book.title}” tem um identificador inválido para backup.`);
      const { uri: _uri, coverUri, pageUris: _pageUris, ...metadata } = book;
      return { ...metadata, hasCover: Boolean(coverUri && book.kind !== "comic" && book.format !== "image"), coverExtension: coverUri && book.kind !== "comic" && book.format !== "image" ? getExtension(coverUri) || "jpg" : undefined };
    }),
    excerpts: excerpts.filter((excerpt) => bookIds.has(excerpt.bookId)),
  };
}

async function streamInputToZip(zip: Zip, entryName: string, uri: string, byteSize: number) {
  const input = new File(uri);
  if (!input.exists) throw new Error("Um dos arquivos da biblioteca não está acessível. Reimporte o item antes de gerar o backup.");
  const entry = new ZipPassThrough(entryName);
  entry.size = byteSize;
  zip.add(entry);
  const handle = input.open(FileMode.ReadOnly);
  try {
    let finalChunk = false;
    while (!finalChunk) {
      const bytes = await handle.readBytes(CHUNK_BYTES);
      finalChunk = bytes.byteLength === 0;
      entry.push(bytes, finalChunk);
    }
  } finally { handle.close(); }
}

/** Streams source files and ZIP output in 64 KiB chunks; documents never enter one large JS buffer. */
export async function createLibraryBackup(books: LibraryBook[], excerpts: SavedExcerpt[]): Promise<string> {
  nativeOnly();
  const manifest = buildManifest(books, excerpts);
  const files: Array<{ entry: string; uri: string; size: number }> = [];
  let totalBytes = 0;
  for (const book of books) {
    const extension = safeBookExtension(book);
    const sourceFiles: Array<[string, string]> = [["books", book.uri]];
    if (book.coverUri && book.kind !== "comic" && book.format !== "image") sourceFiles.push(["covers", book.coverUri]);
    for (const [prefix, uri] of sourceFiles) {
      const file = new File(uri);
      if (!file.exists || !Number.isFinite(file.size) || file.size > MAX_ARCHIVE_BYTES) {
        throw new Error(`O arquivo de “${book.title}” está ausente ou excede o limite de 512 MB por backup.`);
      }
      totalBytes += file.size ?? 0;
      files.push({ entry: `${prefix}/${book.id}.${prefix === "books" ? extension : (getExtension(uri) || "jpg")}`, uri, size: file.size ?? 0 });
    }
  }
  if (totalBytes > MAX_ARCHIVE_BYTES) throw new Error("O total de arquivos passa de 512 MB. Faça mais de um backup ou remova arquivos grandes e tente novamente.");

  const output = new File(Paths.cache, `LeitorPlay-backup-${new Date().toISOString().slice(0, 10)}.zip`);
  output.create({ intermediates: true, overwrite: true });
  const outputHandle = output.open(FileMode.WriteOnly);
  let resolveZip!: () => void;
  let rejectZip!: (error: Error) => void;
  const completed = new Promise<void>((resolve, reject) => { resolveZip = resolve; rejectZip = reject; });
  const zip = new Zip((error, chunk, final) => {
    if (error) { rejectZip(error); return; }
    try {
      if (chunk?.byteLength) outputHandle.writeBytes(chunk);
      if (final) resolveZip();
    } catch (cause) { rejectZip(cause instanceof Error ? cause : new Error("Falha ao gravar o arquivo de backup.")); }
  });
  try {
    const manifestEntry = new ZipPassThrough("manifest.json");
    zip.add(manifestEntry);
    const manifestBytes = strToU8(JSON.stringify(manifest));
    manifestEntry.size = manifestBytes.byteLength;
    manifestEntry.push(manifestBytes, true);
    for (const item of files) await streamInputToZip(zip, item.entry, item.uri, item.size);
    zip.end();
    await completed;
  } catch (cause) {
    zip.terminate();
    outputHandle.close();
    output.delete();
    throw cause instanceof Error ? cause : new Error("Não foi possível criar o backup.");
  }
  outputHandle.close();
  if (output.size === 0 || output.size > MAX_ARCHIVE_BYTES + 8 * 1024 * 1024) {
    output.delete();
    throw new Error("O ZIP de backup ficou vazio ou maior que o permitido.");
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("Este aparelho não disponibiliza o menu do sistema para compartilhar o backup.");
  return output.uri;
}

export async function shareLibraryBackup(books: LibraryBook[], excerpts: SavedExcerpt[]) {
  const uri = await createLibraryBackup(books, excerpts);
  await Sharing.shareAsync(uri, { mimeType: "application/zip", dialogTitle: "Salvar ou enviar backup do LeitorPlay" });
}

function parseManifest(text: string): BackupManifest {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("O JSON do backup está danificado."); }
  if (!raw || typeof raw !== "object") throw new Error("O arquivo não contém um backup do LeitorPlay.");
  const value = raw as Partial<BackupManifest>;
  if (value.app !== "LeitorPlay" || value.version !== BACKUP_VERSION || !Array.isArray(value.books) || !Array.isArray(value.excerpts)) {
    throw new Error("Este backup não é compatível ou tem uma versão não reconhecida.");
  }
  if (value.books.length > MAX_ENTRIES || value.excerpts.length > MAX_ENTRIES * 10) throw new Error("O backup tem mais itens do que este app pode restaurar com segurança.");
  return value as BackupManifest;
}

function validateManifestBooks(manifest: BackupManifest): BookManifest[] {
  const seen = new Set<string>();
  return manifest.books.map((raw) => {
    if (!raw || typeof raw !== "object" || !SAFE_ID.test(raw.id) || seen.has(raw.id)) throw new Error("O backup contém um item com identificador inválido ou repetido.");
    seen.add(raw.id);
    if (typeof raw.title !== "string" || typeof raw.fileName !== "string" || !Number.isFinite(raw.importedAt) || !Number.isFinite(raw.progress) || typeof raw.favorite !== "boolean" || !VALID_KINDS.has(raw.kind)) {
      throw new Error("Os metadados de um livro neste backup estão incompletos.");
    }
    const extension = safeBookExtension(raw);
    const format = getFormat(extension);
    if (!format || raw.format !== format) throw new Error(`O formato do item “${raw.title}” mudou e não pode ser restaurado.`);
    return raw;
  });
}

function makeRandomId(used: Set<string>) {
  let id = generatedId();
  while (used.has(id)) id = generatedId();
  used.add(id);
  return id;
}

/** Extracts into a staging directory, validates every name/manifest, then merges; never deletes the current library. */
export async function restoreLibraryBackup(uri: string, existingBooks: LibraryBook[]): Promise<RestoredLibrary> {
  nativeOnly();
  const input = new File(uri);
  if (!input.exists || (input.size ?? 0) < 22 || (input.size ?? 0) > MAX_ARCHIVE_BYTES) throw new Error("Selecione um arquivo ZIP de backup válido com até 512 MB.");
  const root = requireRoot();
  const staging = `${root}leitorplay-restore-${generatedId()}/`;
  await FileSystem.makeDirectoryAsync(staging, { intermediates: true });
  const allowedFiles = new Map<string, string>();
  const usedNames = new Set<string>();
  const manifestChunks: Uint8Array[] = [];
  let manifestBytes = 0;
  const manifestRef: { current: BackupManifest | null } = { current: null };
  let extractedBytes = 0;
  let entryCount = 0;
  let parseFailure: Error | null = null;
  const unzip = new Unzip((entry) => {
    entryCount += 1;
    if (entryCount > MAX_ENTRIES * 2 + 1) { parseFailure = new Error("O ZIP contém entradas demais."); return; }
    if (entry.name === "manifest.json") {
      entry.ondata = (error, data, final) => {
        if (error) { parseFailure = error; return; }
        if (data) { manifestBytes += data.byteLength; if (manifestBytes > 4 * 1024 * 1024) { parseFailure = new Error("O manifesto do backup é grande demais."); return; } manifestChunks.push(data); }
        if (final) {
          try {
            const size = manifestChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of manifestChunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            manifestRef.current = parseManifest(strFromU8(bytes));
          } catch (cause) { parseFailure = cause instanceof Error ? cause : new Error("Manifesto inválido."); }
        }
      };
      entry.start();
      return;
    }
    const match = /^(books|covers)\/([a-zA-Z0-9-]{1,100}\.[a-zA-Z0-9]{1,10})$/.exec(entry.name);
    if (!match || usedNames.has(entry.name)) { parseFailure = new Error("O backup contém um caminho de arquivo inseguro ou repetido."); return; }
    usedNames.add(entry.name);
    const destination = `${staging}${match[1]}/${match[2]}`;
    void FileSystem.makeDirectoryAsync(`${staging}${match[1]}/`, { intermediates: true });
    const output = new File(destination);
    try { output.create({ intermediates: true, overwrite: true }); }
    catch (cause) { parseFailure = cause instanceof Error ? cause : new Error("Não foi possível preparar a restauração."); return; }
    const handle = output.open(FileMode.WriteOnly);
    entry.ondata = (error, data, final) => {
      if (error) { parseFailure = error; handle.close(); return; }
      if (data) {
        extractedBytes += data.byteLength;
        if (extractedBytes > MAX_EXTRACTED_BYTES) { parseFailure = new Error("O backup descompacta para mais de 1 GB."); handle.close(); return; }
        try { handle.writeBytes(data); } catch (cause) { parseFailure = cause instanceof Error ? cause : new Error("Falha ao extrair um arquivo do backup."); }
      }
      if (final) handle.close();
    };
    try { entry.start(); } catch (cause) { parseFailure = cause instanceof Error ? cause : new Error("Não foi possível descompactar o backup."); handle.close(); }
  });
  unzip.register(UnzipPassThrough);
  unzip.register(UnzipInflate);
  const archiveHandle = input.open(FileMode.ReadOnly);
  try {
    let finalChunk = false;
    while (!finalChunk) {
      const bytes = await archiveHandle.readBytes(CHUNK_BYTES);
      finalChunk = bytes.byteLength === 0;
      unzip.push(bytes, finalChunk);
      if (parseFailure) throw parseFailure;
    }
  } catch (cause) {
    archiveHandle.close();
    await FileSystem.deleteAsync(staging, { idempotent: true }).catch(() => undefined);
    throw cause instanceof Error ? cause : new Error("Falha ao ler o arquivo de backup.");
  }
  archiveHandle.close();

  try {
    const manifest = manifestRef.current as BackupManifest | null;
    if (!manifest) throw new Error("Não encontrei um manifesto válido dentro do ZIP.");
    const metadata = validateManifestBooks(manifest);
    const rootBooks = new Set(existingBooks.map((book) => book.id));
    const idMap = new Map<string, string>();
    const filesToInstall: Array<{ source: string; target: string }> = [];
    const appFolder = `${root}leitorplay/`;
    await FileSystem.makeDirectoryAsync(appFolder, { intermediates: true });
    const books: LibraryBook[] = [];
    for (const raw of metadata) {
      const extension = safeBookExtension(raw);
      const oldBookPath = `books/${raw.id}.${extension}`;
      if (!usedNames.has(oldBookPath)) throw new Error(`O arquivo do livro “${raw.title}” não existe no backup.`);
      const collision = rootBooks.has(raw.id) || new File(`${appFolder}${raw.id}.${extension}`).exists;
      const id = collision ? makeRandomId(rootBooks) : raw.id;
      rootBooks.add(id);
      idMap.set(raw.id, id);
      const bookUri = `${appFolder}${id}.${extension}`;
      filesToInstall.push({ source: `${staging}${oldBookPath}`, target: bookUri });
      let coverUri: string | undefined;
      if (raw.hasCover) {
        const coverExtension = raw.coverExtension || "jpg";
        if (!/^[a-z0-9]{1,10}$/.test(coverExtension)) throw new Error(`A capa de “${raw.title}” tem extensão inválida.`);
        const oldCoverPath = `covers/${raw.id}.${coverExtension}`;
        if (usedNames.has(oldCoverPath)) {
          coverUri = `${appFolder}${id}-cover.${coverExtension}`;
          filesToInstall.push({ source: `${staging}${oldCoverPath}`, target: coverUri });
        }
      }
      const { hasCover: _hasCover, coverExtension: _coverExtension, ...savedFields } = raw;
      books.push({ ...savedFields, id, uri: bookUri, coverUri: raw.format === "image" ? bookUri : coverUri, progress: Math.max(0, Math.min(100, Number(raw.progress) || 0)), position: safeStoredPosition(raw.position), spokenPosition: raw.spokenPosition === undefined ? undefined : safeStoredPosition(raw.spokenPosition), readingSeconds: raw.readingSeconds === undefined ? 0 : safeStoredPosition(raw.readingSeconds) });
    }
    for (const item of filesToInstall) await FileSystem.copyAsync({ from: item.source, to: item.target });
    const booksWithPages: LibraryBook[] = [];
    for (const book of books) {
      if (book.kind === "comic") {
        const comic = await rebuildComicPages(book);
        booksWithPages.push({ ...book, coverUri: comic.coverUri, pageUris: comic.imagePages });
      } else booksWithPages.push(book);
    }
    const restoredExcerpts: SavedExcerpt[] = manifest.excerpts.flatMap((excerpt: SavedExcerpt) => {
      const bookId = idMap.get(excerpt.bookId);
      if (!bookId || typeof excerpt.quote !== "string" || !excerpt.quote.trim()) return [];
      return [{ id: SAFE_ID.test(excerpt.id) ? excerpt.id : generatedId(), bookId, quote: excerpt.quote.slice(0, 10000), page: excerpt.page === undefined ? undefined : safeStoredPosition(excerpt.page), createdAt: Number.isFinite(excerpt.createdAt) ? excerpt.createdAt : Date.now() }];
    });
    await FileSystem.deleteAsync(staging, { idempotent: true }).catch(() => undefined);
    return { books: booksWithPages, excerpts: restoredExcerpts };
  } catch (cause) {
    await FileSystem.deleteAsync(staging, { idempotent: true }).catch(() => undefined);
    throw cause instanceof Error ? cause : new Error("O backup não pôde ser restaurado.");
  }
}

export async function pickAndRestoreLibraryBackup(existingBooks: LibraryBook[]): Promise<RestoredLibrary | null> {
  nativeOnly();
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  return restoreLibraryBackup(picked.assets[0].uri, existingBooks);
}
