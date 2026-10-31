import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const code = transformSync(readFileSync(new URL("../src/tabs/receipt-history.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const { readReceiptHistory, withoutRedeemed, settlementPayer } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const ev = (kind, id, block, logIndex = 0) => ({ kind, id, block: BigInt(block), logIndex });
const rows = [{ id: 1 }, { id: 2 }];

test("Dashboard Active book: lock → redeem leaves the receipt out", () => {
  const events = [ev("lock", 1, 10), ev("redeem", 1, 20), ev("lock", 2, 11)];
  assert.deepEqual(withoutRedeemed(rows, events).map((r) => r.id), [2]);
});

test("Dashboard Active book: lock → redeem → new lock puts the receipt back", () => {
  const events = [ev("lock", 1, 10), ev("redeem", 1, 20), ev("lock", 1, 30), ev("lock", 2, 11)];
  assert.deepEqual(withoutRedeemed(rows, events).map((r) => r.id), [1, 2]);
  assert.equal(readReceiptHistory(events).get(1).redeemed, false);
});

test("Dashboard Active book: same-block ordering uses logIndex, input order does not matter", () => {
  const redeemedLast = [ev("redeem", 1, 20, 5), ev("lock", 1, 20, 2)];
  assert.deepEqual(withoutRedeemed([{ id: 1 }], redeemedLast), []);
  const relockedLast = [ev("lock", 1, 20, 9), ev("redeem", 1, 20, 5), ev("lock", 1, 10)];
  assert.deepEqual(withoutRedeemed([{ id: 1 }], relockedLast).map((r) => r.id), [1]);
});

test("Dashboard Active book: receipts with no events stay active", () => {
  assert.deepEqual(withoutRedeemed(rows, []).map((r) => r.id), [1, 2]);
});

const evA = (kind, id, block, who, logIndex = 0) => ({ kind, id, block: BigInt(block), logIndex, actors: [who] });
const ISSUER = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa", OTHER = "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb";

test("settlementPayer flags a payment made from the issuer's own wallet (case-insensitive)", () => {
  const h = readReceiptHistory([evA("lock", 1, 10, ISSUER), evA("settle", 1, 20, ISSUER.toLowerCase())]).get(1);
  assert.deepEqual(settlementPayer(h), { payer: ISSUER.toLowerCase(), byIssuer: true });
});

test("settlementPayer does not flag a different wallet", () => {
  const h = readReceiptHistory([evA("lock", 1, 10, ISSUER), evA("settle", 1, 20, OTHER)]).get(1);
  assert.equal(settlementPayer(h).byIssuer, false);
});

test("settlementPayer is null while unpaid, and ignores a payment from an earlier lock cycle", () => {
  assert.equal(settlementPayer(readReceiptHistory([evA("lock", 1, 10, ISSUER)]).get(1)), null);
  const relocked = readReceiptHistory([evA("lock", 1, 10, ISSUER), evA("settle", 1, 20, ISSUER), evA("redeem", 1, 30, ISSUER), evA("lock", 1, 40, OTHER)]).get(1);
  assert.equal(settlementPayer(relocked), null);
});

test("settlementPayer shows nothing when the lock event is outside the scanned range", () => {
  const h = readReceiptHistory([evA("settle", 1, 20, OTHER)]).get(1);
  assert.equal(settlementPayer(h, OTHER), null); // not settled without a lock in range: history.settled needs the lock, so no label is shown
});
