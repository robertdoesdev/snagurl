import { spawn } from "node:child_process";
import { JobError } from "./errors.ts";
import type { MediaKind } from "./operations.ts";

const ALLOWED_DEMUXERS = new Set([
  "mov",
  "mp4",
  "matroska",
  "webm",
  "avi",
  "mp3",
  "ogg",
  "wav",
  "flac",
  "aac",
  "image2",
  "png_pipe",
  "jpeg_pipe",
  "gif",
  "webp_pipe",
]);

export interface ProbeResult {
  kind: MediaKind;
  hasVideo: boolean;
  hasAudio: boolean;
  durationSeconds: number | null;
}

interface RawProbe {
  format?: { format_name?: string; duration?: string };
  streams?: { codec_type?: string; disposition?: { attached_pic?: number } }[];
}

export interface ToolPaths {
  ffmpegPath: string;
  ffprobePath: string;
}

export interface RunOptions {
  signal: AbortSignal;
  timeoutMs: number;
  maxOutputBytes: number;
  threads: number;
  durationSeconds: number | null;
  onProgress: (fraction: number) => void;
}

export type Prober = (file: string, signal: AbortSignal) => Promise<ProbeResult>;
export type Transcoder = (
  input: string,
  output: string,
  args: readonly string[],
  options: RunOptions,
) => Promise<void>;

const MINIMAL_ENV = { PATH: process.env.PATH ?? "/usr/bin:/bin" };

function collect(
  command: string,
  args: string[],
  signal: AbortSignal,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"], env: MINIMAL_ENV, shell: false });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length < 1_000_000) stdout += chunk;
    });
    const stop = () => child.kill("SIGKILL");
    signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      resolve({ code, stdout });
    });
  });
}

export function createProber(paths: ToolPaths): Prober {
  return async (file, signal) => {
    const { code, stdout } = await collect(
      paths.ffprobePath,
      [
        "-v", "error",
        "-protocol_whitelist", "file",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file,
      ],
      signal,
      30_000,
    );
    if (signal.aborted) throw new JobError("cancelled", "The job was stopped.");
    if (code !== 0) {
      throw new JobError("unsupported_media", "The source isn’t a supported media file.");
    }
    let raw: RawProbe;
    try {
      raw = JSON.parse(stdout) as RawProbe;
    } catch {
      throw new JobError("unsupported_media", "The source isn’t a supported media file.");
    }

    const names = (raw.format?.format_name ?? "").split(",");
    if (!names.some((name) => ALLOWED_DEMUXERS.has(name))) {
      throw new JobError("unsupported_media", "The source isn’t a supported media file.");
    }

    const streams = raw.streams ?? [];
    const hasAudio = streams.some((stream) => stream.codec_type === "audio");
    const hasVideo = streams.some(
      (stream) => stream.codec_type === "video" && stream.disposition?.attached_pic !== 1,
    );
    const isImageContainer = names.some((name) =>
      ["image2", "png_pipe", "jpeg_pipe", "webp_pipe"].includes(name),
    );
    const duration = Number(raw.format?.duration);
    const durationSeconds = Number.isFinite(duration) && duration > 0 ? duration : null;

    let kind: MediaKind;
    if (isImageContainer || (names.includes("gif") && durationSeconds === null)) kind = "image";
    else if (hasVideo) kind = "video";
    else if (hasAudio) kind = "audio";
    else if (streams.some((stream) => stream.codec_type === "video")) kind = "image";
    else throw new JobError("unsupported_media", "The source has no audio or video to convert.");

    return { kind, hasVideo: hasVideo || kind === "image", hasAudio, durationSeconds };
  };
}

export function createTranscoder(paths: ToolPaths): Transcoder {
  return (input, output, args, options) =>
    new Promise((resolve, reject) => {
      const command = [
        "-nostdin",
        "-hide_banner",
        "-loglevel", "error",
        "-protocol_whitelist", "file",
        "-threads", String(options.threads),
        "-i", input,
        ...args,
        "-fs", String(options.maxOutputBytes),
        "-progress", "pipe:1",
        "-y",
        output,
      ];
      const child = spawn(paths.ffmpegPath, command, {
        stdio: ["ignore", "pipe", "pipe"],
        env: MINIMAL_ENV,
        shell: false,
      });

      let timedOut = false;
      let stderr = "";
      const stop = () => child.kill("SIGKILL");
      options.signal.addEventListener("abort", stop, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        stop();
      }, options.timeoutMs);

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-2000);
      });

      let buffered = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buffered += chunk;
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          const match = /^out_time_(?:us|ms)=(\d+)/.exec(line);
          if (match?.[1] && options.durationSeconds) {
            const seconds = Number(match[1]) / 1_000_000;
            options.onProgress(Math.min(0.99, seconds / options.durationSeconds));
          }
        }
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        options.signal.removeEventListener("abort", stop);
        if (timedOut) {
          reject(new JobError("timeout", "The conversion took too long and was stopped."));
        } else if (options.signal.aborted) {
          reject(new JobError("cancelled", "The job was stopped."));
        } else if (code !== 0) {
          console.error(JSON.stringify({ level: "error", message: "ffmpeg failed", code, stderr }));
          reject(new JobError("conversion_failed", "The file couldn’t be converted."));
        } else {
          resolve();
        }
      });
    });
}
