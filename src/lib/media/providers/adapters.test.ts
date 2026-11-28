import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeProviders, providers } from ".";
import { detectSource } from "../sources";
import type { SourceId } from "../types";

function check(id: SourceId, url: string) {
  const provider = providers.get(id);
  assert.ok(provider);
  return provider.validate(new URL(url));
}

describe("platform identification", () => {
  const cases: [string, SourceId][] = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "youtube"],
    ["https://www.tiktok.com/@creator/video/7234567890123456789", "tiktok"],
    ["https://vm.tiktok.com/ZMabc123/", "tiktok"],
    ["https://x.com/someone/status/1234567890", "x"],
    ["https://twitter.com/someone/status/1234567890", "x"],
    ["https://www.instagram.com/reel/C1a2b3c4d5e/", "instagram"],
    ["https://www.facebook.com/watch/?v=123456789", "facebook"],
    ["https://fb.watch/abcDEF123/", "facebook"],
    ["https://www.pinterest.com/pin/123456789012/", "pinterest"],
    ["https://pin.it/4AbCdEf", "pinterest"],
    ["https://pinterest.co.uk/pin/123456789012/", "pinterest"],
    ["https://cdn.example.com/video.mp4", "direct"],
  ];
  for (const [url, id] of cases) {
    it(`${url} is ${id}`, () => {
      assert.equal(detectSource(new URL(url)).id, id);
    });
  }

  it("does not treat look-alike hosts as platforms", () => {
    for (const url of [
      "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://fakepinterest.com/pin/123456789012/",
    ]) {
      assert.equal(detectSource(new URL(url)).id, "direct", url);
    }
  });
});

describe("URL validation per adapter", () => {
  it("accepts the supported YouTube shapes and rejects the rest", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?t=5",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
    ]) {
      assert.equal(check("youtube", url).ok, true, url);
    }
    for (const url of [
      "https://www.youtube.com/",
      "https://www.youtube.com/@channel",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/playlist?list=PL123",
    ]) {
      assert.equal(check("youtube", url).ok, false, url);
    }
  });

  it("validates TikTok video, photo and short links", () => {
    assert.equal(check("tiktok", "https://www.tiktok.com/@a.b/video/7234567890123456789").ok, true);
    assert.equal(check("tiktok", "https://www.tiktok.com/@a/photo/7234567890123456789").ok, true);
    assert.equal(check("tiktok", "https://www.tiktok.com/t/ZTabcdef/").ok, true);
    assert.equal(check("tiktok", "https://www.tiktok.com/@creator").ok, false);
    assert.equal(check("tiktok", "https://www.tiktok.com/").ok, false);
  });

  it("validates X post links and explains t.co", () => {
    assert.equal(check("x", "https://x.com/user/status/1234567890").ok, true);
    assert.equal(check("x", "https://x.com/i/status/1234567890").ok, true);
    assert.equal(check("x", "https://x.com/user").ok, false);
    const short = check("x", "https://t.co/abcdef");
    assert.equal(short.ok, false);
    assert.match(short.ok ? "" : short.message, /shortened/);
  });

  it("validates Instagram, Facebook and Pinterest shapes", () => {
    assert.equal(check("instagram", "https://www.instagram.com/p/C1a2b3c4d5e/").ok, true);
    assert.equal(check("instagram", "https://www.instagram.com/someone/").ok, false);
    assert.equal(check("facebook", "https://www.facebook.com/someone/videos/123456789/").ok, true);
    assert.equal(check("facebook", "https://www.facebook.com/").ok, false);
    assert.equal(check("pinterest", "https://www.pinterest.com/pin/some-title--123456789012/").ok, true);
    assert.equal(check("pinterest", "https://www.pinterest.com/someone/board/").ok, false);
  });
});

describe("registry status", () => {
  it("reports exactly which platforms are previews and which are restricted", () => {
    const status = Object.fromEntries(describeProviders().map((entry) => [entry.id, entry]));
    assert.equal(status.direct?.capability, "download");
    for (const id of ["youtube", "tiktok", "x"] as const) {
      assert.equal(status[id]?.state, "active", id);
      assert.equal(status[id]?.capability, "preview", id);
    }
    for (const id of ["instagram", "facebook", "pinterest"] as const) {
      assert.equal(status[id]?.state, "restricted", id);
      assert.equal(status[id]?.capability, "none", id);
      assert.ok(status[id]?.reason, id);
    }
  });

  it("restricted adapters refuse to resolve and name the reason", async () => {
    for (const id of ["instagram", "facebook", "pinterest"] as const) {
      const provider = providers.get(id);
      await assert.rejects(
        provider!.resolve(new URL("https://example.com/"), {}),
        (error: unknown) => (error as { code?: string }).code === "source_unavailable",
        id,
      );
    }
  });
});
