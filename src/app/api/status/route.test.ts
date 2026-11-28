import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { GET } from "./route";

const env = process.env as Record<string, string | undefined>;

afterEach(() => {
  delete env.SNAGURL_WORKER_URL;
  delete env.SNAGURL_WORKER_SECRET;
});

describe("GET /api/status", () => {
  it("lists every platform and reports the worker as not configured without credentials", async () => {
    const body = (await (await GET(new Request("https://snagurl.test/api/status"))).json()) as { providers: { id: string; state: string }[]; worker: string };
    assert.equal(body.worker, "not_configured");
    assert.deepEqual(body.providers.map((p) => p.id).sort(), ["direct", "facebook", "instagram", "pinterest", "tiktok", "x", "youtube"]);
    assert.ok(!JSON.stringify(body).includes("SNAGURL_"));
  });
});
