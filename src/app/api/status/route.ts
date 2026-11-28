import { enforceRateLimit, errorResponse } from "@/lib/api/guards";
import { limits } from "@/lib/security/config";
import { describeProviders } from "@/lib/media/providers";
import { workerHealth } from "@/lib/worker/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await enforceRateLimit(request, "status", limits.jobPollRate);
    const worker = await workerHealth();
    return Response.json(
      { providers: describeProviders(), worker },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
