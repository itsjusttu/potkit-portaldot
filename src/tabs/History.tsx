import { useState } from "react";
import { fmt, short, type ChainEvent } from "../lib/chain";
import { Empty, Ico } from "../AppUi";
import { type Ctx } from "./ctx";
import { EV_ICON } from "./Explore";

type Item = { key: string; t: number; approx?: boolean; icon: string; tone: string; title: string; detail: string; money?: string; hash?: string; src: "chain" | "local" };
const LOCAL_ICON: Record<string, string> = { Faucet: "faucet", "Contracts deployed": "deploy", "Contract deployed": "deploy", "PotKit deployed": "deploy", "Shares sent": "send" };
const LABEL: Record<ChainEvent["kind"], string> = { mint: "Minted", lock: "Locked & issued shares", terms: "Terms set", due: "Due date set", settle: "Settled invoice", claim: "Claimed payout", redeem: "Redeemed", list: "Listed shares", buy: "Bought shares", cancel: "Cancelled listing" };

export function History({ c }: { c: Ctx }) {
  const [copied, setCopied] = useState("");
  const [filter, setFilter] = useState<"all" | "mint" | "trade" | "settle" | "claim">("all");
  const me = c.account;
  const myIds = new Set(c.rows.filter((r) => r.depositor === me || r.owner === me).map((r) => r.id));
  const chainItems: Item[] = [];
  const handled = new Set<string>();
  for (const e of c.events) {
    const ownsInvoice = myIds.has(e.id);
    const relevant = e.actors.includes(me as `0x${string}`) || ((e.kind === "terms" || e.kind === "settle") && ownsInvoice);
    if (!relevant) continue;
    if (e.kind === "lock") {
      const txKey = `${e.hash}-${e.id}`;
      if (handled.has(txKey)) continue;
      const terms = c.events.find((candidate) => candidate.kind === "terms" && candidate.id === e.id && candidate.hash === e.hash);
      if (terms) handled.add(txKey);
      const due = terms?.dueDate ? ` due ${new Date(terms.dueDate * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}` : "";
      chainItems.push({ key: `${e.hash}-${e.logIndex}-lock`, t: e.time * 1000, approx: e.timeApprox, icon: EV_ICON.lock, tone: "lock", title: "Locked", detail: `${e.amount?.toString() ?? "—"} shares${terms?.value ? ` · ${fmt(terms.value, 18)} tPOT${due}` : ""}`, hash: e.hash, src: "chain" });
      continue;
    }
    if (e.kind === "terms" && handled.has(`${e.hash}-${e.id}`)) continue;
    const isOwnSettle = e.kind === "settle" && !e.actors.includes(me as `0x${string}`) && ownsInvoice;
    const money = e.kind === "claim" || e.kind === "buy" ? e.value : undefined;
    chainItems.push({
      key: `${e.hash}-${e.logIndex}-${e.kind}`, t: e.time * 1000, approx: e.timeApprox, icon: EV_ICON[e.kind], tone: e.kind,
      title: isOwnSettle ? `Your invoice #${e.id} was settled` : e.kind === "buy" && e.actors[0] !== me ? "Your shares were bought" : LABEL[e.kind],
      detail: isOwnSettle ? `${fmt(e.value ?? 0n, 18)} tPOT paid` : e.text,
      ...(money !== undefined ? { money: `+${fmt(money, 18)} tPOT` } : {}),
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
  const groups = new Map<string, Item[]>();
  const today = new Date();
  for (const it of visible) {
    const date = it.t ? new Date(it.t) : null;
    const d = !date ? "Recent activity" : it.approx ? `~${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : date.toDateString() === today.toDateString() ? "Today" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    groups.set(d, [...(groups.get(d) ?? []), it]);
  }
  const unavailable = !c.eventsOk && !c.eventsLoading;
  if (!all.length && unavailable) return <Empty icon="◷" title="History unavailable" tone="warn" body="The RPC refused part of the event scan (eth_getLogs range limit or a timeout). Your actions still happened on-chain; try again later or set VITE_FROM_BLOCK to the deploy block." />;
  if (!all.length) return <Empty icon="◷" title="No transactions yet" body={c.eventsLoading ? "Reading your on-chain history…" : "Your mints, trades, settlements and claims appear here as a timeline."} />;
  return (
    <div className="history">
      <section className="history-intro"><div><p className="kicker">Wallet activity · Portaldot V3</p><h2>History</h2><p>Every verified action, ordered from newest to oldest.</p></div><div className="chips" role="group" aria-label="Filter activity">{([["all", "All"], ["mint", "Mint"], ["trade", "Trade"], ["settle", "Settle"], ["claim", "Claim"]] as const).map(([key, label]) => <button key={key} className={`chip ${filter === key ? "on" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div></section>
      {unavailable && <p className="banner" role="status">History unavailable for part of the block range — the RPC refused some event queries, so this list may be incomplete.</p>}
      <p className="muted small">{chainItems.length} on-chain events for {short(me)}</p>
      {!visible.length && <Empty icon="◷" title="No events in this filter" body="Choose another activity type to see more of this wallet's timeline." />}
      {[...groups.entries()].map(([d, items]) => (
        <section key={d} className="tl-day">
          <h2 className="tl-date">{d}</h2>
          <ol className="timeline">
            {items.map((it) => (
              <li key={it.key}>
                <span className={`tl-ico k-${it.tone}`} aria-hidden><Ico n={it.icon} /></span>
                <div className="tl-body">
                  <div className="tl-row"><b>{it.title}</b><span className="tl-meta">{it.money && <b className="tl-money green">{it.money}</b>}<time className="muted small num">{it.t ? `${it.approx ? "~" : ""}${new Date(it.t).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${new Date(it.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</time></span></div>
                  <span className="muted">{it.detail}</span>
                  {it.hash && <span className="tl-hash mono">{short(it.hash)}
                    <button className="wp-copy" aria-label={`Copy transaction hash ${it.hash}`} onClick={() => void navigator.clipboard?.writeText(it.hash!).then(() => { setCopied(it.key); setTimeout(() => setCopied(""), 1300); })}><Ico n={copied === it.key ? "check" : "copy"} size={14} />{copied === it.key ? "Copied" : "Copy"}</button>
                    {it.src === "chain" && <a className="tl-explorer" href={`https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/${it.hash}`} target="_blank" rel="noreferrer" aria-label={`Search transaction ${it.hash} in the Portaldot explorer`} title="Open transaction in the Portaldot explorer"><span aria-hidden>↗</span></a>}
                    {it.src === "local" && <span className="tag">local</span>}</span>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
