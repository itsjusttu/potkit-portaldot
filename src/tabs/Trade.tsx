import { useMemo, useState } from "react";
import { parseUnits, type Address } from "viem";
import { buyShares, cancelListing, fmt, KINDS, listingCost, listShares, short, units, type ChainEvent, type Listing, type Row } from "../lib/chain";
import { FaucetButton } from "../Faucet";
import { Addr, Drawer, Empty, Ico, toast } from "../AppUi";
import { daysTo, faceShare, type Ctx } from "./ctx";
import { isUserRejected } from "../lib/txerrors";
import { day, N, pct, SettleBadge } from "./shared";

type Card = { l: Listing; r: Row; price: number; face: number; discount: number; ret: number; apr: number | null; days: number; progress: number | null; state: "Open" | "Due soon" | "Overdue" | "Settled" };
type Allocation = { item: Card; amount: bigint; cost: bigint };
type Pending = { kind: "list"; row: Row; amount: string; price: string; face: number } | { kind: "buy"; amount: string };
const num = (v: number, d = 6) => v.toLocaleString("en-US", { maximumFractionDigits: d });
const displayToken = (v: bigint, d = 18, places = 4) => num(Number(fmt(v, d)), places);
const DEMO_ADDRESS = "0x0000000000000000000000000000000000000007" as Address;
const demoListings = (account: Address | ""): Card[] => {
  const now = Math.floor(Date.now() / 1000);
  const specs: { id: number; note: string; price: string; remaining: number; supply: number; due: number; lid: number; settled?: boolean; seller?: boolean }[] = [
    { id: 7, note: "KIT#7 · Solar equipment invoice", price: "0.0096", remaining: 40, supply: 100, due: 60, lid: 107 },
    { id: 9, note: "KIT#9 · Regional food distributor", price: "0.0098", remaining: 90, supply: 100, due: 45, lid: 109 },
    { id: 3, note: "KIT#3 · Medical supply receivable", price: "0.00995", remaining: 100, supply: 100, due: 12, lid: 103 },
    { id: 4, note: "KIT#4 · Fleet services invoice", price: "0.0097", remaining: 100, supply: 100, due: 75, lid: 104 },
    { id: 2, note: "KIT#2 · Packaging materials", price: "0.009", remaining: 60, supply: 100, due: -5, lid: 102 },
    { id: 1, note: "KIT#1 · Settled invoice", price: "0.008", remaining: 10, supply: 100, due: 0, lid: 101, settled: true },
    { id: 5, note: "KIT#5 · Wholesale order", price: "0.0098", remaining: 60, supply: 100, due: 40, lid: 105, seller: true },
    { id: 8, note: "KIT#8 · Freight invoice", price: "0.00975", remaining: 40, supply: 50, due: 40, lid: 108, seller: true },
  ];
  return specs.map((s) => {
    const supply = parseUnits(String(s.supply), 18), faceValue = parseUnits("0.01", 18) * BigInt(s.supply);
    const dueDate = s.due === 0 ? now + 60 * 86400 : now + s.due * 86400;
    const settled = Boolean(s.settled), face = 0.01, price = Number(s.price), days = s.due;
    const row = { id: s.id, owner: DEMO_ADDRESS, kind: 0, note: s.note, fraction: DEMO_ADDRESS, depositor: DEMO_ADDRESS, supply, dueDate, status: settled ? "Settled" as const : days < 0 ? "Overdue" as const : days <= 30 ? "Due soon" as const : "Pending" as const, settle: { token: DEMO_ADDRESS, faceValue, settled, amount: settled ? faceValue : 0n, supply, paidOut: settled ? faceValue : 0n, decimals: 18, symbol: "tPOT" } } satisfies Row;
    const l = { lid: s.lid, seller: s.seller ? account || DEMO_ADDRESS : DEMO_ADDRESS, fraction: DEMO_ADDRESS, payToken: DEMO_ADDRESS, price: parseUnits(s.price, 18), remaining: parseUnits(String(s.remaining), 18), receiptId: s.id } satisfies Listing;
    const discount = 1 - price / face;
    return { l, r: row, price, face, discount, ret: face / price - 1, apr: !settled && days > 0 ? discount * 365 / days : null, days, progress: null, state: settled ? "Settled" : days < 0 ? "Overdue" : days <= 30 ? "Due soon" : "Open" } satisfies Card;
  });
};
const demoEvents = (account: Address | ""): ChainEvent[] => {
  const now = Math.floor(Date.now() / 1000), actor = account || DEMO_ADDRESS;
  const buys: [number, string, string][] = [[7, "50", "0.48"], [9, "40", "0.36"], [3, "30", "0.28"], [4, "20", "0.1785"], [5, "40", "0.392"], [8, "10", "0.0975"], [7, "10", "0.10"]];
  const events: ChainEvent[] = buys.map(([id, shares, value], i) => ({ kind: "buy", hash: `0x${String(i + 1).repeat(64)}` as `0x${string}`, block: BigInt(1000 - i), logIndex: 0, time: now - (i + 1) * 3600, timeApprox: true, id, lid: 200 + i, actors: [actor], amount: parseUnits(shares, 18), value: parseUnits(value, 18), text: `${shares} shares of #${id} bought` }));
  events.push({ kind: "list", hash: `0x${"a".repeat(64)}`, block: 990n, logIndex: 0, time: now - 86400, timeApprox: true, id: 5, lid: 105, actors: [actor], amount: parseUnits("100", 18), value: parseUnits("0.0098", 18), text: "100 shares of #5 listed" });
  events.push({ kind: "list", hash: `0x${"b".repeat(64)}`, block: 989n, logIndex: 0, time: now - 86400, timeApprox: true, id: 8, lid: 108, actors: [actor], amount: parseUnits("50", 18), value: parseUnits("0.00975", 18), text: "50 shares of #8 listed" });
  return events;
};
export const SkelCards = ({ n = 6 }: { n?: number }) => <div className="lcards" aria-busy="true" aria-label="Loading listings">{Array.from({ length: n }, (_, i) => <div key={i} className="lcard skel-card"><span className="skel w40" /><span className="skel w80 h2" /><span className="skel w60 h3" /><span className="skel w100" /><span className="skel w70" /></div>)}</div>;
/** wei → tPOT (prices and face values are native tPOT, 18 decimals) */
const n6 = (v: bigint, d = 18) => Number(v) / 10 ** d;
const SORTS = { yield: "Highest APR", discount: "Best discount", due: "Due soonest", price: "Lowest price", newest: "Newest" } as const;

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <span className="trade-spark-empty">No trade data</span>;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const points = values.map((v, i) => `${(values.length === 1 ? 50 : 2 + i * 96 / (values.length - 1)).toFixed(1)},${27 - ((v - min) / range) * 22}`).join(" ");
  return <svg className="trade-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-label="Historical trade price chart" role="img"><polyline points={points} /></svg>;
}

export function Trade({ c }: { c: Ctx }) {
  const demoMode = import.meta.env.DEV && !c.market;
  const [status, setStatus] = useState("all");
  const [quick, setQuick] = useState<"all" | "discount" | "due">("all");
  const [sort, setSort] = useState<keyof typeof SORTS>("yield");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [amt, setAmt] = useState("");
  const [sellId, setSellId] = useState(c.param("sell") || (demoMode ? "5" : ""));
  const [sellAmt, setSellAmt] = useState("40");
  const [sellPrice, setSellPrice] = useState(demoMode ? "0.00980" : "0.009");
  const [quickBudget, setQuickBudget] = useState("0.50");
  const [marketView, setMarketView] = useState<"market" | "mine">("market");
  const dis = Boolean(c.busy) || c.gated;
  const [pending, setPending] = useState<Pending | null>(null);
  /** issue time = mint (or lock) event timestamp; falls back to a 30-day term before the due date */
  const marketEvents = useMemo(() => demoMode ? demoEvents(c.account) : c.events, [demoMode, c.account, c.events]);
  const issuedAt = (id: number) => (marketEvents.find((e) => e.id === id && e.kind === "mint" && e.time) ?? marketEvents.find((e) => e.id === id && e.kind === "lock" && e.time))?.time ?? 0;

  const cards = useMemo<Card[]>(() => demoMode ? demoListings(c.account) : c.listings.filter((l) => l.remaining > 0n).flatMap((l) => {
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
    const state: Card["state"] = r.settle.settled ? "Settled" : days <= 0 && r.dueDate ? "Overdue" : days <= 30 && r.dueDate ? "Due soon" : "Open";
    const discount = face > 0 ? 1 - price / face : 0;
    return [{ l, r, price, face, discount, ret, apr: face > 0 && days > 0 ? discount * 365 / days : null, days, progress, state }];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [demoMode, c.account, c.listings, c.rows, c.events]);
  const shown = cards
    .filter((x) => status === "all" || (status === "Pending" ? x.state === "Open" : x.state === status))
    .filter((x) => quick === "all" || (quick === "discount" ? x.discount >= .05 : x.days > 0 && x.days <= 30))
    .filter((x) => !q || `${x.r.id} ${x.r.note} ${KINDS[x.r.kind]}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === "discount" ? b.discount - a.discount : sort === "yield" ? (b.apr ?? -1) - (a.apr ?? -1) : sort === "due" ? (a.r.dueDate || 9e12) - (b.r.dueDate || 9e12) : sort === "price" ? a.price - b.price : b.l.lid - a.l.lid);
  const bestVisibleYield = [...shown].filter((x) => x.apr !== null && x.state !== "Settled" && x.state !== "Overdue").sort((a, b) => (b.apr ?? -1) - (a.apr ?? -1))[0];
  const sel = cards.find((x) => x.l.lid === open);
  const buyAmount = amt.replace(/,/g, "").trim();
  let buyRaw = 0n;
  let buyPrecisionError = false;
  if (/^\d+(\.\d+)?$/.test(buyAmount)) { try { buyRaw = parseUnits(buyAmount, 18); } catch { buyPrecisionError = true; } }
  const buyValid = Boolean(sel) && buyRaw > 0n && buyRaw <= (sel?.l.remaining ?? 0n);
  let buyCost = 0n;
  if (sel && buyValid) buyCost = listingCost(sel.l.price, buyRaw);
  const buyError = !amt ? "" : buyPrecisionError ? "Use up to 18 decimal places." : buyRaw <= 0n ? "Enter a positive share amount." : buyRaw > (sel?.l.remaining ?? 0n) ? `Only ${units(sel?.l.remaining ?? 0n)} shares are available.` : "";
  const buyPayout = sel ? (faceShare(sel.r) * buyRaw) / 10n ** 18n : 0n;
  const walletReason = !c.account ? "Connect your wallet to continue." : c.gated ? "Switch to Portaldot V3 before submitting." : c.busy ? "Wait for the current transaction to finish." : "";
  const sellable = demoMode ? cards.filter((x) => x.r.id === 5 || x.r.id === 8).map((x) => x.r) : c.rows.filter((r) => r.fraction && !r.settle.settled && (c.held.get(r.id) ?? 0n) > 0n);
  const sellRow = demoMode ? cards.find((x) => x.r.id === Number(sellId))?.r : c.rows.find((r) => r.id === Number(sellId));
  const sellHeld = sellRow ? demoMode ? parseUnits(sellRow.id === 5 ? "100" : "50", 18) : c.held.get(sellRow.id) ?? 0n : 0n;
  const sellFace = sellRow ? n6(faceShare(sellRow), sellRow.settle.decimals || 18) : 0;
  const sellAmtOk = /^\d+(\.\d+)?$/.test(sellAmt.trim()) && Number(sellAmt) > 0;
  const sellPriceOk = /^\d+(\.\d+)?$/.test(sellPrice.trim()) && Number(sellPrice) > 0;
  const sellAmountError = !sellAmt ? "" : !sellAmtOk ? "Enter a positive share amount." : !sellRow ? "" : (() => { try { return parseUnits(sellAmt.trim(), 18) > sellHeld ? `You hold only ${units(sellHeld)} shares.` : ""; } catch { return "Use up to 18 decimal places."; } })();
  const sellValid = Boolean(sellRow) && sellAmtOk && !sellAmountError && sellPriceOk;
  const sellApr = sellFace > 0 && sellRow?.dueDate && daysTo(sellRow.dueDate) > 0 ? (1 - Number(sellPrice) / sellFace) * 365 / daysTo(sellRow.dueDate) : null;
  const sellDays = sellRow?.dueDate ? Math.max(0, daysTo(sellRow.dueDate)) : 0;
  const targetPrice = (apr: number) => Math.max(0.00000001, sellFace * (1 - Math.min(.99, (apr / 100) * sellDays / 365)));
  const eligible = cards.filter((x) => x.apr !== null && x.state !== "Settled" && x.state !== "Overdue");
  const bestYield = [...eligible].sort((a, b) => (b.apr ?? -1) - (a.apr ?? -1))[0];
  const openAvgDiscount = eligible.length ? eligible.reduce((s, x) => s + x.discount, 0) / eligible.length : null;
  const buys24h = marketEvents.filter((e) => e.kind === "buy" && e.time >= Date.now() / 1000 - 86400);
  const volume24hRaw = buys24h.reduce((s, e) => s + (e.value ?? 0n), 0n);
  let budgetRaw = 0n;
  if (/^\d+(\.\d+)?$/.test(quickBudget.trim())) { try { budgetRaw = parseUnits(quickBudget.trim(), 18); } catch { budgetRaw = 0n; } }
  const quote: Allocation[] = [];
  let budgetLeft = budgetRaw;
  const quoteCandidates = eligible.filter((x) => x.l.seller !== c.account && x.l.price > 0n).sort((a, b) => a.l.price < b.l.price ? -1 : a.l.price > b.l.price ? 1 : a.l.lid - b.l.lid);
  for (const item of quoteCandidates) {
    if (budgetLeft <= 0n) break;
    const amount = item.l.remaining < (budgetLeft * 10n ** 18n) / item.l.price ? item.l.remaining : (budgetLeft * 10n ** 18n) / item.l.price;
    if (amount <= 0n) continue;
    const cost = listingCost(item.l.price, amount);
    if (cost > budgetLeft) continue;
    quote.push({ item, amount, cost }); budgetLeft -= cost;
  }
  const quoteShares = quote.reduce((s, x) => s + x.amount, 0n);
  const quoteCost = quote.reduce((s, x) => s + x.cost, 0n);
  const quotePayout = quote.reduce((s, x) => s + (faceShare(x.item.r) * x.amount) / 10n ** 18n, 0n);
  const quoteApr = quoteCost ? quote.reduce((s, x) => s + Number(x.cost) * (x.item.apr ?? 0), 0) / Number(quoteCost) : null;
  const myListings = demoMode ? cards.filter((x) => x.r.id === 5 || x.r.id === 8) : cards.filter((x) => c.account && x.l.seller.toLowerCase() === c.account.toLowerCase());
  const initialByListing = new Map(marketEvents.filter((e) => e.kind === "list" && e.lid !== undefined).map((e) => [e.lid!, e.amount ?? 0n]));
  const tradesByReceipt = new Map<number, number[]>();
  for (const e of [...marketEvents].filter((x) => x.kind === "buy" && x.amount && x.value).reverse()) {
    const values = tradesByReceipt.get(e.id) ?? [];
    values.push(Number(e.value) / Number(e.amount)); tradesByReceipt.set(e.id, values);
  }
  const recentTrades = marketEvents.filter((e) => e.kind === "buy").slice(0, 3);
  const openListing = (item?: Card) => { if (item) { setOpen(item.l.lid); setAmt(""); setPending(null); } };

  return (
    <div className="trade">
      <section className="trade-intro"><div><p className="kicker">Markets · Portaldot V3</p><h2>Trade</h2><p>Buy invoice shares below face value. Yield is an estimate assuming full repayment at maturity.</p></div><div className="trade-intro-stats"><span><b>{eligible.length}</b> open listings</span><span><b>{num(eligible.reduce((s, x) => s + x.price * Number(x.l.remaining) / 1e18, 0))}</b> tPOT listed</span></div></section>
      {demoMode && <div className="trade-demo-banner" role="note"><b>DEMO DATA · LOCAL PREVIEW</b><span>Sample market values to preview the interface. Actions are disabled and no wallet transactions will be sent.</span></div>}
      <section className="trade-kpis" aria-label="Market overview">
        <article><small>Best APR</small><strong className="yield-text">{bestYield ? pct(bestYield.apr!) : "—"}</strong><span>{bestYield ? `KIT#${bestYield.r.id} · due in ${Math.ceil(bestYield.days)}d` : "No eligible listings"}</span></article>
        <article><small>Average discount</small><strong>{openAvgDiscount === null ? "—" : pct(openAvgDiscount)}</strong><span>Across eligible listings</span></article>
        <article><small>Open listings</small><strong>{eligible.length}</strong><span>{num(eligible.reduce((s, x) => s + Number(x.l.remaining) / 1e18, 0), 2)} shares available</span></article>
        <article><small>24h volume{demoMode ? " · demo" : " · estimated"}</small><strong>{demoMode ? `${fmt(volume24hRaw, 18)} tPOT` : c.eventsLoading ? "…" : c.eventsOk ? `${fmt(volume24hRaw, 18)} tPOT` : "—"}</strong><span>{demoMode ? `${buys24h.length} sample trades` : c.eventsLoading ? "Reading chain activity" : c.eventsOk ? `${buys24h.length} scanned on-chain buys` : "History unavailable"}</span></article>
      </section>
      {cards.length > 0 && <div className="trade-bar" role="search">
        <div className="tb-search"><Ico n="search" /><input aria-label="Search listings" placeholder="Search invoice, id or kind" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips" role="group" aria-label="Quick filters">
          {([["all", "All"], ["discount", "Discount > 5%"], ["due", "Due < 30d"]] as const).map(([key, label]) => <button key={key} className={`chip ${quick === key ? "on" : ""}`} aria-pressed={quick === key} onClick={() => setQuick(key)}>{label}</button>)}
        </div>
        <div className="chips trade-status-chips" role="group" aria-label="Filter by status">
          {["all", "Pending", "Due soon", "Overdue", "Settled"].map((s) => <button key={s} className={`chip ${status === s ? "on" : ""}`} aria-pressed={status === s} onClick={() => setStatus(s)}>{s === "all" ? "Any status" : s}</button>)}
        </div>
        <label className="tb-sort"><span>Sort</span><select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>}

      <div className="trade-grid">
        <section aria-label="Listings">
          {!c.market && !demoMode ? <Empty icon="⇄" title="No contract yet" body="Deploy PotKit from Issue → Set up the contract (the market is built in)." />
            : c.loading && !demoMode ? <SkelCards />
            : !shown.length ? <>
              <Empty icon="⇄" title={cards.length ? "No listings match" : "No open listings"} body={cards.length ? "Try another status filter or clear the search." : "Nobody is selling shares right now. List yours from the panel to get cash today."} />
              {!cards.length && recentTrades.length > 0 && <section className="card trade-recent" aria-label="Recent trades">
                <header><div><p className="kicker">On-chain activity</p><h3>Recent trades</h3></div><span className="trade-recent-live"><i />Verified</span></header>
                <ol>{recentTrades.map((e) => <li key={`${e.hash}-${e.logIndex}`}><span className="trade-recent-icon"><Ico n="cart" size={16} /></span><b>{e.text}</b><small>Block {e.block.toString()}</small></li>)}</ol>
              </section>}
            </>
            : (
              <>
              <div className="trade-market-card card">
                <div className="trade-market-heading"><div><p className="kicker">Live board</p><h3>Listings <span>{shown.length}</span></h3></div><div className="trade-board-views" role="group" aria-label="Listing view">{([ ["market", "All listings"], ["mine", `My listings · ${myListings.length}`] ] as const).map(([key, label]) => <button key={key} type="button" className={marketView === key ? "on" : ""} onClick={() => setMarketView(key)}>{label}</button>)}</div></div>
                {marketView === "market" ? <div className="trade-market-list" role="table" aria-label="Open invoice share markets">
                  <div className="trade-row trade-row-head" role="row"><span>Invoice</span><span>Price</span><span>Discount</span><span>APR</span><span>Due in</span><span>Available</span><span /></div>
                  {shown.map((x) => {
                    const tradable = x.state !== "Settled" && x.state !== "Overdue";
                    const due = x.state === "Settled" ? "Settled" : x.state === "Overdue" ? "Overdue" : x.r.dueDate ? `${Math.ceil(x.days)}d` : "No due";
                    return <div className={`trade-row ${!tradable ? "trade-row-closed" : ""}`} role="row" key={x.l.lid}>
                      <button type="button" className="trade-row-invoice" onClick={() => openListing(x)} aria-label={`View ${x.r.note}, invoice ${x.r.id}`}><span className="trade-row-icon"><Ico n="terms" /></span><span><b>{x.r.note}</b><small>KIT#{x.r.id} · {KINDS[x.r.kind]}{x.l.seller === c.account ? " · YOUR LISTING" : ""}{x === bestVisibleYield && <i className="trade-best-badge">Best yield</i>}<i className={`trade-status-tag ${x.state.toLowerCase().replace(" ", "-")}`}>{x.state}</i></small></span></button>
                      <span className="trade-row-price">{num(x.price)} <small>tPOT</small></span>
                      <span className="trade-row-discount">{x.face ? pct(x.discount) : "—"}</span>
                      <span className="trade-row-apr">{x.apr !== null ? pct(x.apr) : "—"}</span>
                      <span className="trade-row-due">{due}</span>
                      <span className="trade-row-units">{units(x.l.remaining)}</span>
                      <button type="button" className="btn sm trade-buy" disabled={!tradable || (!demoMode && x.l.seller === c.account)} title={!tradable ? `${x.state} invoice — buying is closed.` : demoMode ? "Preview demo listing; transactions are disabled." : x.l.seller === c.account ? "This is your listing." : "Open purchase quote"} onClick={() => openListing(x)}>{demoMode ? "Preview" : x.l.seller === c.account ? "Yours" : tradable ? "Buy" : "Closed"}</button>
                    </div>;
                  })}
                </div> : <div className="trade-my-listings">
                  {!c.account ? <p className="muted">Connect your wallet to see your listings.</p> : !myListings.length ? <p className="muted">You do not have any open listings.</p> : myListings.map((x) => {
                    const original = initialByListing.get(x.l.lid);
                    const filled = original !== undefined && original > x.l.remaining ? original - x.l.remaining : 0n;
                    const ratio = original ? Number((filled * 10_000n) / original) / 100 : null;
                    return <div className="trade-my-row" key={x.l.lid}><div><b>KIT#{x.r.id}</b><small>{x.r.note}</small></div><span>{num(x.price)} tPOT</span><strong className="trade-row-apr">{x.apr === null ? "—" : pct(x.apr)}</strong><div className="trade-fill"><i style={{ width: `${ratio ?? 0}%` }} /></div><small>{ratio === null ? `${units(x.l.remaining)} shares remaining · fill data unavailable` : `${ratio.toFixed(0)}% · ${units(filled)}/${units(original!)} filled`}</small><button className="btn sm" disabled={dis || demoMode} title={demoMode ? "Demo preview only — no on-chain listing exists." : walletReason || "Cancel and return remaining shares"} onClick={() => void c.run(`cancel${x.l.lid}`, async () => { const h = await cancelListing(c.ready(), c.market as Address, x.l.lid); c.note("Listing cancelled", `#${x.l.lid}`, h); })}>Cancel</button></div>;
                  })}
                </div>}
              </div>
              <section className="card trade-charts"><header><div><p className="kicker">Market activity</p><h3>Last trades</h3></div><small>On-chain price · tPOT / share</small></header><div className="trade-chart-grid">{[...new Map(marketEvents.filter((e) => e.kind === "buy").map((e) => [e.id, e])).values()].slice(0, 5).map((e) => { const values = tradesByReceipt.get(e.id) ?? []; const last = values.at(-1); return <article key={e.id}><div><b>KIT#{e.id}</b><small>{last === undefined ? "—" : `${num(last)} tPOT`}</small></div><Sparkline values={values} /></article>; })}{!marketEvents.some((e) => e.kind === "buy") && <p className="muted">No on-chain buy trades to chart yet.</p>}</div></section>
              </>
            )}
        </section>

        <aside className="trade-side-column">
        <section className="card quick-buy-panel" aria-label="Quick buy">
          <header><div><p className="kicker">Quote across live listings</p><h3>Quick buy</h3></div><small>Lowest price first</small></header>
          <label htmlFor="quick-budget">Spend</label>
          <div className="trade-budget-input"><input id="quick-budget" inputMode="decimal" value={quickBudget} aria-label="Spend amount in tPOT" onChange={(e) => setQuickBudget(e.target.value)} /><span>tPOT</span></div>
          {!/^\d+(\.\d+)?$/.test(quickBudget.trim()) && <small className="field-error">Enter a valid tPOT amount.</small>}
          <dl className="facts compact trade-quote-facts"><div><dt>Shares received</dt><dd>{displayToken(quoteShares, 18, 2)}</dd></div><div><dt>Estimated payout at due</dt><dd>{quote.length ? `${displayToken(quotePayout)} tPOT` : "—"}</dd></div><div><dt>Estimated profit</dt><dd className={quotePayout >= quoteCost ? "yield-text" : "negative-text"}>{quote.length ? `${displayToken(quotePayout - quoteCost)} tPOT` : "—"}</dd></div><div><dt>Weighted APR</dt><dd className="yield-text">{quoteApr === null ? "—" : pct(quoteApr)}</dd></div></dl>
          {quote.length > 1 && <p className="trade-quote-note">This quote uses {quote.length} listings. Each fill is a separate wallet transaction; if you stop midway, earlier confirmed fills remain.</p>}
          {!demoMode && c.account && c.native !== null && quoteCost > c.usdRaw && <FaucetButton account={c.account} compact onFunded={() => void c.refresh()} />}
          <button className="btn primary block" disabled={demoMode || Boolean(c.busy) || (Boolean(c.account) && !quote.length) || (Boolean(c.account) && c.native !== null && quoteCost > c.usdRaw)} title={demoMode ? "Demo preview only — no on-chain transaction will be sent." : !c.account ? walletReason : c.gated ? walletReason : !quote.length ? "No affordable active listings at this spend amount." : c.native !== null && quoteCost > c.usdRaw ? "Your tPOT balance is below this quote." : undefined} onClick={() => {
            if (!c.account) { c.connect(); return; }
            if (c.gated) { c.switchNetwork(); return; }
            if (!quote.length || c.native !== null && quoteCost > c.usdRaw) return;
            void c.run("quick-buy", async () => {
              let filled = 0;
              for (const allocation of quote) {
                try {
                  const h = await buyShares(c.ready(), c.market as Address, allocation.item.l, units(allocation.amount));
                  filled += 1;
                  c.note("Quick buy filled", `${units(allocation.amount)} KIT${allocation.item.r.id} for ${fmt(allocation.cost, 18)} tPOT`, h);
                } catch (error) {
                  if (!filled) throw error;
                  if (isUserRejected(error)) {
                    toast({ kind: "info", title: "Quick buy partially filled", detail: `${filled} of ${quote.length} listings confirmed. You cancelled the next wallet prompt; earlier fills remain on-chain.` });
                    return;
                  }
                  throw new Error(`Quick buy stopped after ${filled} of ${quote.length} confirmed fills. Earlier fills remain on-chain. ${error instanceof Error ? error.message : "The remaining listings were not confirmed."}`);
                }
              }
              toast({ kind: "ok", title: "Quick buy complete", detail: `${units(quoteShares)} shares bought for ${fmt(quoteCost, 18)} tPOT across ${filled} listing${filled === 1 ? "" : "s"}.` });
            });
          }}>{demoMode ? "Demo preview · actions off" : !c.account ? "Connect wallet" : c.gated ? "Switch network" : c.busy === "quick-buy" ? "Confirm in wallet…" : !quote.length ? "No affordable listings" : `Buy ${units(quoteShares)} shares`}</button>
        </section>
        <section className="card sell-panel" id="sell" aria-label="Sell shares">
          <h2><Ico n="tag" /> Sell shares</h2>
          <p className="muted">Get tPOT today. Shares are held in escrow by PotKit until sold or cancelled; buyers pay you directly in the same transaction.</p>
          {!sellable.length ? <div className="trade-sell-empty"><p className="muted">You hold no unsettled shares. Issue an invoice first.</p><button className="btn sm primary" onClick={() => c.account ? c.setTab("issue") : c.connect()}>{c.account ? "Issue invoice" : "Connect wallet"} <Ico n="arrow" /></button></div> : (
            <>
              <label htmlFor="s-id">Receipt</label>
              <select id="s-id" value={sellId} onChange={(e) => setSellId(e.target.value)}>
                <option value="">Choose…</option>
                {sellable.map((r) => <option key={r.id} value={r.id}>#{r.id} · {r.note.slice(0, 30)} · {units(demoMode ? parseUnits(r.id === 5 ? "100" : "50", 18) : c.held.get(r.id) ?? 0n)} held</option>)}
              </select>
              <div className="row fields">
                <div><label htmlFor="s-amt">Shares <span className="muted">· {sellRow ? `${units(sellHeld)} available` : "select a receipt"}</span></label><input id="s-amt" inputMode="decimal" value={sellAmt} aria-invalid={Boolean(sellAmountError)} onChange={(e) => setSellAmt(e.target.value)} />
                  {sellAmountError && <small className="field-error">{sellAmountError}</small>}
                  {sellRow && <div className="trade-amount-presets" aria-label="Choose share amount">{[25, 50, 100].map((p) => <button type="button" key={p} onClick={() => setSellAmt(units((sellHeld * BigInt(p)) / 100n))}>{p === 100 ? "Max" : `${p}%`}</button>)}</div>}
                </div>
                <div><label htmlFor="s-p">Price / share</label><input id="s-p" inputMode="decimal" value={sellPrice} aria-invalid={!sellPriceOk} onChange={(e) => setSellPrice(e.target.value)} />{!sellPriceOk && <small className="field-error">Enter a positive price in tPOT.</small>}</div>
              </div>
              {sellRow && (
                <dl className="facts compact">
                  <div><dt>You receive</dt><dd className="num">{((Number(sellAmt) || 0) * (Number(sellPrice) || 0)).toLocaleString()} tPOT</dd></div>
                  <div><dt>Face / share</dt><dd className="num">{sellFace ? `${sellFace} tPOT` : "no terms"}</dd></div>
                  <div><dt>Discount offered</dt><dd className="num">{sellFace ? pct(1 - (Number(sellPrice) || 0) / sellFace) : "—"}</dd></div>
                </dl>
              )}
              {sellRow && <div className="trade-sell-yield"><div><span>Buyer APR estimate</span><b className="yield-text">{sellApr === null ? "— · add a future due date" : pct(sellApr)}</b></div><p>Suggested price for buyer APR</p><div className="trade-target-prices">{[10, 15, 20].map((target) => <button type="button" key={target} disabled={!sellFace || !sellDays} onClick={() => setSellPrice(targetPrice(target).toFixed(8))}><span>{target}% APR</span><b>{num(targetPrice(target), 6)}</b></button>)}</div></div>}
              {sellRow && !(sellRow.settle.faceValue > 0n) && (
                <div className="banner warn-banner" role="alert">
                  <Ico n="info" /> <span><b>No payment terms yet.</b> Shares can only be listed while invoice #{sellRow.id} is locked with terms.</span>
                  <button className="btn sm" onClick={() => c.setTab("issue")}>Open Issue <Ico n="arrow" /></button>
                </div>
              )}
              <button className="btn primary block" disabled={demoMode || dis || !c.market || !sellRow || !(sellRow.settle.faceValue > 0n) || !sellRow.settle.token || !sellValid} title={demoMode ? "Demo preview only — no on-chain transaction will be sent." : !sellRow ? "Choose a receipt with unsettled shares." : sellAmountError || (!sellAmtOk ? "Enter a positive share amount." : !sellPriceOk ? "Enter a positive price in tPOT." : !(sellRow.settle.faceValue > 0n) ? "Lock the receipt with terms before listing shares." : walletReason)} onClick={() => {
                if (!sellRow?.fraction) return;
                if (!/^\d+(\.\d+)?$/.test(sellAmt.trim()) || !/^\d+(\.\d+)?$/.test(sellPrice.trim()) || !(Number(sellAmt) > 0) || !(Number(sellPrice) > 0)) { toast({ kind: "err", title: "Check the form", detail: "Enter a positive number of shares and price." }); return; }
                setPending({ kind: "list", row: sellRow, amount: sellAmt.trim(), price: sellPrice.trim(), face: sellFace });
              }}>{c.busy === "list" ? "Listing…" : "List shares"}</button>
            </>
          )}
        </section>
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
              <div><dt>Discount · estimated APR</dt><dd className="num"><span className="yield-text">{sel.face ? pct(sel.discount) : "—"}</span>{sel.apr !== null ? ` · ${pct(sel.apr)} APR` : ""}</dd></div>
              <div><dt>Due</dt><dd>{sel.r.dueDate ? day(sel.r.dueDate) : "—"}</dd></div>
              <div><dt>Available</dt><dd className="num">{units(sel.l.remaining)} of {units(sel.r.supply)}</dd></div>
              <div><dt>Seller</dt><dd>{sel.l.seller === c.account ? "You" : <Addr a={sel.l.seller} />}</dd></div>
              <div><dt>Share token</dt><dd><Addr a={sel.l.fraction} label={`KIT${sel.r.id}`} /></dd></div>
            </dl>
            <p className="market-risk" role="note"><b>Invoice information is issuer-provided.</b> PotKit records custody, terms and payment state on-chain, but does not independently verify the underlying invoice.</p>
            {sel.l.seller === c.account ? (
                <button className="btn block" disabled={dis || demoMode} title={demoMode ? "Demo preview only — no on-chain listing exists." : walletReason} onClick={() => void c.run(`cancel${sel.l.lid}`, async () => {
                const h = await cancelListing(c.ready(), c.market as Address, sel.l.lid); c.note("Listing cancelled", `#${sel.l.lid}`, h); setOpen(null);
              })}>{c.busy === `cancel${sel.l.lid}` ? "Cancelling…" : "Cancel listing"}</button>
            ) : sel.state === "Settled" || sel.state === "Overdue" ? <p className="muted">{sel.state} — closed for trading.</p> : (
              <div className="buy-panel">
                <label htmlFor="b-amt">Shares to buy</label>
                <input id="b-amt" inputMode="decimal" placeholder={units(sel.l.remaining)} value={amt} aria-invalid={Boolean(buyError)} onChange={(e) => setAmt(e.target.value)} />
                {buyError && <small className="field-error">{buyError}</small>}
                <div className="trade-amount-presets" aria-label="Choose buy amount">{[25, 50, 100].map((p) => <button type="button" key={p} onClick={() => setAmt(units((sel.l.remaining * BigInt(p)) / 100n))}>{p === 100 ? "Buy all" : `${p}%`}</button>)}</div>
                <dl className="facts compact">
                  <div><dt>You pay</dt><dd className="num">{buyValid ? `${fmt(buyCost, 18)} tPOT` : "—"}</dd></div>
                  <div><dt>Payout at settle</dt><dd className="num">{sel.face && buyValid ? `${fmt(buyPayout, 18)} tPOT` : "—"}</dd></div>
                  <div><dt>Estimated spread</dt><dd className="num pos">{sel.face && buyValid ? `${fmt(buyPayout - buyCost, 18)} tPOT` : "—"}</dd></div>
                  <div><dt>Your tPOT</dt><dd className="num">{c.usdBal || "—"}</dd></div>
                </dl>
                {!demoMode && c.account && c.native !== null && buyValid && c.usdRaw < buyCost && (
                  <FaucetButton account={c.account} compact onFunded={() => void c.refresh()} />
                )}
                <button className="btn primary block" disabled={demoMode || Boolean(c.busy) || (Boolean(c.account) && !buyValid)} title={demoMode ? "Demo preview only — no on-chain transaction will be sent." : !c.account ? walletReason : c.gated ? walletReason : !buyValid ? (buyError || "Enter a share amount to continue.") : undefined} onClick={() => { if (demoMode) return; if (!c.account) { c.connect(); return; } if (c.gated) { c.switchNetwork(); return; } if (!buyValid) return; void c.run(`buy${sel.l.lid}`, async () => {
                  const h = await buyShares(c.ready(), c.market as Address, sel.l, buyAmount);
                  c.note("Shares bought", `${buyAmount} KIT${sel.r.id} for ${fmt(buyCost, 18)} tPOT · from ${short(sel.l.seller)}`, h); setOpen(null); setPending(null); setAmt("");
                }); }}>{demoMode ? "Demo preview · actions off" : c.busy === `buy${sel.l.lid}` ? "Confirm in wallet…" : !c.account ? "Connect wallet" : c.gated ? "Switch network" : !buyValid ? "Enter an amount" : "Confirm"}</button>
                <p className="payout-note" role="note"><b>Illustrative payout only.</b> This estimate assumes the debtor pays the full face value. Payment is not guaranteed; an overdue invoice can remain unpaid. Actual claims are pro-rata to the amount received on-chain.</p>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
