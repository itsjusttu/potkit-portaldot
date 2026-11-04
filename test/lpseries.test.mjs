import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const code = transformSync(readFileSync(new URL("../src/lp/series.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const { buildSeries } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const D = 86400, E18 = 10n ** 18n;

test("landing series: no events with a known time gives no series", () => {
  assert.equal(buildSeries([], 10 * D), null);
  assert.equal(buildSeries([{ hash: "a", time: 0, kind: "mint" }], 10 * D), null);
});

test("landing series: cumulative per day, one transaction counted once, buys and settlements summed", () => {
  const ev = [
    { hash: "a", time: 2 * D + 5, kind: "mint" },
    { hash: "b", time: 2 * D + 9, kind: "lock" }, { hash: "b", time: 2 * D + 9, kind: "terms" }, // one transaction, two events
    { hash: "c", time: 4 * D + 1, kind: "buy", value: 3n * E18 },
    { hash: "d", time: 5 * D + 1, kind: "settle", value: 10n * E18 },
    { hash: "e", time: 5 * D + 2, kind: "buy", value: E18 / 2n },
  ];
  const s = buildSeries(ev, 5 * D + 100);
  assert.equal(s.start, 2 * D);
  assert.equal(s.step, 1);
  assert.deepEqual(s.tx, [2, 2, 3, 5]);
  assert.deepEqual(s.vol, [0, 0, 3, 3.5]);
  assert.deepEqual(s.settled, [0, 0, 0, 10]);
});

test("landing series: a long history is bucketed to at most maxPoints, totals unchanged", () => {
  const ev = Array.from({ length: 200 }, (_, i) => ({ hash: "h" + i, time: (i + 1) * D, kind: "mint" }));
  const s = buildSeries(ev, 201 * D, 36);
  assert.ok(s.tx.length <= 36);
  assert.equal(s.tx.at(-1), 200);
  assert.ok(s.step > 1);
});
