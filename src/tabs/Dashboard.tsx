import type { ReactNode } from "react";
import { fmt, KINDS, units } from "../lib/chain";
import { Empty, Ico } from "../AppUi";
import type { Ctx } from "./ctx";
import { N, SettleBadge } from "./shared";

export function Dashboard({ c }: { c: Ctx }) {
  const open = c.listings.filter((l) => l.remaining > 0n);
  const settleEvents = c.events.filter((e) => e.kind === "settle");
  const settled = settleEvents.reduce((sum, e) => sum + (e.value ?? 0n), 0n);
  // Redeem can clear the live settlement terms; the lock event is the durable source
  // for the original face value and must keep redeemed receipts in the dashboard.
  const eventFaceValues = new Map<number, bigint>();
  for (const e of c.events) if (e.kind === "terms" && (e.value ?? 0n) > 0n && !eventFaceValues.has(e.id)) eventFaceValues.set(e.id, e.value!);
  const faceValueOf = (r: (typeof c.rows)[number]) => r.settle.faceValue > 0n ? r.settle.faceValue : eventFaceValues.get(r.id) ?? 0n;
  const faceRows = c.rows.filter((r) => faceValueOf(r) > 0n);
  const faceValue = faceRows.reduce((sum, r) => sum + faceValueOf(r), 0n);
  const redeemed = new Set(c.events.filter((e) => e.kind === "redeem").map((e) => e.id));
  const claimedEvents = c.events.filter((e) => e.kind === "claim");
  const claimed = claimedEvents.reduce((sum, e) => sum + (e.value ?? 0n), 0n);
  const invoiceWord = (count: number) => `${count} invoice${count === 1 ? "" : "s"}`;
  const relativeTime = (timestamp: number) => {
    if (!timestamp) return "";
    const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const roundedBalance = c.native === null ? c.usdBal || "Reading balance…" : `${fmt(((c.native + 5_000_000_000_000_000n) / 10_000_000_000_000_000n) * 10_000_000_000_000_000n, 18)} tPOTv3`;
  const mine = c.account ? c.rows.filter((r) => r.depositor === c.account || r.owner === c.account) : c.rows;
  const stages = [
    { key: "issue", title: "Issue", note: "Receipt minted", color: "violet", rows: mine.filter((r) => !r.fraction && !redeemed.has(r.id)) },
    { key: "lock", title: "Lock & shares", note: "Terms set on-chain", color: "blue", rows: mine.filter((r) => r.fraction && !r.settle.settled && !open.some((l) => l.receiptId === r.id)) },
    { key: "trade", title: "Trade", note: "Shares on market", color: "cyan", rows: mine.filter((r) => open.some((l) => l.receiptId === r.id)) },
    { key: "settle", title: "Settle", note: "Payment received", color: "green", rows: mine.filter((r) => r.settle.settled && !redeemed.has(r.id)) },
    { key: "redeem", title: "Redeem", note: "Receipt returned", color: "gold", rows: mine.filter((r) => redeemed.has(r.id)) },
  ];
  const metric = (label: string, value: ReactNode, hint: string, tone: string) => (
    <article className={`dash-hero-metric tone-${tone}`}><span>{label}</span><b>{value}</b><small>{hint}</small></article>
  );

  return (
    <div className="dashboard-page">
      <section className="dash-overview">
        <div className="dash-overview-copy"><p className="kicker">Overview · {c.addrs ? `${invoiceWord(c.total)} on PotKit` : "Portaldot V3 testnet"}</p><h1>Your invoice book,<br /><span>from issue to redeem.</span></h1><p>Follow every receipt from issuance through settlement, with activity read directly from the chain.</p>
          {!c.account && <button className="btn sm dash-connect" onClick={c.connect}>Connect wallet to personalize <Ico n="arrow" /></button>}
          {c.account && c.chainOk === false && <span className="dash-wrong-network">Wrong network · switch from the wallet menu</span>}
        </div>
        <div className="dash-hero-metrics" aria-label="Protocol overview">
          {metric("Face value", <><N l={(c.loading || c.eventsLoading) && Boolean(c.addrs)}>{c.addrs ? fmt(faceValue, 18) : "—"}</N><i> tPOT</i></>, `Across ${invoiceWord(faceRows.length)}`, "violet")}
          {metric("Settled", <><N l={(c.loading || c.eventsLoading) && Boolean(c.addrs)}>{c.addrs ? fmt(settled, 18) : "—"}</N><i> tPOT</i></>, `Across ${invoiceWord(new Set(settleEvents.map((e) => e.id)).size)}`, "green")}
          {metric("Claimed", <><N l={(c.loading || c.eventsLoading) && Boolean(c.addrs)}>{c.addrs ? fmt(claimed, 18) : "—"}</N><i> tPOT</i></>, claimedEvents.length ? "By share holders" : "No payouts claimed yet", "blue")}
        </div>
      </section>

      <section className="dash-lifecycle" aria-label="Invoice lifecycle">
        <header className="dash-lifecycle-head"><div><p className="kicker">Your workspace</p><h2>Invoice lifecycle</h2></div><span className="dash-live"><i /> Live · Portaldot V3</span></header>
        {!c.addrs ? <Empty icon="⇄" title="PotKit is not configured" body="Open a judge link to inspect a deployment, or set up the contract from Issue."><button className="btn sm primary" onClick={() => c.setTab("issue")}>Set up PotKit</button></Empty>
          : c.loading ? <p className="muted" role="status">Reading invoices from the chain…</p>
          : !mine.length ? <Empty icon="▤" title={c.account ? "No invoices for this wallet yet" : "No receipts on this deployment"} body="Mint a receipt or explore invoices already on this deployment."><button className="btn sm primary" onClick={() => c.setTab("issue")}>Create invoice</button><button className="btn sm" onClick={() => c.setTab("explore")}>Explore invoices</button></Empty>
          : <div className="dash-stage-grid">{stages.map((stage, i) => (
            <section className={`dash-stage tone-${stage.color}`} key={stage.key}>
              <header><span className="dash-stage-index">0{i + 1}</span><div><b>{stage.title}</b><small>{stage.note}</small></div><strong>{stage.rows.length}</strong></header>
              <div className="dash-stage-items">{stage.rows.slice(0, 4).map((r) => {
                const listing = open.find((l) => l.receiptId === r.id);
                return <button className="dash-invoice-mini" key={r.id} onClick={() => c.setTab("verify", { id: String(r.id) })}>
                  <span className="dash-invoice-no">INVOICE #{r.id}</span><b>{r.note || KINDS[r.kind]}</b>
                  <span className="dash-invoice-detail"><span>Face</span><strong>{faceValueOf(r) ? `${fmt(faceValueOf(r), r.settle.decimals)} ${r.settle.symbol}` : "—"}</strong></span>
                  <span className="dash-invoice-state">{stage.key === "redeem" ? <span className="tag dash-redeemed">REDEEMED</span> : <SettleBadge r={r} terms={false} />}{listing && <small>{units(listing.remaining)} shares listed</small>}</span>
                </button>;
              })}{!stage.rows.length && <p className="dash-stage-empty">Nothing here yet</p>}</div>
              {stage.rows.length > 4 && <button className="dash-more" onClick={() => c.setTab(stage.key === "trade" ? "trade" : "portfolio")}>View {stage.rows.length - 4} more →</button>}
            </section>
          ))}</div>}
      </section>

      <section className="dash-bottom-grid">
        <article className="dash-wallet">
          <div className="dash-wallet-head"><span className="dash-wallet-icon"><Ico n="wallet" size={20} /></span><div className="dash-wallet-copy"><small>Wallet</small><b>{c.account ? `${c.account.slice(0, 6)}…${c.account.slice(-4)}` : "Not connected"}</b></div><span className={`dash-wallet-status ${c.account ? "connected" : ""}`}><i />{c.account ? "Connected" : "Read only"}</span></div>
          {c.account ? <div className="dash-wallet-balance"><small>Available balance</small><b>{roundedBalance}</b></div> : <button className="btn primary" onClick={c.connect}>Connect wallet</button>}
          <div className="dash-network"><span><i className={c.chainOk ? "ok" : ""} />Portaldot V3 Testnet</span><small>Chain 420420777</small></div>
          {c.account && <div className="dash-wallet-actions"><button className="btn primary sm" onClick={() => c.setTab("issue")}>＋ Issue invoice</button><button className="btn sm dash-claim-action" onClick={() => c.setTab("portfolio")}>Claim</button></div>}
        </article>
        <section className="card dash-activity"><header className="dash-section-head"><div><p className="kicker">On-chain feed</p><h2>Recent activity</h2></div><button className="btn sm" onClick={() => c.setTab("history")}>Full history <Ico n="arrow" /></button></header>
          {!c.events.length ? <p className="muted">{c.eventsLoading ? "Reading recent events…" : c.eventsOk ? "No recent activity in the scanned range." : "Event history is unavailable from this RPC."}</p>
            : <ol className="dash-events">{c.events.slice(0, 5).map((e) => <li key={`${e.hash}-${e.logIndex}`}><span className={`de-${e.kind}`}><Ico n={e.kind === "settle" ? "settle" : e.kind === "buy" ? "cart" : e.kind === "mint" ? "mint" : e.kind === "claim" ? "claim" : "activity"} size={15} /></span><div><b>{e.text}</b><small>Block {e.block.toString()}</small></div><time dateTime={e.time ? new Date(e.time * 1000).toISOString() : undefined} title={e.time ? new Date(e.time * 1000).toLocaleString() : undefined}>{relativeTime(e.time)}</time></li>)}</ol>}
        </section>
      </section>
      <p className="dash-footnote">All figures are read live from the selected PotKit deployment. tPOT is the Portaldot V3 testnet token.</p>
    </div>
  );
}
