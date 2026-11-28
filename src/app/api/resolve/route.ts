import {
  assertJsonRequest,
  assertSameOrigin,
  enforceRateLimit,
  errorResponse,
} from "@/lib/api/guards";
import { MediaError } from "@/lib/media/errors";
import { resolveMedia } from "@/lib/media/resolve";
import type { ResolveSuccessBody } from "@/lib/media/types";
import { MAX_URL_LENGTH } from "@/lib/media/url";
import { limits } from "@/lib/security/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = MAX_URL_LENGTH + 64;

async function readUrl(request: Request): Promise<string> {
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
  const url = (body as { url?: unknown } | null)?.url;
  if (typeof url !== "string") {
    throw new MediaError("invalid_request", "The request needs a url.", 400);
  }
  return url;
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertJsonRequest(request);
    await enforceRateLimit(request, "resolve", limits.resolveRate);
    const url = await readUrl(request);
    const media = await resolveMedia(url, request.signal);
    const body: ResolveSuccessBody = { media };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
