import assert from "node:assert/strict";
import { after, afterEach, before, describe, it, mock } from "node:test";
import { signFile as workerSignFile, verifyFile, verifyRequest } from "../../../worker/src/auth";
import { operations as workerOperations } from "../../../worker/src/operations";
import { operations as webOperations, conversionsFor, supportsOperation } from "./operations";
import type { JobView } from "../media/types";

const env = process.env as Record<string, string | undefined>;
const SECRET = "w".repeat(48);
const saved = { url: env.SNAGURL_WORKER_URL, secret: env.SNAGURL_WORKER_SECRET, pub: env.SNAGURL_WORKER_PUBLIC_URL };

let client: typeof import("./client");
let config: typeof import("./config");
const realFetch = globalThis.fetch;

before(async () => {
  client = await import("./client");
  config = await import("./config");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of [["SNAGURL_WORKER_URL", saved.url], ["SNAGURL_WORKER_SECRET", saved.secret], ["SNAGURL_WORKER_PUBLIC_URL", saved.pub]] as const) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
});
after(() => undefined);

function configure(extra: Record<string, string> = {}) {
  env.SNAGURL_WORKER_URL = "http://localhost:8080";
  env.SNAGURL_WORKER_SECRET = SECRET;
  Object.assign(env, extra);
}

describe("worker configuration", () => {
  it("is off without credentials", () => {
    delete env.SNAGURL_WORKER_URL;
    delete env.SNAGURL_WORKER_SECRET;
    assert.equal(config.workerEnabled(), false);
  });
  it("is off with a short secret or a non-local http url", () => {
    env.SNAGURL_WORKER_URL = "http://localhost:8080";
    env.SNAGURL_WORKER_SECRET = "short";
    assert.equal(config.workerEnabled(), false);
    configure({ SNAGURL_WORKER_URL: "http://worker.example.com" });
    assert.equal(config.workerEnabled(), false);
    configure({ SNAGURL_WORKER_URL: "https://user:pw@worker.example.com" });
    assert.equal(config.workerEnabled(), false);
  });
  it("is on with a https url and a long secret", () => {
    configure({ SNAGURL_WORKER_URL: "https://worker.example.com" });
    assert.equal(config.workerEnabled(), true);
  });
});

describe("conversion catalogue", () => {
  it("matches the worker's operation table", () => {
    assert.deepEqual(
      webOperations.map((o) => o.id).sort(),
      workerOperations.map((o) => o.id).sort(),
    );
    for (const op of webOperations) {
      const match = workerOperations.find((w) => w.id === op.id);
      assert.equal(match?.mime, op.mime, op.id);
      assert.deepEqual([...(match?.inputKinds ?? [])].sort(), [...op.from].sort(), op.id);
    }
  });
  it("only offers conversions for downloadable direct media of a fitting kind", () => {
    assert.deepEqual(conversionsFor({ source: "direct", downloadable: true, kind: "image" }).map((o) => o.id), ["jpg", "png", "webp"]);
    assert.ok(conversionsFor({ source: "direct", downloadable: true, kind: "video" }).some((o) => o.id === "mp3"));
    assert.deepEqual(conversionsFor({ source: "youtube", downloadable: false, kind: "video" }), []);
    assert.deepEqual(conversionsFor({ source: "direct", downloadable: false, kind: "video" }), []);
    assert.equal(supportsOperation({ source: "direct", downloadable: true, kind: "image" }, "mp3"), false);
  });
});

describe("worker client", () => {
  it("signs requests so the worker accepts them", async () => {
    configure();
    let seen: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = (async (url: URL, init: RequestInit) => {
      seen = { url: url.href, init };
      return Response.json({ job: { id: "a".repeat(32), status: "queued", progress: null, operation: "mp3", error: null, output: null } }, { status: 202 });
    }) as typeof fetch;

    await client.createJob({ sourceUrl: "https://example.com/a.mp4", operation: "mp3", filename: "a" });
    assert.ok(seen);
    const { url, init } = seen as { url: string; init: RequestInit };
    const headers = init.headers as Record<string, string>;
    assert.equal(new URL(url).pathname, "/jobs");
    assert.equal(
      verifyRequest(SECRET, {
        method: "POST",
        path: "/jobs",
        body: String(init.body),
        timestamp: headers["x-snagurl-timestamp"],
        signature: headers["x-snagurl-signature"],
      }, Date.now(), 60_000),
      true,
    );
    assert.equal(init.redirect, "error");
  });

  it("adds a signed delivery link only when the job is done, and the worker accepts it", async () => {
    configure({ SNAGURL_WORKER_PUBLIC_URL: "https://files.example.com" });
    const id = "b".repeat(32);
    const reply = (status: string, output: unknown) =>
      (async () => Response.json({ job: { id, status, progress: 1, operation: "mp3", error: null, output } })) as unknown as typeof fetch;

    globalThis.fetch = reply("processing", null);
    assert.equal((await client.getJob(id)).download, null);

    globalThis.fetch = reply("done", { filename: "a.mp3", mime: "audio/mpeg", bytes: 10 });
    const view: JobView = await client.getJob(id);
    assert.ok(view.download);
    const link = new URL(view.download.url);
    assert.equal(link.origin, "https://files.example.com");
    assert.equal(link.pathname, `/files/${id}`);
    assert.equal(verifyFile(SECRET, id, Number(link.searchParams.get("exp")), link.searchParams.get("sig") ?? "", Date.now()), true);
    assert.equal(link.searchParams.get("sig"), workerSignFile(SECRET, id, Number(link.searchParams.get("exp"))));
    assert.ok(!JSON.stringify(view).includes(SECRET));
  });

  it("maps worker failures to safe errors without leaking the worker address", async () => {
    configure({ SNAGURL_WORKER_URL: "https://internal-worker.example.com" });
    globalThis.fetch = (async () => { throw new Error("connect ECONNREFUSED 10.0.0.9:443"); }) as typeof fetch;
    await assert.rejects(client.getJob("c".repeat(32)), (error: Error) => {
      assert.ok(!/10\.0\.0\.9|internal-worker/.test(error.message));
      return (error as { code?: string }).code === "unreachable";
    });
    globalThis.fetch = (async () => Response.json({ error: { message: "The worker is busy." } }, { status: 429 })) as typeof fetch;
    await assert.rejects(client.createJob({ sourceUrl: "https://e.com/a.mp4", operation: "mp3", filename: "a" }), (e: Error) => (e as { code?: string }).code === "busy");
    globalThis.fetch = (async () => Response.json({ error: { message: "x" } }, { status: 404 })) as typeof fetch;
    await assert.rejects(client.getJob("d".repeat(32)), (e: Error) => (e as { code?: string }).code === "not_found");
  });

  it("refuses to call anything when not configured", async () => {
    delete env.SNAGURL_WORKER_URL;
    delete env.SNAGURL_WORKER_SECRET;
    const fetchSpy = mock.fn(async () => new Response("{}"));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await assert.rejects(client.getJob("e".repeat(32)), (e: Error) => (e as { code?: string }).code === "not_configured");
    assert.equal(fetchSpy.mock.callCount(), 0);
    assert.equal(await client.workerHealth(), "not_configured");
  });

  it("validates job ids", () => {
    assert.equal(client.isJobId("a".repeat(32)), true);
    assert.equal(client.isJobId("../etc/passwd"), false);
    assert.equal(client.isJobId("A".repeat(32)), false);
  });
});
