import assert from "node:assert/strict";
import { test } from "node:test";
import { isBrokenRpc, rawTitleId } from "../src/detect.ts";

test("flags a raw title id activity", () => {
  assert.equal(
    isBrokenRpc([{ type: 0, name: "CUSA12398" }]),
    true,
    "raw CUSA id should be flagged",
  );
  assert.equal(rawTitleId([{ type: 0, name: "PPSA01234" }]), "PPSA01234");
  assert.equal(rawTitleId([{ type: 0, name: "MRCH00033" }]), "MRCH00033");
});

test("ignores resolved game names and non-playing activities", () => {
  assert.equal(isBrokenRpc([{ type: 0, name: "Bloodborne" }]), false);
  assert.equal(isBrokenRpc([{ type: 0, name: "The Forest" }]), false);
  assert.equal(isBrokenRpc([{ type: 2, name: "CUSA12398" }]), false);
  assert.equal(isBrokenRpc([]), false);
  assert.equal(isBrokenRpc(undefined), false);
});
