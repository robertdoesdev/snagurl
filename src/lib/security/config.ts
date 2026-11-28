const DEFAULT_MAX_FILE_BYTES = 250 * 1000 * 1000;

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const limits = {
  maxFileBytes: readPositiveInt("SNAGURL_MAX_FILE_BYTES", DEFAULT_MAX_FILE_BYTES),
  connectTimeoutMs: 8_000,
  totalTimeoutMs: 15_000,
  downloadIdleTimeoutMs: 20_000,
  downloadTotalTimeoutMs: 10 * 60_000,
  maxRedirects: 3,
  maxConcurrentDownloads: 6,
  signatureTtlMs: 15 * 60_000,
  resolveRate: { limit: 20, windowMs: 60_000 },
  downloadRate: { limit: 10, windowMs: 60_000 },
  jobCreateRate: { limit: 6, windowMs: 5 * 60_000 },
  jobPollRate: { limit: 120, windowMs: 60_000 },
} as const;
