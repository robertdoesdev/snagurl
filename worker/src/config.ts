import os from "node:os";
import path from "node:path";

export interface WorkerConfig {
  port: number;
  host: string;
  secret: string;
  tmpDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  ffmpegThreads: number;
  maxConcurrent: number;
  maxQueued: number;
  jobTimeoutMs: number;
  fetchIdleTimeoutMs: number;
  maxFetchRetries: number;
  retryBaseDelayMs: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxDurationSeconds: number;
  retentionMs: number;
  sweepIntervalMs: number;
  clockSkewMs: number;
}

type Env = Record<string, string | undefined>;

function int(env: Env, name: string, fallback: number, min = 1): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer of at least ${min}`);
  }
  return value;
}

export function loadConfig(env: Env = process.env): WorkerConfig {
  const secret = env.SNAGURL_WORKER_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("SNAGURL_WORKER_SECRET must be at least 32 characters");
  }
  return {
    port: int(env, "PORT", 8080),
    host: env.HOST ?? "0.0.0.0",
    secret,
    tmpDir: env.WORKER_TMP_DIR ?? path.join(os.tmpdir(), "snagurl-worker"),
    ffmpegPath: env.FFMPEG_PATH ?? "ffmpeg",
    ffprobePath: env.FFPROBE_PATH ?? "ffprobe",
    ffmpegThreads: int(env, "WORKER_FFMPEG_THREADS", 2),
    maxConcurrent: int(env, "WORKER_MAX_CONCURRENT", 2),
    maxQueued: int(env, "WORKER_MAX_QUEUED", 20, 0),
    jobTimeoutMs: int(env, "WORKER_JOB_TIMEOUT_SECONDS", 600) * 1000,
    fetchIdleTimeoutMs: int(env, "WORKER_FETCH_IDLE_TIMEOUT_SECONDS", 20) * 1000,
    maxFetchRetries: int(env, "WORKER_FETCH_RETRIES", 2, 0),
    retryBaseDelayMs: 1000,
    maxInputBytes: int(env, "WORKER_MAX_INPUT_BYTES", 500_000_000),
    maxOutputBytes: int(env, "WORKER_MAX_OUTPUT_BYTES", 500_000_000),
    maxDurationSeconds: int(env, "WORKER_MAX_DURATION_SECONDS", 3600),
    retentionMs: int(env, "WORKER_RETENTION_MINUTES", 30) * 60_000,
    sweepIntervalMs: 60_000,
    clockSkewMs: 60_000,
  };
}
