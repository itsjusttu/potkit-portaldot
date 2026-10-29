/* Pure helpers (no viem, no React) so they can be unit tested: issuer track record, debtor acknowledgement
   link parameters, CSV and calendar export. Every figure comes from rows and events read from the chain. */

type Ev = { kind: string; id: number; actors: string[]; time: number; value?: bigint; dueDate?: number };
type RowLite = { id: number; depositor: string; dueDate: number; status: string; settle: { settled: boolean } };
const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export type Record = { issued: number; rated: number; onTime: number; late: number };

/** On-time record of one issuer: a dated receipt counts once it is settled (on time if paid by the due date) or
    is overdue and unpaid. Receipts without a due date or still open are not rated. */
export function issuerRecord(issuer: string, rows: RowLite[], events: Ev[]): Record {
  const ids = new Set<number>([...rows.filter((r) => same(r.depositor, issuer)).map((r) => r.id), ...events.filter((e) => e.kind === "lock" && same(e.actors[0], issuer)).map((e) => e.id)]);
  const due = new Map<number, number>();
  for (const e of events) if (e.kind === "terms" && ids.has(e.id) && e.dueDate) due.set(e.id, e.dueDate);
  for (const r of rows) if (ids.has(r.id) && r.dueDate && !due.has(r.id)) due.set(r.id, r.dueDate);
  const paidAt = new Map<number, number>();
  for (const e of events) if (e.kind === "settle" && ids.has(e.id) && e.time) paidAt.set(e.id, e.time);
  let onTime = 0, late = 0;
  for (const id of ids) {
    const d = due.get(id); if (!d) continue;
    const p = paidAt.get(id);
    if (p) { if (p <= d) onTime++; else late++; }
    else if (rows.find((r) => r.id === id)?.status === "Overdue") late++;
  }
  return { issued: ids.size, rated: onTime + late, onTime, late };
}

export const recordLabel = (r: Record) => (r.rated ? `${r.onTime}/${r.rated} paid on time` : r.issued ? "No rated invoices yet" : "New issuer");

type RowFull = RowLite & { fraction: string; settle: { settled: boolean; faceValue?: bigint } };

/** Where every locked receipt stands against its due date, for the Dashboard charts. `now` in unix seconds. */
export function dueBuckets(rows: RowFull[], now: number) {
  const out = { overdue: 0, week: 0, month: 0, later: 0, undated: 0 };
  for (const r of rows) {
    if (!r.fraction || r.settle.settled) continue;
    if (!r.dueDate) { out.undated++; continue; }
    const days = (r.dueDate - now) / 86400;
    if (days <= 0) out.overdue++; else if (days <= 7) out.week++; else if (days <= 30) out.month++; else out.later++;
  }
  return out;
}

/** Outcome of every dated, locked receipt: paid by the due date, paid late or still unpaid after it, or still open. */
export function settlementSplit(rows: RowFull[], events: Ev[], now: number) {
  const paidAt = new Map<number, number>();
  for (const e of events) if (e.kind === "settle" && e.time) paidAt.set(e.id, e.time);
  const out = { onTime: 0, late: 0, open: 0 };
  for (const r of rows) {
    if (!r.fraction || !r.dueDate) continue;
    const p = paidAt.get(r.id);
    if (r.settle.settled) { if (p) { if (p <= r.dueDate) out.onTime++; else out.late++; } } // paid but outside the scanned events: timing unknown, not rated
    else if (r.dueDate <= now) out.late++;
    else out.open++;
  }
  return out;
}

/** Per-day series over the last `days` days (oldest first), ending on the day of `now` (unix s, UTC days).
    `pick` returns the amount an event adds to its day, or null to skip it; events without a time are skipped. */
export function daily(events: Ev[], now: number, days: number, pick: (e: Ev) => number | null): number[] {
  const today = Math.floor(now / 86400), out = new Array<number>(days).fill(0);
  for (const e of events) {
    if (!e.time) continue;
    const v = pick(e); if (v === null) continue;
    const i = days - 1 - (today - Math.floor(e.time / 86400));
    if (i >= 0 && i < days) out[i] += v;
  }
  return out;
}
export const cumulative = (xs: number[], start = 0) => { let t = start; return xs.map((x) => (t += x)); };

/** Counts of the last `days` days against the `days` before them. `pct` is null when the earlier period is empty. */
export function periodDelta(events: Ev[], now: number, days: number, pick: (e: Ev) => number | null) {
  const xs = daily(events, now, days * 2, pick);
  const prev = xs.slice(0, days).reduce((a, b) => a + b, 0), cur = xs.slice(days).reduce((a, b) => a + b, 0);
  return { cur, prev, pct: prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null };
}

/** Number without exponent or trailing zeros, at most `dp` decimals (safe to paste into a tPOT input). */
export const trimNum = (n: number, dp = 8) => (Number.isFinite(n) ? n.toFixed(dp).replace(/\.?0+$/, "") || "0" : "0");

/** Estimate for selling `pct`% of a position at a `discount` (0..0.99) to face value. Amounts in tPOT. APR is simple
    (discount x 365 / days to due) and null without a future due date. An estimate, never a promise of payment. */
export function salePlan(p: { face: number; held: number; pct: number; discount: number; days: number }) {
  const shares = p.held * Math.min(100, Math.max(0, p.pct)) / 100;
  const d = Math.min(0.99, Math.max(0, p.discount));
  const price = p.face * (1 - d);
  return { shares, price, receive: shares * price, payout: shares * p.face, apr: p.days > 0 ? (d * 365) / p.days : null };
}

/** Debtor acknowledgement travels in the link: ?ack=<65-byte signature>&by=<signer>. */
export function parseAck(ack: string, by: string): { sig: `0x${string}`; by: `0x${string}` } | null {
  return /^0x[0-9a-fA-F]{130}$/.test(ack) && /^0x[0-9a-fA-F]{40}$/.test(by) ? { sig: ack as `0x${string}`, by: by as `0x${string}` } : null;
}

/** Typed-data message for "I acknowledge this invoice". It binds the receipt id, face value, due date and note,
    so changing any of them on-chain makes an old signature fail to verify. */
export const ackTypes = { Acknowledge: [{ name: "receiptId", type: "uint256" }, { name: "faceValue", type: "uint256" }, { name: "dueDate", type: "uint64" }, { name: "note", type: "string" }] } as const;
export const ackMessage = (r: { id: number; note: string; dueDate: number; settle: { faceValue: bigint } }) => ({ receiptId: BigInt(r.id), faceValue: r.settle.faceValue, dueDate: BigInt(r.dueDate || 0), note: r.note });

/** CSV with quoting that survives commas, quotes and newlines. */
export function toCsv(head: string[], rows: (string | number)[][]): string {
  const q = (v: string | number) => { const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
}

/** iCalendar file with one all-day event per due date (RFC 5545 line endings). */
export function toIcs(items: { uid: string; due: number; title: string; detail: string }[], stamp = new Date()): string {
  const d = (t: number) => new Date(t * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const st = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PotKit//Due dates//EN", ...items.flatMap((i) => ["BEGIN:VEVENT", `UID:${i.uid}`, `DTSTAMP:${st}`, `DTSTART;VALUE=DATE:${d(i.due)}`, `SUMMARY:${esc(i.title)}`, `DESCRIPTION:${esc(i.detail)}`, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
}
