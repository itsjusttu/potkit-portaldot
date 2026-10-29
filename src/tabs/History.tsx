import { useState } from "react";
import { fmt, short, type ChainEvent } from "../lib/chain";
import { Empty, Ico } from "../AppUi";
import { type Ctx } from "./ctx";
import { EV_ICON } from "./Explore";
import { blockUrl, download } from "./shared";
import { toCsv } from "./insights";

type Item = { key: string; t: number; block?: bigint; approx?: boolean; icon: string; tone: string; title: string; detail: string; money?: string; hash?: string; src: "chain" | "local" };
const LOCAL_ICON: Record<string, string> = { Faucet: "faucet", "Contracts deployed": "deploy", "Contract deployed": "deploy", "PotKit deployed": "deploy", "Shares sent": "send" };
const LABEL: Record<ChainEvent["kind"], string> = { mint: "Minted", lock: "Locked & issued shares", terms: "Terms set", due: "Due date set", settle: "Settled invoice", claim: "Claimed payout", redeem: "Redeemed", list: "Listed shares", buy: "Bought shares", cancel: "Cancelled listing" };

export function History({ c }: { c: Ctx }) {
  const [copied, setCopied] = useState("");
  const [filter, setFilter] = useState<"all" | "mint" | "trade" | "settle" | "claim">("all");
  const me = c.account;
  const myIds = new Set(c.rows.filter((r) => r.depositor.toLowerCase() === me.toLowerCase() || r.owner.toLowerCase() === me.toLowerCase()).map((r) => r.id));
  const chainItems: Item[] = [];
  const handled = new Set<string>();
  for (const e of c.events) {
    const ownsInvoice = myIds.has(e.id);
    const relevant = e.actors.some((a) => a.toLowerCase() === me.toLowerCase()) || ((e.kind === "terms" || e.kind === "settle") && ownsInvoice);
    if (!relevant) continue;
    if (e.kind === "lock") {
      const txKey = `${e.hash}-${e.id}`;
      if (handled.has(txKey)) continue;
      const terms = c.events.find((candidate) => candidate.kind === "terms" && candidate.id === e.id && candidate.hash === e.hash);
      if (terms) handled.add(txKey);
      const due = terms?.dueDate ? ` due ${new Date(terms.dueDate * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}` : "";
      chainItems.push({ key: `${e.hash}-${e.logIndex}-lock`, t: e.time * 1000, block: e.block, approx: e.timeApprox, icon: EV_ICON.lock, tone: "lock", title: "Locked", detail: `${e.amount?.toString() ?? "—"} shares${terms?.value ? ` · ${fmt(terms.value, 18)} tPOT${due}` : ""}`, hash: e.hash, src: "chain" });
      continue;
    }
    if (e.kind === "terms" && handled.has(`${e.hash}-${e.id}`)) continue;
    const isOwnSettle = e.kind === "settle" && !e.actors.some((a) => a.toLowerCase() === me.toLowerCase()) && ownsInvoice;
    const money = ["claim", "buy", "settle"].includes(e.kind) ? e.value : undefined;
    const amount = money === undefined ? undefined : `${e.kind === "buy" && e.actors[0]?.toLowerCase() === me.toLowerCase() ? "−" : e.kind === "claim" || e.kind === "buy" ? "+" : ""}${fmt(money, 18)} tPOT`;
    chainItems.push({
      key: `${e.hash}-${e.logIndex}-${e.kind}`, t: e.time * 1000, block: e.block, approx: e.timeApprox, icon: EV_ICON[e.kind], tone: e.kind,
      title: isOwnSettle ? `Your invoice #${e.id} was settled` : e.kind === "buy" && e.actors[0] !== me ? "Your shares were bought" : LABEL[e.kind],
      detail: isOwnSettle ? `${fmt(e.value ?? 0n, 18)} tPOT paid` : e.text,
      ...(amount !== undefined ? { money: amount } : {}),
      hash: e.hash, src: "chain",
    });
  }
  const seen = new Set(chainItems.map((x) => x.hash));
  const localDeployHashes = new Set<string>();
  const localItems: Item[] = c.log.filter((l) => {
    if (l.hash && seen.has(l.hash)) return false;
    const isDeploy = /deploy/i.test(l.action);
    if (isDeploy && l.hash) {
      if (localDeployHashes.has(l.hash.toLowerCase())) return false;
      localDeployHashes.add(l.hash.toLowerCase());
    }
    return true;
  }).map((l, i) => ({ key: `l${i}`, t: Date.parse(l.at), icon: LOCAL_ICON[l.action] ?? "info", tone: /deploy/i.test(l.action) ? "mint" : "other", title: l.action, detail: l.detail, hash: l.hash, src: "local" }));
  const all = [...chainItems, ...localItems].sort((a, b) => b.t - a.t);
  const matches = (it: Item) => filter === "all" || (filter === "mint" ? ["mint", "lock", "terms", "due"].includes(it.tone) : filter === "trade" ? ["list", "buy", "cancel"].includes(it.tone) : filter === "settle" ? it.tone === "settle" : ["claim", "redeem"].includes(it.tone));
  const visible = all.filter(matches);
  const unavailable = !c.eventsOk && !c.eventsLoading;
  if (!all.length && c.eventsLoading) return <div className="history" role="status"><p>Reading your on-chain history…</p></div>;
  if (!all.length && unavailable) return <><header className="tab-title"><h1>History</h1></header><Empty icon="◷" title="History unavailable" tone="warn" body="The RPC could not read the full event range. Try refreshing later; this is not proof that no transactions occurred." /></>;
  if (!all.length) return <><header className="tab-title"><h1>History</h1></header><Empty icon="◷" title="No activity found" body="No wallet activity was found in the scanned range. Earlier transactions may be outside that range." /></>;
  const kindLabel: Record<string, string> = { mint: "Issue", lock: "Lock", terms: "Terms", due: "Due date", settle: "Settle", claim: "Claim", redeem: "Redeem", list: "List", buy: "Trade", cancel: "Cancel", other: "Wallet" };
  return (
    <div className="history">
      <section className="history-intro"><div><p className="kicker">Wallet activity · Portaldot V3</p><h1>History</h1><p>Chain events found in the scanned range and actions saved in this browser, newest first.</p></div><div className="chips" role="group" aria-label="Filter activity">{([["all", "All"], ["mint", "Mint"], ["trade", "Trade"], ["settle", "Settle"], ["claim", "Claim"]] as const).map(([key, label]) => <button key={key} className={`chip ${filter === key ? "on" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div></section>
      {unavailable && <p className="banner" role="status">History unavailable for part of the block range — the RPC refused some event queries, so this list may be incomplete.</p>}
      <div className="history-tools"><div><b>{chainItems.length} on-chain events</b><p className="muted small">For {short(me)} in the scanned range{c.eventsLoading ? " · updating…" : ""}</p></div><div className="row"><button type="button" className="btn sm" onClick={() => download(`potkit-history-${me.slice(0, 8)}.csv`, toCsv(["date", "type", "activity", "detail", "amount", "status", "transaction"], visible.map((it) => [it.t ? new Date(it.t).toISOString() : "", kindLabel[it.tone] ?? "Activity", it.title, it.detail, it.money ?? "", it.src === "chain" ? "Confirmed" : "Local", it.hash ?? ""])), "text/csv")}><Ico n="copy" /> Export CSV</button><button type="button" className="btn sm" onClick={() => c.setTab("verify")}>Look up a receipt</button></div></div>
      {!visible.length && <Empty icon="◷" title="No events in this filter" body="Choose another activity type to see more of this wallet's timeline." />}
      {!!visible.length && <section className="history-table" role="table" aria-label="Wallet activity">
        <div className="history-row history-row-head" role="row"><span role="columnheader">Date</span><span role="columnheader">Type</span><span role="columnheader">Activity</span><span role="columnheader">Amount</span><span role="columnheader">Status</span><span role="columnheader">Transaction</span></div>
        {visible.map((it) => (
          <article className="history-row" role="row" key={it.key}>
            <time className="history-date num" role="cell" dateTime={it.t ? new Date(it.t).toISOString() : undefined}>{it.t ? <>{it.approx ? "~" : ""}{new Date(it.t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}<small>{new Date(it.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></> : it.block !== undefined ? `Block ${it.block}` : "Recent"}</time>
            <span className={`history-type tone-${it.tone}`} role="cell"><Ico n={it.icon} size={14} />{kindLabel[it.tone] ?? "Activity"}</span>
            <span className="history-activity" role="cell"><b>{it.title}</b><small>{it.detail}</small></span>
            <span className={`history-amount num ${it.money?.startsWith("+") ? "positive" : ""} ${it.money?.startsWith("−") ? "negative" : ""}`} role="cell">{it.money ?? "—"}</span>
            <span className="history-status" role="cell"><span className={`tag ${it.src === "chain" ? "paid" : ""}`}>{it.src === "chain" ? "Confirmed" : "Local"}</span></span>
            <span className="history-tx" role="cell">
              {it.hash ? <>
                <span className="mono">{short(it.hash)}</span>
                {it.src === "chain" ? (it.block !== undefined ? <a href={blockUrl(it.block)} target="_blank" rel="noreferrer" aria-label={`Open block ${it.block} (contains this transaction) in the node console`} title={`Open block ${it.block} in the node console`}><Ico n="ext" size={14} /></a> : null) : <span className="tag">Local</span>}
                <button className="wp-copy" aria-label={`Copy transaction hash ${it.hash}`} title={copied === it.key ? "Copied" : "Copy transaction hash"} onClick={() => void navigator.clipboard?.writeText(it.hash!).then(() => { setCopied(it.key); setTimeout(() => setCopied(""), 1300); })}><Ico n={copied === it.key ? "check" : "copy"} size={14} /></button>
              </> : <span className="muted">—</span>}
            </span>
          </article>
        ))}
      </section>}
    </div>
  );
}
