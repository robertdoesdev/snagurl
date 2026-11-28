import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { loadConfig, type WorkerConfig } from "./config.ts";
import { JobError } from "./errors.ts";
import { InvalidJobError, JobManager, QueueFullError, safeStem, type JobDeps } from "./jobs.ts";

let dir: string;
let config: WorkerConfig;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "jobs-test-"));
  config = {
    ...loadConfig({ SNAGURL_WORKER_SECRET: "s".repeat(40), WORKER_TMP_DIR: dir }),
    maxConcurrent: 1,
    maxQueued: 1,
    retryBaseDelayMs: 1,
    maxFetchRetries: 2,
  };
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const request = { sourceUrl: "https://example.com/a.mp4", operation: "mp3", filename: "clip" };

function deps(over: Partial<JobDeps> = {}): JobDeps {
  return {
    fetchSource: async (_u, dest) => {
      await writeFile(dest, "x");
      return 1;
    },
    probe: async () => ({ kind: "video", hasVideo: true, hasAudio: true, durationSeconds: 10 }),
    transcode: async (_i, out) => {
      await writeFile(out, "converted");
    },
    sleep: async () => undefined,
    ...over,
  };
}

async function settle(manager: JobManager, id: string) {
  for (let i = 0; i < 200; i += 1) {
    const job = manager.get(id);
    if (job && !["queued", "fetching", "processing"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("job did not settle");
}

test("runs a job to done and exposes the output", async () => {
  const manager = new JobManager(config, deps());
  await manager.init();
  const created = manager.create(request);
  assert.equal(created.status, "queued");
  const done = await settle(manager, created.id);
  assert.equal(done.status, "done");
  assert.equal(done.output?.filename, "clip.mp3");
  assert.equal(done.output?.mime, "audio/mpeg");
  assert.ok(manager.outputFor(created.id));
});

test("rejects unknown operations and unsafe sources", async () => {
  const manager = new JobManager(config, deps());
  assert.throws(() => manager.create({ ...request, operation: "exe" }), InvalidJobError);
  assert.throws(() => manager.create({ ...request, sourceUrl: "http://127.0.0.1/a" }), InvalidJobError);
  assert.throws(() => manager.create({ ...request, sourceUrl: "file:///etc/passwd" }), InvalidJobError);
});

test("enforces concurrency and queue limits", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  let running = 0;
  let peak = 0;
  const manager = new JobManager(
    config,
    deps({
      transcode: async (_i, out) => {
        running += 1;
        peak = Math.max(peak, running);
        await gate;
        running -= 1;
        await writeFile(out, "converted");
      },
    }),
  );
  await manager.init();
  const first = manager.create(request);
  const second = manager.create(request);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(manager.counts(), { active: 1, queued: 1 });
  assert.throws(() => manager.create(request), QueueFullError);
  release();
  await settle(manager, first.id);
  await settle(manager, second.id);
  assert.equal(peak, 1);
});

test("retries transient fetch failures then succeeds", async () => {
  let calls = 0;
  const manager = new JobManager(
    config,
    deps({
      fetchSource: async (_u, dest) => {
        calls += 1;
        if (calls < 3) throw new JobError("unreachable", "x", true);
        await writeFile(dest, "x");
        return 1;
      },
    }),
  );
  await manager.init();
  const done = await settle(manager, manager.create(request).id);
  assert.equal(done.status, "done");
  assert.equal(calls, 3);
});

test("does not retry permanent failures", async () => {
  let calls = 0;
  const manager = new JobManager(
    config,
    deps({
      fetchSource: async () => {
        calls += 1;
        throw new JobError("upstream_status", "404", false);
      },
    }),
  );
  await manager.init();
  const done = await settle(manager, manager.create(request).id);
  assert.equal(done.status, "failed");
  assert.equal(done.error?.code, "upstream_status");
  assert.equal(calls, 1);
});

test("gives up after the retry budget", async () => {
  let calls = 0;
  const manager = new JobManager(
    config,
    deps({
      fetchSource: async () => {
        calls += 1;
        throw new JobError("timeout", "x", true);
      },
    }),
  );
  await manager.init();
  const done = await settle(manager, manager.create(request).id);
  assert.equal(done.status, "failed");
  assert.equal(calls, 3);
});

test("cancels a running job and removes its directory", async () => {
  const manager = new JobManager(
    config,
    deps({
      transcode: (_i, _o, _a, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new JobError("cancelled", "stopped")));
        }),
    }),
  );
  await manager.init();
  const created = manager.create(request);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(manager.get(created.id)?.status, "processing");
  await manager.cancel(created.id);
  const done = await settle(manager, created.id);
  assert.equal(done.status, "cancelled");
  assert.deepEqual(await readdir(dir), []);
});

test("cancels a queued job without running it", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  let started = 0;
  const manager = new JobManager(
    config,
    deps({
      probe: async () => {
        started += 1;
        await gate;
        return { kind: "video", hasVideo: true, hasAudio: true, durationSeconds: 1 };
      },
    }),
  );
  await manager.init();
  manager.create(request);
  const queued = manager.create(request);
  await manager.cancel(queued.id);
  assert.equal(manager.get(queued.id)?.status, "cancelled");
  release();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(started, 1);
});

test("rejects mismatched media, missing tracks and overlong files", async () => {
  for (const [probe, code] of [
    [{ kind: "image", hasVideo: true, hasAudio: false, durationSeconds: null }, "unsupported_media"],
    [{ kind: "video", hasVideo: true, hasAudio: false, durationSeconds: 5 }, "unsupported_media"],
    [{ kind: "video", hasVideo: true, hasAudio: true, durationSeconds: 99999 }, "too_long"],
  ] as const) {
    const manager = new JobManager(config, deps({ probe: async () => probe }));
    await manager.init();
    const done = await settle(manager, manager.create(request).id);
    assert.equal(done.status, "failed");
    assert.equal(done.error?.code, code);
  }
});

test("fails when output reaches the size cap", async () => {
  const manager = new JobManager(
    { ...config, maxOutputBytes: 5 },
    deps({ transcode: async (_i, out) => void (await writeFile(out, "123456")) }),
  );
  await manager.init();
  const done = await settle(manager, manager.create(request).id);
  assert.equal(done.error?.code, "too_large");
});

test("expires finished jobs and sweeps their files", async () => {
  let now = 1_000;
  const manager = new JobManager(config, { ...deps(), now: () => now });
  await manager.init();
  const done = await settle(manager, manager.create(request).id);
  assert.equal(done.status, "done");
  now += config.retentionMs + 1;
  assert.equal(manager.get(done.id)?.status, "expired");
  assert.equal(manager.outputFor(done.id) === null, false);
  await manager.sweep();
  assert.equal(manager.get(done.id), null);
  assert.deepEqual(await readdir(dir), []);
});

test("init removes leftover job directories from a previous run", async () => {
  const stale = path.join(dir, "a".repeat(32));
  await mkdir(stale);
  await writeFile(path.join(stale, "input"), "x");
  await mkdir(path.join(dir, "keep-me"));
  const manager = new JobManager(config, deps());
  await manager.init();
  assert.deepEqual(await readdir(dir), ["keep-me"]);
});

test("safeStem strips path and control characters", () => {
  assert.equal(safeStem("../../etc/passwd"), "_._etc_passwd");
  assert.equal(safeStem("..."), "snagurl-download");
  assert.equal(safeStem('a"b\r\nc'), "a_b_c");
  assert.ok(safeStem("x".repeat(500)).length <= 80);
});
