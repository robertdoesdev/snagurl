import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectSource, sources } from "./sources";
import { providers } from "./providers";
import { parseMediaUrl } from "./url";

function parse(input: string) {
  return parseMediaUrl(input);
}

describe("parseMediaUrl", () => {
  it("accepts https and http links", () => {
    const https = parse("https://cdn.example.com/clip.mp4");
    const http = parse("http://example.com/a.mp3");
    assert.equal(https.ok, true);
    assert.equal(http.ok, true);
  });

  it("adds https to bare hostnames", () => {
    const result = parse("example.com/video.mp4");
    assert.ok(result.ok);
    assert.equal(result.url.href, "https://example.com/video.mp4");
  });

  it("trims surrounding whitespace", () => {
    const result = parse("  https://example.com/a.mp4\n");
    assert.ok(result.ok);
  });

  it("rejects empty input", () => {
    const result = parse("   ");
    assert.ok(!result.ok);
    assert.equal(result.code, "empty");
  });

  it("rejects non-http protocols", () => {
    for (const input of ["ftp://example.com/a.mp4", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi"]) {
      const result = parse(input);
      assert.ok(!result.ok, input);
    }
    const ftp = parse("ftp://example.com/a.mp4");
    assert.ok(!ftp.ok);
    assert.equal(ftp.code, "protocol");
  });

  it("rejects credentials and custom ports", () => {
    const creds = parse("https://user:pass@example.com/a.mp4");
    const port = parse("https://example.com:8443/a.mp4");
    assert.ok(!creds.ok);
    assert.equal(creds.code, "credentials");
    assert.ok(!port.ok);
    assert.equal(port.code, "port");
  });

  it("rejects text that is not a link", () => {
    for (const input of ["hello", "not a url", "https://", "http://exa mple.com"]) {
      assert.ok(!parse(input).ok, input);
    }
  });

  it("rejects links longer than the limit", () => {
    const result = parse(`https://example.com/${"a".repeat(3000)}`);
    assert.ok(!result.ok);
    assert.equal(result.code, "too_long");
  });

  it("normalizes numeric hosts so address checks see the real IP", () => {
    const result = parse("http://2130706433/a.mp4");
    assert.ok(result.ok);
    assert.equal(result.url.hostname, "127.0.0.1");
  });
});

describe("detectSource", () => {
  const detect = (value: string) => {
    const parsed = parse(value);
    assert.ok(parsed.ok, value);
    return detectSource(parsed.url).id;
  };

  it("identifies platforms by host and subdomain", () => {
    assert.equal(detect("https://www.youtube.com/watch?v=abc"), "youtube");
    assert.equal(detect("https://youtu.be/abc"), "youtube");
    assert.equal(detect("https://m.youtube.com/watch?v=abc"), "youtube");
    assert.equal(detect("https://www.tiktok.com/@a/video/1"), "tiktok");
    assert.equal(detect("https://www.instagram.com/reel/abc/"), "instagram");
    assert.equal(detect("https://www.facebook.com/watch/?v=1"), "facebook");
    assert.equal(detect("https://x.com/a/status/1"), "x");
    assert.equal(detect("https://twitter.com/a/status/1"), "x");
  });

  it("does not match lookalike hosts", () => {
    assert.equal(detect("https://notyoutube.com/a.mp4"), "direct");
    assert.equal(detect("https://youtube.com.evil.example/a.mp4"), "direct");
    assert.equal(detect("https://example.com/youtube.com/a.mp4"), "direct");
  });

  it("treats other hosts as direct links", () => {
    assert.equal(detect("https://cdn.example.com/clip.mp4"), "direct");
  });
});

describe("source registry", () => {
  it("has an adapter for every source whose availability matches its definition", () => {
    for (const source of sources) {
      const provider = providers.get(source.id);
      assert.ok(provider, source.id);
      const availability = provider.availability();
      assert.equal(availability.capability, source.capability, source.id);
      assert.equal(availability.state === "restricted", source.capability === "none", source.id);
    }
  });

  it("gives every unsupported source a reason and every preview-only source a notice", () => {
    for (const source of sources) {
      if (source.capability === "none") assert.ok(source.unavailableReason, source.id);
      if (source.capability === "preview") assert.ok(source.notice, source.id);
    }
  });

  it("never offers downloads for platforms", () => {
    for (const source of sources.filter((entry) => entry.id !== "direct")) {
      assert.notEqual(source.capability, "download", source.id);
    }
  });
});
