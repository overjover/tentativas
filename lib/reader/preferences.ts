import AsyncStorage from "@react-native-async-storage/async-storage";

export type ReadingDirection = "rtl" | "ltr";
export interface ReaderPreferences { direction: ReadingDirection; fontSize: number; }
const KEY = "leitorplay.readerPreferences.v1";
const DEFAULTS: ReaderPreferences = { direction: "rtl", fontSize: 18 };

export async function readReaderPreferences(): Promise<ReaderPreferences> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) as Partial<ReaderPreferences> : {};
    return {
      direction: saved.direction === "ltr" ? "ltr" : "rtl",
      fontSize: Math.max(14, Math.min(30, Number(saved.fontSize) || DEFAULTS.fontSize)),
    };
  } catch { return DEFAULTS; }
}

export async function writeReaderPreferences(patch: Partial<ReaderPreferences>): Promise<ReaderPreferences> {
  const current = await readReaderPreferences();
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
