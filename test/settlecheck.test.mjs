import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const code = transformSync(readFileSync(new URL("../src/lib/settlecheck.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const { settleValue, exceedsDecimals } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const E = 10n ** 18n;

test("settle: the value sent is always exactly the face value", () => {
  for (const face of [1n, 10n * E, 10n * E + 1n, (1n << 96n) - 1n]) assert.equal(settleValue(face, false), face);
});

test("settle: nothing to pay without terms or once paid", () => {
  assert.equal(settleValue(0n, false), null); // not locked with terms yet
  assert.equal(settleValue(10n * E, true), null); // already settled
  assert.equal(settleValue(0n, true), null);
});

test("Trade inputs: 18 fraction digits are accepted, 19 are rejected before parseUnits can round them", async () => {
  const { parseUnits } = await import("viem");
  const ok18 = "0." + "0".repeat(17) + "1";
  const bad19 = "0." + "0".repeat(18) + "5"; // viem rounds this half-up to 1 wei: a different value than typed
  assert.equal(parseUnits(bad19, 18), 1n); // documents why the guard is needed
  assert.equal(exceedsDecimals(ok18, 18), false);
  assert.equal(exceedsDecimals("10", 18), false);
  assert.equal(exceedsDecimals("1.5", 18), false);
  assert.equal(exceedsDecimals(bad19, 18), true);
  assert.equal(exceedsDecimals("9." + "9".repeat(19), 18), true); // would round up to 10
  assert.equal(exceedsDecimals(" 1." + "0".repeat(19) + " ", 18), true);
});
