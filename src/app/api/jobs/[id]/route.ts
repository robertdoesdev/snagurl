import { assertSameOrigin, enforceRateLimit, errorResponse } from "@/lib/api/guards";
import { MediaError } from "@/lib/media/errors";
import type { JobResponseBody } from "@/lib/media/types";
import { limits } from "@/lib/security/config";
import { cancelJob, getJob, isJobId } from "@/lib/worker/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

async function readId(context: Context): Promise<string> {
  const { id } = await context.params;
  if (!isJobId(id)) {
    throw new MediaError("not_found", "That job doesn’t exist.", 404);
  }
  return id;
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    await enforceRateLimit(request, "job-poll", limits.jobPollRate);
    const job = await getJob(await readId(context));
    const body: JobResponseBody = { job };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "job-poll", limits.jobPollRate);
    const job = await cancelJob(await readId(context));
    const body: JobResponseBody = { job };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
