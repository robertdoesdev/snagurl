import { Readable, Transform } from "node:stream";
import { enforceRateLimit, errorResponse } from "@/lib/api/guards";
import { MediaError } from "@/lib/media/errors";
import { deriveFilename } from "@/lib/media/filename";
import { describeMime, normalizeMime } from "@/lib/media/mime";
import { parseMediaUrl } from "@/lib/media/url";
import { acquireSlot } from "@/lib/security/concurrency";
import { limits } from "@/lib/security/config";
import { safeFetch } from "@/lib/security/safe-fetch";
import { verifyTarget } from "@/lib/security/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sizeLimiter(maxBytes: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      if (seen > maxBytes) {
        callback(new Error("File exceeded the download size limit."));
        return;
      }
      callback(null, chunk);
    },
  });
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request): Promise<Response> {
  let release: (() => void) | null = null;

  try {
    await enforceRateLimit(request, "download", limits.downloadRate);

    const params = new URL(request.url).searchParams;
    const target = params.get("url") ?? "";
    const expires = Number(params.get("exp"));
    const signature = params.get("sig") ?? "";

    if (!verifyTarget(target, expires, signature)) {
      throw new MediaError(
        "forbidden",
        "This download link has expired. Paste the link again to get a fresh one.",
        403,
      );
    }

    const parsed = parseMediaUrl(target);
    if (!parsed.ok) {
      throw new MediaError("invalid_url", parsed.message, 400);
    }

    release = acquireSlot(limits.maxConcurrentDownloads);
    if (!release) {
      throw new MediaError(
        "busy",
        "SnagUrl is handling a lot of downloads right now. Try again in a moment.",
        503,
        { retryAfterSeconds: 15 },
      );
    }

    const { response, finalUrl } = await safeFetch(parsed.url, {
      idleTimeoutMs: limits.downloadIdleTimeoutMs,
      totalTimeoutMs: limits.downloadTotalTimeoutMs,
      signal: request.signal,
    });

    const status = response.statusCode ?? 0;
    if (status !== 200) {
      response.destroy();
      throw new MediaError(
        "upstream_status",
        `The host answered with status ${status}, so the file can’t be downloaded.`,
        502,
      );
    }

    const mime = normalizeMime(response.headers["content-type"]);
    if (!describeMime(mime)) {
      response.destroy();
      throw new MediaError(
        "not_media",
        "The host no longer returns a supported media file for this link.",
        422,
      );
    }

    const lengthHeader = response.headers["content-length"];
    const length = lengthHeader === undefined ? null : Number(lengthHeader);
    if (length !== null && (!Number.isInteger(length) || length > limits.maxFileBytes)) {
      response.destroy();
      throw new MediaError(
        "too_large",
        "This file is larger than SnagUrl’s download limit.",
        413,
      );
    }

    const limiter = sizeLimiter(limits.maxFileBytes);
    const finish = release;
    limiter.on("close", () => {
      response.destroy();
      finish();
    });
    response.on("error", (error) => limiter.destroy(error));
    request.signal.addEventListener("abort", () => limiter.destroy(), { once: true });
    response.pipe(limiter);
    release = null;

    const headers = new Headers({
      "Content-Type": mime,
      "Content-Disposition": contentDisposition(
        deriveFilename(finalUrl, mime, response.headers["content-disposition"]),
      ),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (length !== null) headers.set("Content-Length", String(length));

    return new Response(Readable.toWeb(limiter) as ReadableStream<Uint8Array>, {
      status: 200,
      headers,
    });
  } catch (error) {
    release?.();
    return errorResponse(error);
  }
}
