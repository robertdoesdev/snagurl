import { workerEnabled } from "@/lib/worker/config";
import { rateLimitMode } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  const secret = process.env.SNAGURL_SIGNING_SECRET;
  const signingConfigured = typeof secret === "string" && secret.length >= 16;
  const ready = signingConfigured || process.env.NODE_ENV !== "production";

  return Response.json(
    {
      status: ready ? "ok" : "misconfigured",
      signing: signingConfigured,
      rateLimit: rateLimitMode(),
      conversion: workerEnabled() ? "configured" : "off",
      time: new Date().toISOString(),
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
