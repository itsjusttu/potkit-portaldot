import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const code = transformSync(readFileSync(new URL("../src/lib/scanstep.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const m = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const { SCAN_MAX, SCAN_MIN, startScan, onScanOk, onScanRefused, backoffMs, isTransient, loadStep, saveStep } = m;

/** A scan of `total` blocks against an RPC that refuses windows larger than `cap`; counts refused and served requests. */
function simulate(cap, total, remembered = null) {
  let s = startScan(remembered), f = 0n, refused = 0, served = 0;
  while (f < total) {
    const span = s.step;
    if (span > cap) { refused++; s = onScanRefused(s); continue; }
    served++; f += span; s = onScanOk(s);
  }
  return { refused, served, ceiling: s.ceiling };
}

test("startScan uses the remembered size only when it is inside the allowed range", () => {
  assert.equal(startScan(null).step, SCAN_MAX);
  assert.equal(startScan(20_000n).step, 20_000n);
  assert.equal(startScan(10n).step, SCAN_MAX);
  assert.equal(startScan(SCAN_MAX * 2n).step, SCAN_MAX);
});

test("a refused window is halved, becomes the ceiling, and never goes below the minimum", () => {
  let s = startScan(null);
  s = onScanRefused(s);
  assert.deepEqual(s, { step: 50_000n, ceiling: 50_000n });
  for (let i = 0; i < 30; i++) s = onScanRefused(s);
  assert.equal(s.step, SCAN_MIN);
  assert.equal(s.ceiling, SCAN_MIN);
});

test("after a success the window grows back, but not past the ceiling", () => {
  let s = { step: 1_000n, ceiling: 3_000n };
  s = onScanOk(s); assert.equal(s.step, 2_000n);
  s = onScanOk(s); assert.equal(s.step, 3_000n);
  s = onScanOk(s); assert.equal(s.step, 3_000n);
});

test("no grow-and-refuse loop: against an RPC that caps the range, the number of refused requests stays small", () => {
  for (const cap of [3_000n, 20_000n, 60_000n]) {
    const r = simulate(cap, 170_000n);
    assert.ok(r.refused <= 8, `cap ${cap}: ${r.refused} refused`);
    assert.ok(r.ceiling <= cap && r.ceiling >= cap / 2n, `cap ${cap}: ceiling ${r.ceiling}`);
  }
  assert.deepEqual(simulate(1_000_000n, 170_000n), { refused: 0, served: 2, ceiling: SCAN_MAX });
});

test("a remembered size skips the search on the next scan", () => {
  const first = simulate(20_000n, 170_000n);
  const second = simulate(20_000n, 170_000n, first.ceiling);
  assert.equal(second.refused, 0);
});

test("backoff doubles and is capped", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(backoffMs), [600, 1200, 2400, 4000, 4000, 4000]);
});

test("isTransient: gateway errors, timeouts and dropped connections retry; range refusals do not", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(isTransient({ status }), true, String(status));
  for (const status of [400, 403, 404, 413]) assert.equal(isTransient({ status }), false, String(status));
  assert.equal(isTransient({ shortMessage: "HTTP request failed.", details: "Failed to fetch" }), true);
  assert.equal(isTransient({ name: "TimeoutError", shortMessage: "The request took too long to respond." }), true);
  assert.equal(isTransient(new TypeError("fetch failed")), true);
  assert.equal(isTransient({ shortMessage: "RPC Request failed.", details: "query exceeds max block range" }), false);
  assert.equal(isTransient({ message: "eth_getLogs is limited to a 10000 block range" }), false);
  assert.equal(isTransient(null), false);
  assert.equal(isTransient("boom"), false);
});

test("loadStep and saveStep round-trip, reject bad values, and survive a blocked storage", () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  assert.equal(loadStep("k", store), null);
  saveStep("k", 25_000n, store);
  assert.equal(loadStep("k", store), 25_000n);
  mem.set("k", "abc"); assert.equal(loadStep("k", store), null);
  mem.set("k", "7"); assert.equal(loadStep("k", store), null);
  mem.set("k", String(SCAN_MAX * 5n)); assert.equal(loadStep("k", store), null);
  const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(loadStep("k", blocked), null);
  assert.doesNotThrow(() => saveStep("k", 1_000n, blocked));
  assert.equal(loadStep("k", null), null);
});
