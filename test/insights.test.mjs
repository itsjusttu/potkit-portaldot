import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const code = transformSync(readFileSync(new URL("../src/tabs/insights.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const { issuerRecord, recordLabel, parseAck, toCsv, toIcs, ackMessage } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const A = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const row = (id, dueDate, status = "Pending", settled = false) => ({ id, depositor: A, dueDate, status, settle: { settled } });

test("issuer record: paid by the due date is on time, paid after is late, overdue unpaid is late", () => {
  const rows = [row(1, 100, "Settled", true), row(2, 100, "Settled", true), row(3, 100, "Overdue"), row(4, 0), row(5, 900)];
  const events = [{ kind: "settle", id: 1, actors: ["0x1"], time: 90 }, { kind: "settle", id: 2, actors: ["0x1"], time: 150 }];
  assert.deepEqual(issuerRecord(A.toLowerCase(), rows, events), { issued: 5, rated: 3, onTime: 1, late: 2 });
});

test("issuer record: undated and still-open receipts are not rated", () => {
  const r = issuerRecord(A, [row(1, 0), row(2, 999)], []);
  assert.equal(r.rated, 0);
  assert.equal(recordLabel(r), "No rated invoices yet");
  assert.equal(recordLabel(issuerRecord(A, [], [])), "New issuer");
});

test("ack link params: only a 65-byte signature and a 20-byte address are accepted", () => {
  const sig = "0x" + "ab".repeat(65);
  assert.ok(parseAck(sig, A));
  assert.equal(parseAck(sig.slice(0, -2), A), null);
  assert.equal(parseAck(sig, "0x123"), null);
});

test("ack message binds id, face value, due date and note", () => {
  const m = ackMessage({ id: 7, note: "Invoice 7", dueDate: 0, settle: { faceValue: 5n } });
  assert.deepEqual(m, { receiptId: 7n, faceValue: 5n, dueDate: 0n, note: "Invoice 7" });
});

test("csv quotes commas, quotes and newlines", () => {
  assert.equal(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line\nbreak", 3]]), 'a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",3');
});

test("ics: one all-day event per due date with escaped text", () => {
  const ics = toIcs([{ uid: "r1@potkit", due: Date.UTC(2026, 10, 21) / 1000, title: "Due: #1, test", detail: "1 tPOT" }], new Date(Date.UTC(2026, 0, 1)));
  assert.match(ics, /DTSTART;VALUE=DATE:20261121/);
  assert.match(ics, /SUMMARY:Due: #1\\, test/);
  assert.match(ics, /DTSTAMP:20260101T000000Z/);
  assert.equal(ics.split("BEGIN:VEVENT").length, 2);
});

const { dueBuckets, settlementSplit } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const lr = (id, dueDate, settled = false, fraction = "0xf") => ({ id, depositor: A, dueDate, status: "", fraction, settle: { settled } });

test("due buckets: only locked, unpaid receipts; overdue, 7 days, 30 days, later, undated", () => {
  const now = 1_000_000, d = 86400;
  const rows = [lr(1, now - 1), lr(2, now + 3 * d), lr(3, now + 20 * d), lr(4, now + 90 * d), lr(5, 0), lr(6, now + d, true), lr(7, now + d, false, "")];
  assert.deepEqual(dueBuckets(rows, now), { overdue: 1, week: 1, month: 1, later: 1, undated: 1 });
});

test("settlement split: on time, late (paid late or unpaid past due), open; unknown payment time is not rated", () => {
  const now = 1000;
  const rows = [lr(1, 500, true), lr(2, 500, true), lr(3, 500), lr(4, 2000), lr(5, 500, true), lr(6, 0, true)];
  const events = [{ kind: "settle", id: 1, actors: [], time: 400 }, { kind: "settle", id: 2, actors: [], time: 600 }];
  assert.deepEqual(settlementSplit(rows, events, now), { onTime: 1, late: 2, open: 1 });
});

const { daily, cumulative } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
test("daily series: buckets by UTC day, oldest first, skips undated and out-of-range events", () => {
  const D = 86400, now = 10 * D + 500;
  const ev = (kind, time, value) => ({ kind, id: 1, actors: [], time, value });
  const events = [ev("list", 10 * D + 5), ev("list", 10 * D + 9), ev("settle", 9 * D, 4n), ev("list", 0), ev("list", 2 * D)];
  assert.deepEqual(daily(events, now, 3, (e) => (e.kind === "list" ? 1 : null)), [0, 0, 2]);
  assert.deepEqual(daily(events, now, 3, (e) => (e.kind === "settle" ? Number(e.value) : null)), [0, 4, 0]);
  assert.deepEqual(cumulative([1, 0, 2], 3), [4, 4, 6]);
});

const { periodDelta, trimNum, salePlan } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
test("period delta: last N days against the N before; null when the earlier period is empty", () => {
  const D = 86400, now = 20 * D + 10;
  const ev = (t) => ({ kind: "list", id: 1, actors: [], time: t });
  const events = [ev(20 * D), ev(19 * D), ev(18 * D), ev(15 * D), ev(12 * D)];
  assert.deepEqual(periodDelta(events, now, 5, () => 1), { cur: 3, prev: 2, pct: 50 });
  assert.deepEqual(periodDelta([ev(20 * D)], now, 5, () => 1), { cur: 1, prev: 0, pct: null });
});
test("trimNum: no exponent, no trailing zeros", () => {
  assert.equal(trimNum(0.0090000001), "0.009"); assert.equal(trimNum(2), "2"); assert.equal(trimNum(1e-12), "0"); assert.equal(trimNum(NaN), "0");
});
test("sale plan: price, proceeds, buyer payout and simple APR", () => {
  const p = salePlan({ face: 0.01, held: 60, pct: 50, discount: 0.1, days: 25 });
  assert.equal(p.shares, 30); assert.ok(Math.abs(p.price - 0.009) < 1e-12); assert.ok(Math.abs(p.receive - 0.27) < 1e-9); assert.ok(Math.abs(p.payout - 0.3) < 1e-9);
  assert.ok(Math.abs(p.apr - (0.1 * 365) / 25) < 1e-12);
  assert.equal(salePlan({ face: 1, held: 1, pct: 100, discount: 0.05, days: 0 }).apr, null);
  assert.equal(salePlan({ face: 1, held: 10, pct: 250, discount: 5, days: 10 }).shares, 10);
});
