import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const TIMESTAMP_HEADER = "x-snagurl-timestamp";
export const SIGNATURE_HEADER = "x-snagurl-signature";

function mac(secret: string, payload: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

function bodyHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function matches(expected: Buffer, received: string): boolean {
  const actual = Buffer.from(received, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function signRequest(
  secret: string,
  method: string,
  path: string,
  body: string,
  timestamp: number,
): string {
  return mac(secret, `req.${timestamp}.${method.toUpperCase()}.${path}.${bodyHash(body)}`).toString(
    "base64url",
  );
}

export interface RequestParts {
  method: string;
  path: string;
  body: string;
  timestamp: string | undefined;
  signature: string | undefined;
}

export function verifyRequest(
  secret: string,
  parts: RequestParts,
  now: number,
  skewMs: number,
): boolean {
  if (parts.timestamp === undefined || parts.signature === undefined) return false;
  if (!/^\d{10,16}$/.test(parts.timestamp)) return false;
  const timestamp = Number(parts.timestamp);
  if (Math.abs(now - timestamp) > skewMs) return false;
  const expected = mac(
    secret,
    `req.${timestamp}.${parts.method.toUpperCase()}.${parts.path}.${bodyHash(parts.body)}`,
  );
  return matches(expected, parts.signature);
}

export function signFile(secret: string, jobId: string, expires: number): string {
  return mac(secret, `file.${jobId}.${expires}`).toString("base64url");
}

export function verifyFile(
  secret: string,
  jobId: string,
  expires: number,
  signature: string,
  now: number,
): boolean {
  if (!Number.isFinite(expires) || expires < now) return false;
  return matches(mac(secret, `file.${jobId}.${expires}`), signature);
}
