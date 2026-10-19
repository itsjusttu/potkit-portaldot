import { useState } from "react";
import type { Address } from "viem";
import { cancelListing, claim, fmt, KINDS, redeem, transferUnits, units } from "../lib/chain";
import { CountUp, Donut, Empty, Ico, PALETTE } from "../AppUi";
import { faceShare, type Ctx } from "./ctx";
import { PaperReceipt, SettleBadge } from "./shared";
import { SkelRows } from "./Explore";

export function Portfolio({ c }: { c: Ctx }) {
  const [more, setMore] = useState<number | null>(null);
  const [view, setView] = useState<"cards" | "table">(() => (localStorage.getItem("potkit.pfview") as "cards" | "table") || "cards");
  const pickView = (v: "cards" | "table") => { setView(v); localStorage.setItem("potkit.pfview", v); };
  const [to, setTo] = useState(""); const [amt, setAmt] = useState("100");
  const dis = Boolean(c.busy) || c.gated;
  const holdings = c.rows.filter((r) => r.fraction && (c.held.get(r.id) ?? 0n) > 0n);
  const myListings = c.listings.filter((l) => l.seller === c.account && l.remaining > 0n);
  const claimable = c.rows.filter((r) => r.settle.settled && (c.claims.get(r.id) ?? 0n) > 0n);
  const dec = 18; // native tPOT
  // settled, every share claimed, still locked: the depositor takes the receipt NFT back
  const redeemable = c.rows.filter((r) => r.settle.settled && r.fraction && r.supply === 0n && r.depositor === c.account && r.owner === c.addrs?.vault);
  const valueAt = (id: number, bal: bigint) => { const r = c.rows.find((x) => x.id === id)!; return r.settle.settled ? c.claims.get(id) ?? 0n : (faceShare(r) * bal) / 10n ** 18n; };
  // cost basis from on-chain Bought events where you were the buyer
  const buys = new Map<number, { shares: bigint; cost: bigint }>();
  for (const e of c.events) if (e.kind === "buy" && e.actors[0]?.toLowerCase() === c.account?.toLowerCase()) { const b = buys.get(e.id) ?? { shares: 0n, cost: 0n }; buys.set(e.id, { shares: b.shares + (e.amount ?? 0n), cost: b.cost + (e.value ?? 0n) }); }
  const listedOf = (id: number) => myListings.filter((l) => l.receiptId === id).reduce((s, l) => s + l.remaining, 0n);
  const totalValue = holdings.reduce((s, r) => s + valueAt(r.id, c.held.get(r.id) ?? 0n), 0n) + myListings.reduce((s, l) => s + (faceShare(c.rows.find((r) => r.id === l.receiptId)!) * l.remaining) / 10n ** 18n, 0n);
  const claimTotal = claimable.reduce((s, r) => s + (c.claims.get(r.id) ?? 0n), 0n);
  const cost = [...buys.values()].reduce((s, b) => s + b.cost, 0n);
  const boughtValue = [...buys.entries()].reduce((s, [id, b]) => { const r = c.rows.find((x) => x.id === id); return r ? s + (faceShare(r) * b.shares) / 10n ** 18n : s; }, 0n);
  const pnl = boughtValue - cost;
  const parts = holdings.map((r, i) => ({ label: `#${r.id} ${r.note.slice(0, 18)}`, value: Number(valueAt(r.id, c.held.get(r.id) ?? 0n)) || Number((c.held.get(r.id) ?? 0n) / 10n ** 15n) / 1e3, color: PALETTE[i % PALETTE.length] }));

  if (c.loading) return <div className="portfolio"><section className="card"><SkelRows n={4} cols={5} /></section></div>;
  if (!holdings.length && !myListings.length && !claimable.length && !redeemable.length)
    return <Empty icon="▤" title="Nothing in your portfolio yet" body="Issue an invoice and lock it into shares, or buy discounted shares on Trade. Holdings, P&L and payouts appear here, read from the chain."><div className="row"><button className="btn sm primary" onClick={() => c.setTab("trade")}>Browse Trade</button><button className="btn sm" onClick={() => c.setTab("issue")}>Issue an invoice</button></div></Empty>;

  return (
    <div className="portfolio">
      {claimable.length > 0 && (
        <section className="claim-banner" role="status">
          <Ico n="claim" size={22} />
          <div><b>{fmt(claimTotal, dec)} tPOT ready to claim</b><span className="muted">{claimable.length} settled invoice{claimable.length === 1 ? "" : "s"} paid out pro-rata. Claiming burns those shares.</span></div>
          <div className="row">
            {claimable.map((r) => (
              <button key={r.id} className="btn primary sm" disabled={dis} onClick={() => void c.run(`claim${r.id}`, async () => {
                const h = await claim(c.ready(), c.addrs!.vault, r.id); c.note("Payout claimed", `#${r.id} · ${fmt(c.claims.get(r.id) ?? 0n, r.settle.decimals)} ${r.settle.symbol}`, h);
              })}>{c.busy === `claim${r.id}` ? "Claiming…" : `Claim #${r.id} · ${fmt(c.claims.get(r.id) ?? 0n, r.settle.decimals)}`}</button>
            ))}
          </div>
        </section>
      )}
      {redeemable.length > 0 && (
        <section className="claim-banner" role="status">
          <Ico n="check" size={22} />
          <div><b>Paid out in full</b><span className="muted">Every share of {redeemable.map((r) => `#${r.id}`).join(", ")} has been claimed. Redeem to take the receipt NFT back (frees its storage, refunding the deposit).</span></div>
          <div className="row">
            {redeemable.map((r) => (
              <button key={r.id} className="btn sm" disabled={dis} onClick={() => void c.run(`red${r.id}`, async () => {
                const h = await redeem(c.ready(), c.addrs!.vault, r.id); c.note("Redeemed", `#${r.id} back to you`, h);
              })}>{c.busy === `red${r.id}` ? "Redeeming…" : `Redeem #${r.id}`}</button>
            ))}
          </div>
        </section>
      )}

      <section className="pf-top">
        <div className="card pf-alloc">
          <p className="kicker">Allocation · value at settle</p>
          <Donut parts={parts} center={fmt(totalValue, dec)} sub="tPOT" />
        </div>
        <div className="pf-kpis">
          <div className="kpi"><span>Value at settle</span><b className="num"><CountUp v={fmt(totalValue, dec)} /></b><small>tPOT · incl. listed shares</small></div>
          <div className="kpi"><span>Claimable now</span><b className="num"><CountUp v={fmt(claimTotal, dec)} /></b><small>tPOT</small></div>
          <div className="kpi"><span>Cost of bought shares</span><b className="num"><CountUp v={fmt(cost, dec)} /></b><small>tPOT · from buy events</small></div>
          <div className={`kpi ${pnl > 0n ? "pos" : pnl < 0n ? "neg" : ""}`}><span>Unrealized P&amp;L</span><b className="num">{pnl > 0n ? "+" : ""}{fmt(pnl, dec)}</b><small>{cost > 0n ? `${((Number(pnl) / Number(cost)) * 100).toFixed(1)}% on bought shares` : "buy shares on Trade to track P&L"}</small></div>
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Holdings</h2><div className="row"><div className="chips view-toggle" role="group" aria-label="View">{(["cards", "table"] as const).map((v) => <button key={v} className={`chip ${view === v ? "on" : ""}`} aria-pressed={view === v} onClick={() => pickView(v)}>{v === "cards" ? "Receipts" : "Table"}</button>)}</div><button className="btn sm" onClick={() => void c.refresh()}>Refresh</button></div></div>
        {view === "cards" ? (
          <div className="prc-grid">
            {holdings.map((r) => {
              const bal = c.held.get(r.id) ?? 0n; const b = buys.get(r.id); const v = valueAt(r.id, bal); const bv = b ? (faceShare(r) * b.shares) / 10n ** 18n : 0n;
              const cl = c.claims.get(r.id) ?? 0n;
              return (
                <PaperReceipt key={r.id} r={r} amount={v ? `${fmt(v, dec)} tPOT` : "—"}
                  facts={[
                    ["Your shares", units(bal)],
                    ["Face / share", faceShare(r) ? fmt(faceShare(r), r.settle.decimals) : "no terms"],
                    ["Cost basis", b ? fmt(b.cost, dec) : "issued"],
                    ["Unrealized", b ? <span className={bv >= b.cost ? "prc-pos" : "prc-neg"}>{bv >= b.cost ? "+" : ""}{fmt(bv - b.cost, dec)}</span> : "—"],
                  ]}
                  bar={r.supply > 0n ? { label: "Your stake", value: Number((bal * 1000n) / r.supply) / 1000 } : undefined}>
                  {r.settle.settled && cl > 0n ? (
                    <button className="btn primary sm" disabled={dis} onClick={() => void c.run(`claim${r.id}`, async () => {
                      const h = await claim(c.ready(), c.addrs!.vault, r.id); c.note("Payout claimed", `#${r.id} · ${fmt(cl, r.settle.decimals)} ${r.settle.symbol}`, h);
                    })}>{c.busy === `claim${r.id}` ? "Claiming…" : `Claim ${fmt(cl, r.settle.decimals)}`}</button>
                  ) : !r.settle.settled && <button className="btn sm" onClick={() => c.setTab("trade", { sell: String(r.id) })}>Trade</button>}
                  <button className="btn sm" onClick={() => { pickView("table"); setMore(r.id); }}>More</button>
                </PaperReceipt>
              );
            })}
          </div>
        ) : (
        <table className="rtable">
          <thead><tr><th scope="col">Receipt</th><th scope="col">Status</th><th scope="col" className="num">Shares</th><th scope="col" className="num">Face / share</th><th scope="col" className="num">Value at settle</th><th scope="col" className="num">Cost basis</th><th scope="col" className="num">Unrealized</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {holdings.map((r) => {
              const bal = c.held.get(r.id) ?? 0n; const b = buys.get(r.id); const v = valueAt(r.id, bal);
              const bv = b ? (faceShare(r) * b.shares) / 10n ** 18n : 0n;
              return (
                <tr key={r.id}>
                  <td data-label="Receipt"><b>#{r.id} · {KINDS[r.kind]}</b><span className="muted r-note">{r.note}</span></td>
                  <td data-label="Status"><div className="tags"><SettleBadge r={r} terms={false} /></div></td>
                  <td data-label="Shares" className="num"><b>{units(bal)}</b><span className="muted"> · {r.supply > 0n ? ((Number((bal * 10000n) / r.supply)) / 100).toFixed(1) : 0}%</span>{listedOf(r.id) > 0n && <div className="muted small">+{units(listedOf(r.id))} listed</div>}</td>
                  <td data-label="Face / share" className="num">{faceShare(r) ? `${fmt(faceShare(r), r.settle.decimals)}` : <span className="muted">no terms</span>}</td>
                  <td data-label="Value at settle" className="num"><b>{v ? fmt(v, dec) : "—"}</b>{r.settle.settled && <div className="muted small">claimable</div>}</td>
                  <td data-label="Cost basis" className="num">{b ? fmt(b.cost, dec) : <span className="muted">issued</span>}</td>
                  <td data-label="Unrealized" className="num">{b ? <b className={bv >= b.cost ? "pos" : "neg"}>{bv >= b.cost ? "+" : ""}{fmt(bv - b.cost, dec)}<span className="small"> {b.cost > 0n ? `(${((Number(bv - b.cost) / Number(b.cost)) * 100).toFixed(1)}%)` : ""}</span></b> : <span className="muted">—</span>}</td>
                  <td className="acts"><button className="btn sm" aria-expanded={more === r.id} onClick={() => setMore(more === r.id ? null : r.id)}>More</button>
                    {more === r.id && !r.settle.settled && (
                      <div className="row more-row">
                        <input aria-label="Recipient address" placeholder="0x recipient" value={to} onChange={(e) => setTo(e.target.value)} />
                        <input className="w-num" aria-label="Shares to send" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
                        <button className="btn sm" disabled={dis} onClick={() => void c.run(`send${r.id}`, async () => {
                          const h = await transferUnits(c.ready(), r.fraction as Address, to.trim(), amt.trim()); c.note("Shares sent", `${amt} KIT${r.id} → ${to.slice(0, 8)}…`, h);
                        })}><Ico n="send" /> Send</button>
                        {bal === r.supply && bal > 0n && <button className="btn sm" disabled={dis} onClick={() => void c.run(`red${r.id}`, async () => { const h = await redeem(c.ready(), c.addrs!.vault, r.id); c.note("Redeemed", `#${r.id} back to you`, h); })}>Redeem NFT</button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </section>

      {myListings.length > 0 && (
        <section className="card" style={{ marginTop: "1rem" }}>
          <h2>Your open listings</h2>
          {myListings.map((l) => {
            const r = c.rows.find((x) => x.id === l.receiptId);
            return (
              <div className="item item-head" key={l.lid}>
                <div><b>#{l.receiptId} · {r?.note}</b><div className="muted num">{units(l.remaining)} shares @ {fmt(l.price, 18)} tPOT · asking {fmt((l.price * l.remaining) / 10n ** 18n, 18)} tPOT</div></div>
                <button className="btn sm" disabled={dis} onClick={() => void c.run(`cancel${l.lid}`, async () => { const h = await cancelListing(c.ready(), c.market as Address, l.lid); c.note("Listing cancelled", `#${l.lid}`, h); })}>{c.busy === `cancel${l.lid}` ? "Cancelling…" : "Cancel"}</button>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
