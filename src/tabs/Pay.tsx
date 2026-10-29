import { useEffect, useState } from "react";
import type { Address } from "viem";
import { fmt, KINDS, units } from "../lib/chain";
import { checkAck, signAck } from "../lib/ack";
import { Addr, Empty, Ico, toast } from "../AppUi";
import type { Ctx } from "./ctx";
import { day, SettleBadge, Term, txBlock, Why } from "./shared";
import { issuerRecord, parseAck, recordLabel } from "./insights";

/** The debtor's page: one invoice, the amount due, an optional free acknowledgement signature and the pay button.
    Opened from a link the issuer shares (?tab=pay&id=N); works read-only until the visitor wants to sign or pay. */
export function Pay({ c }: { c: Ctx }) {
  const id = Number(c.param("id"));
  const r = c.rows.find((x) => x.id === id);
  const ack = parseAck(c.param("ack"), c.param("by"));
  const [ackOk, setAckOk] = useState<boolean | null>(null);
  const [signed, setSigned] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setAckOk(null);
    if (!ack || !r || !c.addrs) return;
    let live = true;
    void checkAck(c.addrs.vault, r, ack.sig, ack.by).then((ok) => { if (live) setAckOk(ok); });
    return () => { live = false; };
  }, [ack?.sig, ack?.by, r?.id, r?.settle.faceValue, r?.dueDate, r?.note, c.addrs?.vault]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = (extra = "") => `${c.judgeLink}&tab=pay&id=${id}${extra}`;
  const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => toast({ kind: "ok", title: `${what} copied`, detail: "Paste it into a message to the other party." })).catch(() => toast({ kind: "err", title: "Copy failed", detail: text }));
  const head = <header className="pay-head"><h1>Pay invoice{Number.isFinite(id) && id > 0 ? ` #${id}` : ""}</h1><p className="muted">A payment page for the debtor. Paying settles the receipt on-chain and every share holder can then claim their part.</p></header>;

  if (!c.addrs) return <div className="pay">{head}<Empty icon="⇄" title="No PotKit deployment loaded" body="Open the full pay link you received; it names the PotKit contract." /></div>;
  if (!(id > 0)) return <div className="pay">{head}<Empty icon="▤" title="No receipt in this link" body="A pay link ends with &id= and the receipt number. Ask the issuer for the full link."><button className="btn sm" onClick={() => c.setTab("verify")}>Look up a receipt</button></Empty></div>;
  if (c.loading) return <div className="pay">{head}<p className="muted" role="status">Reading receipt #{id} from Portaldot…</p></div>;
  if (!r) return <div className="pay">{head}<Empty icon="▤" title={`Receipt #${id} is not in the loaded range`} body="It may not exist on this contract, or it is older than the receipts loaded here."><button className="btn sm" onClick={() => c.setTab("verify", { id: String(id) })}>Verify #{id}</button></Empty></div>;

  const rec = issuerRecord(r.depositor || r.owner, c.rows, c.events);
  const payBlock = !r.fraction || !(r.settle.faceValue > 0n) ? "The issuer has not locked this receipt with payment terms yet, so it cannot be paid." : r.settle.settled ? "This invoice is already paid." : txBlock(c);
  const signBlock = r.settle.settled ? "Already paid; no acknowledgement needed." : "";
  const sign = async () => {
    if (!c.account || !c.addrs) { c.connect(); return; }
    setBusy(true);
    try {
      const sig = await signAck(c.account, c.addrs.vault, r);
      const out = link(`&ack=${sig}&by=${c.account}`); setSigned(out);
      c.note("Invoice acknowledged", `#${r.id} · signature only, no transaction`);
    } catch (e) { toast({ kind: "err", title: "Not signed", detail: e instanceof Error ? e.message.split("\n")[0]! : "The wallet did not return a signature." }); }
    finally { setBusy(false); }
  };

  return (
    <div className="pay">
      {head}
      <div className="pay-grid">
        <article className="pay-doc" aria-label={`Invoice ${r.id}`}>
          <header><span className="pay-doc-id">RECEIPT #{r.id}</span><div className="tags"><SettleBadge r={r} terms={false} /></div></header>
          <h2>{r.note || KINDS[r.kind]}</h2>
          <dl className="pay-facts">
            <div><dt>Kind</dt><dd>{KINDS[r.kind]}</dd></div>
            <div><dt>Issuer</dt><dd>{r.depositor ? <Addr a={r.depositor} /> : <Addr a={r.owner} />}</dd></div>
            <div><dt>Issuer record</dt><dd>{recordLabel(rec)}</dd></div>
            <div><dt>Due date</dt><dd className="num">{r.dueDate ? day(r.dueDate) : "No due date"}</dd></div>
            <div><dt><Term k="share">Shares</Term></dt><dd className="num">{r.fraction ? units(r.supply) : "Not issued"}</dd></div>
            <div><dt>Contract</dt><dd><Addr a={c.addrs.vault} /></dd></div>
          </dl>
          <p className="pay-scope">Issuer-provided record. PotKit shows what is on-chain; it does not verify the invoice itself.</p>

          <section className="pay-ack" aria-labelledby="ack-h">
            <h3 id="ack-h">Debtor acknowledgement</h3>
            {ack ? (
              ackOk === null ? <p className="muted" role="status">Checking the signature…</p>
              : ackOk ? <p className="pay-ack-ok"><Ico n="check" size={16} /><span><b>Signed by <Addr a={ack.by} /></b> for these exact terms. A signature shows which wallet agreed; it does not prove who owns that wallet.</span></p>
              : <p className="pay-ack-bad" role="alert"><b>Signature does not match.</b> It was not made by {ack.by.slice(0, 8)}… for the current terms (the terms may have changed since signing).</p>
            ) : signed ? (
              <div className="pay-ack-done"><p><Ico n="check" size={16} /> Signed. Send this link back to the issuer; anyone who opens it can check the signature.</p><code className="mono">{signed}</code><button className="btn sm" onClick={() => copy(signed, "Acknowledged link")}><Ico n="copy" /> Copy link</button></div>
            ) : (
              <><p className="muted">Are you the debtor? Sign once to confirm you owe this invoice on these terms. It is a free wallet signature, not a transaction, and it moves no funds.</p>
                <button className="btn sm" disabled={busy || Boolean(signBlock && c.account)} onClick={() => void sign()}>{busy ? "Confirm in wallet…" : !c.account ? "Connect wallet to sign" : "Sign acknowledgement"}</button><Why text={signBlock} /></>
            )}
          </section>
        </article>

        <aside className="pay-panel" aria-label="Payment">
          <span className="pay-label"><Term k="face">Amount due</Term></span>
          <strong className="pay-amount num">{r.settle.faceValue > 0n ? `${fmt(r.settle.faceValue, r.settle.decimals)} tPOT` : "—"}</strong>
          <small className="muted">{r.settle.settled ? `Paid ${fmt(r.settle.amount, r.settle.decimals)} tPOT` : "Minimum payment. Anyone can pay."}</small>
          <button className="btn primary block" disabled={Boolean(payBlock && c.account) || (!c.account && Boolean(r.settle.settled || !r.fraction))} onClick={() => { if (!c.account) { c.connect(); return; } if (c.gated) { c.switchNetwork(); return; } c.openPay(r.id); }}>{r.settle.settled ? "Paid" : !c.account ? "Connect wallet to pay" : "Review and pay"}</button>
          <Why text={c.account ? payBlock : ""} />
          <p className="pay-warn">Payment is final. Paying more than the amount due sends the extra to share holders and it is not refunded; you will be asked to confirm.</p>
          <div className="pay-links">
            <button className="btn sm" onClick={() => copy(link(ack ? `&ack=${ack.sig}&by=${ack.by}` : ""), "Pay link")}><Ico n="link" /> Copy pay link</button>
            <button className="btn sm" onClick={() => c.setTab("verify", { id: String(r.id) })}><Ico n="shield" /> Verify</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
