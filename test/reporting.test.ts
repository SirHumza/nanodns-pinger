import assert from "node:assert/strict";
import { test } from "node:test";
import { coverUrlFor, parseHeading, squeeze } from "../src/pkgzone.ts";
import { knownResolve } from "../src/known.ts";
import { commentBody, parseIssueUrl } from "../src/github.ts";
import type { GithubReport } from "../src/github.ts";

test("pkgzone parse takes the first non-boilerplate <h1>", () => {
  const page = `<html><h1>Install HB-Store on your Playstation</h1><h1 class="t">   MyApp &amp;  Friends </h1></html>`;
  assert.equal(parseHeading(page), "MyApp & Friends");
  assert.equal(parseHeading("<h1>Install HB-Store on your Playstation</h1>"), null);
  assert.equal(parseHeading("<p>no headings</p>"), null);
});

test("pkgzone entities and cover path", () => {
  assert.equal(squeeze("A&nbsp;&quot;B&#39;s&quot;&#39;C"), `A "B's"'C`);
  assert.equal(coverUrlFor("MRCH00033"), "https://pkg-zone.com/images/MRCH00033/cover.png");
});

test("github issue url parses into repo + number", () => {
  const { repo, number } = parseIssueUrl("https://github.com/SirHumza/orbisRPC/issues/37");
  assert.equal(repo, "SirHumza/orbisRPC");
  assert.equal(number, 37);
  assert.throws(() => parseIssueUrl("https://example.com/nope"));
});

test("known homebrew override supplies name and square cover", () => {
  const hit = knownResolve("MRCH00033");
  assert.ok(hit, "MRCH00033 should have a curated override");
  assert.match(hit.name, /M33/);
  assert.match(hit.cover, /^https:\/\/.+\.png$/);
  assert.equal(knownResolve("CUSA00000"), null);
});

test("github comment body carries every field a maintainer needs", () => {
  const report: GithubReport = {
    titleId: "MRCH00033",
    name: "My Homebrew",
    cover: "https://pkg-zone.com/images/MRCH00033/cover.png",
    player: "Sheikh (discord id 1)",
    seenAt: "2026-10-18T00:00:00.000Z",
    source: "Sony TMDB: no entry",
  };
  const body = commentBody(report);
  for (const part of ["MRCH00033", "My Homebrew", "cover.png", "Sheikh", "Sony TMDB"]) {
    assert.ok(body.includes(part), `body should mention ${part}`);
  }
});
