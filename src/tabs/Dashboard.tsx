import { useState } from "react";
import { fmt, KINDS, units } from "../lib/chain";
import { CountUp, Empty, Ico, toast } from "../AppUi";
import type { Ctx } from "./ctx";
import { day, SettleBadge, Term } from "./shared";
import { withoutRedeemed } from "./receipt-history";
import { lifecycleSteps } from "./Tour";
import { EV_ICON } from "./Explore";
import { cumulative, daily, dueBuckets, periodDelta, settlementSplit } from "./insights";
import { DotMatrix, Lines, Needle, Spark } from "./charts";
import { SalePlanner } from "./SalePlanner";

type Scope = "all" | "action" | "market" | "settled";
type R = Ctx["rows"][number];
const DAYS = 30;
const tpot = (v: bigint) => Number(v) / 1e18;
const ago = (t: number) => { const s = Date.now() / 1000 - t; return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }); };

/** Big figure with the decimals dimmed, e.g. 12<small>.5</small> tPOT. */
const Big = ({ v }: { v: string }) => { const [i, d] = v.split("."); return <span className="nv-big num"><CountUp v={i!} />{d ? <small>.{d}</small> : null}<em>tPOT</em></span>; };

export function Dashboard({ c }: { c: Ctx }) {
  const [scope, setScope] = useState<Scope>("all");
  const [view, setView] = useState<"dots" | "lines">("dots");
  const [allSteps, setAllSteps] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const now = Date.now() / 1000;
  const open = c.listings.filter((l) => l.remaining > 0n);
  const eventFaceValues = new Map<number, bigint>();
  for (const e of c.events) if (e.kind === "terms" && (e.value ?? 0n) > 0n && !eventFaceValues.has(e.id)) eventFaceValues.set(e.id, e.value!);
  const faceValueOf = (r: R) => r.settle.faceValue > 0n ? r.settle.faceValue : eventFaceValues.get(r.id) ?? 0n;
  const mine = c.account ? c.rows.filter((r) => r.depositor.toLowerCase() === c.account.toLowerCase() || r.owner.toLowerCase() === c.account.toLowerCase()) : c.rows;
  const active = withoutRedeemed(mine, c.events); // same current-cycle rule as Explore
  const market = withoutRedeemed(c.rows, c.events);
  const onMarket = (r: R) => open.some((l) => l.receiptId === r.id);
  const needsAction = (r: R) => !r.fraction || r.settle.settled;
  const inScope = (r: R) => scope === "all" || (scope === "action" && needsAction(r)) || (scope === "market" && onMarket(r)) || (scope === "settled" && r.settle.settled);
  const shown = active.filter(inScope);
  const nextFor = (r: R) => {
    if (!r.fraction) return { label: "Add terms", tab: "issue" as const, params: { id: String(r.id) } };
    if (r.settle.settled) return { label: "Review claims", tab: "portfolio" as const, params: { id: String(r.id) } };
    if (onMarket(r)) return { label: "Open listing", tab: "trade" as const, params: { id: String(r.id) } };
    return { label: "List shares", tab: "trade" as const, params: { sell: String(r.id) } };
  };
  const go = (r: R) => { const next = nextFor(r); c.setTab(next.tab, next.tab === "trade" && "sell" in next.params ? { sell: String(r.id) } : { id: String(r.id) }); };
  const claimTotal = [...c.claims.values()].reduce((s, v) => s + v, 0n);
  const pending = active.filter(needsAction).length;
  const attention = [
    ...active.filter((r) => r.settle.settled && (c.claims.get(r.id) ?? 0n) > 0n).map((r) => ({ r, why: `Paid — ${fmt(c.claims.get(r.id) ?? 0n, 18)} tPOT ready for you`, label: "Claim payout", go: () => c.setTab("portfolio") })),
    ...active.filter((r) => !r.fraction).map((r) => ({ r, why: "Minted but not locked: add terms to issue shares", label: "Add terms", go: () => c.setTab("issue", { id: String(r.id) }) })),
    ...active.filter((r) => r.status === "Overdue").map((r) => ({ r, why: "Past due and unpaid; nothing is collected automatically", label: "View proof", go: () => c.setTab("verify", { id: String(r.id) }) })),
  ].slice(0, 4);
  const scopes: [Scope, string, number][] = [["all", "All", active.length], ["action", "Needs action", pending], ["market", "On market", active.filter(onMarket).length], ["settled", "Settled", active.filter((r) => r.settle.settled).length]];

  // ---- market figures, all from loaded rows, listings and scanned events ----
  const openRows = market.filter((r) => r.fraction && !r.settle.settled);
  const outstanding = openRows.reduce((s, r) => s + faceValueOf(r), 0n);
  const settledRows = market.filter((r) => r.settle.settled);
  const settledTotal = c.events.filter((e) => e.kind === "settle").reduce((s, e) => s + (e.value ?? 0n), 0n);
  const buyEvents = c.events.filter((e) => e.kind === "buy");
  const traded = buyEvents.reduce((s, e) => s + (e.value ?? 0n), 0n);
  const sharesForSale = open.reduce((s, l) => s + l.remaining, 0n);
  const issuedDaily = daily(c.events, now, DAYS, (e) => (["mint", "lock", "list"].includes(e.kind) ? 1 : null));
  const paidDaily = daily(c.events, now, DAYS, (e) => (["buy", "settle", "claim"].includes(e.kind) ? 1 : null));
  const inRange = issuedDaily.reduce((a, b) => a + b, 0) + paidDaily.reduce((a, b) => a + b, 0);
  const anyEvent = (e: { kind: string }) => (["mint", "lock", "list", "buy", "settle", "claim"].includes(e.kind) ? 1 : null);
  const delta = periodDelta(c.events, now, DAYS, anyEvent);
  const prevTotals = daily(c.events, now - DAYS * 86400, DAYS, anyEvent);
  const curTotals = issuedDaily.map((n, i) => n + paidDaily[i]!);
  const dayLabels = Array.from({ length: DAYS }, (_, i) => new Date((now - (DAYS - 1 - i) * 86400) * 1000));
  const tick = (i: number) => dayLabels[i]!.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const listSpark = cumulative(daily(c.events, now, DAYS, (e) => (e.kind === "list" ? 1 : null)));
  const tradeSpark = cumulative(daily(c.events, now, DAYS, (e) => (e.kind === "buy" ? tpot(e.value ?? 0n) : null)));
  const settleSpark = cumulative(daily(c.events, now, DAYS, (e) => (e.kind === "settle" ? tpot(e.value ?? 0n) : null)));
  const split = settlementSplit(market, c.events, now);
  const rated = split.onTime + split.late;
  const due = dueBuckets(market, now);
  const weeks = Array.from({ length: 12 }, (_, w) => openRows.filter((r) => r.dueDate && r.dueDate > now + w * 7 * 86400 && r.dueDate <= now + (w + 1) * 7 * 86400).length);
  const histo = [due.overdue, ...weeks], histoMax = Math.max(1, ...histo);
  const nextDue = [...openRows].filter((r) => r.dueDate > now).sort((a, b) => a.dueDate - b.dueDate)[0];
  const nextDays = nextDue ? Math.ceil((nextDue.dueDate - now) / 86400) : null;
  const latest = [...market].filter((r) => r.fraction).sort((a, b) => b.id - a.id)[0];
  const steps = lifecycleSteps(c);
  const stepsDone = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);
  const recent = c.events.slice(0, 4);

  return <div className="receivable-dashboard nv">
    <h1 className="sr-only">Dashboard</h1>
    <div className="nv-grid">
      <div className="nv-main">
        <article className="nv-card nv-hero" style={{ "--i": 0 } as React.CSSProperties} aria-labelledby="nv-out">
          <header><span className="nv-ico"><Ico n="terms" /></span><h2 id="nv-out"><Term k="face">Outstanding face value</Term></h2>
            <button className="btn primary sm nv-cta" onClick={() => c.setTab("issue")}>Issue receipt <Ico n="arrow" size={14} /></button><div className="nv-view" role="group" aria-label="Chart style"><button type="button" aria-pressed={view === "dots"} aria-label="Dot matrix" onClick={() => setView("dots")}><Ico n="grid" size={15} /></button><button type="button" aria-pressed={view === "lines"} aria-label="Line chart" onClick={() => setView("lines")}><Ico n="activity" size={15} /></button></div></header>
          <div className="nv-hero-fig">{c.loading ? <span className="nv-big">—</span> : <Big v={fmt(outstanding, 18)} />}<span className="nv-chip">{openRows.length} open receipt{openRows.length === 1 ? "" : "s"}</span>{delta.pct !== null && <span className={`nv-chip ${delta.pct >= 0 ? "up" : "down"}`} title={`${delta.cur} on-chain events in the last ${DAYS} days against ${delta.prev} in the ${DAYS} before`}><Ico n="arrow" size={12} />{delta.pct >= 0 ? "+" : ""}{delta.pct}% activity vs previous {DAYS} days</span>}</div>
          <div className="nv-hero-sub"><p className="muted">What debtors owe on locked, unpaid receipts. Not a guaranteed payout. <button type="button" className="nv-inline" onClick={() => setPlanOpen(true)}>Plan a sale →</button></p><span className="nv-legend" title={c.eventsLoading ? "Reading on-chain events…" : `${inRange} on-chain events in the last ${DAYS} days (scanned range)`}>{view === "dots" ? <><span><i className="k-a" />Issued &amp; listed</span><span><i className="k-b" />Trades &amp; payments</span></> : <><span><i className="k-a" />Last {DAYS} days</span><span><i className="k-p" />Previous {DAYS}</span></>}</span></div>
                    <div className="nv-swap" key={view}>{view === "dots" ? <DotMatrix a={issuedDaily} b={paidDaily} dates={dayLabels.map((_, i) => tick(i))} /> : <Lines cur={curTotals} prev={prevTotals} />}</div>
          <div className="nv-axis">{[0, 6, 12, 18, 24, 29].map((i) => <span key={i}>{tick(i)}</span>)}</div>
        </article>

        <div className="nv-kpis">
          <button type="button" className="nv-card nv-kpi" style={{ "--i": 7 } as React.CSSProperties} onClick={() => c.setTab("trade")}><span>Open listings</span><b className="num">{c.loading ? "—" : open.length}</b><Spark xs={listSpark} tone="violet" /><small>{units(sharesForSale)} shares for sale</small></button>
          <button type="button" className="nv-card nv-kpi" style={{ "--i": 8 } as React.CSSProperties} onClick={() => c.setTab("trade")}><span>Traded volume</span><b className="num">{c.eventsOk ? `${fmt(traded, 18)} tPOT` : "—"}</b><Spark xs={tradeSpark} tone="blue" /><small>{buyEvents.length} buy{buyEvents.length === 1 ? "" : "s"} in scanned events</small></button>
          <button type="button" className="nv-card nv-kpi" style={{ "--i": 9 } as React.CSSProperties} onClick={() => c.setTab("explore")}><span>Settled</span><b className="num">{c.eventsOk ? `${fmt(settledTotal, 18)} tPOT` : "—"}</b><Spark xs={settleSpark} tone="green" /><small>{settledRows.length} receipt{settledRows.length === 1 ? "" : "s"} paid</small></button>
        </div>

        <div className="nv-row">
          <article className="nv-card nv-due" style={{ "--i": 1 } as React.CSSProperties} aria-labelledby="nv-due">
            <header><span className="nv-ico"><Ico n="clock" /></span><h2 id="nv-due">Upcoming payments</h2><button type="button" className="nv-link" onClick={() => c.setTab("explore")}>View receipts <Ico n="arrow" size={14} /></button></header>
            <div className="nv-due-grid">
              <div className="nv-sub"><span className="nv-sub-t">By week</span>
                <div className="nv-histo">{histo.map((n, i) => <i key={i} className={i === 0 ? "past" : ""} style={{ height: `${n ? 18 + (n / histoMax) * 82 : 6}%`, "--k": i } as React.CSSProperties} title={`${i === 0 ? "Past due" : `Week ${i}`}: ${n}`} />)}</div>
                <div className="nv-histo-axis"><span>Past</span><span>Now</span><span>+12 wk</span></div></div>
              <div className="nv-sub nv-next"><b className="num">{nextDays === null ? "—" : `${nextDays} day${nextDays === 1 ? "" : "s"}`}</b><span>{nextDue ? `until #${nextDue.id} is due` : "No upcoming due date"}</span></div>
            </div>
          </article>
          <button type="button" className="nv-card nv-receipt" style={{ "--i": 10 } as React.CSSProperties} onClick={() => latest && c.setTab("verify", { id: String(latest.id) })} disabled={!latest} aria-label={latest ? `Verify latest receipt ${latest.id}` : "No receipt yet"}>
            <header><span className="nv-ico"><Ico n="shield" /></span><h2>Latest receipt</h2>{latest && <Ico n="arrow" size={14} />}</header>
            {latest ? <div className="nv-rcard"><span className="nv-rcard-top"><img src="/potkit-p-circle-black.svg" alt="" width={18} height={18} /> PotKit receipt <b className="num">#{latest.id}</b></span><span className="nv-rcard-note">{latest.note || KINDS[latest.kind]}</span><span className="nv-rcard-foot"><span className="num">{fmt(faceValueOf(latest), 18)} tPOT</span><span className="num">{latest.dueDate ? day(latest.dueDate) : "No due date"}</span></span></div> : <p className="db-none">No receipt has been locked yet.</p>}
            <span className="nv-podium" aria-hidden />
          </button>
        </div>

        <article className="nv-card nv-list" style={{ "--i": 2 } as React.CSSProperties} aria-labelledby="nv-rec-h">
          <header><span className="nv-ico"><Ico n="terms" /></span><h2 id="nv-rec-h">{c.account ? "Your receipts" : "Receipts"}</h2><button type="button" className="nv-link" onClick={() => c.setTab("explore")}>View all <Ico n="arrow" size={14} /></button></header>
          <div className="nv-filter" role="group" aria-label="Filter receipts">{scopes.map(([k, label, n]) => <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)}>{label}<span className="num">{n}</span></button>)}</div>
          {!c.addrs ? <p className="db-none">PotKit is not configured. <button className="nv-link" onClick={() => c.setTab("issue")}>Set up</button></p>
            : c.loading ? <p className="db-none" role="status">Reading receipts from the chain…</p>
            : !shown.length ? <p className="db-none">{active.length ? "No receipt in this view." : "No active receipts yet."}</p>
            : <ul className="nv-rows">{shown.slice(0, 6).map((r) => { const nx = nextFor(r); return (
              <li key={r.id}>
                <span className="nv-ev-ico num">#{r.id}</span>
                <span className="nv-ev-t"><b>{r.note || KINDS[r.kind]}</b><small>{KINDS[r.kind]}{r.dueDate ? <> · due <span className="num">{day(r.dueDate)}</span></> : ""}{r.fraction ? <> · <span className="num">{units(r.supply)}</span> shares</> : " · not locked yet"}</small></span>
                <span className="nv-row-status"><SettleBadge r={r} terms={false} /></span>
                <span className="nv-row-v num">{faceValueOf(r) ? `${fmt(faceValueOf(r), r.settle.decimals)} tPOT` : "—"}</span>
                <span className="nv-row-act">
                  {r.fraction && !r.settle.settled && <button type="button" className="nv-round" aria-label={`Copy pay link for receipt ${r.id}`} title="Copy pay link for the debtor" onClick={() => void navigator.clipboard?.writeText(`${c.judgeLink}&tab=pay&id=${r.id}`).then(() => toast({ kind: "ok", title: "Pay link copied", detail: "Send it to the debtor. They can acknowledge and pay from it." })).catch(() => toast({ kind: "err", title: "Copy failed", detail: "Your browser blocked the clipboard." }))}><Ico n="link" size={15} /></button>}
                  <button type="button" className="nv-round" aria-label={`Verify receipt ${r.id}`} title="Verify" onClick={() => c.setTab("verify", { id: String(r.id) })}><Ico n="shield" size={15} /></button>
                  <button type="button" className="btn sm" onClick={() => go(r)}>{nx.label}</button>
                </span>
              </li>); })}</ul>}
        </article>
      </div>

      <aside className="nv-side">
        <article className="nv-card nv-gauge" style={{ "--i": 3 } as React.CSSProperties} aria-labelledby="nv-rec">
          <header><span className="nv-ico"><Ico n="check" /></span><h2 id="nv-rec">Settlement record</h2></header>
          <b className="nv-gauge-v num">{rated ? `${Math.round((split.onTime / rated) * 100)}%` : "—"}</b>
          <Needle pct={rated ? (split.onTime / rated) * 100 : null} label={`${split.onTime} paid on time, ${split.late} late or unpaid past due, ${split.open} still open`} />
          <footer><span><i className="d-ok" />On time {split.onTime}</span><span><i className="d-late" />Late {split.late}</span><span><i className="d-open" />Open {split.open}</span></footer>
          <small className="muted">Dated receipts · scanned events only</small>
        </article>

        <article className="nv-card nv-progress" style={{ "--i": 4 } as React.CSSProperties} aria-labelledby="nv-prog">
          <header><span className="nv-ico"><Ico n="activity" /></span><h2 id="nv-prog">Your progress</h2><span className="nv-badge num">{stepsDone}/{steps.length}</span></header>
          <div className="nv-prog-box">
            <p>{stepsDone === steps.length ? "Full lifecycle done on-chain." : <>You are <b>{steps.length - stepsDone} step{steps.length - stepsDone === 1 ? "" : "s"}</b> from a full lifecycle</>}</p>
            <div className="nv-segs" role="progressbar" aria-label="Lifecycle steps done" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={stepsDone}>{steps.map((s, k) => <i key={s.t} className={s.done ? "on" : ""} style={{ "--k": k } as React.CSSProperties} />)}</div>
            {c.account && <div className="nv-prog-meta"><span>Balance <b className="num">{c.native === null ? "—" : `${(Number(c.native) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 3 })} tPOT`}</b></span><span><Term k="claim">Claimable</Term> <b className="num">{fmt(claimTotal, 18)} tPOT</b></span></div>}
          </div>
          {nextStep && <button type="button" className="nv-next" onClick={() => nextStep.go?.[1] === "dashboard" && !c.account ? c.connect() : nextStep.go ? c.setTab(nextStep.go[1], nextStep.go[2] ?? {}) : setAllSteps(true)}><Ico n="arrow" size={14} /> Next: {nextStep.t}</button>}
          {nextStep && !nextStep.go && !nextStep.extra && <p className="nv-hint" role="note">{nextStep.d}</p>}
          <button type="button" className="nv-link" aria-expanded={allSteps} onClick={() => setAllSteps(!allSteps)}>{allSteps ? "Hide steps" : "All steps"}</button>
          {allSteps && <ol className="nv-steps">{steps.map((s, i) => <li key={s.t} className={s.done ? "done" : ""}><span className="num">{s.done ? "✓" : i + 1}</span>{s.t}{!s.done && s.extra}{!s.done && !s.go && !s.extra && <small>{s.d}</small>}</li>)}</ol>}
        </article>

        <article className="nv-card nv-attn" style={{ "--i": 5 } as React.CSSProperties} aria-labelledby="rd-att">
          <header><span className="nv-ico"><Ico n="info" /></span><h2 id="rd-att">Needs attention</h2>{attention.length > 0 && <span className="nv-badge num">{attention.length}</span>}</header>
          {c.loading ? <p className="db-none" role="status">Reading…</p> : attention.length ? <ul>{attention.map((x) => <li key={`${x.label}-${x.r.id}`}><span className="nv-ev-t"><b>#{x.r.id} · {x.r.note || KINDS[x.r.kind]}</b><small>{x.why}</small></span><button className="btn sm" onClick={x.go}>{x.label}</button></li>)}</ul>
            : <p className="db-none">{c.account ? "Nothing needs a step from you." : "Connect a wallet to see your steps."}</p>}
        </article>

        <article className="nv-card nv-activity" style={{ "--i": 6 } as React.CSSProperties} aria-labelledby="nv-act">
          <header><span className="nv-ico"><Ico n="clock" /></span><h2 id="nv-act">Recent activity</h2></header>
          {!recent.length ? <p className="db-none">{c.eventsLoading ? "Reading on-chain activity…" : c.eventsOk ? "No activity in the scanned range." : "Event history unavailable."}</p> : <ul>{recent.map((e) => (
            <li key={`${e.hash}-${e.logIndex}-${e.kind}`}><span className="nv-ev-ico"><Ico n={EV_ICON[e.kind]} size={16} /></span><span className="nv-ev-t"><b>{e.text}</b><small>{e.time ? `${e.timeApprox ? "~" : ""}${new Date(e.time * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : `Block ${e.block}`}</small></span>{e.value !== undefined && ["buy", "settle", "claim"].includes(e.kind) && <span className={`nv-ev-v num ${e.kind === "claim" ? "pos" : ""}`}>{fmt(e.value, 18)} tPOT</span>}</li>
          ))}</ul>}
          <button type="button" className="nv-link nv-foot" onClick={() => c.setTab(c.account ? "history" : "explore")}>View full activity <Ico n="arrow" size={14} /></button>
        </article>
      </aside>
    </div>
    <SalePlanner c={c} open={planOpen} onClose={() => setPlanOpen(false)} />
  </div>;
}
