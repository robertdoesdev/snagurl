import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { checkRateLimit, rateLimitMode } from "./rate-limit";

const rule = { limit: 2, windowMs: 60_000 };

function storeResponse(rows: unknown, status = 200): Response {
  return new Response(JSON.stringify(rows), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("shared rate limit store", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://store.example.com/";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token-value";
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    mock.restoreAll();
  });

  it("reports shared mode only when both settings exist", () => {
    assert.equal(rateLimitMode(), "shared");
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    assert.equal(rateLimitMode(), "memory");
  });

  it("allows requests at or under the limit", async () => {
    const calls = mock.method(globalThis, "fetch", async () =>
      storeResponse([{ result: 2 }, { result: 1 }, { result: 59_000 }]),
    );
    const result = await checkRateLimit("resolve", "client-a", rule);
    assert.deepEqual(result, { allowed: true, retryAfterSeconds: 0 });

    const [url, init] = calls.mock.calls[0]?.arguments ?? [];
    assert.equal(url, "https://store.example.com/pipeline");
    const headers = (init as RequestInit).headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer token-value");
    const commands = JSON.parse(String((init as RequestInit).body)) as string[][];
    assert.deepEqual(commands[0], ["INCR", "snagurl:rl:resolve:client-a"]);
    assert.deepEqual(commands[1], ["PEXPIRE", "snagurl:rl:resolve:client-a", "60000", "NX"]);
  });

  it("blocks over the limit and reports the remaining time", async () => {
    mock.method(globalThis, "fetch", async () =>
      storeResponse([{ result: 3 }, { result: 0 }, { result: 12_400 }]),
    );
    const result = await checkRateLimit("resolve", "client-b", rule);
    assert.deepEqual(result, { allowed: false, retryAfterSeconds: 13 });
  });

  it("falls back to the in-memory limit when the store fails", async () => {
    const errors = mock.method(console, "error", () => undefined);
    mock.method(globalThis, "fetch", async () => {
      throw new Error("network down");
    });
    const now = 40_000_000;
    assert.equal((await checkRateLimit("fallback", "client-c", rule, now)).allowed, true);
    assert.equal((await checkRateLimit("fallback", "client-c", rule, now)).allowed, true);
    assert.equal((await checkRateLimit("fallback", "client-c", rule, now)).allowed, false);
    assert.ok(errors.mock.callCount() >= 1);
  });

  it("falls back when the store answers with an error status or garbage", async () => {
    mock.method(console, "error", () => undefined);
    const statuses = mock.method(globalThis, "fetch", async () => storeResponse({}, 500));
    const now = 41_000_000;
    assert.equal((await checkRateLimit("fallback2", "client-d", rule, now)).allowed, true);
    statuses.mock.mockImplementation(async () => storeResponse([{ error: "WRONGTYPE" }]));
    assert.equal((await checkRateLimit("fallback2", "client-d", rule, now)).allowed, true);
    assert.equal((await checkRateLimit("fallback2", "client-d", rule, now)).allowed, false);
  });
});
