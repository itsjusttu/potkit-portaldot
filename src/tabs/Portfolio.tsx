import { useState } from "react";
import type { Address } from "viem";
import { cancelListing, claim, fmt, KINDS, redeem, transferUnits, units } from "../lib/chain";
import { CountUp, Donut, Empty, Ico, PALETTE } from "../AppUi";
import { faceShare, type Ctx } from "./ctx";
import { PaperReceipt, SettleBadge } from "./shared";
import { SkelRows } from "./Explore";
import { readReceiptHistory } from "./receipt-history";

export function Portfolio({ c }: { c: Ctx }) {
  const [more, setMore] = useState<number | null>(null);
  const [pfTab, setPfTab] = useState<"receipts" | "shares" | "claimable">("receipts");
  const [receiptScope, setReceiptScope] = useState<"all" | "active" | "history">("all");
  const [view, setView] = useState<"cards" | "table">(() => (localStorage.getItem("potkit.pfview") as "cards" | "table") || "cards");
  const pickView = (v: "cards" | "table") => { setView(v); localStorage.setItem("potkit.pfview", v); };
  const [to, setTo] = useState(""); const [amt, setAmt] = useState("100");
  const dis = Boolean(c.busy) || c.gated;
  const holdings = c.rows.filter((r) => r.fraction && (c.held.get(r.id) ?? 0n) > 0n);
  const receipts = c.rows.filter((r) => r.owner === c.account || r.depositor === c.account);
  const receiptHistory = readReceiptHistory(c.events);
  const myListings = c.listings.filter((l) => l.seller === c.account && l.remaining > 0n);
  const claimable = c.rows.filter((r) => r.settle.settled && (c.claims.get(r.id) ?? 0n) > 0n);
  const dec = 18; // native tPOT
  // settled, every share claimed, still locked: the depositor takes the receipt NFT back
  const redeemable = c.rows.filter((r) => r.settle.settled && r.fraction && r.supply === 0n && r.depositor === c.account && r.owner === c.addrs?.vault);
  const valueAt = (id: number, bal: bigint) => { const r = c.rows.find((x) => x.id === id)!; return (faceShare(r) * bal) / 10n ** 18n; };
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
  const isRedeemed = (id: number) => receiptHistory.get(id)?.redeemed ?? false;
  const activeReceipts = receipts.filter((r) => !isRedeemed(r.id));
  const historyReceipts = receipts.filter((r) => isRedeemed(r.id));
  const visibleReceipts = receiptScope === "active" ? activeReceipts : receiptScope === "history" ? historyReceipts : receipts;

  if (c.loading) return <div className="portfolio"><section className="card"><SkelRows n={4} cols={5} /></section></div>;
  if (!holdings.length && !receipts.length && !myListings.length && !claimable.length && !redeemable.length)
    return <Empty icon="▤" title="Nothing in your portfolio yet" body="Issue an invoice and lock it into shares, or buy discounted shares on Trade. Holdings, P&L and payouts appear here, read from the chain."><div className="row"><button className="btn sm primary" onClick={() => c.setTab("trade")}>Browse Trade</button><button className="btn sm" onClick={() => c.setTab("issue")}>Issue an invoice</button></div></Empty>;

  return (
    <div className="portfolio">
      {claimable.length > 0 && pfTab === "claimable" && (
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

      <section className="pf-hero">
        <div><p className="kicker">Face-value estimate</p><h2><CountUp v={fmt(totalValue, dec)} /><small> tPOT</small></h2><p className="pf-value-note"><span title="Face value is an estimate from invoice terms, not a market quote or guaranteed payout." aria-label="Face-value estimate information"><Ico n="info" size={13} /></span>Face value of open positions · {fmt(claimTotal, dec)} tPOT claimable</p></div>
        <div className="pf-hero-metrics"><div><span>Receipts</span><b>{receipts.length}</b></div><div><span>Share positions</span><b>{holdings.length}</b></div><div className={claimable.length ? "claim" : ""}><span>Claimable</span><b>{fmt(claimTotal, dec)} <small>tPOT</small></b></div></div>
      </section>
      <nav className="pf-tabs" aria-label="Portfolio sections">
        {([["receipts", "Receipts", receipts.length], ["shares", "Shares", holdings.length], ["claimable", "Claimable", claimable.length]] as const).map(([key, label, count]) => <button key={key} type="button" className={`${pfTab === key ? "on" : ""} ${key === "claimable" && claimable.length ? "has-claim" : ""}`} aria-current={pfTab === key ? "page" : undefined} onClick={() => setPfTab(key)}>{label}<span>{count}</span></button>)}
      </nav>

      {pfTab === "receipts" && <section className="pf-receipts-view" aria-label="Receipt NFTs">
        {!receipts.length ? <Empty icon="▤" title="No receipts in this wallet" body="Mint an invoice receipt or connect the wallet that issued it."><button className="btn primary" onClick={() => c.setTab("issue")}>Issue a receipt</button></Empty> : <>
          <div className="pf-receipt-filter" role="group" aria-label="Receipt status">
            {([["all", "All", receipts.length], ["active", "Active", activeReceipts.length], ["history", "History", historyReceipts.length]] as const).map(([key, label, count]) => <button key={key} type="button" className={receiptScope === key ? "on" : ""} aria-pressed={receiptScope === key} onClick={() => setReceiptScope(key)}>{label}<span>{count}</span></button>)}
          </div>
          {!visibleReceipts.length ? <Empty icon={receiptScope === "history" ? "✓" : "▤"} title={receiptScope === "history" ? "No completed receipts yet" : "No active receipts"} body={receiptScope === "history" ? "Redeemed receipts will appear here as your invoice history." : "Your open receipts will appear here."} /> : <div className="prc-grid">{visibleReceipts.map((r) => {
            const history = receiptHistory.get(r.id);
            const redeemed = history?.redeemed ?? false;
            const face = r.settle.faceValue > 0n ? r.settle.faceValue : (history?.terms?.value ?? 0n);
            const dueDate = r.dueDate || history?.terms?.dueDate || 0;
            const supply = r.supply > 0n ? r.supply : (history?.lock?.amount ?? 0n) * 10n ** 18n;
            const settled = r.settle.settled || Boolean(redeemed && history?.settled);
            const dueLabel = dueDate ? new Date(dueDate * 1000).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "No due date";
            const sharesLabel = settled ? `${units(supply)}/${units(supply)} · settled` : redeemed ? `${units(supply)}/${units(supply)} · redeemed` : r.fraction ? units(r.settle.supply || r.supply) : "Not issued";
            return <PaperReceipt key={r.id} r={r} amount={face ? `${fmt(face, r.settle.decimals)} ${r.settle.symbol}` : "No terms yet"} statusLabel={redeemed ? "REDEEMED" : undefined} statusTone={redeemed ? "redeemed" : undefined} stampLabel={redeemed ? (settled ? "PAID" : "REDEEMED") : undefined} stampTone={redeemed ? "paid" : undefined} className={redeemed ? "prc-complete" : ""} actionsInside facts={[["State", redeemed ? "Redeemed · in your wallet" : r.settle.settled ? "Paid" : r.fraction ? "Locked in PotKit" : "In your wallet"], ["Due", dueLabel], ["Shares", sharesLabel], ["Receipt owner", r.owner === c.account ? "You" : "PotKit vault"]]}>
              <button className="btn sm" onClick={() => c.setTab("verify", { id: String(r.id) })}><Ico n="shield" /> Verify</button>{r.fraction && !r.settle.settled && !redeemed && <button className="btn sm" onClick={() => c.setTab("trade", { sell: String(r.id) })}>Trade shares</button>}
            </PaperReceipt>;
          })}</div>}
        </>}
      </section>}

      {pfTab === "claimable" && !claimable.length && <Empty icon="✓" title="No payouts waiting" body="When an invoice settles, your pro-rata payout will appear here with a one-click claim." />}

      {pfTab === "shares" && <>
      <section className="pf-top">
        <div className="card pf-alloc">
          <p className="kicker">Allocation · face-value basis</p>
          <Donut parts={parts} center={fmt(totalValue, dec)} sub="tPOT" />
        </div>
        <div className="pf-kpis">
          <div className="kpi"><span>Face-value estimate</span><b className="num"><CountUp v={fmt(totalValue, dec)} /></b><small>tPOT · includes listed shares</small></div>
          <div className="kpi"><span>Claimable now</span><b className="num"><CountUp v={fmt(claimTotal, dec)} /></b><small>tPOT</small></div>
          <div className="kpi"><span>Cost of bought shares</span><b className="num"><CountUp v={fmt(cost, dec)} /></b><small>tPOT · from buy events</small></div>
          <div className={`kpi ${pnl > 0n ? "pos" : pnl < 0n ? "neg" : ""}`}><span>Face-value spread vs cost</span><b className="num">{pnl > 0n ? "+" : ""}{fmt(pnl, dec)}</b><small>{cost > 0n ? "Face value minus recorded buy cost; not realized P&L" : "Buy events provide the recorded cost basis"}</small></div>
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Share positions</h2><div className="row"><div className="chips view-toggle" role="group" aria-label="View">{(["cards", "table"] as const).map((v) => <button key={v} className={`chip ${view === v ? "on" : ""}`} aria-pressed={view === v} onClick={() => pickView(v)}>{v === "cards" ? "Cards" : "Table"}</button>)}</div><button className="btn sm" onClick={() => void c.refresh()}>Refresh</button></div></div>
        {view === "cards" ? (
          <div className="prc-grid">
            {holdings.map((r) => {
              const bal = c.held.get(r.id) ?? 0n; const b = buys.get(r.id); const v = valueAt(r.id, bal); const bv = b ? (faceShare(r) * b.shares) / 10n ** 18n : 0n;
              const cl = c.claims.get(r.id) ?? 0n;
              return (
                <PaperReceipt key={r.id} r={r} amount={v ? `${fmt(v, dec)} tPOT face-value estimate` : "—"}
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
          <thead><tr><th scope="col">Receipt</th><th scope="col">Status</th><th scope="col" className="num">Shares</th><th scope="col" className="num">Face / share</th><th scope="col" className="num">Face-value estimate</th><th scope="col" className="num">Cost basis</th><th scope="col" className="num">Spread vs cost</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
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
                  <td data-label="Face-value estimate" className="num"><b>{v ? fmt(v, dec) : "—"}</b>{r.settle.settled && <div className="muted small">not a payout quote</div>}</td>
                  <td data-label="Cost basis" className="num">{b ? fmt(b.cost, dec) : <span className="muted">issued</span>}</td>
                  <td data-label="Spread vs cost" className="num">{b ? <b className={bv >= b.cost ? "pos" : "neg"}>{bv >= b.cost ? "+" : ""}{fmt(bv - b.cost, dec)}<span className="small"> {b.cost > 0n ? `(${((Number(bv - b.cost) / Number(b.cost)) * 100).toFixed(1)}%)` : ""}</span></b> : <span className="muted">—</span>}</td>
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
      </>}

      {pfTab === "shares" && myListings.length > 0 && (
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
