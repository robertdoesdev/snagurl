import type { MediaKind } from "./media/types";

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  host: string;
  sourceLabel: string;
  kind: MediaKind;
  bytes: number | null;
  at: number;
}

const STORAGE_KEY = "snagurl:history:v1";
const CHANGE_EVENT = "snagurl:history-change";
const MAX_ENTRIES = 20;
const EMPTY: readonly HistoryEntry[] = [];

let cachedRaw: string | null | undefined;
let cachedEntries: readonly HistoryEntry[] = EMPTY;

function toEntry(value: unknown): HistoryEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.title !== "string" ||
    typeof entry.url !== "string" ||
    typeof entry.host !== "string" ||
    (entry.kind !== "video" && entry.kind !== "audio" && entry.kind !== "image") ||
    (entry.bytes !== null && typeof entry.bytes !== "number") ||
    typeof entry.at !== "number"
  ) {
    return null;
  }
  return {
    id: entry.id,
    title: entry.title,
    url: entry.url,
    host: entry.host,
    sourceLabel: typeof entry.sourceLabel === "string" ? entry.sourceLabel : "Direct link",
    kind: entry.kind,
    bytes: entry.bytes,
    at: entry.at,
  };
}

export function parseHistory(raw: string | null): readonly HistoryEntry[] {
  if (raw === null) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    const entries: HistoryEntry[] = [];
    for (const item of value) {
      const entry = toEntry(item);
      if (entry) entries.push(entry);
    }
    return entries.slice(0, MAX_ENTRIES);
  } catch {
    return EMPTY;
  }
}

export function getHistorySnapshot(): readonly HistoryEntry[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedEntries = parseHistory(raw);
  }
  return cachedEntries;
}

export function getServerHistorySnapshot(): readonly HistoryEntry[] {
  return EMPTY;
}

export function subscribeHistory(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function write(entries: readonly HistoryEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function addHistoryEntry(entry: Omit<HistoryEntry, "id" | "at">): void {
  const next: HistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    at: Date.now(),
  };
  const rest = getHistorySnapshot().filter((item) => item.url !== entry.url);
  write([next, ...rest].slice(0, MAX_ENTRIES));
}

export function removeHistoryEntry(id: string): void {
  write(getHistorySnapshot().filter((item) => item.id !== id));
}

export function clearHistory(): void {
  write(EMPTY);
}
