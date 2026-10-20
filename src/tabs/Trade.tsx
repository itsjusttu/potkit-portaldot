import { useMemo, useState } from "react";
import type { Address } from "viem";
import { buyShares, cancelListing, fmt, KINDS, listShares, short, units, type Listing, type Row } from "../lib/chain";
import { FaucetButton } from "../Faucet";
import { Addr, Drawer, Empty, Ico, toast } from "../AppUi";
import { daysTo, faceShare, type Ctx } from "./ctx";
import { day, N, pct, SettleBadge } from "./shared";

type Card = { l: Listing; r: Row; price: number; face: number; discount: number; ret: number; apr: number | null; days: number; progress: number | null };
type Pending = { kind: "list"; row: Row; amount: string; price: string; face: number } | { kind: "buy"; amount: string };
const num = (v: number, d = 6) => v.toLocaleString("en-US", { maximumFractionDigits: d });
export const SkelCards = ({ n = 6 }: { n?: number }) => <div className="lcards" aria-busy="true" aria-label="Loading listings">{Array.from({ length: n }, (_, i) => <div key={i} className="lcard skel-card"><span className="skel w40" /><span className="skel w80 h2" /><span className="skel w60 h3" /><span className="skel w100" /><span className="skel w70" /></div>)}</div>;
/** wei → tPOT (prices and face values are native tPOT, 18 decimals) */
const n6 = (v: bigint, d = 18) => Number(v) / 10 ** d;
const SORTS = { discount: "Best discount", yield: "Highest yield", due: "Due soonest", price: "Lowest price", newest: "Newest" } as const;

export function Trade({ c }: { c: Ctx }) {
  const [status, setStatus] = useState("all");
  const [quick, setQuick] = useState<"all" | "discount" | "due">("all");
  const [sort, setSort] = useState<keyof typeof SORTS>("discount");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [amt, setAmt] = useState("");
  const [sellId, setSellId] = useState(c.param("sell"));
  const [sellAmt, setSellAmt] = useState("40");
  const [sellPrice, setSellPrice] = useState("0.009");
  const dis = Boolean(c.busy) || c.gated;
  const [pending, setPending] = useState<Pending | null>(null);
  /** issue time = mint (or lock) event timestamp; falls back to a 30-day term before the due date */
  const issuedAt = (id: number) => (c.events.find((e) => e.id === id && e.kind === "mint" && e.time) ?? c.events.find((e) => e.id === id && e.kind === "lock" && e.time))?.time ?? 0;

  const cards = useMemo<Card[]>(() => c.listings.filter((l) => l.remaining > 0n).flatMap((l) => {
    const r = c.rows.find((x) => x.id === l.receiptId); if (!r) return [];
    const price = n6(l.price), face = n6(faceShare(r), r.settle.decimals || 18), days = daysTo(r.dueDate);
    const ret = face > 0 && price > 0 ? face / price - 1 : 0;
    let progress: number | null = null;
    if (r.dueDate) {
      const now = Date.now() / 1000;
      let start = issuedAt(r.id);
      if (!start || start >= r.dueDate) start = Math.min(now, r.dueDate) - 30 * 86400;
      progress = Math.max(0, Math.min(1, (now - start) / (r.dueDate - start)));
    }
    return [{ l, r, price, face, discount: face > 0 ? 1 - price / face : 0, ret, apr: face > 0 && days > 1 ? (ret * 365) / days : null, days, progress }];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [c.listings, c.rows, c.events]);
  const shown = cards
    .filter((x) => status === "all" || x.r.status === status)
    .filter((x) => quick === "all" || (quick === "discount" ? x.discount >= .05 : x.days > 0 && x.days <= 30))
    .filter((x) => !q || `${x.r.id} ${x.r.note} ${KINDS[x.r.kind]}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === "discount" ? b.discount - a.discount : sort === "yield" ? b.ret - a.ret : sort === "due" ? (a.r.dueDate || 9e12) - (b.r.dueDate || 9e12) : sort === "price" ? a.price - b.price : b.l.lid - a.l.lid);
  const sel = cards.find((x) => x.l.lid === open);
  const buyN = Number(amt || (sel ? units(sel.l.remaining).replace(/,/g, "") : 0)) || 0;
  const sellable = c.rows.filter((r) => r.fraction && !r.settle.settled && (c.held.get(r.id) ?? 0n) > 0n);
  const sellRow = c.rows.find((r) => r.id === Number(sellId));
  const sellFace = sellRow ? n6(faceShare(sellRow), sellRow.settle.decimals || 18) : 0;
  const highestDiscount = [...cards].sort((a, b) => b.discount - a.discount)[0];
  const endingSoon = cards.filter((x) => x.days > 0).sort((a, b) => a.days - b.days)[0];
  const newest = [...cards].sort((a, b) => b.l.lid - a.l.lid)[0];
  const recentTrades = c.events.filter((e) => e.kind === "buy").slice(0, 3);
  const openListing = (item?: Card) => { if (item) { setOpen(item.l.lid); setAmt(""); setPending(null); } };

  return (
    <div className="trade">
      <section className="trade-intro"><div><p className="kicker">Stage 03 · Portaldot V3</p><h2>Invoice share markets</h2><p>Compare discounts and time to maturity, then inspect the settlement terms before you buy.</p></div><div className="trade-intro-stats"><span><b>{cards.length}</b> open markets</span><span><b>{num(cards.reduce((s, x) => s + x.price * Number(x.l.remaining) / 1e18, 0))}</b> tPOT listed</span></div></section>
      {c.total >= 6 && cards.length > 0 && <section className="trade-highlights" aria-label="Market highlights">
        {[{ id: "discount", title: "Highest discount", badge: "HOT", item: highestDiscount, value: highestDiscount ? pct(highestDiscount.discount) : "—" }, { id: "soon", title: "Ending soon", badge: "SOON", item: endingSoon, value: endingSoon ? `${Math.ceil(endingSoon.days)}d` : "—" }, { id: "newest", title: "Newest", badge: "NEW", item: newest, value: newest ? `#${newest.r.id}` : "—" }].map((h) => (
          <button type="button" key={h.id} className={`trade-highlight hl-${h.id}`} onClick={() => openListing(h.item)} disabled={!h.item}>
            <span className="trade-hl-top"><b>{h.title}</b><i>{h.badge}</i></span>
            <span className="trade-hl-main">{h.item ? h.item.r.note : "No matching listing"}</span>
            <span className="trade-hl-bottom"><small>{h.item ? `Invoice #${h.item.r.id} · ${h.item.price} tPOT / share` : "Listings will appear here"}</small><strong>{h.value}</strong></span>
          </button>
        ))}
      </section>}
      {cards.length > 0 && <div className="trade-bar" role="search">
        <div className="tb-search"><Ico n="search" /><input aria-label="Search listings" placeholder="Search invoice, id or kind" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips" role="group" aria-label="Quick filters">
          {([["all", "All"], ["discount", "Discount > 5%"], ["due", "Due < 30d"]] as const).map(([key, label]) => <button key={key} className={`chip ${quick === key ? "on" : ""}`} aria-pressed={quick === key} onClick={() => setQuick(key)}>{label}</button>)}
        </div>
        <div className="chips trade-status-chips" role="group" aria-label="Filter by status">
          {["all", "Pending", "Due soon", "Overdue"].map((s) => <button key={s} className={`chip ${status === s ? "on" : ""}`} aria-pressed={status === s} onClick={() => setStatus(s)}>{s === "all" ? "Any status" : s}</button>)}
        </div>
        <label className="tb-sort"><span>Sort</span><select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>}

      <div className="trade-grid">
        <section aria-label="Listings">
          {!c.market ? <Empty icon="⇄" title="No contract yet" body="Deploy PotKit from Issue → Set up the contract (the market is built in)." />
            : c.loading ? <SkelCards />
            : !shown.length ? <>
              <Empty icon="⇄" title={cards.length ? "No listings match" : "No open listings"} body={cards.length ? "Try another status filter or clear the search." : "Nobody is selling shares right now. List yours from the panel to get cash today."} />
              {!cards.length && recentTrades.length > 0 && <section className="card trade-recent" aria-label="Recent trades">
                <header><div><p className="kicker">On-chain activity</p><h3>Recent trades</h3></div><span className="trade-recent-live"><i />Verified</span></header>
                <ol>{recentTrades.map((e) => <li key={`${e.hash}-${e.logIndex}`}><span className="trade-recent-icon"><Ico n="cart" size={16} /></span><b>{e.text}</b><small>Block {e.block.toString()}</small></li>)}</ol>
              </section>}
            </>
            : (
              <div className="trade-market-list" role="table" aria-label="Open invoice share markets">
                <div className="trade-row trade-row-head" role="row"><span>Invoice</span><span>Price / share</span><span>Discount</span><span>Units left</span><span>Due</span><span /></div>
                {shown.map((x) => (
                  <div className="trade-row" role="row" key={x.l.lid}>
                    <button type="button" className="trade-row-invoice" onClick={() => openListing(x)} aria-label={`Review ${x.r.note}, invoice ${x.r.id}`}><span className="trade-row-icon"><Ico n="terms" /></span><span><b>{x.r.note}</b><small>INVOICE #{x.r.id} · {KINDS[x.r.kind]}{x.l.seller === c.account ? " · YOUR LISTING" : ""}</small></span></button>
                    <span className="trade-row-price">{num(x.price)} <small>tPOT</small></span>
                    <span className="trade-row-discount">{x.face ? pct(x.discount) : "—"}</span>
                    <span className="trade-row-units">{units(x.l.remaining)}</span>
                    <span className="trade-row-due">{x.r.dueDate ? day(x.r.dueDate) : "No due date"}</span>
                    <button type="button" className="btn sm trade-buy" onClick={() => openListing(x)}>Review</button>
                  </div>
                ))}
              </div>
            )}
        </section>

        <aside className="card sell-panel" id="sell" aria-label="Sell shares">
          <h2><Ico n="tag" /> Sell shares</h2>
          <p className="muted">Get tPOT today. Shares are held in escrow by PotKit until sold or cancelled; buyers pay you directly in the same transaction.</p>
          {!sellable.length ? <div className="trade-sell-empty"><p className="muted">You hold no unsettled shares. Issue an invoice first.</p><button className="btn sm primary" onClick={() => c.setTab("issue")}>Issue invoice <Ico n="arrow" /></button></div> : (
            <>
              <label htmlFor="s-id">Receipt</label>
              <select id="s-id" value={sellId} onChange={(e) => setSellId(e.target.value)}>
                <option value="">Choose…</option>
                {sellable.map((r) => <option key={r.id} value={r.id}>#{r.id} · {r.note.slice(0, 30)} · {units(c.held.get(r.id) ?? 0n)} held</option>)}
              </select>
              <div className="row fields">
                <div><label htmlFor="s-amt">Shares</label><input id="s-amt" inputMode="decimal" value={sellAmt} onChange={(e) => setSellAmt(e.target.value)} /></div>
                <div><label htmlFor="s-p">Price / share</label><input id="s-p" inputMode="decimal" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} /></div>
              </div>
              {sellRow && (
                <dl className="facts compact">
                  <div><dt>You receive</dt><dd className="num">{((Number(sellAmt) || 0) * (Number(sellPrice) || 0)).toLocaleString()} tPOT</dd></div>
                  <div><dt>Face / share</dt><dd className="num">{sellFace ? `${sellFace} tPOT` : "no terms"}</dd></div>
                  <div><dt>Discount offered</dt><dd className="num">{sellFace ? pct(1 - (Number(sellPrice) || 0) / sellFace) : "—"}</dd></div>
                </dl>
              )}
              {sellRow && !(sellRow.settle.faceValue > 0n) && (
                <div className="banner warn-banner" role="alert">
                  <Ico n="info" /> <span><b>No payment terms yet.</b> Shares can only be listed while invoice #{sellRow.id} is locked with terms.</span>
                  <button className="btn sm" onClick={() => c.setTab("issue")}>Open Issue <Ico n="arrow" /></button>
                </div>
              )}
              <button className="btn primary block" disabled={dis || !c.market || !sellRow || !(sellRow.settle.faceValue > 0n) || !sellRow.settle.token} onClick={() => {
                if (!sellRow?.fraction) return;
                if (!/^\d+(\.\d+)?$/.test(sellAmt.trim()) || !/^\d+(\.\d+)?$/.test(sellPrice.trim()) || !(Number(sellAmt) > 0) || !(Number(sellPrice) > 0)) { toast({ kind: "err", title: "Check the form", detail: "Enter a positive number of shares and price." }); return; }
                setPending({ kind: "list", row: sellRow, amount: sellAmt.trim(), price: sellPrice.trim(), face: sellFace });
              }}>{c.busy === "list" ? "Listing…" : "List shares"}</button>
            </>
          )}
        </aside>
      </div>

      <Drawer open={pending?.kind === "list"} onClose={() => setPending(null)} kicker="Confirm listing" title={pending?.kind === "list" ? `List shares of #${pending.row.id}` : ""}>
        {pending?.kind === "list" && (() => {
          const a = Number(pending.amount), p = Number(pending.price), sym = pending.row.settle.symbol || "tPOT";
          const d = pending.face ? 1 - p / pending.face : 0;
          return (
            <>
              <p className="confirm-line"><b>List {num(a)} shares of #{pending.row.id} at {num(p)} {sym}{pending.face ? ` (${pct(d)} ${d >= 0 ? "discount" : "premium"})` : ""}. You receive up to {num(a * p)} {sym}.</b></p>
              <dl className="facts">
                <div><dt>Invoice</dt><dd>{pending.row.note}</dd></div>
                <div><dt>Face / share</dt><dd className="num">{pending.face ? `${num(pending.face)} ${sym}` : "—"}</dd></div>
                <div><dt>Escrow</dt><dd>Shares move into PotKit until sold or cancelled</dd></div>
                <div><dt>Wallet prompts</dt><dd>1 transaction (no approval needed)</dd></div>
              </dl>
              <div className="row confirm-acts">
                <button className="btn" disabled={Boolean(c.busy)} onClick={() => setPending(null)}>Cancel</button>
                <button className="btn primary" disabled={dis} onClick={() => void c.run("list", async () => {
                  const r = pending.row;
                  const h = await listShares(c.ready(), c.market as Address, r.id, r.fraction as Address, pending.price, pending.amount);
                  c.note("Listed", `${pending.amount} KIT${r.id} @ ${pending.price} ${sym}`, h); setPending(null);
                })}>{c.busy === "list" ? "Confirm in wallet…" : "Confirm"}</button>
              </div>
            </>
          );
        })()}
      </Drawer>

      <Drawer open={Boolean(sel)} onClose={() => { setOpen(null); setPending(null); }} kicker={sel ? `// LISTING ${sel.l.lid} //` : ""} title={sel ? `#${sel.r.id} · ${sel.r.note}` : ""}>
        {sel && (
          <>
            <div className="tags"><SettleBadge r={sel.r} /></div>
            <dl className="facts">
              <div><dt>Price</dt><dd className="num">{sel.price} tPOT / share</dd></div>
              <div><dt>Face / share</dt><dd className="num">{sel.face ? `${sel.face} tPOT` : "no terms"}</dd></div>
              <div><dt>Discount</dt><dd className="num pos">{sel.face ? pct(sel.discount) : "—"}</dd></div>
              <div><dt>Implied yield</dt><dd className="num">{sel.face ? pct(sel.ret) : "—"}{sel.apr !== null ? ` · ${pct(sel.apr, 0)} APR` : ""}</dd></div>
              <div><dt>Due</dt><dd>{sel.r.dueDate ? day(sel.r.dueDate) : "—"}</dd></div>
              <div><dt>Available</dt><dd className="num">{units(sel.l.remaining)} of {units(sel.r.supply)}</dd></div>
              <div><dt>Seller</dt><dd>{sel.l.seller === c.account ? "You" : <Addr a={sel.l.seller} />}</dd></div>
              <div><dt>Share token</dt><dd><Addr a={sel.l.fraction} label={`KIT${sel.r.id}`} /></dd></div>
            </dl>
            <p className="market-risk" role="note"><b>Invoice information is issuer-provided.</b> PotKit records custody, terms and payment state on-chain, but does not independently verify the underlying invoice.</p>
            {sel.l.seller === c.account ? (
              <button className="btn block" disabled={dis} onClick={() => void c.run(`cancel${sel.l.lid}`, async () => {
                const h = await cancelListing(c.ready(), c.market as Address, sel.l.lid); c.note("Listing cancelled", `#${sel.l.lid}`, h); setOpen(null);
              })}>{c.busy === `cancel${sel.l.lid}` ? "Cancelling…" : "Cancel listing"}</button>
            ) : sel.r.settle.settled ? <p className="muted">Settled — closed for trading.</p> : (
              <div className="buy-panel">
                <label htmlFor="b-amt">Shares to buy</label>
                <input id="b-amt" inputMode="decimal" placeholder={units(sel.l.remaining)} value={amt} onChange={(e) => setAmt(e.target.value)} />
                <dl className="facts compact">
                  <div><dt>You pay</dt><dd className="num">{(buyN * sel.price).toLocaleString(undefined, { maximumFractionDigits: 6 })} tPOT</dd></div>
                  <div><dt>Payout at settle</dt><dd className="num">{sel.face ? `${(buyN * sel.face).toLocaleString(undefined, { maximumFractionDigits: 6 })} tPOT` : "—"}</dd></div>
                  <div><dt>Profit</dt><dd className="num pos">{sel.face ? `+${(buyN * (sel.face - sel.price)).toLocaleString(undefined, { maximumFractionDigits: 6 })} tPOT` : "—"}</dd></div>
                  <div><dt>Your tPOT</dt><dd className="num">{c.usdBal || "—"}</dd></div>
                </dl>
                {c.account && c.native !== null && Number(c.usdRaw) / 1e18 < buyN * sel.price && (
                  <FaucetButton account={c.account} compact onFunded={() => void c.refresh()} />
                )}
                {pending?.kind === "buy" ? (
                  <div className="confirm-box" role="dialog" aria-label="Confirm purchase">
                    <p className="kicker">Confirm purchase</p>
                    <p><b>Buy {num(Number(pending.amount))} shares of #{sel.r.id} at {num(sel.price)} tPOT.</b></p>
                    <dl className="facts compact">
                      <div><dt>Cost</dt><dd className="num">{num(Number(pending.amount) * sel.price)} tPOT</dd></div>
                      <div><dt>Face payout</dt><dd className="num">{sel.face ? `${num(Number(pending.amount) * sel.face)} tPOT` : "—"}</dd></div>
                      <div><dt>Expected profit</dt><dd className="num pos">{sel.face ? `+${num(Number(pending.amount) * (sel.face - sel.price))} tPOT (${pct(sel.ret)})` : "—"}</dd></div>
                    </dl>
                    <div className="row confirm-acts">
                      <button className="btn" disabled={Boolean(c.busy)} onClick={() => setPending(null)}>Cancel</button>
                      <button className="btn primary" disabled={dis} onClick={() => void c.run(`buy${sel.l.lid}`, async () => {
                        const a = pending.amount;
                        const h = await buyShares(c.ready(), c.market as Address, sel.l, a);
                        c.note("Shares bought", `${a} KIT${sel.r.id} for ${(Number(a) * sel.price).toLocaleString()} tPOT · from ${short(sel.l.seller)}`, h); setOpen(null); setPending(null);
                      })}>{c.busy === `buy${sel.l.lid}` ? "Confirm in wallet…" : "Confirm"}</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn primary block" disabled={dis || buyN <= 0} onClick={() => {
                    const a = (amt || units(sel.l.remaining)).replace(/,/g, "").trim();
                    if (!/^\d+(\.\d+)?$/.test(a) || !(Number(a) > 0)) { toast({ kind: "err", title: "Check the amount", detail: "Enter a positive amount." }); return; }
                    setPending({ kind: "buy", amount: a });
                  }}>Review purchase</button>
                )}
                <p className="payout-note" role="note"><b>Illustrative payout only.</b> This estimate assumes the debtor pays the full face value. Payment is not guaranteed; an overdue invoice can remain unpaid. Actual claims are pro-rata to the amount received on-chain.</p>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
