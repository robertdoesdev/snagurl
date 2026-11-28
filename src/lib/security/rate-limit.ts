interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface RemoteStore {
  url: string;
  token: string;
}

const MAX_TRACKED_KEYS = 5_000;
const REMOTE_TIMEOUT_MS = 1_500;
const buckets = new Map<string, Window>();

function remoteStore(): RemoteStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export function rateLimitMode(): "shared" | "memory" {
  return remoteStore() ? "shared" : "memory";
}

function prune(now: number): void {
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();
}

function checkMemory(
  key: string,
  rule: RateLimitRule,
  now: number,
): RateLimitResult {
  if (buckets.size >= MAX_TRACKED_KEYS) prune(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= rule.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

interface PipelineRow {
  result?: unknown;
  error?: string;
}

async function checkRemote(
  store: RemoteStore,
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const response = await fetch(`${store.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${store.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["PEXPIRE", key, String(rule.windowMs), "NX"],
      ["PTTL", key],
    ]),
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Rate limit store answered ${response.status}`);
  }

  const rows = (await response.json()) as PipelineRow[];
  const count = Number(rows[0]?.result);
  const ttl = Number(rows[2]?.result);

  if (rows.some((row) => row.error) || !Number.isFinite(count)) {
    throw new Error("Rate limit store returned an unexpected result");
  }

  if (count <= rule.limit) return { allowed: true, retryAfterSeconds: 0 };

  const remainingMs = ttl > 0 ? ttl : rule.windowMs;
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
}

export async function checkRateLimit(
  scope: string,
  client: string,
  rule: RateLimitRule,
  now = Date.now(),
): Promise<RateLimitResult> {
  const store = remoteStore();

  if (store) {
    try {
      return await checkRemote(store, `snagurl:rl:${scope}:${client}`, rule);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Shared rate limit unavailable, using in-memory limit",
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return checkMemory(`${scope}:${client}`, rule, now);
}

export function clientKey(headers: Headers): string {
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}
