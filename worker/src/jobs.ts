import { randomBytes } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { WorkerConfig } from "./config.ts";
import { JobError } from "./errors.ts";
import type { Prober, Transcoder } from "./ffmpeg.ts";
import type { SourceFetcher } from "./fetch.ts";
import { assertAllowedSource } from "./fetch.ts";
import { getOperation, type Operation } from "./operations.ts";

export type JobStatus =
  | "queued"
  | "fetching"
  | "processing"
  | "done"
  | "failed"
  | "cancelled"
  | "expired";

export interface JobOutput {
  filename: string;
  mime: string;
  bytes: number;
}

export interface JobSnapshot {
  id: string;
  status: JobStatus;
  progress: number | null;
  operation: string;
  error: { code: string; message: string } | null;
  output: JobOutput | null;
}

interface Job {
  id: string;
  operation: Operation;
  sourceUrl: URL;
  stem: string;
  status: JobStatus;
  progress: number | null;
  error: { code: string; message: string } | null;
  output: JobOutput | null;
  outputPath: string | null;
  dir: string;
  controller: AbortController;
  finishedAt: number | null;
}

export interface JobDeps {
  fetchSource: SourceFetcher;
  probe: Prober;
  transcode: Transcoder;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface CreateJobRequest {
  sourceUrl: string;
  operation: string;
  filename: string;
}

export const JOB_ID = /^[a-f0-9]{32}$/;

export function safeStem(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9._ -]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80);
  return cleaned === "" ? "snagurl-download" : cleaned;
}

export class QueueFullError extends Error {}
export class InvalidJobError extends Error {}

export class JobManager {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: string[] = [];
  private active = 0;
  private closed = false;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  private readonly config: WorkerConfig;
  private readonly deps: JobDeps;

  constructor(config: WorkerConfig, deps: JobDeps) {
    this.config = config;
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.sleep =
      deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async init(): Promise<void> {
    await mkdir(this.config.tmpDir, { recursive: true, mode: 0o700 });
    for (const entry of await readdir(this.config.tmpDir)) {
      if (JOB_ID.test(entry)) {
        await rm(path.join(this.config.tmpDir, entry), { recursive: true, force: true });
      }
    }
  }

  counts(): { active: number; queued: number } {
    return { active: this.active, queued: this.queue.length };
  }

  create(request: CreateJobRequest): JobSnapshot {
    if (this.closed) throw new QueueFullError("closed");
    const operation = getOperation(request.operation);
    if (!operation) throw new InvalidJobError("That conversion isn’t supported.");

    let sourceUrl: URL;
    try {
      sourceUrl = new URL(request.sourceUrl);
      assertAllowedSource(sourceUrl);
    } catch (error) {
      throw new InvalidJobError(
        error instanceof JobError ? error.message : "That source address isn’t valid.",
      );
    }

    if (this.queue.length >= this.config.maxQueued && this.active >= this.config.maxConcurrent) {
      throw new QueueFullError("The worker queue is full.");
    }

    const id = randomBytes(16).toString("hex");
    const job: Job = {
      id,
      operation,
      sourceUrl,
      stem: safeStem(request.filename),
      status: "queued",
      progress: null,
      error: null,
      output: null,
      outputPath: null,
      dir: path.join(this.config.tmpDir, id),
      controller: new AbortController(),
      finishedAt: null,
    };
    this.jobs.set(id, job);
    this.queue.push(id);
    queueMicrotask(() => this.pump());
    return this.snapshot(job);
  }

  get(id: string): JobSnapshot | null {
    const job = this.jobs.get(id);
    return job ? this.snapshot(job) : null;
  }

  async cancel(id: string): Promise<JobSnapshot | null> {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (job.status === "queued") {
      const index = this.queue.indexOf(id);
      if (index >= 0) this.queue.splice(index, 1);
      await this.finish(job, "cancelled");
    } else if (job.status === "fetching" || job.status === "processing") {
      job.controller.abort();
    }
    return this.snapshot(job);
  }

  outputFor(id: string): { path: string; output: JobOutput } | null {
    const job = this.jobs.get(id);
    if (!job || job.status !== "done" || !job.outputPath || !job.output) return null;
    return { path: job.outputPath, output: job.output };
  }

  async sweep(): Promise<void> {
    const now = this.now();
    for (const job of [...this.jobs.values()]) {
      if (job.finishedAt === null || now - job.finishedAt < this.config.retentionMs) continue;
      await rm(job.dir, { recursive: true, force: true });
      this.jobs.delete(job.id);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.jobs.values()) job.controller.abort();
    for (const job of this.jobs.values()) await rm(job.dir, { recursive: true, force: true });
  }

  private snapshot(job: Job): JobSnapshot {
    const expired =
      job.status === "done" &&
      job.finishedAt !== null &&
      this.now() - job.finishedAt >= this.config.retentionMs;
    return {
      id: job.id,
      status: expired ? "expired" : job.status,
      progress: job.progress,
      operation: job.operation.id,
      error: job.error,
      output: expired ? null : job.output,
    };
  }

  private pump(): void {
    while (this.active < this.config.maxConcurrent) {
      const id = this.queue.shift();
      if (id === undefined) return;
      const job = this.jobs.get(id);
      if (!job || job.status !== "queued") continue;
      this.active += 1;
      void this.run(job).finally(() => {
        this.active -= 1;
        this.pump();
      });
    }
  }

  private async finish(job: Job, status: JobStatus, error?: JobError): Promise<void> {
    if (status !== "done") {
      await rm(job.dir, { recursive: true, force: true });
      job.progress = null;
    }
    if (error) job.error = { code: error.code, message: error.message };
    job.finishedAt = this.now();
    job.status = status;
  }

  private async run(job: Job): Promise<void> {
    const timeout = AbortSignal.timeout(this.config.jobTimeoutMs);
    const signal = AbortSignal.any([job.controller.signal, timeout]);
    try {
      await mkdir(job.dir, { mode: 0o700 });
      const input = path.join(job.dir, "input");
      const output = path.join(job.dir, `output.${job.operation.extension}`);

      job.status = "fetching";
      await this.fetchWithRetry(job, input, signal);

      job.status = "processing";
      job.progress = 0;
      const probe = await this.deps.probe(input, signal);
      if (!job.operation.inputKinds.includes(probe.kind)) {
        throw new JobError("unsupported_media", "That conversion doesn’t apply to this file.");
      }
      if (job.operation.needs === "audio" && !probe.hasAudio) {
        throw new JobError("unsupported_media", "This file has no audio track.");
      }
      if (job.operation.needs === "video" && !probe.hasVideo) {
        throw new JobError("unsupported_media", "This file has no video track.");
      }
      if (probe.durationSeconds !== null && probe.durationSeconds > this.config.maxDurationSeconds) {
        throw new JobError("too_long", "This file is longer than the worker allows.");
      }

      await this.deps.transcode(input, output, job.operation.args, {
        signal,
        timeoutMs: this.config.jobTimeoutMs,
        maxOutputBytes: this.config.maxOutputBytes,
        threads: this.config.ffmpegThreads,
        durationSeconds: probe.durationSeconds,
        onProgress: (fraction) => {
          job.progress = fraction;
        },
      });

      const info = await stat(output).catch(() => null);
      if (!info || info.size === 0) {
        throw new JobError("conversion_failed", "The file couldn’t be converted.");
      }
      if (info.size >= this.config.maxOutputBytes) {
        throw new JobError("too_large", "The converted file is larger than the worker allows.");
      }

      await rm(input, { force: true });
      job.outputPath = output;
      job.output = {
        filename: `${job.stem}.${job.operation.extension}`,
        mime: job.operation.mime,
        bytes: info.size,
      };
      job.progress = 1;
      await this.finish(job, "done");
    } catch (error) {
      if (job.controller.signal.aborted) {
        await this.finish(job, "cancelled", new JobError("cancelled", "The job was cancelled."));
      } else if (error instanceof JobError) {
        await this.finish(job, "failed", error);
      } else if (timeout.aborted) {
        await this.finish(job, "failed", new JobError("timeout", "The job took too long and was stopped."));
      } else {
        console.error(
          JSON.stringify({ level: "error", message: error instanceof Error ? error.message : String(error) }),
        );
        await this.finish(job, "failed", new JobError("internal", "Something went wrong in the worker."));
      }
    }
  }

  private async fetchWithRetry(job: Job, destination: string, signal: AbortSignal): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.deps.fetchSource(job.sourceUrl, destination, {
          signal,
          maxBytes: this.config.maxInputBytes,
          idleTimeoutMs: this.config.fetchIdleTimeoutMs,
        });
        return;
      } catch (error) {
        const retryable = error instanceof JobError && error.retryable;
        if (!retryable || attempt >= this.config.maxFetchRetries || signal.aborted) throw error;
        await rm(destination, { force: true });
        await this.sleep(this.config.retryBaseDelayMs * 2 ** attempt);
      }
    }
  }
}
