import { MediaError } from "../media/errors";
import type { ConversionId, JobStatus, JobView } from "../media/types";
import { limits } from "../security/config";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signFile, signRequest } from "./auth";
import { workerSettings, type WorkerSettings } from "./config";

const REQUEST_TIMEOUT_MS = 10_000;
const JOB_ID = /^[a-f0-9]{32}$/;

export function isJobId(value: string): boolean {
  return JOB_ID.test(value);
}

function requireSettings(): WorkerSettings {
  const settings = workerSettings();
  if (!settings) {
    throw new MediaError(
      "not_configured",
      "Conversion isn’t enabled on this server.",
      503,
    );
  }
  return settings;
}

interface WorkerJob {
  id: string;
  status: JobStatus;
  progress: number | null;
  operation: ConversionId;
  error: { code: string; message: string } | null;
  output: { filename: string; mime: string; bytes: number } | null;
}

function isWorkerJob(value: unknown): value is WorkerJob {
  if (typeof value !== "object" || value === null) return false;
  const job = value as Record<string, unknown>;
  return typeof job.id === "string" && typeof job.status === "string" && typeof job.operation === "string";
}

async function call(
  method: "GET" | "POST" | "DELETE",
  path: string,
  payload?: unknown,
): Promise<WorkerJob> {
  const settings = requireSettings();
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const timestamp = Date.now();
  const url = new URL(path, settings.baseUrl);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(body === "" ? {} : { "content-type": "application/json" }),
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: signRequest(settings.secret, method, url.pathname, body, timestamp),
      },
      body: body === "" ? undefined : body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new MediaError("unreachable", "The conversion service isn’t reachable right now.", 503);
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = (data as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const message =
      typeof error?.message === "string" ? error.message : "The conversion service refused the request.";
    if (response.status === 404) throw new MediaError("not_found", message, 404);
    if (response.status === 429 || response.status === 503) throw new MediaError("busy", message, 503);
    throw new MediaError("internal", message, 502);
  }

  const job = (data as { job?: unknown } | null)?.job;
  if (!isWorkerJob(job)) {
    throw new MediaError("internal", "The conversion service sent an unexpected reply.", 502);
  }
  return job;
}

export interface CreateJobInput {
  sourceUrl: string;
  operation: ConversionId;
  filename: string;
}

export async function createJob(input: CreateJobInput): Promise<JobView> {
  return toView(await call("POST", "/jobs", input));
}

export async function getJob(id: string): Promise<JobView> {
  return toView(await call("GET", `/jobs/${id}`));
}

export async function cancelJob(id: string): Promise<JobView> {
  return toView(await call("DELETE", `/jobs/${id}`));
}

function toView(job: WorkerJob): JobView {
  const settings = requireSettings();
  let download: JobView["download"] = null;
  if (job.status === "done" && job.output) {
    const expires = Date.now() + limits.signatureTtlMs;
    const url = new URL(`/files/${job.id}`, settings.publicUrl);
    url.searchParams.set("exp", String(expires));
    url.searchParams.set("sig", signFile(settings.secret, job.id, expires));
    download = {
      url: url.href,
      filename: job.output.filename,
      mime: job.output.mime,
      bytes: job.output.bytes,
    };
  }
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    operation: job.operation,
    error: job.error,
    download,
  };
}

export async function workerHealth(): Promise<"ok" | "unreachable" | "not_configured"> {
  const settings = workerSettings();
  if (!settings) return "not_configured";
  try {
    const response = await fetch(new URL("/health", settings.baseUrl), {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    return response.ok ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}
