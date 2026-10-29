import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { explain, fmt, KINDS, loadRows, PAY_SYMBOL, readTokenUri, short, units, type ChainEvent, type Row } from "../lib/chain";
import { Addr, Ico } from "../AppUi";
import { type Ctx } from "./ctx";
import { blockUrl, day } from "./shared";
import { readReceiptHistory } from "./receipt-history";

type Check = { ok: boolean | null; k: string; v: ReactNode };

export function Verify({ c }: { c: Ctx }) {
  const [input, setInput] = useState(c.param("id") || "");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<{ row: Row; name: string; kind: string; at: Date } | null>(null);
  const [copied, setCopied] = useState("");
  const copy = async (value: string, key: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(""), 1500); } catch { /* Clipboard may be unavailable outside a secure context. */ }
  };
  const check = useCallback(async (raw: string) => {
    setRes(null);
    if (!c.addrs) return setMsg("No contracts configured. Open a PotKit link or deploy from Issue.");
    const v = raw.trim();
    let n = /^#?[1-9]\d*$/.test(v) ? Number(v.replace(/^#/, "")) : NaN;
    if (/^0x[0-9a-fA-F]{40}$/.test(v)) { const r = c.rows.find((x) => x.fraction && x.fraction.toLowerCase() === v.toLowerCase()); if (!r) return setMsg("Share token not found among loaded receipts. Search its receipt id instead."); n = r.id; }
    if (!Number.isSafeInteger(n) || n < 1) return setMsg("Enter a positive receipt id (e.g. 1) or a loaded KIT share-token address.");
    setMsg(""); setLoading(true); setRes(null);
    try {
      const [row] = await loadRows(c.addrs.vault, n, 1);
      if (!row) { setMsg(`Receipt #${n} does not exist on this contract.`); return; }
      const meta = await readTokenUri(c.addrs.receipt, n);
      setRes({ row, name: meta.name, kind: String(meta.attributes[0]?.value ?? ""), at: new Date() });
      lastLookup.current = `${c.addrs.vault}:${n}`;
      const q = new URLSearchParams(location.search); q.set("tab", "verify"); q.set("id", String(n)); history.replaceState(null, "", `${location.pathname}?${q}`);
    } catch (e) { const m = explain(e); setMsg(/HTTP request failed|fetch failed|Failed to fetch|timed out/i.test(m) ? "Could not reach the Portaldot node. Check your connection and try again." : m); } finally { setLoading(false); }
  }, [c.addrs, c.rows]);
  const lastLookup = useRef("");
  const routeId = c.param("id");
  useEffect(() => {
    if (!routeId || !c.addrs || lastLookup.current === `${c.addrs.vault}:${routeId}`) return;
    lastLookup.current = `${c.addrs.vault}:${routeId}`;
    setInput(routeId);
    void check(routeId);
  }, [routeId, c.addrs, check]);

  const r = res?.row;
  const vaultHeld = Boolean(r && c.addrs && r.owner.toLowerCase() === c.addrs.vault.toLowerCase());
  const hist = r ? c.events.filter((e) => e.id === r.id) : [];
  const receiptHistory = r ? readReceiptHistory(c.events).get(r.id) : undefined;
  // Redeeming clears live terms and share state, so restore the final receipt facts from its on-chain events.
  const lastRedeem = receiptHistory?.redeem;
  const paidEv = receiptHistory?.settle;
  const termsEv = receiptHistory?.terms;
  const lockEv = receiptHistory?.lock;
  const redeemed = Boolean(receiptHistory?.redeemed);
  const currentSettle = Boolean(r?.settle.settled || receiptHistory?.settled);
  const redeemedPaid = Boolean(r && redeemed && receiptHistory?.settled);
  const currentLock = Boolean(r && r.fraction && vaultHeld);
  const faceValue = r && r.settle.faceValue > 0n ? r.settle.faceValue : termsEv?.value ?? 0n;
  const dueDate = r?.dueDate || termsEv?.dueDate || 0;
  const sharesIssued = r?.supply && r.supply > 0n ? units(r.supply) : lockEv?.amount?.toString() ?? "";
  type ProofStep = { key: string; title: string; done: boolean; fallback: string; event?: ChainEvent; rank: number };
  const proofSteps: ProofStep[] = r ? [
    { key: "mint", title: "Receipt minted", done: true, fallback: "Receipt exists on-chain", event: hist.find((e) => e.kind === "mint"), rank: 0 },
    { key: "lock", title: "Receipt locked", done: vaultHeld || Boolean(lockEv), fallback: "Receipt is not currently held by PotKit", event: lockEv, rank: 1 },
    { key: "settle", title: "Debtor payment settled", done: Boolean(r.settle.settled || receiptHistory?.settled), fallback: "No settlement recorded", event: paidEv, rank: 2 },
    { key: "redeem", title: "Receipt redeemed", done: redeemed, fallback: "Not redeemed", event: lastRedeem, rank: 5 },
    ...hist.filter((e) => e.kind === "list").map((event, i) => ({ key: `list-${event.hash}-${i}`, title: `Shares listed · ${units(event.amount ?? 0n)}`, done: true, fallback: "", event, rank: 3 })),
    ...hist.filter((e) => e.kind === "buy").map((event, i) => ({ key: `buy-${event.hash}-${i}`, title: `Shares sold · ${units(event.amount ?? 0n)}`, done: true, fallback: "", event, rank: 3 })),
    ...hist.filter((e) => e.kind === "claim").map((event, i) => ({ key: `claim-${event.hash}-${i}`, title: `Payout claimed${event.value ? ` · +${fmt(event.value, 18)} ${PAY_SYMBOL}` : ""}`, done: true, fallback: "", event, rank: 4 })),
  ].sort((a, b) => a.event && b.event
    ? a.event.block === b.event.block ? a.event.logIndex - b.event.logIndex : a.event.block < b.event.block ? -1 : 1
    : a.event ? -1 : b.event ? 1 : a.rank - b.rank) : [];
  const checks: Check[] = r && redeemedPaid ? [
    { ok: true, k: "Receipt exists on-chain", v: <>{res!.name}{res!.kind ? ` · ${res!.kind}` : ""}</> },
    { ok: true, k: "Debtor payment", v: <>Paid {fmt(paidEv?.value ?? 0n, 18)} {PAY_SYMBOL} into PotKit{paidEv ? ` (block ${paidEv.block.toString()})` : ""}</> },
    { ok: termsEv ? (paidEv?.value ?? 0n) >= (termsEv.value ?? 0n) : null, k: "Paid at least face value", v: termsEv ? `${fmt(termsEv.value ?? 0n, 18)} ${PAY_SYMBOL} face value` : "—" },
    { ok: true, k: "Payout claimed and shares burned", v: "Every share was claimed before redemption" },
    { ok: null, k: "NFT returned to the depositor", v: <>Held by <Addr a={r.owner} /> as a paid receipt</> },
  ] : r ? [
    { ok: true, k: "Receipt exists on-chain", v: <>{res!.name}{res!.kind ? ` · ${res!.kind}` : ""}</> },
    { ok: r.fraction ? vaultHeld : null, k: "NFT locked in PotKit", v: vaultHeld ? <Addr a={r.owner} label="PotKit" /> : r.fraction ? <>Held by <Addr a={r.owner} /></> : "Not locked — still a plain NFT" },
    { ok: r.fraction ? true : null, k: "Share token issued", v: r.fraction ? <><Addr a={r.fraction} label={`KIT${r.id}`} /> {units(r.supply)} shares</> : "No shares" },
    { ok: r.settle.faceValue > 0n ? true : null, k: "Payment terms on-chain", v: r.settle.faceValue > 0n ? <>{fmt(r.settle.faceValue, r.settle.decimals)} {r.settle.symbol}{r.dueDate ? ` · due ${day(r.dueDate)}` : ""}</> : "No terms set" },
    { ok: r.settle.settled ? true : r.status === "Overdue" ? false : null, k: "Debtor payment", v: r.settle.settled ? <>Paid {fmt(r.settle.amount, r.settle.decimals)} {r.settle.symbol} · {fmt(r.settle.paidOut, r.settle.decimals)} claimed</> : r.status === "Overdue" ? "Overdue — not paid" : "Not yet due" },
    { ok: r.settle.settled ? r.settle.amount >= r.settle.faceValue : null, k: "Paid at least face value", v: r.settle.settled ? (r.settle.amount >= r.settle.faceValue ? "Yes" : "Short-paid") : "—" },
  ] : [];
  const fails = checks.filter((x) => x.ok === false).length;
  const shortPaid = Boolean(r && r.settle.settled && r.settle.faceValue > 0n && r.settle.amount < r.settle.faceValue);
  const verdict = !r ? "" : shortPaid ? "SHORT-PAID" : fails ? "CHECKS FAILED" : redeemedPaid ? "PAID · REDEEMED" : r.status === "Overdue" && !currentSettle ? "OVERDUE · UNPAID" : currentSettle ? "SETTLED" : currentLock ? "LOCKED · UNPAID" : r.fraction ? "UNBACKED" : "RECEIPT ONLY";
  const link = r && c.addrs ? `${location.origin}${location.pathname}?kit=${c.addrs.vault}&tab=verify&id=${r.id}` : "";

  return (
    <div className="verify">
      <section className="verify-intro"><div><p className="kicker">Public verification · Portaldot V3</p><h1>Verify an invoice</h1><p>Read the receipt, custody and settlement state directly from the selected PotKit contract.</p></div><span className="verify-network"><i /> Chain 420420777</span></section>
      <div className="verify-scope"><Ico n="info" /><p><b>What this proof checks:</b> receipt and share-token state, custody, terms and settlement events read from Portaldot. It does not independently confirm that the off-chain invoice or claim is genuine.</p></div>
      <div className="verify-lookup">
        <div className="verify-lookup-copy"><h3>Look up a receipt</h3><p>Enter a receipt ID to read current contract state. A share-token address can find a receipt in the loaded range.</p></div>
        <form className="v-search" onSubmit={(e) => { e.preventDefault(); void check(input); }}>
          <label htmlFor="v-in" className="sr-only">Receipt id or share-token address</label>
          <div className="tb-search"><Ico n="search" /><input id="v-in" placeholder="Receipt id (e.g. 4) or KIT share-token address" value={input} onChange={(e) => setInput(e.target.value)} /></div>
          <button className="btn primary" type="submit" disabled={loading}>{loading ? "Reading…" : "Verify on-chain"}</button>
        </form>
      </div>
      {msg && <p className="banner err" role="alert">{msg}</p>}
      {loading && !res && <p className="muted" role="status">Reading Portaldot…</p>}
      {!res && !loading && !msg && <p className="muted verify-empty">Enter a receipt id to inspect its current on-chain state. Share-token address lookup covers loaded receipts only.</p>}
      {res && r && (
        <div className="verify-result" aria-live="polite">
          <article className={`cert ${fails ? "bad" : currentSettle || currentLock ? "good" : "warn"}`}>
            <i className="c-c tl" /><i className="c-c tr" /><i className="c-c bl" /><i className="c-c br" />
            <header className="cert-head">
              <div>
                <p className="kicker">PotKit receipt · Invoice #{r.id}</p>
                <h2 className="cert-title">{r.note || KINDS[r.kind]}</h2>
                <p className="cert-note">{KINDS[r.kind]} · ERC-721</p>
              <div className="cert-status">{currentSettle && <span className="is-paid">● SETTLED</span>}{!currentSettle && !redeemed && <span>● UNPAID</span>}{redeemed && <span className="is-redeemed">● REDEEMED</span>}{!redeemed && <span>{currentLock ? "● LOCKED IN POTKIT" : "● NOT LOCKED"}</span>}</div>
              </div>
              <div className="seal" aria-label={`Verdict: ${verdict}`}>
                <svg viewBox="0 0 120 120" aria-hidden><circle cx="60" cy="60" r="54" /><circle cx="60" cy="60" r="44" /><path d={fails ? "M44 44l32 32M76 44 44 76" : "M40 61l14 14 27-30"} /></svg>
                <b>{verdict}</b>
              </div>
            </header>
            <dl className="cert-facts">
              <div><dt>FACE VALUE</dt><dd>{faceValue ? `${fmt(faceValue, r.settle.decimals || 18)} ${r.settle.symbol || PAY_SYMBOL}` : "Not set"}</dd></div>
              <div><dt>SHARES ISSUED</dt><dd>{sharesIssued || "Not issued"}</dd></div>
              <div><dt>DUE DATE</dt><dd>{dueDate ? day(dueDate) : "Not set"}</dd></div>
              <div><dt>RECEIPT OWNER</dt><dd><Addr a={r.owner} /></dd></div>
            </dl>
            {redeemedPaid && <div className="cert-summary"><Ico n="check" size={16} /><span>Settled {fmt(paidEv?.value ?? faceValue, 18)} {PAY_SYMBOL} · {sharesIssued}/{sharesIssued} shares paid out · Lifecycle complete</span></div>}
            <footer className="cert-foot">
              <div className="cert-contract"><span>CONTRACT</span><Addr a={c.addrs!.vault} label="PotKit · Portaldot V3" /></div>
              <button className="btn" onClick={() => void copy(link, "proof")}><Ico n={copied === "proof" ? "check" : "link"} /> {copied === "proof" ? "Link copied" : "Share proof"}</button>
            </footer>
            <p className="cert-disclaimer">Read {res.at.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })} from chain 420420777. This proves on-chain state, not the authenticity of off-chain invoice documents.</p>
          </article>
          <aside className="proof-trail">
            <header><div><h3>On-chain proof trail</h3><p className="muted">Earlier cycles may share this receipt ID and token address. Current status is shown above; events below span the readable history.</p></div><span>{hist.length}<small>events loaded</small></span></header>
            {!c.eventsOk && <p className="proof-scan-note">The RPC event scan is incomplete. Missing steps below may exist outside the range that could be read.</p>}
            <ol className="proof-events">{proofSteps.map((step) => (
              <li key={step.key} className={step.done ? "done" : "pending"}>
                <span className="proof-event-icon"><Ico n={step.done ? "check" : "dash"} size={14} /></span>
                <div className="proof-event-body"><b>{step.title}</b>
                  {step.event ? <><small>Block {step.event.block.toString()}{step.event.time ? ` · ${step.event.timeApprox ? "~" : ""}${new Date(step.event.time * 1000).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}</small><div className="proof-tx-actions"><a className="proof-tx" href={blockUrl(step.event.block)} target="_blank" rel="noreferrer" aria-label={`Open block ${step.event.block} (contains transaction ${step.event.hash}) in the node console`}><code>{short(step.event.hash)}</code><span>Open block ↗</span></a><button type="button" className="proof-tx" title="Copy full transaction hash" onClick={() => void copy(step.event!.hash, step.event!.hash)}>{copied === step.event.hash ? "Copied" : "Copy tx"}</button></div></>
                    : <small>{step.done ? step.fallback : c.eventsOk ? step.fallback : "Not found in the readable event range"}</small>}
                </div>
              </li>
            ))}</ol>
            <details className="proof-checks"><summary>On-chain state checks</summary><ul className="vchecks">{checks.map((x) => (
              <li key={x.k} className={x.ok === true ? "pass" : x.ok === false ? "fail" : "na"}>
                <span className="vc-i"><Ico n={x.ok === true ? "check" : x.ok === false ? "x" : "dash"} /></span>
                <span className="vc-k">{x.k}<span className="sr-only">: {x.ok === true ? "pass" : x.ok === false ? "fail" : "not applicable"}</span><small>{x.v}</small></span>
              </li>
            ))}</ul></details>
          </aside>
        </div>
      )}
    </div>
  );
}
