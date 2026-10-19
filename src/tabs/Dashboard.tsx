import { fmt, KINDS, units } from "../lib/chain";
import { Empty, Ico } from "../AppUi";
import type { Ctx } from "./ctx";
import { N, SettleBadge } from "./shared";

export function Dashboard({ c }: { c: Ctx }) {
  const open = c.listings.filter((l) => l.remaining > 0n);
  const settled = c.rows.filter((r) => r.settle.settled).reduce((sum, r) => sum + r.settle.amount, 0n);
  const mine = c.rows.filter((r) => r.depositor === c.account || r.owner === c.account);

  return (
    <div className="dashboard-page">
      <section className="dash-wallet">
        <span className="dash-wallet-icon"><Ico n="wallet" size={20} /></span>
        <div className="dash-wallet-copy">
          <small>Your wallet</small>
          <b>{c.account ? `${c.account.slice(0, 6)}…${c.account.slice(-4)}` : "Connect to see your PotKit activity"}</b>
        </div>
        {c.account && <div className="dash-wallet-balance"><small>Available balance</small><b>{c.usdBal || "Reading balance…"}</b></div>}
        {!c.account && <button className="btn primary" onClick={c.connect}>Connect wallet</button>}
        {c.account && c.chainOk === false && <span className="dash-wrong-network">Wrong network · switch from the wallet menu</span>}
      </section>

      <section className="dash-kpis" aria-label="PotKit overview">
        <article className={`dash-kpi ${!c.addrs ? "is-unconfigured" : ""}`}><span>Receipts on this vault</span><b><N l={c.loading && Boolean(c.addrs)}>{c.addrs ? c.total : "—"}</N></b><small>{c.addrs ? "Read from Portaldot V3" : "Configure PotKit to load"}</small></article>
        <article className={`dash-kpi ${!c.addrs ? "is-unconfigured" : ""}`}><span>Open listings</span><b><N l={c.loading && Boolean(c.addrs)}>{c.addrs ? open.length : "—"}</N></b><small>{c.addrs ? "Shares available to buy" : "Configure PotKit to load"}</small></article>
        <article className={`dash-kpi ${!c.addrs ? "is-unconfigured" : ""}`}><span>Settled volume</span><b className="dash-value"><N l={c.loading && Boolean(c.addrs)}>{c.addrs ? `${fmt(settled, 18)} tPOT` : "—"}</N></b><small>{c.addrs ? "Paid into PotKit" : "Configure PotKit to load"}</small></article>
        <article className={`dash-kpi ${!c.addrs ? "is-unconfigured" : ""}`}><span>Your receipts</span><b><N l={c.loading && Boolean(c.addrs)}>{c.addrs ? (c.account ? mine.length : "—") : "—"}</N></b><small>{!c.addrs ? "Configure PotKit to load" : c.account ? "Issued or held by this wallet" : "Connect wallet to personalize"}</small></article>
      </section>

      <div className="dash-main-grid">
        <section className="card dash-market">
          <header className="dash-section-head"><div><p className="kicker">Marketplace · all wallets</p><h2>Open listings</h2></div><button className="btn sm" onClick={() => c.setTab("trade")}>View market <Ico n="arrow" /></button></header>
          {!c.addrs ? <Empty icon="⇄" title="PotKit is not configured" body="Deploy the contract to start issuing receipts, or open a judge link to inspect a demo deployment."><button className="btn sm primary" onClick={() => c.setTab("issue")}>Set up PotKit</button></Empty>
            : c.loading ? <p className="muted" role="status">Reading the chain…</p>
            : !open.length ? <Empty icon="⇄" title="No open listings yet" body="Once shares are listed, the market summary will appear here."><button className="btn sm" onClick={() => c.setTab("explore")}>Explore receipts</button></Empty>
            : <div className="dash-listings">{open.slice(0, 4).map((l) => {
              const r = c.rows.find((item) => item.id === l.receiptId);
              if (!r) return null;
              return <button className="dash-listing" key={l.lid} onClick={() => c.setTab("trade")}>
                <span className="dash-listing-id">#{r.id}</span><span className="dash-listing-main"><b>{r.note || KINDS[r.kind]}</b><small>{KINDS[r.kind]} · {units(l.remaining)} shares available</small></span>
                <span className="dash-listing-status"><SettleBadge r={r} terms={false} /></span><b className="dash-listing-price">{fmt(l.price, 18)} <small>tPOT / share</small></b><Ico n="arrow" />
              </button>;
            })}</div>}
        </section>

        <aside className="card dash-actions">
          <p className="kicker">Workspace</p><h2>Pick up where you left off</h2>
          <button className="dash-action" onClick={() => c.setTab("issue")}><span><Ico n="mint" /></span><b>Issue a receipt</b><small>Record an invoice and set terms</small><Ico n="arrow" /></button>
          <button className="dash-action" onClick={() => c.setTab("trade")}><span><Ico n="cart" /></span><b>Trade shares</b><small>Browse listings or sell your shares</small><Ico n="arrow" /></button>
          <button className="dash-action" onClick={() => c.setTab("verify")}><span><Ico n="shield" /></span><b>Verify a receipt</b><small>Check custody, terms and payment state</small><Ico n="arrow" /></button>
          <div className="dash-network"><i className={c.chainOk ? "ok" : ""} />Portaldot V3 Testnet <small>Chain {"420420777"}</small></div>
        </aside>

        <section className="card dash-activity">
          <header className="dash-section-head"><div><p className="kicker">On-chain feed</p><h2>Recent activity</h2></div><button className="btn sm" onClick={() => c.setTab("history")}>Full history <Ico n="arrow" /></button></header>
          {!c.events.length ? <p className="muted">{c.eventsLoading ? "Reading recent events…" : c.eventsOk ? "No recent activity in the scanned range." : "Event history is unavailable from this RPC."}</p>
            : <ol className="dash-events">{c.events.slice(0, 5).map((e) => <li key={`${e.hash}-${e.logIndex}`}><span><Ico n={e.kind === "settle" ? "settle" : e.kind === "buy" ? "cart" : e.kind === "mint" ? "mint" : "activity"} size={15} /></span><div><b>{e.text}</b><small>Block {e.block.toString()}</small></div><button aria-label={`Verify receipt ${e.id}`} onClick={() => c.setTab("verify", { id: String(e.id) })}>#{e.id}</button></li>)}</ol>}
        </section>
      </div>
      <p className="dash-footnote">All figures are read live from the selected PotKit deployment. tPOT is the Portaldot V3 testnet token.</p>
    </div>
  );
}
