import assert from "node:assert/strict";
import { test } from "node:test";
import { signFile, signRequest, verifyFile, verifyRequest } from "./auth.ts";

const secret = "s".repeat(40);
const now = 1_800_000_000_000;

function parts(over: Partial<Parameters<typeof verifyRequest>[1]> = {}) {
  return {
    method: "POST",
    path: "/jobs",
    body: '{"a":1}',
    timestamp: String(now),
    signature: signRequest(secret, "POST", "/jobs", '{"a":1}', now),
    ...over,
  };
}

test("accepts a correctly signed request", () => {
  assert.equal(verifyRequest(secret, parts(), now, 60_000), true);
});

test("rejects wrong secret, tampered body, wrong path and wrong method", () => {
  assert.equal(verifyRequest("x".repeat(40), parts(), now, 60_000), false);
  assert.equal(verifyRequest(secret, parts({ body: '{"a":2}' }), now, 60_000), false);
  assert.equal(verifyRequest(secret, parts({ path: "/jobs/abc" }), now, 60_000), false);
  assert.equal(verifyRequest(secret, parts({ method: "DELETE" }), now, 60_000), false);
});

test("rejects missing, malformed and stale credentials", () => {
  assert.equal(verifyRequest(secret, parts({ signature: undefined }), now, 60_000), false);
  assert.equal(verifyRequest(secret, parts({ timestamp: undefined }), now, 60_000), false);
  assert.equal(verifyRequest(secret, parts({ timestamp: "abc" }), now, 60_000), false);
  assert.equal(verifyRequest(secret, parts({ signature: "!!" }), now, 60_000), false);
  assert.equal(verifyRequest(secret, parts(), now + 120_000, 60_000), false);
});

test("file signatures bind id and expiry", () => {
  const sig = signFile(secret, "a".repeat(32), now + 1000);
  assert.equal(verifyFile(secret, "a".repeat(32), now + 1000, sig, now), true);
  assert.equal(verifyFile(secret, "b".repeat(32), now + 1000, sig, now), false);
  assert.equal(verifyFile(secret, "a".repeat(32), now + 2000, sig, now), false);
  assert.equal(verifyFile(secret, "a".repeat(32), now + 1000, sig, now + 5000), false);
});

test("a request signature is not valid as a file signature", () => {
  const sig = signRequest(secret, "GET", "/files/x", "", now);
  assert.equal(verifyFile(secret, "x", now, sig, now - 1), false);
});
