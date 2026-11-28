import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHistory } from "./history";

const valid = {
  id: "a",
  title: "clip.mp4",
  url: "https://cdn.example.com/clip.mp4",
  host: "cdn.example.com",
  sourceLabel: "Direct link",
  kind: "video",
  bytes: 1200,
  at: 1_700_000_000_000,
};

describe("parseHistory", () => {
  it("reads valid entries and ignores everything else", () => {
    const raw = JSON.stringify([valid, { id: 1 }, null, "text", { ...valid, kind: "pdf" }]);
    assert.deepEqual(parseHistory(raw), [valid]);
  });

  it("adds a source label to entries saved before labels existed", () => {
    const { sourceLabel, ...legacy } = valid;
    void sourceLabel;
    assert.equal(parseHistory(JSON.stringify([legacy]))[0]?.sourceLabel, "Direct link");
  });

  it("accepts a null size", () => {
    assert.equal(parseHistory(JSON.stringify([{ ...valid, bytes: null }]))[0]?.bytes, null);
  });

  it("returns an empty list for corrupt or unexpected storage", () => {
    for (const raw of [null, "", "{not json", "{}", "42", '"x"']) {
      assert.deepEqual(parseHistory(raw), []);
    }
  });

  it("keeps at most twenty entries", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ ...valid, id: String(index) }));
    assert.equal(parseHistory(JSON.stringify(many)).length, 20);
  });
});
