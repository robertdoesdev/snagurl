import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

interface FetchJsonResult {
  status: number;
  body: unknown;
}

const fetchJsonMock = mock.fn<(url: URL) => Promise<FetchJsonResult>>();

let resolveMedia: typeof import("../resolve").resolveMedia;

before(async () => {
  mock.module(require.resolve("../../security/fetch-json"), {
    namedExports: { fetchJson: fetchJsonMock },
  });
  ({ resolveMedia } = await import("../resolve"));
});

function answer(status: number, body: unknown) {
  fetchJsonMock.mock.mockImplementationOnce(async () => ({ status, body }));
}

describe("oEmbed providers", () => {
  it("returns a preview-only result for a YouTube link", async () => {
    answer(200, {
      title: "  Open  source\nsummit ",
      author_name: "Example Channel",
      thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
    const before = fetchJsonMock.mock.callCount();
    const info = await resolveMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    assert.equal(info.source, "youtube");
    assert.equal(info.title, "Open source summit");
    assert.equal(info.author, "Example Channel");
    assert.equal(info.thumbnailUrl, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    assert.equal(info.downloadable, false);
    assert.equal(info.formats.length, 0);
    assert.equal(info.previewUrl, null);
    assert.match(info.notice ?? "", /written approval/);

    const endpoint = fetchJsonMock.mock.calls[before]?.arguments[0];
    assert.equal(endpoint?.origin, "https://www.youtube.com");
    assert.equal(endpoint?.pathname, "/oembed");
    assert.equal(endpoint?.searchParams.get("url"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(endpoint?.searchParams.get("format"), "json");
  });

  it("only ever contacts the provider's fixed oEmbed host", async () => {
    answer(200, { title: "x" });
    const before = fetchJsonMock.mock.callCount();
    await resolveMedia("https://www.tiktok.com/@creator/video/1234567890");
    const endpoint = fetchJsonMock.mock.calls[before]?.arguments[0];
    assert.equal(endpoint?.origin, "https://www.tiktok.com");
    assert.equal(endpoint?.pathname, "/oembed");

    answer(200, { author_name: "someone" });
    const beforeX = fetchJsonMock.mock.callCount();
    await resolveMedia("https://x.com/someone/status/12345");
    const xEndpoint = fetchJsonMock.mock.calls[beforeX]?.arguments[0];
    assert.equal(xEndpoint?.origin, "https://publish.x.com");
  });

  it("builds fallback titles from the author when the service gives no title", async () => {
    answer(200, { author_name: "someone" });
    const post = await resolveMedia("https://x.com/someone/status/12345");
    assert.equal(post.title, "Post by someone");
    assert.equal(post.thumbnailUrl, null);

    answer(200, {});
    const bare = await resolveMedia("https://www.tiktok.com/@a/video/12345");
    assert.equal(bare.title, "TikTok video");
    assert.equal(bare.author, null);
  });

  it("ignores thumbnails that are not https and caps long titles", async () => {
    answer(200, {
      title: "a".repeat(500),
      thumbnail_url: "http://cdn.example.com/t.jpg",
    });
    const info = await resolveMedia("https://youtu.be/dQw4w9WgXcQ");
    assert.equal(info.thumbnailUrl, null);
    assert.equal(info.title.length, 200);

    answer(200, { title: "ok", thumbnail_url: "javascript:alert(1)" });
    assert.equal((await resolveMedia("https://youtu.be/dQw4w9WgXcQ")).thumbnailUrl, null);
  });

  it("explains missing posts and upstream failures", async () => {
    for (const status of [400, 401, 403, 404]) {
      answer(status, null);
      await assert.rejects(
        resolveMedia("https://www.youtube.com/watch?v=goneGoneGon"),
        (error: unknown) =>
          (error as { status?: number }).status === 422 &&
          /no public post/.test((error as Error).message),
        String(status),
      );
    }
    answer(500, null);
    await assert.rejects(
      resolveMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      (error: unknown) => (error as { status?: number }).status === 502,
    );
    answer(200, "not an object");
    await assert.rejects(resolveMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
  });

  it("declines Instagram and Facebook without contacting anyone", async () => {
    const before = fetchJsonMock.mock.callCount();
    for (const url of ["https://www.instagram.com/p/abc/", "https://www.facebook.com/watch/?v=1"]) {
      await assert.rejects(
        resolveMedia(url),
        (error: unknown) =>
          (error as { code?: string }).code === "source_unavailable" &&
          /embed code/.test((error as Error).message),
        url,
      );
    }
    assert.equal(fetchJsonMock.mock.callCount(), before);
  });
});
