import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { explain, fmt, KINDS, loadRows, PAY_SYMBOL, readTokenUri, units, type ChainEvent, type Row } from "../lib/chain";
import { Addr, Ico } from "../AppUi";
import { type Ctx } from "./ctx";
import { day, SettleBadge } from "./shared";

type Check = { ok: boolean | null; k: string; v: ReactNode };

export function Verify({ c }: { c: Ctx }) {
  const [input, setInput] = useState(c.param("id") || "1");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<{ row: Row; name: string; kind: string; at: Date } | null>(null);
  const [copied, setCopied] = useState(false);
  const check = useCallback(async (raw: string) => {
    if (!c.addrs) return setMsg("No contracts configured.");
    const v = raw.trim();
    let n = Number(v.replace(/^#/, ""));
    if (/^0x[0-9a-fA-F]{40}$/.test(v)) { const r = c.rows.find((x) => x.fraction && x.fraction.toLowerCase() === v.toLowerCase()); if (!r) return setMsg("That address is not a PotKit share token on this vault."); n = r.id; }
    if (!Number.isInteger(n) || n < 1) return setMsg("Enter a receipt id (e.g. 1) or a KIT share-token address.");
    setMsg(""); setLoading(true); setRes(null);
    try {
      const [row] = await loadRows(c.addrs.vault, n, 1);
      if (!row) { setMsg(`Receipt #${n} does not exist on this contract.`); return; }
      const meta = await readTokenUri(c.addrs.receipt, n);
      setRes({ row, name: meta.name, kind: String(meta.attributes[0]?.value ?? ""), at: new Date() });
      const q = new URLSearchParams(location.search); q.set("tab", "verify"); q.set("id", String(n)); history.replaceState(null, "", `${location.pathname}?${q}`);
    } catch (e) { setMsg(explain(e)); } finally { setLoading(false); }
  }, [c.addrs, c.rows]);
  const ran = useRef(false);
  useEffect(() => { if (c.addrs && !ran.current) { ran.current = true; void check(input); } }, [c.addrs, check, input]);

  const r = res?.row;
  const vaultHeld = Boolean(r && c.addrs && r.owner.toLowerCase() === c.addrs.vault.toLowerCase());
  // A redeemed receipt has its settlement storage cleared (refunding the deposit); its payment history lives on in
  // PotKit's Activity events. Paid + fully claimed + redeemed is the happy end of the lifecycle, not "unbacked".
  const before = (x: ChainEvent, y: ChainEvent) => x.block < y.block || (x.block === y.block && x.logIndex < y.logIndex);
  const hist = r ? c.events.filter((e) => e.id === r.id) : [];
  const lastRedeem = hist.find((e) => e.kind === "redeem");
  const paidEv = lastRedeem && hist.find((e) => e.kind === "settle" && before(e, lastRedeem));
  const termsEv = paidEv && hist.find((e) => e.kind === "terms" && before(e, paidEv));
  const redeemedPaid = Boolean(r && !vaultHeld && !r.fraction && paidEv);
  const checks: Check[] = r && redeemedPaid ? [
    { ok: true, k: "Receipt exists on-chain", v: <>{res!.name}{res!.kind ? ` · ${res!.kind}` : ""}</> },
    { ok: true, k: "Debtor payment", v: <>Paid {fmt(paidEv!.value ?? 0n, 18)} {PAY_SYMBOL} into PotKit (block {paidEv!.block.toString()})</> },
    { ok: termsEv ? (paidEv!.value ?? 0n) >= (termsEv.value ?? 0n) : null, k: "Paid at least face value", v: termsEv ? `${fmt(termsEv.value ?? 0n, 18)} ${PAY_SYMBOL} face value` : "—" },
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
  const verdict = !r ? "" : fails ? "ISSUES FOUND" : redeemedPaid ? "PAID · REDEEMED" : r.fraction && vaultHeld ? "VERIFIED" : "UNBACKED";
  const link = r && c.addrs ? `${location.origin}${location.pathname}?kit=${c.addrs.vault}&tab=verify&id=${r.id}` : "";

  return (
    <div className="verify">
      <div className="verify-scope"><Ico n="info" /><p><b>What this proof checks:</b> receipt and share-token state, custody, terms and settlement events read from Portaldot. It does not independently confirm that the off-chain invoice or claim is genuine.</p></div>
      <form className="v-search" onSubmit={(e) => { e.preventDefault(); void check(input); }}>
        <label htmlFor="v-in" className="sr-only">Receipt id or share-token address</label>
        <div className="tb-search"><Ico n="search" /><input id="v-in" placeholder="Receipt id (e.g. 4) or KIT share-token address" value={input} onChange={(e) => setInput(e.target.value)} /></div>
        <button className="btn primary" type="submit" disabled={loading}>{loading ? "Reading…" : "Verify on-chain"}</button>
      </form>
      {msg && <p className="banner err" role="alert">{msg}</p>}
      {loading && !res && <p className="muted" role="status">Reading Portaldot…</p>}
      {res && r && (
        <article className={`cert ${fails ? "bad" : verdict === "VERIFIED" || redeemedPaid ? "good" : "warn"}`} aria-live="polite">
          <i className="c-c tl" /><i className="c-c tr" /><i className="c-c bl" /><i className="c-c br" />
          <header className="cert-head">
            <div>
              <p className="kicker">Certificate of verification</p>
              <h2 className="cert-title">Receipt #{r.id} · {KINDS[r.kind]}</h2>
              <p className="cert-note">{r.note}</p>
              <div className="tags"><SettleBadge r={r} /></div>
            </div>
            <div className="seal" aria-label={`Verdict: ${verdict}`}>
              <svg viewBox="0 0 120 120" aria-hidden><circle cx="60" cy="60" r="54" /><circle cx="60" cy="60" r="44" /><path d={fails ? "M44 44l32 32M76 44 44 76" : "M40 61l14 14 27-30"} /></svg>
              <b>{verdict}</b>
            </div>
          </header>
          <ul className="vchecks">
            {checks.map((x) => (
              <li key={x.k} className={x.ok === true ? "pass" : x.ok === false ? "fail" : "na"}>
                <span className="vc-i"><Ico n={x.ok === true ? "check" : x.ok === false ? "x" : "dash"} /></span>
                <span className="vc-k">{x.k}<span className="sr-only">: {x.ok === true ? "pass" : x.ok === false ? "fail" : "not applicable"}</span></span><span className="vc-v">{x.v}</span>
              </li>
            ))}
          </ul>
          <footer className="cert-foot">
            <div className="muted small">Read {res.at.toLocaleString()} directly from the PotKit contract <Addr a={c.addrs!.vault} label="PotKit" /> on Portaldot V3 (chain 420420777). No PotKit server involved.</div>
            <button className="btn" onClick={() => void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}><Ico n={copied ? "check" : "link"} /> {copied ? "Link copied" : "Copy shareable link"}</button>
          </footer>
        </article>
      )}
    </div>
  );
}
