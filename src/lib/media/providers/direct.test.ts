import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { before, describe, it, mock } from "node:test";
import { Readable } from "node:stream";

process.env.SNAGURL_MAX_FILE_BYTES = "1000";
process.env.SNAGURL_SIGNING_SECRET = "test-secret-with-enough-length";

interface FakeOptions {
  status?: number;
  headers?: Record<string, string>;
}

let destroyed = 0;

function fakeResponse({ status = 200, headers = {} }: FakeOptions): IncomingMessage {
  const stream = Readable.from([Buffer.from("x")]) as unknown as IncomingMessage;
  stream.statusCode = status;
  stream.headers = headers;
  const originalDestroy = stream.destroy.bind(stream);
  stream.destroy = (error?: Error) => {
    destroyed += 1;
    return originalDestroy(error);
  };
  return stream;
}

const safeFetchMock = mock.fn<(url: URL) => Promise<{ response: IncomingMessage; finalUrl: URL }>>();

let directProvider: typeof import("./direct").directProvider;
let verifyTarget: typeof import("../../security/signing").verifyTarget;

before(async () => {
  mock.module(require.resolve("../../security/safe-fetch"), {
    namedExports: { safeFetch: safeFetchMock },
  });
  ({ directProvider } = await import("./direct"));
  ({ verifyTarget } = await import("../../security/signing"));
});

function respondWith(options: FakeOptions, finalHref?: string) {
  safeFetchMock.mock.mockImplementationOnce(async (url: URL) => ({
    response: fakeResponse(options),
    finalUrl: new URL(finalHref ?? url.href),
  }));
}

const target = new URL("https://cdn.example.com/media/clip%20one.mp4");

describe("directProvider", () => {
  it("describes a supported media file", async () => {
    respondWith({ headers: { "content-type": "video/mp4", "content-length": "500" } });
    const info = await directProvider.resolve(target, {});

    assert.equal(info.source, "direct");
    assert.equal(info.title, "clip one.mp4");
    assert.equal(info.kind, "video");
    assert.equal(info.mime, "video/mp4");
    assert.equal(info.bytes, 500);
    assert.equal(info.host, "cdn.example.com");
    assert.equal(info.previewUrl, target.href);
    assert.equal(info.formats.length, 1);
    assert.equal(info.formats[0]?.container, "MP4");
  });

  it("issues a signed download path bound to the original url", async () => {
    respondWith({ headers: { "content-type": "audio/mpeg" } });
    const info = await directProvider.resolve(target, {});
    const path = info.formats[0]?.downloadPath ?? "";
    const params = new URL(path, "https://snagurl.example").searchParams;

    assert.equal(params.get("url"), target.href);
    assert.equal(
      verifyTarget(params.get("url") ?? "", Number(params.get("exp")), params.get("sig") ?? ""),
      true,
    );
    assert.equal(info.bytes, null);
  });

  it("omits the preview for files that are not served over https", async () => {
    const plain = new URL("http://cdn.example.com/a.mp3");
    respondWith({ headers: { "content-type": "audio/mpeg" } });
    const info = await directProvider.resolve(plain, {});
    assert.equal(info.previewUrl, null);
  });

  it("rejects responses that are not supported media", async () => {
    for (const type of ["text/html; charset=utf-8", "application/octet-stream", "image/svg+xml", ""]) {
      respondWith({ headers: type === "" ? {} : { "content-type": type } });
      await assert.rejects(
        directProvider.resolve(target, {}),
        (error: unknown) => (error as { code?: string }).code === "not_media",
        type,
      );
    }
  });

  it("rejects files over the size limit", async () => {
    respondWith({ headers: { "content-type": "video/mp4", "content-length": "1001" } });
    await assert.rejects(
      directProvider.resolve(target, {}),
      (error: unknown) => (error as { code?: string }).code === "too_large",
    );
  });

  it("rejects non-2xx upstream responses", async () => {
    respondWith({ status: 404, headers: { "content-type": "video/mp4" } });
    await assert.rejects(
      directProvider.resolve(target, {}),
      (error: unknown) => (error as { code?: string }).code === "upstream_status",
    );
  });

  it("always closes the upstream response", async () => {
    destroyed = 0;
    respondWith({ headers: { "content-type": "video/mp4" } });
    await directProvider.resolve(target, {});
    respondWith({ headers: { "content-type": "text/html" } });
    await assert.rejects(directProvider.resolve(target, {}));
    assert.equal(destroyed, 2);
  });

  it("uses the final url after redirects for the title and preview", async () => {
    respondWith(
      { headers: { "content-type": "image/png" } },
      "https://files.example.net/final/photo.png",
    );
    const info = await directProvider.resolve(target, {});
    assert.equal(info.title, "photo.png");
    assert.equal(info.downloadable, true);
    assert.equal(info.notice, null);
    assert.equal(info.thumbnailUrl, "https://files.example.net/final/photo.png");
    assert.equal(info.previewUrl, "https://files.example.net/final/photo.png");
    assert.equal(info.originUrl, target.href);
  });
});
