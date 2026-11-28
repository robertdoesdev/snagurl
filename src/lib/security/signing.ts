import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MediaError } from "../media/errors";
import { limits } from "./config";

const globalForSecret = globalThis as unknown as { snagurlDevSecret?: string };

function getSecret(): string {
  const configured = process.env.SNAGURL_SIGNING_SECRET;
  if (configured && configured.length >= 16) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new MediaError(
      "not_configured",
      "SnagUrl isn’t configured to serve downloads yet.",
      503,
    );
  }

  globalForSecret.snagurlDevSecret ??= randomBytes(32).toString("hex");
  return globalForSecret.snagurlDevSecret;
}

function digest(url: string, expires: number): Buffer {
  return createHmac("sha256", getSecret()).update(`${expires}.${url}`).digest();
}

export interface SignedTarget {
  expires: number;
  signature: string;
}

export function signTarget(url: string, now = Date.now()): SignedTarget {
  const expires = now + limits.signatureTtlMs;
  return { expires, signature: digest(url, expires).toString("base64url") };
}

export function verifyTarget(
  url: string,
  expires: number,
  signature: string,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(expires) || expires < now) return false;
  const expected = digest(url, expires);
  const received = Buffer.from(signature, "base64url");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
