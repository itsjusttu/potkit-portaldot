import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const code = transformSync(readFileSync(new URL("../src/lib/settlecheck.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const { checkPayment, needsAck, exceedsDecimals } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const E = 10n ** 18n;
const FACE = 10n * E;
const check = (text) => checkPayment(text, FACE, 18);

test("settle: empty, malformed and non-positive amounts are invalid", () => {
  for (const t of ["", "  ", "abc", "1,5", "-1", "0", "0.0", "1e3", "1.", ".5"]) assert.equal(check(t).status, "invalid", JSON.stringify(t));
  assert.equal(check("1." + "0".repeat(19)).status, "invalid"); // more fraction digits than tPOT has
});

test("settle: below the face value is blocked, down to one wei", () => {
  assert.equal(check("5").status, "under");
  assert.equal(check("9.999999999999999999").status, "under");
});

test("settle: exactly the face value is allowed and needs no confirmation", () => {
  const c = check("10");
  assert.equal(c.status, "ok");
  assert.equal(c.extra, 0n);
  assert.equal(needsAck(c, null), false);
});

test("settle: overpaying is allowed but needs confirmation of the exact extra amount", () => {
  const c = check("10.5");
  assert.equal(c.status, "ok");
  assert.equal(c.extra, E / 2n);
  assert.equal(needsAck(c, null), true);
  assert.equal(needsAck(c, c.extra), false);
});

test("settle: changing the amount after ticking locks Pay again", () => {
  const acked = check("10.5").extra;
  assert.equal(needsAck(check("11"), acked), true); // different overpayment
  assert.equal(needsAck(check("10"), acked), false); // back to face value: nothing to confirm
  assert.equal(needsAck(check("5"), acked), false); // blocked anyway (status under), not an ack matter
  assert.equal(needsAck(check("10.5"), acked), false); // same amount keeps the confirmation
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
  assert.equal(checkPayment(ok18, 1n, 18).status, "ok");
  assert.equal(checkPayment(bad19, 1n, 18).status, "invalid");
});
