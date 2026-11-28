import assert from "node:assert/strict";
import type http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signFile, signRequest } from "./auth.ts";
import { loadConfig, type WorkerConfig } from "./config.ts";
import { JobManager } from "./jobs.ts";
import { createServer } from "./server.ts";

const secret = "k".repeat(48);
let dir: string;
let config: WorkerConfig;
let server: http.Server;
let base = "";
let manager: JobManager;

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "server-test-"));
  config = { ...loadConfig({ SNAGURL_WORKER_SECRET: secret, WORKER_TMP_DIR: dir }), maxConcurrent: 1, maxQueued: 0 };
  manager = new JobManager(config, {
    fetchSource: async (_u, dest) => {
      await writeFile(dest, "x");
      return 1;
    },
    probe: async () => ({ kind: "video", hasVideo: true, hasAudio: true, durationSeconds: 3 }),
    transcode: async (_i, out) => {
      await writeFile(out, "audio-bytes");
    },
    sleep: async () => undefined,
  });
  await manager.init();
  server = createServer({ config, jobs: manager, ffmpegReady: true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  await manager.close();
  await rm(dir, { recursive: true, force: true });
});

async function signed(method: string, p: string, payload?: unknown, over: { secret?: string; timestamp?: number } = {}) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const ts = over.timestamp ?? Date.now();
  return fetch(`${base}${p}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      [TIMESTAMP_HEADER]: String(ts),
      [SIGNATURE_HEADER]: signRequest(over.secret ?? secret, method, p, body, ts),
    },
    body: body || undefined,
  });
}

const good = { sourceUrl: "https://example.com/a.mp4", operation: "mp3", filename: "My Song" };

test("health is public and reports readiness", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("job routes reject unsigned, wrongly signed and stale requests", async () => {
  assert.equal((await fetch(`${base}/jobs`, { method: "POST", body: "{}" })).status, 401);
  assert.equal((await signed("POST", "/jobs", good, { secret: "z".repeat(48) })).status, 401);
  assert.equal((await signed("POST", "/jobs", good, { timestamp: Date.now() - 10 * 60_000 })).status, 401);
  assert.equal((await fetch(`${base}/jobs/${"a".repeat(32)}`)).status, 401);
});

test("validates the request body", async () => {
  assert.equal((await signed("POST", "/jobs", { operation: "mp3" })).status, 400);
  assert.equal((await signed("POST", "/jobs", { ...good, operation: "rm" })).status, 400);
  assert.equal((await signed("POST", "/jobs", { ...good, sourceUrl: "http://169.254.169.254/" })).status, 400);
  const big = await signed("POST", "/jobs", { ...good, filename: "x".repeat(20_000) });
  assert.equal(big.status, 413);
});

test("creates a job, reports status and serves a signed file once", async () => {
  const created = await signed("POST", "/jobs", good);
  assert.equal(created.status, 202);
  const { job } = (await created.json()) as { job: { id: string } };

  let status = "";
  let output: { filename: string; bytes: number } | null = null;
  for (let i = 0; i < 100 && status !== "done"; i += 1) {
    const poll = (await (await signed("GET", `/jobs/${job.id}`)).json()) as {
      job: { status: string; output: { filename: string; bytes: number } | null };
    };
    status = poll.job.status;
    output = poll.job.output;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(status, "done");
  assert.equal(output?.filename, "My Song.mp3");

  const exp = Date.now() + 60_000;
  const sig = signFile(secret, job.id, exp);
  const file = await fetch(`${base}/files/${job.id}?exp=${exp}&sig=${sig}`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "audio/mpeg");
  assert.match(file.headers.get("content-disposition") ?? "", /^attachment; filename="My Song\.mp3"/);
  assert.equal(file.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await file.text(), "audio-bytes");

  assert.equal((await fetch(`${base}/files/${job.id}?exp=${exp}&sig=${sig.slice(1)}x`)).status, 403);
  const old = Date.now() - 1000;
  assert.equal((await fetch(`${base}/files/${job.id}?exp=${old}&sig=${signFile(secret, job.id, old)}`)).status, 403);
  const other = "b".repeat(32);
  assert.equal((await fetch(`${base}/files/${other}?exp=${exp}&sig=${signFile(secret, other, exp)}`)).status, 404);
});

test("returns 404 for unknown or malformed job ids", async () => {
  assert.equal((await signed("GET", `/jobs/${"c".repeat(32)}`)).status, 404);
  assert.equal((await signed("GET", "/jobs/..%2f..%2fetc")).status, 404);
  assert.equal((await signed("DELETE", `/jobs/${"c".repeat(32)}`)).status, 404);
});

test("answers 429 with Retry-After when the queue is full", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  const busy = new JobManager(
    { ...config, tmpDir: path.join(dir, "busy"), maxQueued: 0 },
    {
      fetchSource: async () => {
        await gate;
        return 0;
      },
      probe: async () => ({ kind: "video", hasVideo: true, hasAudio: true, durationSeconds: 1 }),
      transcode: async () => undefined,
    },
  );
  await busy.init();
  const s = createServer({ config, jobs: busy, ffmpegReady: true });
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  const post = async () => {
    const body = JSON.stringify(good);
    const ts = Date.now();
    return fetch(`${url}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", [TIMESTAMP_HEADER]: String(ts), [SIGNATURE_HEADER]: signRequest(secret, "POST", "/jobs", body, ts) },
      body,
    });
  };
  assert.equal((await post()).status, 202);
  await new Promise((r) => setTimeout(r, 20));
  const second = await post();
  assert.equal(second.status, 429);
  assert.equal(second.headers.get("retry-after"), "30");
  release();
  s.close();
  await busy.close();
});
