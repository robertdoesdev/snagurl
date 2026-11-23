import { describeMime } from "./mime";

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned;
}

function fromContentDisposition(header: string | undefined): string | null {
  if (!header) return null;
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (extended?.[1]) return safeDecode(extended[1].trim());
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header);
  return plain?.[1] ? plain[1].trim() : null;
}

function fromPath(url: URL): string | null {
  const last = url.pathname.split("/").filter(Boolean).pop();
  return last ? safeDecode(last) : null;
}

export function deriveFilename(
  url: URL,
  mime: string,
  contentDisposition?: string,
): string {
  const raw = fromContentDisposition(contentDisposition) ?? fromPath(url);
  const extension = describeMime(mime)?.extension ?? "bin";
  const base = raw ? sanitizeFilename(raw) : "";
  if (base === "") return `snagurl-download.${extension}`;
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${extension}`;
}
