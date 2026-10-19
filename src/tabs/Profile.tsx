import { N } from "./shared";
import { FaucetButton } from "../Faucet";
import { fmt, formatNative, KINDS, mappedAddress, short, units } from "../lib/chain";
import { Addr, CountUp, Ico } from "../AppUi";
import { faceShare, type Ctx } from "./ctx";

export function Profile({ c }: { c: Ctx }) {
  const me = c.account;
  const issued = c.rows.filter((r) => r.depositor === me || (r.owner === me && !r.fraction));
  const holdings = c.rows.filter((r) => r.fraction && (c.held.get(r.id) ?? 0n) > 0n);
  const value = holdings.reduce((s, r) => s + (r.settle.settled ? c.claims.get(r.id) ?? 0n : (faceShare(r) * (c.held.get(r.id) ?? 0n)) / 10n ** 18n), 0n);
  const claim = [...c.claims.values()].reduce((s, v) => s + v, 0n);
  const listings = c.listings.filter((l) => l.seller === me && l.remaining > 0n);
  const recent = c.events.filter((e) => e.actors.includes(me as `0x${string}`)).slice(0, 6);
  return (
    <div className="profile">
      <section className="card id-card">
        <div className="avatar" aria-hidden style={{ background: `conic-gradient(from ${parseInt(me.slice(2, 6), 16) % 360}deg, #7c6cff, #0b1418, #b48ac8, #7c6cff)` }} />
        <div className="id-main">
          <p className="kicker">Wallet identity</p>
          <h2 className="mono id-addr">{me}</h2>
          <div className="row"><Addr a={me} label="Copy" /><span className="tag">{c.walletName}</span><span className={`tag ${c.chainOk ? "paid" : "warn"}`}>{c.chainOk ? "Portaldot V3 Testnet · 420420777" : "Wrong network"}</span>{c.issuer === me && <span className="tag lock">Receipt issuer</span>}</div>
        </div>
      </section>
      <section className="pf-kpis profile-kpis">
        <div className="kpi"><span>Invoices issued</span><b className="num"><N l={c.loading}><CountUp v={issued.length} /></N></b><small><N l={c.loading}>{issued.filter((r) => r.settle.settled).length} settled</N></small></div>
        <div className="kpi"><span>Holdings value at settle</span><b className="num"><N l={c.loading}><CountUp v={fmt(value, 18)} /></N></b><small>tPOT · {holdings.length} receipt{holdings.length === 1 ? "" : "s"}</small></div>
        <div className="kpi"><span>Claimable</span><b className="num"><N l={c.loading}><CountUp v={fmt(claim, 18)} /></N></b><small>tPOT</small></div>
        <div className="kpi"><span>Open listings</span><b className="num"><N l={c.loading}><CountUp v={listings.length} /></N></b><small><N l={c.loading}>{units(listings.reduce((s, l) => s + l.remaining, 0n))} shares</N></small></div>
      </section>
      <div className="two grid" style={{ marginTop: "1rem" }}>
        <section className="card">
          <h2>Balances</h2>
          <table className="rtable bal">
            <tbody>
              <tr><td><b>tPOTv3</b><span className="muted r-note">Native gas token (EVM view)</span></td><td className="num">{c.native === null ? "…" : formatNative(c.native)}</td></tr>
                            {holdings.map((r) => <tr key={r.id}><td><b>KIT{r.id}</b><span className="muted r-note">#{r.id} · {KINDS[r.kind]} · {r.note.slice(0, 28)}</span></td><td className="num">{units(c.held.get(r.id) ?? 0n)}</td></tr>)}
            </tbody>
          </table>
        </section>
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between" }}><h2>Recent activity</h2><button className="btn sm" onClick={() => c.setTab("history")}>Full history <Ico n="arrow" /></button></div>
          {!recent.length ? <p className="muted">No on-chain activity yet.</p> : <ol className="feed-list">{recent.map((e) => <li key={`${e.hash}-${e.logIndex}`}><span className="fi"><Ico n="info" size={14} /></span><div><b>{e.text}</b><span className="muted small mono">{short(e.hash)}</span></div></li>)}</ol>}
        </section>
      </div>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Deployment</h2>
        <p className="muted small">Gas account (mapped): <span className="mono">{mappedAddress(me)}</span></p>
        <FaucetButton account={me} onFunded={() => void c.refresh()} />
        <p className="muted">Contract addresses you deployed or opened are saved in this browser. Reset them to fall back to the deployment baked into this build (.env).</p>
        <button className="btn sm" disabled={Boolean(c.busy)} onClick={() => { if (confirm("Forget the saved PotKit deployment in this browser?")) c.resetDeployment(); }}><Ico n="x" /> Reset saved deployment</button>
      </section>
    </div>
  );
}
