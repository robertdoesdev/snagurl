import { createReadStream } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyFile, verifyRequest } from "./auth.ts";
import type { WorkerConfig } from "./config.ts";
import { InvalidJobError, JOB_ID, JobManager, QueueFullError, type JobSnapshot } from "./jobs.ts";

const MAX_BODY_BYTES = 8 * 1024;

function send(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(text);
}

function fail(response: ServerResponse, status: number, code: string, message: string): void {
  send(response, status, { error: { code, message } });
}

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    let exceeded = false;
    request.on("data", (chunk: Buffer) => {
      if (exceeded) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        exceeded = true;
        chunks.length = 0;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function view(job: JobSnapshot): { job: JobSnapshot } {
  return { job };
}

function dispositionName(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export interface ServerDeps {
  config: WorkerConfig;
  jobs: JobManager;
  ffmpegReady: boolean;
  now?: () => number;
}

export function createServer(deps: ServerDeps): http.Server {
  const { config, jobs } = deps;
  const now = deps.now ?? Date.now;

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://worker.local");
    const method = request.method ?? "GET";
    const segments = url.pathname.split("/").filter(Boolean);

    if (method === "GET" && url.pathname === "/health") {
      send(response, deps.ffmpegReady ? 200 : 503, {
        status: deps.ffmpegReady ? "ok" : "ffmpeg_missing",
      });
      return;
    }

    if (method === "GET" && segments[0] === "files" && segments.length === 2) {
      const id = segments[1] ?? "";
      const expires = Number(url.searchParams.get("exp"));
      const signature = url.searchParams.get("sig") ?? "";
      if (!JOB_ID.test(id) || !verifyFile(config.secret, id, expires, signature, now())) {
        fail(response, 403, "forbidden", "This download link isn’t valid or has expired.");
        return;
      }
      const file = jobs.outputFor(id);
      if (!file) {
        fail(response, 404, "not_found", "This file isn’t available anymore.");
        return;
      }
      response.writeHead(200, {
        "content-type": file.output.mime,
        "content-length": file.output.bytes,
        "content-disposition": dispositionName(file.output.filename),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "cross-origin-resource-policy": "cross-origin",
      });
      const stream = createReadStream(file.path);
      stream.on("error", () => response.destroy());
      response.on("close", () => stream.destroy());
      stream.pipe(response);
      return;
    }

    const isJobRoute =
      segments[0] === "jobs" &&
      ((segments.length === 1 && method === "POST") ||
        (segments.length === 2 && (method === "GET" || method === "DELETE")));
    if (!isJobRoute) {
      fail(response, 404, "not_found", "Not found.");
      return;
    }

    const body = method === "POST" ? await readBody(request) : "";
    if (body === null) {
      response.setHeader("connection", "close");
      response.on("finish", () => request.destroy());
      fail(response, 413, "too_large", "The request was too large.");
      return;
    }
    const authorized = verifyRequest(
      config.secret,
      {
        method,
        path: url.pathname,
        body,
        timestamp: header(request, TIMESTAMP_HEADER),
        signature: header(request, SIGNATURE_HEADER),
      },
      now(),
      config.clockSkewMs,
    );
    if (!authorized) {
      fail(response, 401, "unauthorized", "Request signature is missing or invalid.");
      return;
    }

    if (method === "POST") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        fail(response, 400, "invalid_request", "The request wasn’t valid JSON.");
        return;
      }
      const fields = (parsed ?? {}) as Record<string, unknown>;
      if (
        typeof fields.sourceUrl !== "string" ||
        typeof fields.operation !== "string" ||
        typeof fields.filename !== "string"
      ) {
        fail(response, 400, "invalid_request", "sourceUrl, operation and filename are required.");
        return;
      }
      try {
        const job = jobs.create({
          sourceUrl: fields.sourceUrl,
          operation: fields.operation,
          filename: fields.filename,
        });
        send(response, 202, view(job));
      } catch (error) {
        if (error instanceof InvalidJobError) {
          fail(response, 400, "invalid_request", error.message);
        } else if (error instanceof QueueFullError) {
          response.setHeader("retry-after", "30");
          fail(response, 429, "busy", "The worker is busy. Try again shortly.");
        } else {
          throw error;
        }
      }
      return;
    }

    const id = segments[1] ?? "";
    if (!JOB_ID.test(id)) {
      fail(response, 404, "not_found", "That job doesn’t exist.");
      return;
    }
    const job = method === "DELETE" ? await jobs.cancel(id) : jobs.get(id);
    if (!job) {
      fail(response, 404, "not_found", "That job doesn’t exist.");
      return;
    }
    send(response, 200, view(job));
  }

  const server = http.createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      console.error(
        JSON.stringify({ level: "error", message: error instanceof Error ? error.message : String(error) }),
      );
      if (!response.headersSent) fail(response, 500, "internal", "Something went wrong.");
      else response.destroy();
    });
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 0;
  server.keepAliveTimeout = 5_000;
  return server;
}
