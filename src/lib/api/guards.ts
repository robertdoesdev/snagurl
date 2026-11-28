import { MediaError } from "../media/errors";
import type { ApiErrorBody } from "../media/types";
import {
  checkRateLimit,
  clientKey,
  type RateLimitRule,
} from "../security/rate-limit";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin === null) return;
  const host = request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new MediaError("forbidden", "Cross-site requests aren’t allowed.", 403);
  }
  if (originHost !== host) {
    throw new MediaError("forbidden", "Cross-site requests aren’t allowed.", 403);
  }
}

export function assertJsonRequest(request: Request): void {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new MediaError("invalid_request", "Send the request as JSON.", 415);
  }
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  rule: RateLimitRule,
): Promise<void> {
  const result = await checkRateLimit(scope, clientKey(request.headers), rule);
  if (!result.allowed) {
    throw new MediaError(
      "rate_limited",
      `Too many requests. Try again in ${result.retryAfterSeconds} seconds.`,
      429,
      { retryAfterSeconds: result.retryAfterSeconds },
    );
  }
}

export function errorResponse(error: unknown): Response {
  const known = error instanceof MediaError;
  if (!known) {
    console.error(
      JSON.stringify({
        level: "error",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  const mediaError = known
    ? error
    : new MediaError("internal", "Something went wrong on our side. Try again.", 500);

  const body: ApiErrorBody = {
    error: {
      code: mediaError.code,
      message: mediaError.message,
      ...(mediaError.source ? { source: mediaError.source } : {}),
    },
  };

  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (mediaError.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(mediaError.retryAfterSeconds);
  }

  return Response.json(body, { status: mediaError.status, headers });
}
