export interface WorkerSettings {
  baseUrl: URL;
  publicUrl: URL;
  secret: string;
}

const MIN_SECRET_LENGTH = 32;

function parseUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username !== "" || url.password !== "") return null;
    const secure = url.protocol === "https:";
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!secure && !(url.protocol === "http:" && local)) return null;
    if (process.env.NODE_ENV === "production" && !secure) return null;
    return url;
  } catch {
    return null;
  }
}

export function workerSettings(): WorkerSettings | null {
  const secret = process.env.SNAGURL_WORKER_SECRET ?? "";
  const baseUrl = parseUrl(process.env.SNAGURL_WORKER_URL);
  if (secret.length < MIN_SECRET_LENGTH || baseUrl === null) return null;
  const publicUrl = parseUrl(process.env.SNAGURL_WORKER_PUBLIC_URL) ?? baseUrl;
  return { baseUrl, publicUrl, secret };
}

export function workerEnabled(): boolean {
  return workerSettings() !== null;
}
