import { useEffect, useState, type RefObject } from "react";
import { buildSeries, type Series } from "./series";

/* Figures for the landing page, read from the PotKit contract by the visitor's browser. The chain code (viem and the Lens
   reads) is a separate chunk that is only downloaded when the stats section scrolls into view, so the first paint of the
   landing page never waits for it. Nothing here is invented: when a read fails the figure stays a dash, or the dated
   snapshot documented in the README, and the section says which one it is showing. */

export const KIT = "0x3c26351ad8b9dc7bb4f837c5b921879c35e20fb7";
export const DEPLOY_BLOCK = 97421n;
/** Documented in the README and DEVLOG: state-changing transactions on the kit, counted from its event logs. */
export const SNAPSHOT = { txs: 28, date: "2026-11-04" } as const;

export type LiveReceipt = { id: number; note: string; kind: string; face: string; due: number; status: string; shares: string };
export type Live = {
  phase: "idle" | "loading" | "done";
  receipts: number | null; traded: string | null; txs: number | null; txsLive: boolean; receipt: LiveReceipt | null;
  rows: { id: number; status: string }[]; openListings: number | null; sharesForSale: string | null;
  settledTotal: string | null; series: Series | null;
};
const empty: Live = { phase: "idle", receipts: null, traded: null, txs: null, txsLive: false, receipt: null, rows: [], openListings: null, sharesForSale: null, settledTotal: null, series: null };

/** Starts reading once `ref` is on screen (or at once when IntersectionObserver is missing). */
export function useLive(ref: RefObject<HTMLElement | null>): Live {
  const [live, setLive] = useState<Live>(empty);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let started = false, dead = false;
    const run = async () => {
      if (started) return; started = true;
      setLive((l) => ({ ...l, phase: "loading" }));
      try {
        const [chain, { fmtShares }] = await Promise.all([import("../lib/chain"), import("../lib/shares")]);
        const kit = chain.addr(KIT) as `0x${string}`;
        const part: Partial<Live> = {};
        const [count, rows, listings] = await Promise.all([
          chain.receiptCount(kit).catch(() => null),
          chain.loadRows(kit, 0, 50).catch(() => [] as Awaited<ReturnType<typeof chain.loadRows>>),
          chain.loadListings(kit).catch(() => [] as Awaited<ReturnType<typeof chain.loadListings>>),
        ]);
        part.receipts = count;
        part.rows = rows.map((r) => ({ id: r.id, status: r.status }));
        const open = listings.filter((l) => l.remaining > 0n);
        part.openListings = open.length;
        part.sharesForSale = fmtShares(open.reduce((s, l) => s + l.remaining, 0n));
        const pick = [...rows].reverse().find((r) => r.fraction && r.supply > 0n) ?? null;
        if (pick) part.receipt = { id: pick.id, note: pick.note, kind: chain.KINDS[pick.kind] ?? "Receipt", face: `${chain.fmt(pick.settle.faceValue, pick.settle.decimals)} ${pick.settle.symbol || "tPOT"}`, due: pick.dueDate, status: pick.status, shares: fmtShares(pick.supply) };
        if (!dead) setLive((l) => ({ ...l, ...part }));
        const ev = await chain.loadEvents(chain.kitAddrs(kit), kit, listings, DEPLOY_BLOCK).catch(() => ({ events: [], ok: false }));
        if (dead) return;
        const buys = ev.events.filter((e) => e.kind === "buy");
        const paid = ev.events.filter((e) => e.kind === "settle");
        setLive((l) => ({
          ...l, ...part, phase: "done",
          traded: ev.ok ? chain.fmt(buys.reduce((s, e) => s + (e.value ?? 0n), 0n), 18) : null,
          settledTotal: ev.ok ? chain.fmt(paid.reduce((s, e) => s + (e.value ?? 0n), 0n), 18) : null,
          txs: ev.ok ? new Set(ev.events.map((e) => e.hash)).size : null, txsLive: ev.ok,
          series: ev.ok ? buildSeries(ev.events, Math.floor(Date.now() / 1000)) : null,
        }));
      } catch {
        if (!dead) setLive((l) => ({ ...l, phase: "done" }));
      }
    };
    if (typeof IntersectionObserver === "undefined") { void run(); return () => { dead = true; }; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { void run(); io.disconnect(); } }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => { dead = true; io.disconnect(); };
  }, [ref]);
  return live;
}
