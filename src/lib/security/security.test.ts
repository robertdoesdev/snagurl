import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MediaError } from "../media/errors";
import { acquireSlot } from "./concurrency";
import { checkRateLimit } from "./rate-limit";
import { assertAllowedTarget, safeFetch } from "./safe-fetch";
import { signTarget, verifyTarget } from "./signing";

describe("assertAllowedTarget", () => {
  it("rejects loopback, private and metadata IP literals", () => {
    for (const href of [
      "http://127.0.0.1/a.mp4",
      "http://10.0.0.5/a.mp4",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/a.mp4",
      "http://[::ffff:127.0.0.1]/a.mp4",
      "http://2130706433/a.mp4",
    ]) {
      assert.throws(
        () => assertAllowedTarget(new URL(href)),
        (error: unknown) => error instanceof MediaError && error.code === "blocked_address",
        href,
      );
    }
  });

  it("rejects credentials, ports and non-http schemes", () => {
    for (const href of [
      "https://user:pw@example.com/a.mp4",
      "https://example.com:8080/a.mp4",
      "ftp://example.com/a.mp4",
    ]) {
      assert.throws(() => assertAllowedTarget(new URL(href)), MediaError, href);
    }
  });

  it("allows public hostnames and public IP literals", () => {
    assert.doesNotThrow(() => assertAllowedTarget(new URL("https://example.com/a.mp4")));
    assert.doesNotThrow(() => assertAllowedTarget(new URL("https://8.8.8.8/a.mp4")));
  });
});

describe("safeFetch", () => {
  it("refuses hostnames that resolve to loopback at connect time", async () => {
    await assert.rejects(
      safeFetch(new URL("http://localhost/a.mp4")),
      (error: unknown) => error instanceof MediaError && error.code === "blocked_address",
    );
  });

  it("refuses private IP literals before any connection is made", async () => {
    await assert.rejects(
      safeFetch(new URL("http://192.168.0.1/a.mp4")),
      (error: unknown) => error instanceof MediaError && error.code === "blocked_address",
    );
  });
});

describe("signing", () => {
  const url = "https://example.com/a.mp4";

  it("verifies a signature it issued", () => {
    const { expires, signature } = signTarget(url);
    assert.equal(verifyTarget(url, expires, signature), true);
  });

  it("rejects a changed url, a changed expiry and a tampered signature", () => {
    const { expires, signature } = signTarget(url);
    assert.equal(verifyTarget("https://example.com/b.mp4", expires, signature), false);
    assert.equal(verifyTarget(url, expires + 1, signature), false);
    assert.equal(verifyTarget(url, expires, `${signature.slice(0, -2)}AA`), false);
    assert.equal(verifyTarget(url, expires, ""), false);
  });

  it("rejects expired signatures", () => {
    const issued = 1_000_000;
    const { expires, signature } = signTarget(url, issued);
    assert.equal(verifyTarget(url, expires, signature, expires + 1), false);
  });
});

describe("checkRateLimit", () => {
  it("allows up to the limit, then blocks with a retry time", async () => {
    const rule = { limit: 3, windowMs: 60_000 };
    const now = 5_000_000;
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await checkRateLimit("t1", "client", rule, now)).allowed, true);
    }
    const blocked = await checkRateLimit("t1", "client", rule, now + 1_000);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 59);
  });

  it("resets after the window and isolates clients", async () => {
    const rule = { limit: 1, windowMs: 1_000 };
    const now = 9_000_000;
    assert.equal((await checkRateLimit("t2", "a", rule, now)).allowed, true);
    assert.equal((await checkRateLimit("t2", "a", rule, now + 10)).allowed, false);
    assert.equal((await checkRateLimit("t2", "b", rule, now + 10)).allowed, true);
    assert.equal((await checkRateLimit("t2", "a", rule, now + 1_001)).allowed, true);
  });
});

describe("acquireSlot", () => {
  it("caps concurrent slots and releases exactly once", () => {
    const first = acquireSlot(2);
    const second = acquireSlot(2);
    assert.ok(first && second);
    assert.equal(acquireSlot(2), null);
    first();
    first();
    const third = acquireSlot(2);
    assert.ok(third);
    assert.equal(acquireSlot(2), null);
    second();
    third();
    assert.ok(acquireSlot(2));
  });
});
