import assert from "node:assert/strict";
import type { LookupAddress } from "node:dns";
import { describe, it } from "node:test";
import { createGuardedLookup } from "./safe-fetch";

interface Outcome {
  error: NodeJS.ErrnoException | null;
  address: string | LookupAddress[];
  family?: number;
}

function run(
  records: LookupAddress[] | Error,
  options: { all?: boolean } = {},
): { outcome: Outcome; resolverCalls: number } {
  let resolverCalls = 0;
  const lookup = createGuardedLookup((_host, _options, callback) => {
    resolverCalls += 1;
    if (records instanceof Error) callback(records, []);
    else callback(null, records);
  });
  let outcome: Outcome | undefined;
  lookup("media.example.com", options, (error, address, family) => {
    outcome = { error, address, family };
  });
  assert.ok(outcome);
  return { outcome, resolverCalls };
}

const publicV4: LookupAddress = { address: "93.184.216.34", family: 4 };
const publicV6: LookupAddress = { address: "2606:4700:4700::1111", family: 6 };

describe("guarded lookup", () => {
  it("returns the validated address it resolved, once", () => {
    const { outcome, resolverCalls } = run([publicV4]);
    assert.equal(outcome.error, null);
    assert.equal(outcome.address, "93.184.216.34");
    assert.equal(outcome.family, 4);
    assert.equal(resolverCalls, 1);
  });

  it("returns every validated record when the caller asks for all", () => {
    const { outcome } = run([publicV4, publicV6], { all: true });
    assert.equal(outcome.error, null);
    assert.deepEqual(outcome.address, [publicV4, publicV6]);
  });

  it("blocks a hostname that resolves to a private address", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.0.9"]) {
      const { outcome } = run([{ address, family: 4 }]);
      assert.equal((outcome.error as { code?: string } | null)?.code, "SNAGURL_BLOCKED", address);
    }
    const loopbackV6 = run([{ address: "::1", family: 6 }]);
    assert.equal((loopbackV6.outcome.error as { code?: string } | null)?.code, "SNAGURL_BLOCKED");
  });

  it("blocks a hostname when any one of its records is private", () => {
    const mixed = run([publicV4, { address: "127.0.0.1", family: 4 }], { all: true });
    assert.equal((mixed.outcome.error as { code?: string } | null)?.code, "SNAGURL_BLOCKED");
    const mappedV6 = run([publicV4, { address: "::ffff:10.0.0.1", family: 6 }]);
    assert.equal((mappedV6.outcome.error as { code?: string } | null)?.code, "SNAGURL_BLOCKED");
  });

  it("blocks empty answers and passes resolver errors through", () => {
    const empty = run([]);
    assert.equal((empty.outcome.error as { code?: string } | null)?.code, "SNAGURL_BLOCKED");
    const failure = Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    const failed = run(failure);
    assert.equal(failed.outcome.error?.code, "ENOTFOUND");
  });
});
