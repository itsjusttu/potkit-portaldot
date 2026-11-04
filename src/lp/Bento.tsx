import type { CSSProperties, ReactNode } from "react";
import { SNAPSHOT, type Live } from "./useLive";

/* The pinned "Live on testnet" block: three panels (Receipts, Market, Settlement) that follow the scroll. Every figure and
   every chart point comes from the chain through useLive; while the read is running the cards show skeletons, and when a
   read fails they show a dash. The text on the left cards is plain description, not data. */

const W = 560, H = 230;
const grid = Array.from({ length: 9 }, (_, i) => 12 + i * 24);

function Empty({ loading }: { loading: boolean }) {
  return <div className={`lp-chart-empty ${loading ? "lp-skel-block" : ""}`}>{loading ? "" : "The chart appears when the event scan has loaded."}</div>;
}

function Grid() {
  return <g aria-hidden>{grid.map((y) => <line key={y} x1="0" x2={W} y1={y} y2={y} className="gl" />)}</g>;
}

const xs = (n: number, i: number) => (n <= 1 ? W / 2 : 8 + (i * (W - 16)) / (n - 1));
const ys = (v: number, max: number) => H - 12 - (max > 0 ? (v / max) * (H - 28) : 0);

export function DotChart({ values, on, label }: { values: number[]; on: boolean; label: string }) {
  const max = Math.max(...values, 1);
  return (
    <svg className={`lp-chart ${on ? "on" : ""}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <Grid />
      {values.map((v, i) => <rect key={i} className="dot" x={xs(values.length, i) - 4} y={ys(v, max) - 4} width="8" height="8" rx="1.5" style={{ transitionDelay: `${i * 22}ms` }} />)}
    </svg>
  );
}

export function BarsChart({ values, on, label }: { values: number[]; on: boolean; label: string }) {
  const max = Math.max(...values, 1), n = values.length, bw = Math.max(3, (W - 16) / n - 5);
  return (
    <svg className={`lp-chart ${on ? "on" : ""}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <Grid />
      {values.map((v, i) => { const h = Math.max(2, H - 12 - ys(v, max)); return <rect key={i} className="bar" x={xs(n, i) - bw / 2} y={H - 12 - h} width={bw} height={h} rx="2" style={{ transitionDelay: `${i * 24}ms` }} />; })}
    </svg>
  );
}

export function LineChart({ values, on, label }: { values: number[]; on: boolean; label: string }) {
  const max = Math.max(...values, 1), n = values.length;
  const d = values.map((v, i) => `${i ? "L" : "M"}${xs(n, i).toFixed(1)} ${ys(v, max).toFixed(1)}`).join(" ");
  return (
    <svg className={`lp-chart ${on ? "on" : ""}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <Grid />
      <path className="ln" d={d} pathLength={1} fill="none" />
      <rect className="dot end" x={xs(n, n - 1) - 4.5} y={ys(values[n - 1] ?? 0, max) - 4.5} width="9" height="9" rx="2" />
    </svg>
  );
}

type Panel = { id: string; title: string; blurb: string; cta: [string, string] };
const num = (v: ReactNode, loading: boolean, cls = "") => (v === null || v === undefined ? <b className={loading ? "lp-skel lp-skel-n" : "dim"}>{loading ? " " : "—"}</b> : <b className={`num ${cls}`}>{v}</b>);

export function Bento({ live, idx, panels }: { live: Live; idx: number; panels: Panel[] }) {
  const loading = live.phase !== "done";
  const s = live.series;
  const overdue = live.rows.filter((r) => r.status === "Overdue").length;
  const settled = live.rows.filter((r) => r.status === "Settled").length;
  const tone = (st: string) => (st === "Settled" ? "ok" : st === "Overdue" ? "late" : "open");
  const last = (a: number[]) => a[a.length - 1] ?? 0;
  const n2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });
  const groups: ReactNode[] = [
    // 1 · receipts
    <div key="r" className="lp-pg" data-ac="navy">
      <article className="lp-bc big"><span>Receipts minted</span>{num(live.receipts, loading)}<i className="lp-cap">Transactions on the contract over time, cumulative</i>
        {s ? <DotChart values={s.tx} on={idx === 0} label={`State-changing transactions, cumulative: ${last(s.tx)} by the last day`} /> : <Empty loading={loading} />}
      </article>
      <article className="lp-bc"><span>State-changing transactions</span><b className="num">{live.txs ?? SNAPSHOT.txs}</b><small>{live.txsLive ? "Counted from the event logs just now. All from two wallets, both the builder's." : `Snapshot, counted ${SNAPSHOT.date}. All from two wallets, both the builder's.`}</small></article>
      <article className="lp-bc"><span>Receipts by status</span>
        <div className="lp-tiles" aria-label="Receipts by status">{live.rows.length ? live.rows.map((r) => <i key={r.id} className={`lp-tile ${tone(r.status)}`} title={`Receipt #${r.id}: ${r.status}`}><b className="num">#{r.id}</b></i>) : <Empty loading={loading} />}</div>
        <small>Open, settled or overdue, read from the contract now.</small></article>
    </div>,
    // 2 · market
    <div key="m" className="lp-pg" data-ac="bronze">
      <article className="lp-bc big"><span>tPOT traded</span>{num(live.traded, loading)}<i className="lp-cap">Share purchases over time, cumulative tPOT</i>
        {s ? <BarsChart values={s.vol} on={idx === 1} label={`Cumulative tPOT traded: ${n2(last(s.vol))} by the last day`} /> : <Empty loading={loading} />}
      </article>
      <article className="lp-bc"><span>Open listings</span>{num(live.openListings, loading)}<small>Shares offered on the escrow market right now.</small></article>
      <article className="lp-bc"><span>Shares for sale</span>{num(live.sharesForSale, loading)}<small>Total remaining across open listings. Buyers can take any amount.</small></article>
    </div>,
    // 3 · settlement
    <div key="s" className="lp-pg" data-ac="green">
      <article className="lp-bc big"><span>tPOT paid by debtors</span>{num(live.settledTotal, loading)}<i className="lp-cap">Debtor payments over time, cumulative tPOT, all cycles</i>
        {s ? <LineChart values={s.settled} on={idx === 2} label={`Cumulative tPOT paid by debtors: ${n2(last(s.settled))} by the last day`} /> : <Empty loading={loading} />}
      </article>
      <article className="lp-bc"><span>Receipts settled now</span>{num(live.rows.length ? settled : null, loading)}<small>Paid in full, current cycle.</small></article>
      <article className="lp-bc"><span>Past due and unpaid</span>{num(live.rows.length ? overdue : null, loading, overdue ? "late" : "")}<small>Nothing is collected automatically: holders are paid only when the debtor pays.</small></article>
    </div>,
  ];
  return (
    <div className="lp-bento" data-idx={idx}>
      <div className="lp-bleft">
        {panels.map((p, k) => (
          <article key={p.id} className={`lp-pc ${k === idx ? "active" : k < idx ? "past" : "next"}`} style={{ "--k": k } as CSSProperties}>
            <h3>{p.title}</h3>
            <div className="lp-pc-body"><div><p>{p.blurb}</p><a className="lp-btn solid sm" href={p.cta[1]}>{p.cta[0]}</a></div></div>
          </article>
        ))}
      </div>
      <div className="lp-bright" aria-live="polite">
        {groups.map((g, k) => <div key={k} className={`lp-pgw ${k === idx ? "on" : ""}`}>{g}</div>)}
      </div>
    </div>
  );
}
