import { useState, type ReactNode } from "react";
import { Ico } from "../AppUi";
import { FaucetButton } from "../Faucet";
import type { Ctx, Tab } from "./ctx";

const KEY = "potkit.tour.hidden";
const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export type Step = { t: string; d: string; done: boolean; go?: [string, Tab, Record<string, string>?]; extra?: ReactNode };
/** The eight lifecycle steps, each ticked only from on-chain state for the connected wallet. */
export function lifecycleSteps(c: Ctx): Step[] {
  const me = c.account;
  const mine = (kind: string) => c.events.some((e) => e.kind === kind && same(e.actors[0], me));
  const minted = c.rows.some((r) => same(r.owner, me) || same(r.depositor, me)) || mine("mint");
  const locked = c.rows.some((r) => same(r.depositor, me) && Boolean(r.fraction)) || mine("lock");
  const listed = c.listings.some((l) => same(l.seller, me)) || mine("list");
  const bought = mine("buy");
  const settledMine = c.events.some((e) => e.kind === "settle" && (same(e.actors[0], me) || c.rows.some((r) => r.id === e.id && same(r.depositor, me))));
  const claimed = mine("claim");
  // minting is limited to the issuer and approved minters (PotKit.yul "not minter"); do not point other wallets at it
  const cannotMint = Boolean(me) && !c.loading && !c.canMint && !minted;
  const firstLocked = c.rows.find((r) => same(r.depositor, me) && r.fraction && !r.settle.settled);
  return [
    { t: "Connect a wallet", d: "Any EVM browser wallet. Explore and Verify work without one.", done: Boolean(me), go: me ? undefined : ["Connect", "dashboard"] },
    { t: "Get testnet gas", d: "tPOT pays for gas and purchases and has no real value. The PotKit faucet is closed; the Portaldot team hands out test tokens (Discord).", done: (c.native ?? 0n) > 0n, extra: me && !((c.native ?? 0n) > 0n) ? <FaucetButton account={me} compact onFunded={() => void c.refresh()} /> : undefined },
    { t: "Mint a receipt", d: cannotMint ? "This wallet cannot mint on this deployment: only the issuer or an approved minter can. Ask the issuer to approve your address, or run the local demo (README)." : "Describe an invoice and mint it as an ERC-721 receipt.", done: minted, go: cannotMint ? undefined : ["Issue", "issue"] },
    { t: "Lock it into shares", d: cannotMint ? "Needs a receipt you own; receipts are minted by the issuer or an approved minter." : "Set face value, due date and share count in one transaction.", done: locked, go: cannotMint ? undefined : ["Add terms", "issue"] },
    { t: "List shares for sale", d: "Offer some shares at a discount to raise tPOT now.", done: listed, go: ["Sell", "trade", firstLocked ? { sell: String(firstLocked.id) } : {}] },
    { t: "Buy shares", d: "Use a second wallet to buy from a listing (you cannot buy your own).", done: bought, go: ["Trade", "trade"] },
    { t: "Settle the invoice", d: "Pay at least the face value through the debtor's pay page.", done: settledMine, go: ["Open pay page", "pay", firstLocked ? { id: String(firstLocked.id) } : {}] },
    { t: "Claim the payout", d: "Each holder withdraws their pro-rata part of the payment.", done: claimed, go: ["Portfolio", "portfolio"] },
  ];
}

/** Guided lifecycle for first-time visitors and judges. Each step is ticked only from what this wallet has done on
    the loaded deployment (balances, receipts, listings and scanned events), never from clicks in the tour itself. */
export function Tour({ c }: { c: Ctx }) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === "1" && !/[?&]tour=1/.test(location.search); } catch { return false; } });
  const hide = (v: boolean) => { setHidden(v); try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* storage blocked */ } };
  if (hidden) return <button type="button" className="tour-reopen" onClick={() => hide(false)}><Ico n="info" size={14} /> Show the lifecycle walkthrough</button>;

  const steps = lifecycleSteps(c);
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className="tour" aria-labelledby="tour-h">
      <header><div><h2 id="tour-h">Try the full lifecycle</h2><p className="muted">Each step is checked against this wallet's on-chain activity on Portaldot V3 testnet.</p></div>
        <div className="tour-meta"><span className="num">{done}/{steps.length}</span><button type="button" className="btn sm" onClick={() => hide(true)}>Hide</button></div></header>
      <div className="tour-bar" role="progressbar" aria-label="Lifecycle progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol>{steps.map((s, i) => (
        <li key={s.t} className={s.done ? "done" : i === next ? "next" : ""}>
          <span className="tour-n" aria-hidden>{s.done ? <Ico n="check" size={14} /> : i + 1}</span>
          <span className="tour-t"><b>{s.t}</b><small>{s.done ? "Done on-chain" : s.d}</small></span>
          {!s.done && i === next && (s.extra ?? (s.go && <button type="button" className="btn sm" onClick={() => s.go![1] === "dashboard" && !c.account ? c.connect() : c.setTab(s.go![1], s.go![2] ?? {})}>{s.go[0]} <Ico n="arrow" size={14} /></button>))}
        </li>
      ))}</ol>
    </section>
  );
}
