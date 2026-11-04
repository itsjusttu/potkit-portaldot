import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const code = transformSync(readFileSync(new URL("../src/lib/shares.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const { fmtShares, eventText } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const E18 = 10n ** 18n;

test("share format: the long values seen on the live app are shortened to 2 decimals", () => {
  assert.equal(fmtShares(11_111_111_111_111_111_111n), "11.11");
  assert.equal(fmtShares(487_888_888_888_888_888_889n), "487.89");
});

test("share format: zero, whole numbers and exactly 18 digits of fraction", () => {
  assert.equal(fmtShares(0n), "0");
  assert.equal(fmtShares(E18), "1");
  assert.equal(fmtShares(100n * E18), "100");
  assert.equal(fmtShares(1_500_000_000_000_000_000n), "1.5");
  assert.equal(fmtShares(1_234_567_890_123_456_789n), "1.23");
});

test("share format: very large supplies keep thousands separators (up to the 10^12 unit limit)", () => {
  assert.equal(fmtShares(1_000_000n * E18), "1,000,000");
  assert.equal(fmtShares(10n ** 12n * E18), "1,000,000,000,000");
  assert.equal(fmtShares(1_234_567n * E18 + 5n * 10n ** 17n), "1,234,567.5");
});

test("share format: below 1 share it uses 4 decimals, and a non-zero amount never shows as 0", () => {
  assert.equal(fmtShares(12_345_678_901_234_567n), "0.0123");
  assert.equal(fmtShares(10n ** 14n), "0.0001");
  assert.equal(fmtShares(1n), "<0.0001");
  assert.equal(fmtShares(49_999_999_999_999n), "<0.0001");
  assert.equal(fmtShares(999_999_999_999_999_999n), "1");
});

test("share format: rounds half up, carries into the whole part, handles negatives and other decimals", () => {
  assert.equal(fmtShares(1_005_000_000_000_000_000n), "1.01");
  assert.equal(fmtShares(1_999_500_000_000_000_000n), "2");
  assert.equal(fmtShares(-5n * 10n ** 17n), "-0.5");
  assert.equal(fmtShares(1_500_000n, 6), "1.5");
});

test("event text: listings and buys are rounded for display, other events keep their text", () => {
  assert.equal(eventText({ kind: "buy", id: 4, amount: 11_111_111_111_111_111_111n, text: "x" }), "11.11 shares of #4 bought");
  assert.equal(eventText({ kind: "list", id: 4, amount: 487_888_888_888_888_888_889n, text: "x" }), "487.89 shares of #4 listed");
  assert.equal(eventText({ kind: "list", id: 4, text: "kept" }), "kept");
  assert.equal(eventText({ kind: "settle", id: 4, amount: 1n, text: "#4 settled" }), "#4 settled");
});
