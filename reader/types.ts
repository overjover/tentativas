export type ReaderFormat =
  | "pdf"
  | "epub"
  | "cbz"
  | "cbr"
  | "rar"
  | "zip"
  | "mobi"
  | "azw3"
  | "txt"
  | "md"
  | "html"
  | "fb2"
  | "docx"
  | "rtf"
  | "image";

export type LibraryKind = "book" | "comic" | "image" | "document";

export interface LibraryBook {
  id: string;
  uri: string;
  fileName: string;
  title: string;
  author?: string;
  format: ReaderFormat;
  kind: LibraryKind;
  coverUri?: string;
  /** Persisted file URIs for archives already extracted to the app sandbox. */
  pageUris?: string[];
  importedAt: number;
  lastOpenedAt?: number;
  progress: number;
  position: number;
  spokenPosition?: number;
  spokenOffset?: number;
  readingSeconds?: number;
  favorite: boolean;
}

export interface SavedExcerpt {
  id: string;
  bookId: string;
  quote: string;
  page?: number;
  createdAt: number;
}

export interface ReaderChapter {
  title: string;
  syntheticTitle?: boolean;
  text: string;
}

export interface ReaderContent {
  text?: string;
  chapters?: ReaderChapter[];
  imagePages?: string[];
}

export interface ImportedFile {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number;
  file?: File;
}
