import { useState } from "react";
import { fmt, KINDS, short, units, type ChainEvent, type Row } from "../lib/chain";
import { Addr, CountUp, Empty, Ico } from "../AppUi";
import { faceShare, type Ctx } from "./ctx";
import { day, pct } from "./shared";
import { N } from "./shared";
import { readReceiptHistory } from "./receipt-history";
export const SkelRows = ({ n = 6, cols = 6 }: { n?: number; cols?: number }) => <div className="skel-rows" aria-busy="true" aria-label="Loading">{Array.from({ length: n }, (_, i) => <div key={i} className="skel-row">{Array.from({ length: cols }, (_, j) => <span key={j} className={`skel ${j === 0 ? "w100" : "w60"}`} />)}</div>)}</div>;
import { SettleBadge, useWatch, WatchBtn } from "./shared";

type Col = "id" | "status" | "face" | "due" | "supply";
const STATUS_ORDER: Record<string, number> = { Overdue: 0, "Due soon": 1, Pending: 2, Trading: 3, Settled: 4, Redeemed: 5, Free: 6 };
export const EV_ICON: Record<ChainEvent["kind"], string> = { mint: "mint", lock: "lock", terms: "terms", due: "terms", settle: "settle", claim: "claim", redeem: "redeem", list: "tag", buy: "cart", cancel: "cancel" };
const ago = (t: number) => { if (!t) return ""; const s = Date.now() / 1000 - t; return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };

export function Explore({ c }: { c: Ctx }) {
  const [q, setQ] = useState(c.param("addr"));
  const [view, setView] = useState<"cards" | "table">(() => { try { return localStorage.getItem("potkit.exview") === "cards" ? "cards" : "table"; } catch { return "table"; } });
  const [stageFilter, setStageFilter] = useState<"all" | "trading" | "settled" | "redeemed" | "watch">("all");
  const watch = useWatch();
  const pickView = (v: "cards" | "table") => { setView(v); try { localStorage.setItem("potkit.exview", v); } catch { /* Private browsing may block storage. */ } };
  const [col, setCol] = useState<Col>("id");
  const [asc, setAsc] = useState(false);
  const R = c.rows;
  const receiptHistory = readReceiptHistory(c.events);
  const outstanding = R.filter((r) => r.fraction && !r.settle.settled).reduce((s, r) => s + r.settle.faceValue, 0n);
  const settledVol = R.filter((r) => r.settle.settled).reduce((s, r) => s + r.settle.amount, 0n);
  const open = c.listings.filter((l) => l.remaining > 0n);
  const listedVal = open.reduce((s, l) => s + (l.price * l.remaining) / 10n ** 18n, 0n);
  const traded = c.events.filter((e) => e.kind === "buy").reduce((s, e) => s + (e.value ?? 0n), 0n);
  const ask = new Map<number, bigint>();
  for (const l of open) { const p = ask.get(l.receiptId); if (p === undefined || l.price < p) ask.set(l.receiptId, l.price); }
  const isRedeemed = (r: Row) => receiptHistory.get(r.id)?.redeemed ?? false;
  const faceValueOf = (r: Row) => r.settle.faceValue > 0n ? r.settle.faceValue : receiptHistory.get(r.id)?.terms?.value ?? 0n;
  const dueDateOf = (r: Row) => r.dueDate || receiptHistory.get(r.id)?.terms?.dueDate || 0;
  const supplyOf = (r: Row) => r.supply > 0n ? r.supply : (receiptHistory.get(r.id)?.lock?.amount ?? 0n) * 10n ** 18n;
  const isTrading = (r: Row) => !isRedeemed(r) && open.some((l) => l.receiptId === r.id);
  const isSettled = (r: Row) => !isRedeemed(r) && r.settle.settled;
  const displayStatus = (r: Row) => isRedeemed(r) ? "Redeemed" : isTrading(r) ? "Trading" : isSettled(r) ? "Settled" : r.status;
  const qq = q.trim().toLowerCase();
  const rows = R.filter((r) => {
      const stage = displayStatus(r).toLowerCase();
      const matchesStage = stageFilter === "all" || (stageFilter === "trading" && isTrading(r)) || (stageFilter === "settled" && isSettled(r)) || (stageFilter === "redeemed" && isRedeemed(r)) || (stageFilter === "watch" && watch.has(r.id));
      return matchesStage && (!qq || `#${r.id} ${r.id} ${r.note} ${KINDS[r.kind]} ${stage} ${r.status} ${r.owner} ${r.depositor} ${r.fraction}`.toLowerCase().includes(qq));
    })
    .sort((a, b) => { const k = col === "id" ? a.id - b.id : col === "status" ? (STATUS_ORDER[displayStatus(a)] ?? 6) - (STATUS_ORDER[displayStatus(b)] ?? 6) : col === "face" ? Number(faceValueOf(a) - faceValueOf(b)) : col === "due" ? (dueDateOf(a) || 9e12) - (dueDateOf(b) || 9e12) : Number((supplyOf(a) - supplyOf(b)) / 10n ** 15n); return asc ? k : -k; });
  const th = (k: Col, label: string, num = false) => (
    <th scope="col" className={num ? "num" : ""} aria-sort={col === k ? (asc ? "ascending" : "descending") : "none"}>
      <button className="th-sort" onClick={() => { if (col === k) setAsc(!asc); else { setCol(k); setAsc(k === "due" || k === "status"); } }}>{label}<span aria-hidden>{col === k ? (asc ? " ▲" : " ▼") : ""}</span></button>
    </th>
  );
  if (!c.addrs) return <Empty icon="▣" title="No contracts configured" body="Open a judge link, or deploy contracts from Issue."><button className="btn sm primary" onClick={() => c.setTab("issue")}>Go to Issue</button></Empty>;

  return (
    <div className="explore">
      <section className="explore-intro"><div><p className="kicker">Loaded receipts · {R.length} of {c.total}</p><h1>Explore real-world receivables</h1><p>Issuer-provided receipts. Select one to inspect its proof.</p></div><div className="explore-intro-actions"><span className="explore-live"><i /> Live from Portaldot V3</span><button className="btn sm primary" onClick={() => c.setTab("trade")}>Open share market <Ico n="arrow" /></button></div></section>
      {!c.eventsOk && !c.eventsLoading && <p className="banner ex-scan-warning" role="status">Event scan incomplete. Trade totals and redeemed statuses may omit transactions outside the readable range.</p>}
      <section className="ex-stats" aria-label="Loaded network overview">
        <div className="kpi"><span>Receipts on contract</span><b className="num"><N l={c.loading}><CountUp v={c.total} /></N></b><small><N l={c.loading}>{R.filter((r) => r.fraction).length} locked among loaded receipts</N></small></div>
        <div className="kpi"><span>Outstanding</span><b className="num"><N l={c.loading}><CountUp v={fmt(outstanding, 18)} /></N></b><small>tPOT owed by debtors</small></div>
        <div className="kpi"><span>Settled</span><b className="num"><N l={c.loading}><CountUp v={fmt(settledVol, 18)} /></N></b><small>tPOT paid into PotKit</small></div>
        <div className="kpi"><span>Open listings</span><b className="num"><N l={c.loading}><CountUp v={open.length} /></N></b><small><N l={c.loading}>{fmt(listedVal, 18)} tPOT asked</N></small></div>
        <div className="kpi"><span>Traded</span><b className="num">{c.eventsLoading ? "Reading…" : !c.eventsOk ? "—" : <CountUp v={fmt(traded, 18)} />}</b><small>{c.eventsOk ? "tPOT in scanned buys" : "Incomplete event scan"}</small></div>
        <div className={`kpi ${R.some((r) => r.status === "Overdue") ? "neg" : ""}`}><span>Overdue</span><b className="num"><N l={c.loading}><CountUp v={R.filter((r) => r.status === "Overdue").length} /></N></b><small>past due, unpaid</small></div>
      </section>

      <div className="ex-grid ex-stack">
        <section className="card ex-table">
          <div className="ex-toolbar">
            <div className="ex-head-title"><h2>Receivable board</h2><p className="muted small">{c.loading ? "Reading contract…" : `${rows.length} of ${R.length} loaded receipts shown`}</p></div>
            <div className="tb-search"><Ico n="search" /><input aria-label="Search receipts" placeholder="Search by id, note, kind or address" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="seg-tabs" role="group" aria-label="Filter receipts by lifecycle">
              {([["all", "All", R.length], ["trading", "Trading", R.filter(isTrading).length], ["settled", "Settled", R.filter(isSettled).length], ["redeemed", "Redeemed", R.filter(isRedeemed).length], ["watch", "Watching", R.filter((r) => watch.has(r.id)).length]] as const).map(([key, label, n]) => <button key={key} type="button" className={stageFilter === key ? "on" : ""} aria-pressed={stageFilter === key} onClick={() => setStageFilter(key)}>{label}<span>{n}</span></button>)}
            </div>
            <div className="chips view-toggle" role="group" aria-label="View">{(["table", "cards"] as const).map((v) => <button key={v} className={`chip ${view === v ? "on" : ""}`} aria-pressed={view === v} onClick={() => pickView(v)}>{v === "cards" ? "Cards" : "Table"}</button>)}</div>
          </div>
          {c.loading ? <SkelRows /> : !rows.length ? <Empty icon="▤" title={R.length ? "No receipts match" : "No receipts loaded"} body={R.length ? "Change the search or lifecycle filter to see more receipts." : c.total > 0 ? "No receipt details were returned by the RPC. Try refreshing the page." : "No receipts have been issued on this vault yet."} /> : view === "cards" ? (
            <div className="explore-card-grid">
              {rows.map((r) => {
                const onMkt = open.filter((l) => l.receiptId === r.id).reduce((s, l) => s + l.remaining, 0n);
                const p = ask.get(r.id); const totalShares = supplyOf(r); const face = faceValueOf(r); const dueDate = dueDateOf(r); const redeemed = isRedeemed(r);
                const facePerShare = totalShares > 0n ? face * 10n ** 18n / totalShares : faceShare(r);
                const marketPct = redeemed ? 100 : totalShares > 0n ? Math.min(100, Number((onMkt * 10000n) / totalShares) / 100) : 0;
                const tone = redeemed ? "redeemed" : isSettled(r) ? "settled" : r.status === "Overdue" ? "overdue" : r.fraction ? (onMkt ? "trading" : "listed") : "minted";
                return (
                  <article className={`explore-card ex-${tone}`} key={r.id}>
                    <header><span className="explore-icon"><Ico n={redeemed ? "redeem" : isSettled(r) ? "check" : r.fraction ? "swap" : "terms"} size={17} /></span><span className="ex-id">INVOICE #{r.id}</span>{redeemed ? <span className="tag explore-redeemed-tag">REDEEMED</span> : <SettleBadge r={r} terms={false} />}</header>
                    <h3>{r.note || KINDS[r.kind]}</h3><p className="explore-issuer">{KINDS[r.kind]} · issuer wallet {short(r.depositor || r.owner)}</p>
                    <div className="explore-card-facts"><div><small>Face value</small><b>{face ? `${fmt(face, r.settle.decimals)} ${r.settle.symbol}` : "Terms pending"}</b></div><div><small>Due</small><b>{dueDate ? new Date(dueDate * 1000).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : redeemed ? "No due date" : "—"}</b></div></div>
                    <div className="explore-meter-label"><span>{redeemed ? "Shares issued before redemption" : "Currently listed"}</span><b>{redeemed && totalShares > 0n ? units(totalShares) : totalShares > 0n ? `${units(onMkt)} / ${units(totalShares)}` : "Not issued"}</b></div><div className="explore-meter"><i style={{ width: `${redeemed ? 0 : marketPct}%` }} /></div>
                    <div className="explore-card-foot"><span>{redeemed ? "Lifecycle complete" : r.fraction ? `${units(totalShares)} shares` : "Receipt only"}</span><b>{redeemed && receiptHistory.get(r.id)?.settled ? <>Settled · {fmt(receiptHistory.get(r.id)?.settle?.value ?? r.settle.amount, r.settle.decimals)} {r.settle.symbol} paid</> : p === undefined ? (redeemed ? "REDEEMED" : "Not listed") : <>{fmt(p, 18)} <small>tPOT / share</small></>}</b></div>
                    <footer><button className="btn sm" onClick={() => c.setTab("verify", { id: String(r.id) })}><Ico n="shield" /> Verify</button>{!redeemed && r.fraction && !r.settle.settled && <button className="btn sm" onClick={() => p !== undefined ? c.setTab("trade") : c.openPay(r.id)}>{p !== undefined ? "View market" : "Pay invoice"}</button>}</footer>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="tscroll"><table className="rtable">
              <thead><tr>{th("id", "Receipt")}{th("status", "Status")}{th("face", "Face value", true)}{th("due", "Due")}{th("supply", "Shares", true)}<th scope="col" className="num">Best ask</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Receipt"><span className="ex-rid"><WatchBtn on={watch.has(r.id)} id={r.id} onToggle={() => watch.toggle(r.id)} /><b>#{r.id} · {KINDS[r.kind]}</b></span><span className="muted r-note">{r.note}</span><span className="r-dep small muted">{r.depositor ? <>by <Addr a={r.depositor} /></> : <>owner <Addr a={r.owner} /></>}</span></td>
                    <td data-label="Status"><div className="tags">{isRedeemed(r) ? <span className="tag explore-redeemed-tag">REDEEMED</span> : <SettleBadge r={r} terms={false} />}</div></td>
                    <td data-label="Face value" className="num">{faceValueOf(r) > 0n ? `${fmt(faceValueOf(r), r.settle.decimals)} ${r.settle.symbol}` : "—"}</td>
                    <td data-label="Due">{dueDateOf(r) ? day(dueDateOf(r)) : "—"}</td>
                    <td data-label="Shares" className="num">{supplyOf(r) > 0n ? units(supplyOf(r)) : "—"}</td>
                    <td data-label="Best ask" className="num">{(() => { const p = ask.get(r.id); if (p === undefined) return "—"; const f = supplyOf(r) > 0n ? faceValueOf(r) * 10n ** 18n / supplyOf(r) : faceShare(r); return <>{fmt(p, 18)}{f > 0n && <span className="pos small ba-disc">{pct(1 - Number(p) / Number(f))} off</span>}</>; })()}</td>
                    <td className="acts"><div className="row">
                      <button className="btn sm" aria-label={`Verify receipt ${r.id}`} onClick={() => c.setTab("verify", { id: String(r.id) })}><Ico n="shield" /> Verify</button>
                      {!isRedeemed(r) && r.fraction && !r.settle.settled && (ask.has(r.id) ? <button className="btn sm" onClick={() => c.setTab("trade")}>View market</button> : <button className="btn sm" onClick={() => c.openPay(r.id)}>Pay</button>)}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          {!qq && c.rows.length < c.total && Math.min(...c.rows.map((r) => r.id)) > 1 && (
            <button className="btn sm block" onClick={c.loadOlder}>Load older ({c.total - c.rows.length} more)</button>
          )}
        </section>

        <aside className="ex-side">
                    <section className="card feed">
            <p className="kicker">Recent activity</p>
            {(c.loading || c.eventsLoading) && !c.events.length ? <p className="muted" role="status">Reading events…</p>
              : !c.events.length ? <p className="muted">{c.eventsOk ? "No events in the scanned block range." : "History unavailable — the RPC refused the event scan."}</p>
              : <ol className="feed-list">
                {c.events.slice(0, 14).map((e) => (
                  <li key={`${e.hash}-${e.logIndex}-${e.kind}`}><span className={`fi k-${e.kind}`}><Ico n={EV_ICON[e.kind]} size={14} /></span>
                    <div><b>{e.text}</b><span className="muted small">{e.actors[0] ? `${short(e.actors[0])} · ` : ""}{ago(e.time) || `block ${e.block}`}</span></div></li>
                ))}
              </ol>}
          </section>
        </aside>
      </div>
    </div>
  );
}
