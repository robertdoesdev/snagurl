import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const TIMESTAMP_HEADER = "x-snagurl-timestamp";
export const SIGNATURE_HEADER = "x-snagurl-signature";

function mac(secret: string, payload: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

function bodyHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
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

export function signFile(secret: string, jobId: string, expires: number): string {
  return mac(secret, `file.${jobId}.${expires}`).toString("base64url");
}
