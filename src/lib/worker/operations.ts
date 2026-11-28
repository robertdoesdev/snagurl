import type { ConversionId, ConversionOption, MediaInfo, MediaKind } from "../media/types";

interface OperationEntry extends ConversionOption {
  from: readonly MediaKind[];
}

export const operations: readonly OperationEntry[] = [
  {
    id: "mp3",
    label: "MP3 audio",
    container: "MP3",
    mime: "audio/mpeg",
    description: "Audio only, 192 kbps.",
    from: ["video", "audio"],
  },
  {
    id: "m4a",
    label: "M4A audio",
    container: "M4A",
    mime: "audio/mp4",
    description: "Audio only, AAC 192 kbps.",
    from: ["video", "audio"],
  },
  {
    id: "mp4-720",
    label: "MP4 video, up to 720p",
    container: "MP4",
    mime: "video/mp4",
    description: "H.264 and AAC. Never upscaled.",
    from: ["video"],
  },
  {
    id: "mp4-480",
    label: "MP4 video, up to 480p",
    container: "MP4",
    mime: "video/mp4",
    description: "Smaller H.264 and AAC file. Never upscaled.",
    from: ["video"],
  },
  {
    id: "gif",
    label: "Animated GIF",
    container: "GIF",
    mime: "image/gif",
    description: "First 15 seconds, 480 px wide, 12 frames per second.",
    from: ["video"],
  },
  {
    id: "jpg",
    label: "JPG image",
    container: "JPG",
    mime: "image/jpeg",
    description: "A still frame as JPEG.",
    from: ["image"],
  },
  {
    id: "png",
    label: "PNG image",
    container: "PNG",
    mime: "image/png",
    description: "Lossless PNG.",
    from: ["image"],
  },
  {
    id: "webp",
    label: "WebP image",
    container: "WebP",
    mime: "image/webp",
    description: "Compressed WebP.",
    from: ["image"],
  },
];

export function isConversionId(value: unknown): value is ConversionId {
  return operations.some((entry) => entry.id === value);
}

export function conversionsFor(media: Pick<MediaInfo, "source" | "downloadable" | "kind">): ConversionOption[] {
  if (media.source !== "direct" || !media.downloadable) return [];
  return operations
    .filter((entry) => entry.from.includes(media.kind))
    .map(({ from: _from, ...option }) => {
      void _from;
      return option;
    });
}

export function supportsOperation(
  media: Pick<MediaInfo, "source" | "downloadable" | "kind">,
  operation: ConversionId,
): boolean {
  return conversionsFor(media).some((option) => option.id === operation);
}
