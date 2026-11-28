import {
  assertJsonRequest,
  assertSameOrigin,
  enforceRateLimit,
  errorResponse,
} from "@/lib/api/guards";
import { MediaError } from "@/lib/media/errors";
import { sanitizeFilenameStem } from "@/lib/media/filename";
import { resolveMedia } from "@/lib/media/resolve";
import type { JobResponseBody } from "@/lib/media/types";
import { MAX_URL_LENGTH } from "@/lib/media/url";
import { limits } from "@/lib/security/config";
import { workerEnabled } from "@/lib/worker/config";
import { createJob } from "@/lib/worker/client";
import { isConversionId, supportsOperation } from "@/lib/worker/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = MAX_URL_LENGTH + 128;

async function readBody(request: Request): Promise<{ url: string; operation: string }> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    throw new MediaError("invalid_request", "The request was too large.", 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new MediaError("invalid_request", "The request wasn’t valid JSON.", 400);
  }
  const fields = (body ?? {}) as { url?: unknown; operation?: unknown };
  if (typeof fields.url !== "string" || typeof fields.operation !== "string") {
    throw new MediaError("invalid_request", "The request needs a url and an operation.", 400);
  }
  return { url: fields.url, operation: fields.operation };
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertJsonRequest(request);
    if (!workerEnabled()) {
      throw new MediaError("not_configured", "Conversion isn’t enabled on this server.", 503);
    }
    await enforceRateLimit(request, "job-create", limits.jobCreateRate);

    const { url, operation } = await readBody(request);
    if (!isConversionId(operation)) {
      throw new MediaError("invalid_request", "That conversion isn’t supported.", 400);
    }

    const media = await resolveMedia(url, request.signal);
    if (!supportsOperation(media, operation)) {
      throw new MediaError(
        "invalid_request",
        "That conversion isn’t available for this file.",
        422,
        { source: media.source },
      );
    }

    const job = await createJob({
      sourceUrl: media.originUrl,
      operation,
      filename: sanitizeFilenameStem(media.title),
    });
    const body: JobResponseBody = { job };
    return Response.json(body, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
