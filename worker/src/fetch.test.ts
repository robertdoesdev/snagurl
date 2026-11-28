import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAllowedSource, createGuardedLookup } from "./fetch.ts";

test("rejects non-http schemes, credentials and custom ports", () => {
  for (const raw of ["file:///etc/passwd", "ftp://example.com/a", "http://u:p@example.com/", "https://example.com:8443/a"]) {
    assert.throws(() => assertAllowedSource(new URL(raw)), (e: Error) => e.name === "JobError", raw);
  }
});

test("rejects private and loopback literals", () => {
  for (const raw of ["http://127.0.0.1/a", "http://10.0.0.5/a", "http://169.254.169.254/latest", "http://[::1]/a", "http://[::ffff:10.0.0.1]/a"]) {
    assert.throws(() => assertAllowedSource(new URL(raw)), (e: Error) => e.name === "JobError", raw);
  }
  assert.doesNotThrow(() => assertAllowedSource(new URL("https://example.com/a.mp4")));
});

test("guarded lookup refuses a hostname when any record is private", async () => {
  const lookup = createGuardedLookup((_h, _o, cb) =>
    cb(null, [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]),
  );
  const error = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
    lookup("rebind.example", {}, (e) => resolve(e)),
  );
  assert.equal((error as { code?: string } | null)?.code, "SNAGURL_BLOCKED");
});

test("guarded lookup passes public addresses", async () => {
  const lookup = createGuardedLookup((_h, _o, cb) => cb(null, [{ address: "93.184.216.34", family: 4 }]));
  const address = await new Promise<string | null>((resolve) =>
    lookup("ok.example", {}, (e, a) => resolve(e ? null : (a as string))),
  );
  assert.equal(address, "93.184.216.34");
});
