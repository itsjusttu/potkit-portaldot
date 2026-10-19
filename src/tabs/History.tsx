import { useState } from "react";
import { short, type ChainEvent } from "../lib/chain";
import { Empty, Ico } from "../AppUi";
import { type Ctx } from "./ctx";
import { EV_ICON } from "./Explore";

type Item = { key: string; t: number; icon: string; title: string; detail: string; hash?: string; src: "chain" | "local" };
const LOCAL_ICON: Record<string, string> = { Faucet: "faucet", "Contracts deployed": "deploy", "Contract deployed": "deploy", "PotKit deployed": "deploy", "Shares sent": "send" };
const LABEL: Record<ChainEvent["kind"], string> = { mint: "Minted", lock: "Locked & issued shares", terms: "Terms set", due: "Due date set", settle: "Settled invoice", claim: "Claimed payout", redeem: "Redeemed", list: "Listed shares", buy: "Bought shares", cancel: "Cancelled listing" };

export function History({ c }: { c: Ctx }) {
  const [copied, setCopied] = useState("");
  const me = c.account;
  const myIds = new Set(c.rows.filter((r) => r.depositor === me || r.owner === me).map((r) => r.id));
  const chainItems: Item[] = c.events
    .filter((e) => e.actors.includes(me as `0x${string}`) || (e.kind === "terms" && myIds.has(e.id)))
    .map((e) => ({ key: `${e.hash}-${e.logIndex}`, t: e.time * 1000, icon: EV_ICON[e.kind], title: e.kind === "buy" && e.actors[0] !== me ? "Your shares were bought" : LABEL[e.kind], detail: e.text, hash: e.hash, src: "chain" }));
  const seen = new Set(chainItems.map((x) => x.hash));
  const localItems: Item[] = c.log.filter((l) => !l.hash || !seen.has(l.hash)).map((l, i) => ({ key: `l${i}`, t: Date.parse(l.at), icon: LOCAL_ICON[l.action] ?? "info", title: l.action, detail: l.detail, hash: l.hash, src: "local" }));
  const all = [...chainItems, ...localItems].sort((a, b) => b.t - a.t);
  const groups = new Map<string, Item[]>();
  for (const it of all) { const d = it.t ? new Date(it.t).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" }) : "Unknown date"; groups.set(d, [...(groups.get(d) ?? []), it]); }
  const unavailable = !c.eventsOk && !c.eventsLoading;
  if (!all.length && unavailable) return <Empty icon="◷" title="History unavailable" tone="warn" body="The RPC refused part of the event scan (eth_getLogs range limit or a timeout). Your actions still happened on-chain; try again later or set VITE_FROM_BLOCK to the deploy block." />;
  if (!all.length) return <Empty icon="◷" title="No transactions yet" body={c.eventsLoading ? "Reading your on-chain history…" : "Your mints, trades, settlements and claims appear here as a timeline."} />;
  return (
    <div className="history">
      {unavailable && <p className="banner" role="status">History unavailable for part of the block range — the RPC refused some event queries, so this list may be incomplete.</p>}
      <p className="muted small">{chainItems.length} on-chain event{chainItems.length === 1 ? "" : "s"} for {short(me)} (since deploy block) · {localItems.length} local-only action{localItems.length === 1 ? "" : "s"}.</p>
      {[...groups.entries()].map(([d, items]) => (
        <section key={d} className="tl-day">
          <h2 className="tl-date">{d}</h2>
          <ol className="timeline">
            {items.map((it) => (
              <li key={it.key}>
                <span className="tl-ico" aria-hidden><Ico n={it.icon} /></span>
                <div className="tl-body">
                  <div className="tl-row"><b>{it.title}</b><span className="muted small num">{it.t ? new Date(it.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span></div>
                  <span className="muted">{it.detail}</span>
                  {it.hash && <span className="tl-hash mono">{short(it.hash)}
                    <button className="wp-copy" aria-label={`Copy transaction hash ${it.hash}`} onClick={() => void navigator.clipboard?.writeText(it.hash!).then(() => { setCopied(it.key); setTimeout(() => setCopied(""), 1300); })}><Ico n={copied === it.key ? "check" : "copy"} size={14} />{copied === it.key ? "Copied" : "Copy"}</button>
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
