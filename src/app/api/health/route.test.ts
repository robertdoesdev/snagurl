import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { GET } from "./route";

const env = process.env as Record<string, string | undefined>;
const original = { node: env.NODE_ENV, secret: env.SNAGURL_SIGNING_SECRET };

afterEach(() => {
  env.NODE_ENV = original.node;
  if (original.secret === undefined) delete env.SNAGURL_SIGNING_SECRET;
  else env.SNAGURL_SIGNING_SECRET = original.secret;
});

describe("GET /api/health", () => {
  it("reports ok with signing configured in production", async () => {
    env.NODE_ENV = "production";
    env.SNAGURL_SIGNING_SECRET = "a-secret-that-is-long-enough";
    const response = GET();
    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.status, "ok");
    assert.equal(body.signing, true);
    assert.ok(["shared", "memory"].includes(String(body.rateLimit)));
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(!JSON.stringify(body).includes("a-secret"));
  });

  it("fails the check in production when the signing secret is missing", async () => {
    env.NODE_ENV = "production";
    delete env.SNAGURL_SIGNING_SECRET;
    const response = GET();
    assert.equal(response.status, 503);
    assert.equal(((await response.json()) as { status: string }).status, "misconfigured");
  });

  it("does not require a secret in development", () => {
    env.NODE_ENV = "development";
    delete env.SNAGURL_SIGNING_SECRET;
    assert.equal(GET().status, 200);
  });
});
