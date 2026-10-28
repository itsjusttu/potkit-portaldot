import { useState } from "react";
import { fmt, KINDS, units } from "../lib/chain";
import { Empty, Ico } from "../AppUi";
import type { Ctx } from "./ctx";
import { day, SettleBadge } from "./shared";
import { withoutRedeemed } from "./receipt-history";

export function Dashboard({ c }: { c: Ctx }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const open = c.listings.filter((l) => l.remaining > 0n);
  const eventFaceValues = new Map<number, bigint>();
  for (const e of c.events) if (e.kind === "terms" && (e.value ?? 0n) > 0n && !eventFaceValues.has(e.id)) eventFaceValues.set(e.id, e.value!);
  const faceValueOf = (r: (typeof c.rows)[number]) => r.settle.faceValue > 0n ? r.settle.faceValue : eventFaceValues.get(r.id) ?? 0n;
  const mine = c.account ? c.rows.filter((r) => r.depositor.toLowerCase() === c.account.toLowerCase() || r.owner.toLowerCase() === c.account.toLowerCase()) : c.rows;
  const active = withoutRedeemed(mine, c.events); // same current-cycle rule as Explore
  const selected = active.find((r) => r.id === selectedId) ?? active[0];
  const nextFor = (r: (typeof c.rows)[number]) => {
    if (!r.fraction) return { label: "Add terms", tab: "issue" as const, params: { id: String(r.id) } };
    if (r.settle.settled) return { label: "Review claims", tab: "portfolio" as const, params: { id: String(r.id) } };
    if (open.some((l) => l.receiptId === r.id)) return { label: "Open listing", tab: "trade" as const, params: { id: String(r.id) } };
    return { label: "List shares", tab: "trade" as const, params: { sell: String(r.id) } };
  };
  const statusFor = (r: (typeof c.rows)[number]) => !r.fraction ? "Needs terms" : r.settle.settled ? "Settled" : open.some((l) => l.receiptId === r.id) ? "On market" : "Active";
  const faceTotal = c.rows.reduce((sum, r) => sum + faceValueOf(r), 0n);
  const settled = c.events.filter((e) => e.kind === "settle").reduce((sum, e) => sum + (e.value ?? 0n), 0n);
  const pending = active.filter((r) => !r.fraction || r.settle.settled).length;
  return <div className="receivable-dashboard">
    <header className="rd-heading"><div><h1>{c.account ? "Your receivables" : "Receivables"}</h1><p>Follow each receipt from issue through payment and redemption.</p></div><button className="btn primary" onClick={() => c.setTab("issue")}>Issue receipt <Ico n="arrow" /></button></header>
    <div className="rd-layout">
      <section className="rd-workspace" aria-label="Receivables workspace">
        <section className="rd-next-actions" aria-label="What to do next">
          <div><h2>What needs attention</h2><p>{c.loading ? "Reading your receipts…" : pending ? `${pending} ${pending === 1 ? "receipt needs" : "receipts need"} review` : "No receipts need immediate review in the loaded range."}</p></div>
          <div className="rd-next-actions-links"><button className="btn sm" onClick={() => { if (pending && selected) { const next = nextFor(selected); c.setTab(next.tab, next.tab === "trade" && "sell" in next.params ? { sell: String(selected.id) } : { id: String(selected.id) }); } else c.setTab("issue"); }}>{pending && selected ? nextFor(selected).label : "Issue receipt"} <Ico n="arrow" /></button><button className="btn sm" onClick={() => c.setTab("trade")}>Browse market</button></div>
        </section>
        <div className="rd-summary" aria-label="Receivables summary"><div><span>Active receipts</span><strong>{active.length}</strong></div><div><span>Face value</span><strong>{c.loading ? "—" : `${fmt(faceTotal, 18)} tPOT`}</strong></div><div><span>Settled on-chain</span><strong>{c.eventsLoading || !c.eventsOk ? "—" : `${fmt(settled, 18)} tPOT`}</strong></div></div>
        <div className="rd-section-head"><div><h2>Active book</h2><span>{c.account ? "Receipts associated with your wallet" : "Loaded deployment receipts"}</span></div><button className="btn sm" onClick={() => c.setTab("explore")}>View all receipts <Ico n="arrow" /></button></div>
        {!c.addrs ? <Empty icon="⇄" title="PotKit is not configured" body="Open a deployment link or set up the contract from Issue."><button className="btn primary" onClick={() => c.setTab("issue")}>Set up PotKit</button></Empty> : c.loading ? <p className="muted" role="status">Reading receipts from the chain…</p> : !active.length ? <Empty icon="▤" title="No active receipts in the loaded range" body="Issue a receipt or explore the deployment."><button className="btn primary" onClick={() => c.setTab("issue")}>Create receipt</button></Empty> : <div className="tscroll"><table className="rtable rd-table"><thead><tr><th scope="col">Receipt</th><th scope="col">Status</th><th scope="col" className="num">Face value</th><th scope="col">Due</th><th scope="col"><span className="sr-only">Next action</span></th></tr></thead><tbody>{active.map((r) => { const nx = nextFor(r); return <tr key={r.id} className={selected?.id === r.id ? "sel" : ""} onClick={() => setSelectedId(r.id)}><td data-label="Receipt"><button type="button" className="rd-pick" aria-pressed={selected?.id === r.id} onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); }}><b>#{r.id} · {r.note || KINDS[r.kind]}</b><small>{KINDS[r.kind]} · {r.fraction ? `${units(r.supply)} shares` : "Not fractionalized"}</small></button></td><td data-label="Status"><div className="tags"><SettleBadge r={r} terms={false} /></div><small className="muted">{statusFor(r)}</small></td><td data-label="Face value" className="num">{faceValueOf(r) ? `${fmt(faceValueOf(r), r.settle.decimals)} ${r.settle.symbol}` : "—"}</td><td data-label="Due">{r.dueDate ? day(r.dueDate) : "—"}</td><td data-label="Next" className="acts"><button type="button" className="btn sm" onClick={(e) => { e.stopPropagation(); c.setTab(nx.tab, nx.tab === "trade" && "sell" in nx.params ? { sell: String(r.id) } : { id: String(r.id) }); }}>{nx.label} <Ico n="arrow" size={14} /></button></td></tr>; })}</tbody></table></div>}
        <section className="rd-activity"><div className="rd-section-head"><div><h2>Recent activity</h2><span>{c.eventsOk ? "Read from Portaldot V3" : "Event history unavailable"}</span></div><button className="btn sm" onClick={() => c.setTab("history")}>Full history</button></div>{c.events.length ? <ol>{c.events.slice(0, 5).map((e) => <li key={`${e.hash}-${e.logIndex}`}><span>{e.text}</span><small>Block {e.block.toString()}</small></li>)}</ol> : <p className="muted">{c.eventsLoading ? "Reading on-chain activity…" : "No activity in the scanned range."}</p>}</section>
      </section>
      <aside className="rd-context" aria-label="Receipt context"><div className="rd-context-head"><span>Context</span><span>Portaldot V3 · on-chain</span></div>{selected ? <><span className="rd-context-id">RECEIPT #{selected.id}</span><h2>{selected.note || KINDS[selected.kind]}</h2><div className="rd-current"><span>Current state</span><SettleBadge r={selected} terms={false} /><strong>{statusFor(selected)}</strong></div><dl><div><dt>Face value</dt><dd>{faceValueOf(selected) ? `${fmt(faceValueOf(selected), selected.settle.decimals)} ${selected.settle.symbol}` : "Not set"}</dd></div><div><dt>Available shares</dt><dd>{selected.fraction ? units(selected.supply) : "—"}</dd></div><div><dt>Market</dt><dd>{open.some((l) => l.receiptId === selected.id) ? "Listed" : "No open listing"}</dd></div></dl><p className="rd-next-label">Next action</p><button className="btn block" onClick={() => { const next = nextFor(selected); c.setTab(next.tab, next.tab === "trade" && "sell" in next.params ? { sell: String(selected.id) } : { id: String(selected.id) }); }}>{nextFor(selected).label} <Ico n="arrow" /></button><button className="btn block" onClick={() => c.setTab("verify", { id: String(selected.id) })}>Verify receipt</button></> : <><h2>Start with a receipt</h2><p className="muted">Select an active receipt to see its current state and the next action.</p></>}
        <div className="rd-context-footer"><span>{pending} {pending === 1 ? "receipt needs" : "receipts need"} review</span><button onClick={() => c.setTab("portfolio")}>Open portfolio <Ico n="arrow" /></button></div>
      </aside>
    </div>
  </div>;
}
