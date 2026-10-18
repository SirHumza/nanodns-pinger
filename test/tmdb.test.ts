import assert from "node:assert/strict";
import { test } from "node:test";
import { tmdbPath, tmdbResolve } from "../src/tmdb.ts";

test("builds the Sony TMDB path with a keyed HMAC-SHA1", async () => {
  // Vector from orbisRPC tests/test_utils.c.
  assert.equal(
    await tmdbPath("CUSA00740"),
    "/tmdb2/CUSA00740_00_95C83DE844D155477CB77C577A24D735F2E9AC08/CUSA00740_00.json",
  );
});

test("rejects malformed ids", async () => {
  assert.equal(await tmdbPath("junk!"), null);
  assert.equal(await tmdbPath("CUSA740"), null);
});

test("resolves, misses, and errors are distinct", async () => {
  const hit = await tmdbResolve(
    "CUSA00740",
    async () =>
      new Response(JSON.stringify({ names: [{ name: "Bloodborne" }] }), { status: 200 }),
  );
  assert.deepEqual(hit, { status: "resolved", name: "Bloodborne" });

  const miss = await tmdbResolve(
    "CUSA00740",
    async () => new Response("", { status: 404 }),
  );
  assert.equal(miss.status, "missing");

  const down = await tmdbResolve("CUSA00740", async () => {
    throw new Error("network down");
  });
  assert.equal(down.status, "error");
});
