import { useState } from "react";
import type { Address } from "viem";
import { cancelListing, claim, fmt, KINDS, redeem, transferUnits, units, type Row } from "../lib/chain";
import { Empty, Ico, toast } from "../AppUi";
import { faceShare, type Ctx } from "./ctx";
import { day, download, SettleBadge, Term, txBlock, Why } from "./shared";
import { toCsv, toIcs } from "./insights";
import { SkelRows } from "./Explore";
import { readReceiptHistory } from "./receipt-history";

/** Portfolio grouped like a brokerage account: balances first, then what can be claimed, the shares held,
    open listings and the receipts this wallet issued. Every row states its next step. */
export function Portfolio({ c }: { c: Ctx }) {
  const [more, setMore] = useState<number | null>(null);
  const [receiptScope, setReceiptScope] = useState<"active" | "history">("active");
  const [to, setTo] = useState(""); const [amt, setAmt] = useState("100");
  const dis = Boolean(c.busy) || c.gated;
  const why = txBlock(c);
  const holdings = c.rows.filter((r) => r.fraction && (c.held.get(r.id) ?? 0n) > 0n);
  const receipts = c.rows.filter((r) => r.owner.toLowerCase() === c.account.toLowerCase() || r.depositor.toLowerCase() === c.account.toLowerCase());
  const receiptHistory = readReceiptHistory(c.events);
  const myListings = c.listings.filter((l) => l.seller.toLowerCase() === c.account.toLowerCase() && l.remaining > 0n);
  const claimable = c.rows.filter((r) => r.settle.settled && (c.claims.get(r.id) ?? 0n) > 0n);
  const dec = 18; // native tPOT
  const valueAt = (id: number, bal: bigint) => { const r = c.rows.find((x) => x.id === id); return r ? (faceShare(r) * bal) / 10n ** 18n : 0n; };
  // cost basis from on-chain Bought events where you were the buyer
  const buys = new Map<number, { shares: bigint; cost: bigint }>();
  for (const e of c.events) if (e.kind === "buy" && e.actors[0]?.toLowerCase() === c.account?.toLowerCase()) { const b = buys.get(e.id) ?? { shares: 0n, cost: 0n }; buys.set(e.id, { shares: b.shares + (e.amount ?? 0n), cost: b.cost + (e.value ?? 0n) }); }
  const listedOf = (id: number) => myListings.filter((l) => l.receiptId === id).reduce((s, l) => s + l.remaining, 0n);
  const totalValue = holdings.reduce((s, r) => s + valueAt(r.id, c.held.get(r.id) ?? 0n), 0n) + myListings.reduce((s, l) => { const r = c.rows.find((x) => x.id === l.receiptId); return r ? s + (faceShare(r) * l.remaining) / 10n ** 18n : s; }, 0n);
  const claimTotal = claimable.reduce((s, r) => s + (c.claims.get(r.id) ?? 0n), 0n);
  const isRedeemed = (id: number) => receiptHistory.get(id)?.redeemed ?? false;
  const activeReceipts = receipts.filter((r) => !isRedeemed(r.id));
  const historyReceipts = receipts.filter((r) => isRedeemed(r.id));
  const visibleReceipts = receiptScope === "active" ? activeReceipts : historyReceipts;
  const claimBtn = (r: Row, primary = true) => (
    <button className={`btn sm ${primary ? "primary" : ""}`} disabled={dis} onClick={() => void c.run(`claim${r.id}`, async () => {
      const h = await claim(c.ready(), c.addrs!.vault, r.id); c.note("Payout claimed", `#${r.id} · ${fmt(c.claims.get(r.id) ?? 0n, r.settle.decimals)} ${r.settle.symbol}`, h);
    })}>{c.busy === `claim${r.id}` ? "Claiming…" : `Claim ${fmt(c.claims.get(r.id) ?? 0n, r.settle.decimals)} tPOT`}</button>
  );
  // one claim per receipt, in order; a rejected signature stops the rest, confirmed claims stay done
  const claimAll = () => void c.run("claim-all", async () => {
    let done = 0;
    for (const r of claimable) {
      try { const h = await claim(c.ready(), c.addrs!.vault, r.id); done++; c.note("Payout claimed", `#${r.id} · ${fmt(c.claims.get(r.id) ?? 0n, r.settle.decimals)} ${r.settle.symbol}`, h); }
      catch (e) { if (!done) throw e; toast({ kind: "err", title: `Stopped after ${done} of ${claimable.length} claims`, detail: "The confirmed claims are done. Claim the rest when ready." }); return; }
    }
  });
  const exportCsv = () => {
    const pos = holdings.map((r) => { const b = buys.get(r.id); return ["share position", r.id, r.note, KINDS[r.kind], r.status, units(c.held.get(r.id) ?? 0n), fmt(valueAt(r.id, c.held.get(r.id) ?? 0n), dec), b ? fmt(b.cost, dec) : "", r.dueDate ? new Date(r.dueDate * 1000).toISOString().slice(0, 10) : "", fmt(c.claims.get(r.id) ?? 0n, dec)]; });
    const iss = receipts.map((r) => ["issued receipt", r.id, r.note, KINDS[r.kind], isRedeemed(r.id) ? "Redeemed" : r.status, r.fraction ? units(r.supply) : "", r.settle.faceValue > 0n ? fmt(r.settle.faceValue, dec) : "", "", r.dueDate ? new Date(r.dueDate * 1000).toISOString().slice(0, 10) : "", ""]);
    download(`potkit-portfolio-${c.account.slice(0, 8)}.csv`, toCsv(["type", "receipt", "note", "kind", "status", "shares", "face value tPOT", "bought for tPOT", "due date", "claimable tPOT"], [...pos, ...iss]), "text/csv");
  };
  const dated = [...new Map([...holdings, ...activeReceipts].filter((r) => r.dueDate && !r.settle.settled).map((r) => [r.id, r])).values()];
  const exportIcs = () => download("potkit-due-dates.ics", toIcs(dated.map((r) => ({ uid: `potkit-${c.addrs?.vault}-${r.id}@potkit`, due: r.dueDate, title: `PotKit #${r.id} due: ${r.note || KINDS[r.kind]}`, detail: `Face value ${fmt(r.settle.faceValue, dec)} tPOT. Check status on PotKit before acting; payment is not guaranteed.` }))), "text/calendar");
  const head = (
    <header className="pf2-head">
      <div><h1>Portfolio</h1><p className="muted">Balances, payouts and positions for this wallet, read from the chain.</p></div>
      {c.account && !c.loading && (holdings.length > 0 || receipts.length > 0) && <div className="pf2-tools"><button className="btn sm" onClick={exportCsv}><Ico n="copy" /> Export CSV</button><button className="btn sm" disabled={!dated.length} onClick={exportIcs}><Ico n="terms" /> Add due dates to calendar</button>{!dated.length && <small className="why">No open receipt with a due date.</small>}</div>}
    </header>
  );

  if (!c.account) return <div className="portfolio">{head}<Empty icon="◉" title="Connect a wallet to view your portfolio" body="Your receipts, share positions, listings and claimable payouts are tied to the connected wallet."><button className="btn primary" onClick={c.connect}>Connect wallet</button></Empty></div>;
  if (c.loading) return <div className="portfolio">{head}<section className="card" aria-busy="true"><SkelRows n={4} cols={5} /></section></div>;
  if (!holdings.length && !receipts.length && !myListings.length && !claimable.length)
    return <div className="portfolio">{head}<Empty icon="▤" title="Nothing in your portfolio yet" body="Issue an invoice and lock it into shares, or buy discounted shares on Trade. Positions and payouts appear here, read from the chain."><div className="row"><button className="btn sm primary" onClick={() => c.setTab("trade")}>Browse Trade</button><button className="btn sm" onClick={() => c.setTab("issue")}>Issue an invoice</button></div></Empty></div>;

  const holdingStep = (r: Row) => {
    const cl = c.claims.get(r.id) ?? 0n;
    if (r.settle.settled && cl > 0n) return { text: "Paid — claim your part", act: claimBtn(r, false) };
    if (r.settle.settled) return { text: "Paid and claimed", act: null };
    if (r.status === "Overdue") return { text: "Past due, unpaid. Wait for settlement or sell.", act: <button className="btn sm" onClick={() => c.setTab("trade", { sell: String(r.id) })}>Sell shares</button> };
    return { text: "Waiting for the debtor to pay", act: <button className="btn sm" onClick={() => c.setTab("trade", { sell: String(r.id) })}>Sell shares</button> };
  };
  const receiptStep = (r: Row) => {
    if (isRedeemed(r.id)) return { text: "Lifecycle complete", act: <button className="btn sm" onClick={() => c.setTab("verify", { id: String(r.id) })}>Verify</button> };
    if (!r.fraction) return { text: "Minted — add terms to issue shares", act: <button className="btn sm" onClick={() => c.setTab("issue", { id: String(r.id) })}>Add terms</button> };
    if (r.settle.settled) return { text: "Paid — holders can claim", act: <button className="btn sm" onClick={() => c.setTab("verify", { id: String(r.id) })}>Verify</button> };
    return { text: listedOf(r.id) > 0n ? "Shares on the market" : "Locked — list shares to raise tPOT", act: <button className="btn sm" onClick={() => c.setTab("trade", { sell: String(r.id) })}>{listedOf(r.id) > 0n ? "Manage listing" : "List shares"}</button> };
  };

  return (
    <div className="portfolio pf2">
      {head}
      <section className="pf2-balances" aria-label="Balances">
        <div><span>Wallet balance</span><strong title={c.usdBal || undefined}>{c.native === null ? (c.nativeLoading ? "…" : "—") : `${(Number(c.native) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 4 })} tPOT`}</strong><small>Native tPOT for buying and gas</small></div>
        <div className={claimTotal > 0n ? "is-claim" : ""}><span><Term k="claim">Claimable now</Term></span><strong>{fmt(claimTotal, dec)} tPOT</strong><small>{claimable.length ? `${claimable.length} settled receipt${claimable.length === 1 ? "" : "s"}` : "No payouts waiting"}</small></div>
        <div><span><Term k="share">Shares held</Term></span><strong><span className="num">{holdings.length}</span> position{holdings.length === 1 ? "" : "s"}</strong><small>{fmt(totalValue, dec)} tPOT at face value · estimate, incl. listed</small></div>
        <div><span><Term k="receipt">Receipts issued</Term></span><strong><span className="num">{activeReceipts.length}</span> active</strong><small>{historyReceipts.length} completed</small></div>
      </section>

      {claimable.length > 0 && (
        <section className="pf2-sec pf2-claim" aria-labelledby="pf-claim">
          <div className="pf2-sec-head"><div><h2 id="pf-claim">Ready to claim</h2><p className="muted">These receipts are settled. Claiming sends your pro-rata payout in tPOT and burns those shares.</p></div>{claimable.length > 1 && <div><button className="btn sm primary" disabled={dis} onClick={claimAll}>{c.busy === "claim-all" ? "Claiming…" : `Claim all · ${fmt(claimTotal, dec)} tPOT`}</button><small className="why">{claimable.length} separate wallet transactions, one per receipt.</small></div>}</div>
          <div className="tscroll"><table className="rtable"><thead><tr><th scope="col">Receipt</th><th scope="col" className="num">Your shares</th><th scope="col" className="num">Your payout</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead><tbody>
            {claimable.map((r) => <tr key={r.id}><td data-label="Receipt"><b>#{r.id} · {r.note || KINDS[r.kind]}</b><small className="muted">Settled · {fmt(r.settle.amount, r.settle.decimals)} tPOT paid</small></td><td data-label="Your shares" className="num">{units(c.held.get(r.id) ?? 0n)}</td><td data-label="Your payout" className="num"><b className="pos">{fmt(c.claims.get(r.id) ?? 0n, r.settle.decimals)} tPOT</b></td><td className="acts">{claimBtn(r)}<Why text={why} /></td></tr>)}
          </tbody></table></div>
        </section>
      )}

      <section className="pf2-sec" aria-labelledby="pf-shares">
        <div className="pf2-sec-head"><div><h2 id="pf-shares">Shares you hold</h2><p className="muted">Face value is the most each share can pay out if the invoice is paid in full. It is not a market price.</p></div><button className="btn sm" onClick={() => void c.refresh()}>Refresh</button></div>
        {!holdings.length ? <p className="pf2-none">You hold no shares. <button className="btn sm" onClick={() => c.setTab("trade")}>Browse Trade</button></p> : <div className="tscroll"><table className="rtable">
          <thead><tr><th scope="col">Receipt</th><th scope="col">Status</th><th scope="col" className="num">Your shares</th><th scope="col" className="num">Face-value estimate</th><th scope="col" className="num">Bought for</th><th scope="col">Next step</th><th scope="col"><span className="sr-only">More</span></th></tr></thead>
          <tbody>
            {holdings.map((r) => {
              const bal = c.held.get(r.id) ?? 0n; const b = buys.get(r.id); const v = valueAt(r.id, bal); const step = holdingStep(r);
              return (
                <tr key={r.id}>
                  <td data-label="Receipt"><b>#{r.id} · {r.note || KINDS[r.kind]}</b><small className="muted">{KINDS[r.kind]}{r.dueDate ? ` · due ${day(r.dueDate)}` : ""}</small></td>
                  <td data-label="Status"><div className="tags"><SettleBadge r={r} terms={false} /></div></td>
                  <td data-label="Your shares" className="num"><b>{units(bal)}</b><small className="muted"> {r.supply > 0n ? ((Number((bal * 10000n) / r.supply)) / 100).toFixed(1) : 0}% of {units(r.supply)}</small>{listedOf(r.id) > 0n && <small className="muted">+{units(listedOf(r.id))} listed</small>}</td>
                  <td data-label="Face-value estimate" className="num">{v ? `${fmt(v, dec)} tPOT` : "—"}</td>
                  <td data-label="Bought for" className="num">{b ? `${fmt(b.cost, dec)} tPOT` : <span className="muted">Issued to you</span>}</td>
                  <td data-label="Next step"><span className="pf2-step">{step.text}</span></td>
                  <td className="acts"><div className="row">{step.act}<button className="btn sm" aria-expanded={more === r.id} onClick={() => setMore(more === r.id ? null : r.id)}>More</button></div>
                    {dis && r.settle.settled && (c.claims.get(r.id) ?? 0n) > 0n && <Why text={why} />}
                    {more === r.id && !r.settle.settled && (
                      <div className="pf2-more">
                        <label htmlFor={`to${r.id}`}>Send shares to</label>
                        <input id={`to${r.id}`} placeholder="0x recipient" value={to} onChange={(e) => setTo(e.target.value)} />
                        <label htmlFor={`amt${r.id}`}>Shares</label>
                        <input id={`amt${r.id}`} className="w-num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
                        <button className="btn sm" disabled={dis} onClick={() => void c.run(`send${r.id}`, async () => {
                          const h = await transferUnits(c.ready(), r.fraction as Address, to.trim(), amt.trim()); c.note("Shares sent", `${amt} KIT${r.id} → ${to.slice(0, 8)}…`, h);
                        })}><Ico n="send" /> Send</button>
                        {bal === r.supply && bal > 0n ? <button className="btn sm" disabled={dis} onClick={() => void c.run(`red${r.id}`, async () => { const h = await redeem(c.ready(), c.addrs!.vault, r.id); c.note("Redeemed", `#${r.id} back to you`, h); })}>Redeem NFT</button> : <small className="muted">Redeeming the receipt needs every share ({units(r.supply)}).</small>}
                        <Why text={why} />
                      </div>
                    )}
                    {more === r.id && r.settle.settled && <p className="muted small">Settled shares can only be claimed.</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>}
      </section>

      {myListings.length > 0 && (
        <section className="pf2-sec" aria-labelledby="pf-listings">
          <div className="pf2-sec-head"><div><h2 id="pf-listings">Your open listings</h2><p className="muted">Shares in escrow on the market. Cancel to get the remaining shares back.</p></div></div>
          <div className="tscroll"><table className="rtable"><thead><tr><th scope="col">Receipt</th><th scope="col" className="num">Remaining</th><th scope="col" className="num">Price / share</th><th scope="col" className="num">Asking total</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead><tbody>
            {myListings.map((l) => { const r = c.rows.find((x) => x.id === l.receiptId); return (
              <tr key={l.lid}><td data-label="Receipt"><b>#{l.receiptId} · {r?.note}</b><small className="muted">Listing {l.lid}</small></td><td data-label="Remaining" className="num">{units(l.remaining)}</td><td data-label="Price / share" className="num">{fmt(l.price, 18)} tPOT</td><td data-label="Asking total" className="num">{fmt((l.price * l.remaining) / 10n ** 18n, 18)} tPOT</td>
                <td className="acts"><button className="btn sm" disabled={dis} onClick={() => void c.run(`cancel${l.lid}`, async () => { const h = await cancelListing(c.ready(), c.market as Address, l.lid); c.note("Listing cancelled", `#${l.lid}`, h); })}>{c.busy === `cancel${l.lid}` ? "Cancelling…" : "Cancel listing"}</button><Why text={why} /></td></tr>
            ); })}
          </tbody></table></div>
        </section>
      )}

      <section className="pf2-sec" aria-labelledby="pf-receipts">
        <div className="pf2-sec-head"><div><h2 id="pf-receipts">Receipts you issued</h2><p className="muted">Issuer-provided records. PotKit does not verify the invoices behind them.</p></div>
          <div className="seg-tabs" role="group" aria-label="Receipt status">{([["active", "Active", activeReceipts.length], ["history", "Completed", historyReceipts.length]] as const).map(([k, label, n]) => <button key={k} type="button" className={receiptScope === k ? "on" : ""} aria-pressed={receiptScope === k} onClick={() => setReceiptScope(k)}>{label}<span>{n}</span></button>)}</div></div>
        {!visibleReceipts.length ? <p className="pf2-none">{receiptScope === "active" ? "No active receipts." : "No completed receipts yet."} {receiptScope === "active" && <button className="btn sm" onClick={() => c.setTab("issue")}>Issue a receipt</button>}</p> : <div className="tscroll"><table className="rtable">
          <thead><tr><th scope="col">Receipt</th><th scope="col">Status</th><th scope="col" className="num">Face value</th><th scope="col">Due</th><th scope="col" className="num">Shares</th><th scope="col">Next step</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
          <tbody>
            {visibleReceipts.map((r) => {
              const h = receiptHistory.get(r.id); const face = r.settle.faceValue > 0n ? r.settle.faceValue : (h?.terms?.value ?? 0n); const due = r.dueDate || h?.terms?.dueDate || 0;
              const supply = r.supply > 0n ? r.supply : (h?.lock?.amount ?? 0n) * 10n ** 18n; const step = receiptStep(r);
              return <tr key={r.id}><td data-label="Receipt"><b>#{r.id} · {r.note || KINDS[r.kind]}</b><small className="muted">{KINDS[r.kind]} · {r.owner.toLowerCase() === c.account.toLowerCase() ? "in your wallet" : "held by PotKit"}</small></td>
                <td data-label="Status"><div className="tags">{isRedeemed(r.id) ? <span className="tag paid">Redeemed</span> : <SettleBadge r={r} terms={false} />}</div></td>
                <td data-label="Face value" className="num">{face ? `${fmt(face, r.settle.decimals)} tPOT` : "—"}</td>
                <td data-label="Due">{due ? day(due) : "—"}</td>
                <td data-label="Shares" className="num">{supply > 0n ? units(supply) : "—"}</td>
                <td data-label="Next step"><span className="pf2-step">{step.text}</span></td>
                <td className="acts">{step.act}</td></tr>;
            })}
          </tbody>
        </table></div>}
      </section>
    </div>
  );
}
