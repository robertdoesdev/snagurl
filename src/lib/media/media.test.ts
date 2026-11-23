import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveFilename, sanitizeFilename } from "./filename";
import { formatBytes, formatDuration } from "./format";
import { describeMime, normalizeMime } from "./mime";

describe("mime", () => {
  it("normalizes content types and gates on the allowlist", () => {
    assert.equal(normalizeMime("Video/MP4; codecs=avc1"), "video/mp4");
    assert.equal(normalizeMime(undefined), "");
    assert.ok(describeMime("video/mp4"));
    assert.equal(describeMime("text/html"), null);
    assert.equal(describeMime("application/octet-stream"), null);
    assert.equal(describeMime("image/svg+xml"), null);
  });
});

describe("filenames", () => {
  it("strips path separators and control characters", () => {
    assert.equal(sanitizeFilename('../../etc/pa"ss\\wd'), "_._etc_pa_ss_wd");
    assert.ok(!sanitizeFilename("a/../b").includes(".."));
    assert.equal(sanitizeFilename("a\u0000b.mp4"), "a_b.mp4");
    assert.equal(sanitizeFilename("...hidden"), "hidden");
  });

  it("derives a name from content-disposition, then the path, then a fallback", () => {
    const url = new URL("https://example.com/files/clip%20one.mp4");
    assert.equal(deriveFilename(url, "video/mp4"), "clip one.mp4");
    assert.equal(
      deriveFilename(url, "video/mp4", 'attachment; filename="renamed.mp4"'),
      "renamed.mp4",
    );
    assert.equal(
      deriveFilename(url, "video/mp4", "attachment; filename*=UTF-8''caf%C3%A9.mp4"),
      "café.mp4",
    );
    assert.equal(
      deriveFilename(new URL("https://example.com/"), "audio/mpeg"),
      "snagurl-download.mp3",
    );
    assert.equal(
      deriveFilename(new URL("https://example.com/stream"), "video/webm"),
      "stream.webm",
    );
  });
});

describe("formatting", () => {
  it("formats byte sizes", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(999), "999 B");
    assert.equal(formatBytes(1_500), "1.5 KB");
    assert.equal(formatBytes(12_400_000), "12.4 MB");
    assert.equal(formatBytes(250_000_000), "250 MB");
  });

  it("formats durations", () => {
    assert.equal(formatDuration(5), "0:05");
    assert.equal(formatDuration(65), "1:05");
    assert.equal(formatDuration(3725), "1:02:05");
    assert.equal(formatDuration(Number.NaN), "");
  });
});
