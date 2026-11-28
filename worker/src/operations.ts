export type MediaKind = "video" | "audio" | "image";

export interface Operation {
  id: string;
  extension: string;
  mime: string;
  needs: MediaKind;
  inputKinds: readonly MediaKind[];
  args: readonly string[];
}

const mp4 = (height: number): readonly string[] => [
  "-map", "0:v:0",
  "-map", "0:a:0?",
  "-vf", `scale=-2:'min(${height},ih)'`,
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "23",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "128k",
  "-movflags", "+faststart",
  "-f", "mp4",
];

export const operations: readonly Operation[] = [
  {
    id: "mp3",
    extension: "mp3",
    mime: "audio/mpeg",
    needs: "audio",
    inputKinds: ["video", "audio"],
    args: ["-map", "0:a:0", "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3"],
  },
  {
    id: "m4a",
    extension: "m4a",
    mime: "audio/mp4",
    needs: "audio",
    inputKinds: ["video", "audio"],
    args: ["-map", "0:a:0", "-vn", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-f", "ipod"],
  },
  { id: "mp4-720", extension: "mp4", mime: "video/mp4", needs: "video", inputKinds: ["video"], args: mp4(720) },
  { id: "mp4-480", extension: "mp4", mime: "video/mp4", needs: "video", inputKinds: ["video"], args: mp4(480) },
  {
    id: "gif",
    extension: "gif",
    mime: "image/gif",
    needs: "video",
    inputKinds: ["video"],
    args: [
      "-map", "0:v:0",
      "-t", "15",
      "-vf", "fps=12,scale='min(480,iw)':-2:flags=lanczos",
      "-loop", "0",
      "-f", "gif",
    ],
  },
  {
    id: "jpg",
    extension: "jpg",
    mime: "image/jpeg",
    needs: "image",
    inputKinds: ["image"],
    args: ["-map", "0:v:0", "-frames:v", "1", "-q:v", "2", "-pix_fmt", "yuvj420p", "-f", "image2"],
  },
  {
    id: "png",
    extension: "png",
    mime: "image/png",
    needs: "image",
    inputKinds: ["image"],
    args: ["-map", "0:v:0", "-frames:v", "1", "-f", "image2"],
  },
  {
    id: "webp",
    extension: "webp",
    mime: "image/webp",
    needs: "image",
    inputKinds: ["image"],
    args: ["-map", "0:v:0", "-frames:v", "1", "-c:v", "libwebp", "-quality", "85", "-f", "webp"],
  },
];

export function getOperation(id: string): Operation | undefined {
  return operations.find((operation) => operation.id === id);
}
