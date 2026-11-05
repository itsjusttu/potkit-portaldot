import { useEffect, useState, type RefObject } from "react";
import { buildSeries, type Series } from "./series";

/* Figures for the landing page, read from the PotKit contract by the visitor's browser with the same read functions the app
   uses, so the two always agree. The chain code (viem and the Lens reads) is a separate chunk that is only downloaded when the
   section scrolls into view. After the first read the page asks the chain again every POLL_MS while the tab is visible, and
   at once when the tab comes back, so a transaction made in the app shows up here within seconds; new events are read
   incrementally from the last block seen. Nothing is invented: when a read fails the previous value stays, and a figure that
   was never read is a dash or the dated snapshot documented in the README. */

export const KIT = "0x3c26351ad8b9dc7bb4f837c5b921879c35e20fb7";
export const DEPLOY_BLOCK = 97421n;
export const POLL_MS = 15_000;
/** Documented in the README, DEVLOG and the DoraHacks text: state-changing transactions on the kit, counted from its event logs (block 328567). */
export const SNAPSHOT = { txs: 34, date: "2026-11-05" } as const;

export type LiveReceipt = { id: number; note: string; kind: string; face: string; due: number; status: string; shares: string };
export type Live = {
  phase: "idle" | "loading" | "done";
  receipts: number | null; traded: string | null; txs: number | null; txsLive: boolean; receipt: LiveReceipt | null;
  rows: { id: number; status: string }[]; openListings: number | null; sharesForSale: string | null;
  settledTotal: string | null; series: Series | null;
  /** unix ms of the last successful read of the contract, null before the first one */
  updatedAt: number | null;
};
const empty: Live = { phase: "idle", receipts: null, traded: null, txs: null, txsLive: false, receipt: null, rows: [], openListings: null, sharesForSale: null, settledTotal: null, series: null, updatedAt: null };

/** Starts reading once `ref` is on screen (or at once when IntersectionObserver is missing), then keeps the figures fresh. */
export function useLive(ref: RefObject<HTMLElement | null>): Live {
  const [live, setLive] = useState<Live>(empty);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let started = false, dead = false, busy = false, timer = 0, lastRun = 0;
    type Chain = typeof import("../lib/chain");
    let chain: Chain | null = null, fmtShares: ((v: bigint) => string) | null = null;
    const events: Awaited<ReturnType<Chain["loadEvents"]>>["events"] = [];
    const seen = new Set<string>();
    let lastBlock = 0n, scanned = false;

    const read = async () => {
      if (busy || dead) return;
      busy = true; lastRun = Date.now();
      try {
        if (!chain || !fmtShares) {
          const [c, s] = await Promise.all([import("../lib/chain"), import("../lib/shares")]);
          chain = c; fmtShares = s.fmtShares;
        }
        const c = chain, fs = fmtShares;
        const kit = c.addr(KIT) as `0x${string}`;
        const [count, rows, listings] = await Promise.all([
          c.receiptCount(kit).catch(() => null),
          c.loadRows(kit, 0, 50).catch(() => null),
          c.loadListings(kit).catch(() => null),
        ]);
        if (dead) return;
        const part: Partial<Live> = {};
        if (count !== null) part.receipts = count;
        if (rows) {
          part.rows = rows.map((r) => ({ id: r.id, status: r.status }));
          const pick = [...rows].reverse().find((r) => r.fraction && r.supply > 0n) ?? null;
          part.receipt = pick ? { id: pick.id, note: pick.note, kind: c.KINDS[pick.kind] ?? "Receipt", face: `${c.fmt(pick.settle.faceValue, pick.settle.decimals)} ${pick.settle.symbol || "tPOT"}`, due: pick.dueDate, status: pick.status, shares: fs(pick.supply) } : null;
        }
        if (listings) {
          const open = listings.filter((l) => l.remaining > 0n);
          part.openListings = open.length;
          part.sharesForSale = fs(open.reduce((s, l) => s + l.remaining, 0n));
        }
        if (count !== null || rows || listings) { part.updatedAt = Date.now(); setLive((l) => ({ ...l, ...part, phase: l.phase === "idle" ? "loading" : l.phase })); }

        // events: the first scan starts at the deploy block, later ones at the block after the newest event already seen
        const from = lastBlock > 0n ? lastBlock + 1n : DEPLOY_BLOCK;
        const ev = await c.loadEvents(c.kitAddrs(kit), kit, listings ?? [], from).catch(() => ({ events: [], ok: false }));
        if (dead) return;
        if (ev.ok) {
          scanned = true;
          for (const e of ev.events) {
            const key = `${e.hash}-${e.logIndex}-${e.kind}`;
            if (seen.has(key)) continue;
            seen.add(key); events.push(e);
            if (e.block > lastBlock) lastBlock = e.block;
          }
        }
        const buys = events.filter((e) => e.kind === "buy"), paid = events.filter((e) => e.kind === "settle");
        setLive((l) => ({
          ...l, ...part, phase: "done",
          ...(scanned ? {
            traded: c.fmt(buys.reduce((s, e) => s + (e.value ?? 0n), 0n), 18),
            settledTotal: c.fmt(paid.reduce((s, e) => s + (e.value ?? 0n), 0n), 18),
            txs: new Set(events.map((e) => e.hash)).size, txsLive: true,
            series: buildSeries(events, Math.floor(Date.now() / 1000)),
          } : {}),
          updatedAt: part.updatedAt ?? l.updatedAt,
        }));
      } catch {
        if (!dead) setLive((l) => ({ ...l, phase: "done" }));
      } finally { busy = false; }
    };

    const visible = () => document.visibilityState === "visible";
    const begin = () => {
      if (started) return; started = true;
      setLive((l) => ({ ...l, phase: "loading" }));
      void read();
      timer = window.setInterval(() => { if (visible()) void read(); }, POLL_MS);
    };
    const wake = () => { if (started && visible() && Date.now() - lastRun > 4000) void read(); };
    document.addEventListener("visibilitychange", wake); addEventListener("focus", wake);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") begin();
    else { io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { begin(); io?.disconnect(); } }, { rootMargin: "400px 0px" }); io.observe(el); }
    return () => { dead = true; io?.disconnect(); window.clearInterval(timer); document.removeEventListener("visibilitychange", wake); removeEventListener("focus", wake); };
  }, [ref]);
  return live;
}
