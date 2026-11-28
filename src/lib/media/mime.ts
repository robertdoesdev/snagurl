import type { MediaKind } from "./types";

interface MimeEntry {
  kind: MediaKind;
  extension: string;
  label: string;
}

const allowed: Readonly<Record<string, MimeEntry>> = {
  "video/mp4": { kind: "video", extension: "mp4", label: "MP4 video" },
  "video/webm": { kind: "video", extension: "webm", label: "WebM video" },
  "video/quicktime": { kind: "video", extension: "mov", label: "QuickTime video" },
  "video/ogg": { kind: "video", extension: "ogv", label: "Ogg video" },
  "audio/mpeg": { kind: "audio", extension: "mp3", label: "MP3 audio" },
  "audio/mp4": { kind: "audio", extension: "m4a", label: "M4A audio" },
  "audio/aac": { kind: "audio", extension: "aac", label: "AAC audio" },
  "audio/ogg": { kind: "audio", extension: "ogg", label: "Ogg audio" },
  "audio/webm": { kind: "audio", extension: "weba", label: "WebM audio" },
  "audio/wav": { kind: "audio", extension: "wav", label: "WAV audio" },
  "audio/x-wav": { kind: "audio", extension: "wav", label: "WAV audio" },
  "audio/flac": { kind: "audio", extension: "flac", label: "FLAC audio" },
  "image/jpeg": { kind: "image", extension: "jpg", label: "JPEG image" },
  "image/png": { kind: "image", extension: "png", label: "PNG image" },
  "image/gif": { kind: "image", extension: "gif", label: "GIF image" },
  "image/webp": { kind: "image", extension: "webp", label: "WebP image" },
  "image/avif": { kind: "image", extension: "avif", label: "AVIF image" },
};

export function normalizeMime(contentType: string | undefined): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export function describeMime(mime: string): MimeEntry | null {
  return allowed[mime] ?? null;
}
