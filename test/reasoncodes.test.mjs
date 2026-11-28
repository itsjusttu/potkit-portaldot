import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { yulPrep } from "../scripts/yulprep.mjs";

const art = JSON.parse(readFileSync(new URL("../src/generated/artifacts.json", import.meta.url), "utf8"));

// the letters deployed in v2.1 (testnet kit 0xf9f6…e743, 27 Nov); the app decodes every supported kit with this table
const DEPLOYED = {
  A: "allowance", B: "amount", C: "auth", D: "balance", E: "claim first", F: "clone", G: "closed", H: "due date", I: "from", J: "kind",
  K: "need all units", L: "no listing", M: "no shares", N: "no token", O: "not depositor", P: "not issuer", Q: "not locked", R: "not minter",
  S: "not seller", T: "not settled", U: "note length", V: "own listing", W: "pay", X: "price", Y: "receiver", Z: "settled",
  a: "underpaid", b: "units", c: "value", d: "zero", e: "escrow", f: "grace", g: "no credit", h: "overpaid", i: "recipient",
};

test("reason codes: the compiled contract keeps every deployed letter", () => {
  for (const [letter, reason] of Object.entries(art.REASON_CODES)) if (DEPLOYED[letter]) assert.equal(reason, DEPLOYED[letter], `code ${letter}`);
  for (const [letter, reason] of Object.entries(DEPLOYED)) if (Object.values(art.REASON_CODES).includes(reason)) assert.equal(art.REASON_CODES[letter], reason, reason);
});

test("reason codes: a new reason is appended after the fixed ones and shifts none of them", () => {
  const src = 'need(a, "grace")\nneed(b, "aaa new")\nneed(c, "no credit")\nneed(d, "allowance")\nneed(e, "zzz new")';
  const { codes } = yulPrep(src);
  assert.deepEqual(codes, { f: "grace", j: "aaa new", g: "no credit", A: "allowance", k: "zzz new" });
});

test("issued supply: share percentages and face value use the shares issued at lock, not the outstanding count", async () => {
  const code = transformSync(readFileSync(new URL("../src/tabs/ctx.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
  const { issuedSupply, faceShare } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  const E18 = 10n ** 18n;
  // the v2.1 run: 100 shares issued, face 1 tPOT, 25 claimed (burned), so 75 outstanding
  const row = { supply: 75n * E18, settle: { supply: 100n * E18, faceValue: E18 } };
  assert.equal(issuedSupply(row), 100n * E18);
  assert.equal(faceShare(row), E18 / 100n); // 0.01 tPOT a share, so 60 shares are 0.6 (was 0.8 over 75)
  // not locked or redeemed: no original supply, falls back to the row (0)
  assert.equal(issuedSupply({ supply: 0n, settle: { supply: 0n, faceValue: 0n } }), 0n);
  assert.equal(faceShare({ supply: 0n, settle: { supply: 0n, faceValue: 0n } }), 0n);
});
