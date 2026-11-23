import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { before, describe, it, mock } from "node:test";
import { Readable } from "node:stream";

process.env.SNAGURL_MAX_FILE_BYTES = "1000";
process.env.SNAGURL_SIGNING_SECRET = "test-secret-with-enough-length";

interface FakeOptions {
  status?: number;
  headers?: Record<string, string>;
  chunks?: Buffer[];
}

function fakeResponse({ status = 200, headers = {}, chunks = [Buffer.from("hello")] }: FakeOptions) {
  const stream = Readable.from(chunks) as unknown as IncomingMessage;
  stream.statusCode = status;
  stream.headers = headers;
  return stream;
}

const safeFetchMock = mock.fn<(url: URL) => Promise<{ response: IncomingMessage; finalUrl: URL }>>();

let GET: typeof import("./route").GET;
let signTarget: typeof import("../../../lib/security/signing").signTarget;
let acquireSlot: typeof import("../../../lib/security/concurrency").acquireSlot;

before(async () => {
  mock.module(require.resolve("../../../lib/security/safe-fetch"), {
    namedExports: { safeFetch: safeFetchMock },
  });
  ({ GET } = await import("./route"));
  ({ signTarget } = await import("../../../lib/security/signing"));
  ({ acquireSlot } = await import("../../../lib/security/concurrency"));
});

const target = "https://cdn.example.com/media/clip.mp4";
let counter = 0;

function downloadRequest(url = target, overrides: { exp?: number; sig?: string } = {}) {
  const signed = signTarget(url);
  const params = new URLSearchParams({
    url,
    exp: String(overrides.exp ?? signed.expires),
    sig: overrides.sig ?? signed.signature,
  });
  counter += 1;
  return new Request(`https://snagurl.example/api/download?${params.toString()}`, {
    headers: { "x-real-ip": `198.51.100.${counter}` },
  });
}

function respondWith(options: FakeOptions) {
  safeFetchMock.mock.mockImplementationOnce(async (url: URL) => ({
    response: fakeResponse(options),
    finalUrl: url,
  }));
}

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

describe("GET /api/download", () => {
  it("streams the file with safe download headers", async () => {
    respondWith({
      headers: { "content-type": "video/mp4; codecs=avc1", "content-length": "5" },
    });
    const response = await GET(downloadRequest());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.equal(response.headers.get("content-length"), "5");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename="clip\.mp4"/);
    assert.equal(await response.text(), "hello");
  });

  it("encodes non-ascii filenames", async () => {
    const url = "https://cdn.example.com/caf%C3%A9.mp3";
    respondWith({ headers: { "content-type": "audio/mpeg" } });
    const response = await GET(downloadRequest(url));
    const disposition = response.headers.get("content-disposition") ?? "";
    assert.match(disposition, /filename="caf_\.mp3"/);
    assert.match(disposition, /filename\*=UTF-8''caf%C3%A9\.mp3/);
    await response.arrayBuffer();
  });

  it("rejects missing, tampered and expired signatures", async () => {
    const forged = await GET(downloadRequest(target, { sig: "AAAA" }));
    assert.equal(forged.status, 403);
    assert.equal(await errorCode(forged), "forbidden");

    const expired = await GET(downloadRequest(target, { exp: Date.now() - 1000 }));
    assert.equal(expired.status, 403);

    const bare = await GET(
      new Request(`https://snagurl.example/api/download?url=${encodeURIComponent(target)}`, {
        headers: { "x-real-ip": "203.0.113.200" },
      }),
    );
    assert.equal(bare.status, 403);
  });

  it("does not fetch for unsigned requests", async () => {
    const before = safeFetchMock.mock.callCount();
    await GET(downloadRequest(target, { sig: "AAAA" }));
    assert.equal(safeFetchMock.mock.callCount(), before);
  });

  it("refuses content that is no longer supported media", async () => {
    respondWith({ headers: { "content-type": "text/html" } });
    const response = await GET(downloadRequest());
    assert.equal(response.status, 422);
    assert.equal(await errorCode(response), "not_media");
  });

  it("refuses files whose declared size is over the limit", async () => {
    respondWith({ headers: { "content-type": "video/mp4", "content-length": "1001" } });
    const response = await GET(downloadRequest());
    assert.equal(response.status, 413);
    assert.equal(await errorCode(response), "too_large");
  });

  it("aborts streams that exceed the limit without a declared length", async () => {
    respondWith({
      headers: { "content-type": "video/mp4" },
      chunks: [Buffer.alloc(600), Buffer.alloc(600)],
    });
    const response = await GET(downloadRequest());
    assert.equal(response.status, 200);
    await assert.rejects(response.arrayBuffer());
  });

  it("passes through non-200 upstream statuses as errors", async () => {
    respondWith({ status: 206, headers: { "content-type": "video/mp4" } });
    const response = await GET(downloadRequest());
    assert.equal(response.status, 502);
    assert.equal(await errorCode(response), "upstream_status");
  });

  it("returns a busy error when all download slots are taken", async () => {
    const held = Array.from({ length: 6 }, () => acquireSlot(6));
    assert.ok(held.every((release) => release !== null));
    const response = await GET(downloadRequest());
    assert.equal(response.status, 503);
    assert.equal(await errorCode(response), "busy");
    assert.equal(response.headers.get("retry-after"), "15");
    for (const release of held) release?.();
  });

  it("releases its slot after a completed download", async () => {
    respondWith({ headers: { "content-type": "video/mp4" } });
    const response = await GET(downloadRequest());
    await response.arrayBuffer();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const slots = Array.from({ length: 6 }, () => acquireSlot(6));
    assert.ok(slots.every((release) => release !== null));
    for (const release of slots) release?.();
  });

  it("rate limits repeated requests from one client", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const request = new Request(
        `https://snagurl.example/api/download?url=${encodeURIComponent(target)}`,
        { headers: { "x-real-ip": "192.0.2.77" } },
      );
      statuses.push((await GET(request)).status);
    }
    assert.equal(statuses.filter((status) => status === 429).length, 2);
    assert.equal(statuses[11], 429);
  });
});
