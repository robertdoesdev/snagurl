import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { loadConfig, type WorkerConfig } from "./config.ts";
import { createProber, createTranscoder } from "./ffmpeg.ts";
import { JobManager, type JobSnapshot } from "./jobs.ts";

const available =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0 &&
  spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;
const skip = available ? false : "ffmpeg and ffprobe are not installed";

let root: string;
let config: WorkerConfig;
let manager: JobManager;
let fixture = "";

function ff(args: string[]): void {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "ignore" });
}

function probeJson(file: string): { streams: { codec_type: string; codec_name: string; width?: number; height?: number }[]; format: { duration?: string } } {
  return JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]).toString(),
  );
}

before(async () => {
  if (!available) return;
  root = await mkdtemp(path.join(os.tmpdir(), "pipeline-"));
  config = { ...loadConfig({ SNAGURL_WORKER_SECRET: "s".repeat(40), WORKER_TMP_DIR: path.join(root, "work") }), maxConcurrent: 2 };
  const paths = { ffmpegPath: "ffmpeg", ffprobePath: "ffprobe" };
  manager = new JobManager(config, {
    // The network fetch is replaced by a local copy because the real fetcher
    // refuses loopback and private addresses. The fetcher is tested in fetch.test.ts.
    fetchSource: async (url, dest) => {
      await copyFile(path.join(root, url.pathname.slice(1)), dest);
      return 1;
    },
    probe: createProber(paths),
    transcode: createTranscoder(paths),
  });
  await manager.init();
  ff(["-f", "lavfi", "-i", "testsrc=size=1280x720:rate=24:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-shortest", path.join(root, "clip.mp4")]);
  ff(["-f", "lavfi", "-i", "testsrc=size=320x240:rate=1:duration=1", "-frames:v", "1", path.join(root, "pic.png")]);
  ff(["-f", "lavfi", "-i", "testsrc=size=320x240:rate=24:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(root, "silent.mp4")]);
  ff(["-f", "lavfi", "-i", "sine=frequency=330:duration=1", "-c:a", "libmp3lame", path.join(root, "tone.mp3")]);
  await writeFile(path.join(root, "notmedia.mp4"), "this is plain text, not media\n");
  await writeFile(path.join(root, "evil.mp4"), "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:1,\n/etc/passwd\n#EXT-X-ENDLIST\n");
  fixture = root;
});

after(async () => {
  if (!available) return;
  await manager.close();
  await rm(root, { recursive: true, force: true });
});

async function run(file: string, operation: string): Promise<JobSnapshot> {
  const created = manager.create({ sourceUrl: `https://media.example/${file}`, operation, filename: "result" });
  for (let i = 0; i < 600; i += 1) {
    const job = manager.get(created.id);
    if (job && !["queued", "fetching", "processing"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timed out");
}

function outputPath(job: JobSnapshot): string {
  const found = manager.outputFor(job.id);
  assert.ok(found, "output exists");
  return found.path;
}

test("mp3 extraction produces an mp3 audio stream", { skip }, async () => {
  const job = await run("clip.mp4", "mp3");
  assert.equal(job.status, "done", JSON.stringify(job.error));
  const info = probeJson(outputPath(job));
  assert.deepEqual(info.streams.map((s) => s.codec_name), ["mp3"]);
  assert.ok(Math.abs(Number(info.format.duration) - 2) < 0.3);
});

test("m4a extraction produces AAC audio only", { skip }, async () => {
  const job = await run("clip.mp4", "m4a");
  assert.equal(job.status, "done", JSON.stringify(job.error));
  assert.deepEqual(probeJson(outputPath(job)).streams.map((s) => s.codec_name), ["aac"]);
});

test("mp4-480 renders H.264 at 480 high with audio", { skip }, async () => {
  const job = await run("clip.mp4", "mp4-480");
  assert.equal(job.status, "done", JSON.stringify(job.error));
  const info = probeJson(outputPath(job));
  const video = info.streams.find((s) => s.codec_type === "video");
  assert.equal(video?.codec_name, "h264");
  assert.equal(video?.height, 480);
  assert.ok(info.streams.some((s) => s.codec_type === "audio"));
});

test("mp4-720 on a 240p source does not upscale", { skip }, async () => {
  const job = await run("silent.mp4", "mp4-720");
  assert.equal(job.status, "done", JSON.stringify(job.error));
  const video = probeJson(outputPath(job)).streams.find((s) => s.codec_type === "video");
  assert.equal(video?.height, 240);
});

test("gif output is a gif", { skip }, async () => {
  const job = await run("clip.mp4", "gif");
  assert.equal(job.status, "done", JSON.stringify(job.error));
  const video = probeJson(outputPath(job)).streams[0];
  assert.equal(video?.codec_name, "gif");
  assert.equal(video?.width, 480);
});

test("image conversions produce jpg, png and webp", { skip }, async () => {
  for (const [operation, codec] of [["jpg", "mjpeg"], ["png", "png"], ["webp", "webp"]] as const) {
    const job = await run("pic.png", operation);
    assert.equal(job.status, "done", `${operation}: ${JSON.stringify(job.error)}`);
    assert.equal(probeJson(outputPath(job)).streams[0]?.codec_name, codec, operation);
  }
});

test("mp3 works from an audio source", { skip }, async () => {
  const job = await run("tone.mp3", "m4a");
  assert.equal(job.status, "done", JSON.stringify(job.error));
});

test("rejects a video-only file for audio extraction", { skip }, async () => {
  const job = await run("silent.mp4", "mp3");
  assert.equal(job.status, "failed");
  assert.equal(job.error?.code, "unsupported_media");
});

test("rejects an image for a video conversion", { skip }, async () => {
  const job = await run("pic.png", "mp4-480");
  assert.equal(job.status, "failed");
  assert.equal(job.error?.code, "unsupported_media");
});

test("rejects text disguised as media", { skip }, async () => {
  const job = await run("notmedia.mp4", "mp3");
  assert.equal(job.status, "failed");
  assert.equal(job.error?.code, "unsupported_media");
});

test("rejects an HLS playlist that points at a local file", { skip }, async () => {
  const job = await run("evil.mp4", "mp3");
  assert.equal(job.status, "failed");
  assert.equal(job.error?.code, "unsupported_media");
});

test("a failed or finished job leaves no input file behind", { skip }, async () => {
  const job = await run("clip.mp4", "mp3");
  const out = outputPath(job);
  assert.ok((await stat(out)).size > 0);
  await assert.rejects(stat(path.join(path.dirname(out), "input")));
  assert.ok(fixture !== "");
});
