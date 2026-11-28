import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import type { JobView, MediaInfo } from "../../../lib/media/types";

const env = process.env as Record<string, string | undefined>;

const resolveMock = mock.fn<(url: string) => Promise<MediaInfo>>();
const createMock = mock.fn<(input: { sourceUrl: string; operation: string; filename: string }) => Promise<JobView>>();
const getMock = mock.fn<(id: string) => Promise<JobView>>();
const cancelMock = mock.fn<(id: string) => Promise<JobView>>();

let POST: typeof import("./route").POST;
let GET: typeof import("./[id]/route").GET;
let DELETE: typeof import("./[id]/route").DELETE;

const media: MediaInfo = {
  source: "direct",
  sourceLabel: "Direct link",
  originUrl: "https://cdn.example.com/My%20Clip.mp4",
  host: "cdn.example.com",
  title: "My Clip.mp4",
  author: null,
  kind: "video",
  mime: "video/mp4",
  bytes: 100,
  previewUrl: null,
  thumbnailUrl: null,
  downloadable: true,
  notice: null,
  formats: [],
  conversions: [],
};

const view: JobView = {
  id: "a".repeat(32),
  status: "queued",
  progress: null,
  operation: "mp3",
  error: null,
  download: null,
};

before(async () => {
  mock.module(require.resolve("../../../lib/media/resolve"), { namedExports: { resolveMedia: resolveMock } });
  mock.module(require.resolve("../../../lib/worker/client"), {
    namedExports: {
      createJob: createMock,
      getJob: getMock,
      cancelJob: cancelMock,
      isJobId: (value: string) => /^[a-f0-9]{32}$/.test(value),
    },
  });
  ({ POST } = await import("./route"));
  ({ GET, DELETE } = await import("./[id]/route"));
});

beforeEach(() => {
  env.SNAGURL_WORKER_URL = "http://localhost:8080";
  env.SNAGURL_WORKER_SECRET = "q".repeat(48);
  resolveMock.mock.resetCalls();
  createMock.mock.resetCalls();
  resolveMock.mock.mockImplementation(async () => media);
  createMock.mock.mockImplementation(async () => view);
  getMock.mock.mockImplementation(async () => view);
  cancelMock.mock.mockImplementation(async () => ({ ...view, status: "cancelled" }));
});

afterEach(() => {
  delete env.SNAGURL_WORKER_URL;
  delete env.SNAGURL_WORKER_SECRET;
});

let ip = 0;
function post(body: unknown, headers: Record<string, string> = {}) {
  ip += 1;
  return POST(
    new Request("https://snagurl.test/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", host: "snagurl.test", "x-real-ip": `198.51.100.${ip}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/jobs", () => {
  it("creates a job for a direct video and sends the sanitised name to the worker", async () => {
    const response = await post({ url: "https://cdn.example.com/My%20Clip.mp4", operation: "mp3" });
    assert.equal(response.status, 202);
    assert.equal(((await response.json()) as { job: JobView }).job.id, view.id);
    const input = createMock.mock.calls[0]?.arguments[0];
    assert.equal(input?.sourceUrl, media.originUrl);
    assert.equal(input?.operation, "mp3");
    assert.equal(input?.filename, "My Clip");
  });

  it("returns 503 not_configured and never contacts the worker when conversion is off", async () => {
    delete env.SNAGURL_WORKER_URL;
    const response = await post({ url: "https://cdn.example.com/a.mp4", operation: "mp3" });
    assert.equal(response.status, 503);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "not_configured");
    assert.equal(createMock.mock.callCount(), 0);
  });

  it("rejects platform media: previews never reach the worker", async () => {
    resolveMock.mock.mockImplementation(async () => ({ ...media, source: "youtube", downloadable: false }));
    const response = await post({ url: "https://youtu.be/dQw4w9WgXcQ", operation: "mp3" });
    assert.equal(response.status, 422);
    assert.equal(createMock.mock.callCount(), 0);
  });

  it("rejects conversions that do not fit the media kind", async () => {
    const response = await post({ url: "https://cdn.example.com/a.mp4", operation: "jpg" });
    assert.equal(response.status, 422);
    assert.equal(createMock.mock.callCount(), 0);
  });

  it("rejects unknown operations, bad bodies, wrong content type and cross-site requests", async () => {
    assert.equal((await post({ url: "https://cdn.example.com/a.mp4", operation: "rm -rf" })).status, 400);
    assert.equal((await post("not json")).status, 400);
    assert.equal((await post({ operation: "mp3" })).status, 400);
    assert.equal((await post({ url: "x", operation: "mp3" }, { "content-type": "text/plain" })).status, 415);
    assert.equal((await post({ url: "x", operation: "mp3" }, { origin: "https://evil.example" })).status, 403);
    assert.equal(createMock.mock.callCount(), 0);
  });

  it("rate limits job creation per client", async () => {
    const headers = { "x-real-ip": "203.0.113.77" };
    let last = 0;
    for (let i = 0; i < 8; i += 1) {
      last = (await post({ url: "https://cdn.example.com/a.mp4", operation: "mp3" }, headers)).status;
    }
    assert.equal(last, 429);
  });
});

describe("/api/jobs/[id]", () => {
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  const request = (method: string, headers: Record<string, string> = {}) => {
    ip += 1;
    return new Request("https://snagurl.test/api/jobs/x", { method, headers: { host: "snagurl.test", "x-real-ip": `192.0.2.${ip}`, ...headers } });
  };

  it("returns job status", async () => {
    const response = await GET(request("GET"), context(view.id));
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { job: JobView }).job.status, "queued");
  });

  it("rejects malformed ids before calling the worker", async () => {
    const before = getMock.mock.callCount();
    assert.equal((await GET(request("GET"), context("../../secret"))).status, 404);
    assert.equal(getMock.mock.callCount(), before);
  });

  it("cancels a job and blocks cross-site cancellation", async () => {
    const ok = await DELETE(request("DELETE"), context(view.id));
    assert.equal(((await ok.json()) as { job: JobView }).job.status, "cancelled");
    assert.equal((await DELETE(request("DELETE", { origin: "https://evil.example" }), context(view.id))).status, 403);
  });
});
