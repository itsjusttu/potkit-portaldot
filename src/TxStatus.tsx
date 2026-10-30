import { useEffect, useRef, useState } from "react";
import { onTx, type TxEvent } from "./lib/chain";
import type { TxPhase } from "./hooks/useTx";

type Step = "wait" | "now" | "done" | "fail";
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

/**
 * Step-by-step feedback for the write in flight: confirm in the wallet, broadcast, confirmed or failed.
 * It only listens to the phase from useTx and the chain layer's tx events; it never sends anything.
 * A success closes itself after a while; a failure stays until dismissed (the toast carries the reason).
 */
export function TxStatus({ phase }: { phase: TxPhase }) {
  const [shown, setShown] = useState<TxPhase>("idle");
  const [ev, setEv] = useState<TxEvent | null>(null);
  const [copied, setCopied] = useState(false);
  const prev = useRef<TxPhase>("idle");

  useEffect(() => onTx(setEv), []);
  useEffect(() => {
    const was = prev.current;
    prev.current = phase;
    if (phase === "signing") { setEv(null); setCopied(false); setShown("signing"); }
    else if (phase === "pending" || phase === "success" || phase === "error") setShown(phase);
    else if (was === "signing") setShown("idle"); // rejected in the wallet: the toast says so, nothing to track
  }, [phase]);
  useEffect(() => {
    if (shown !== "success") return;
    const t = window.setTimeout(() => setShown("idle"), 8000);
    return () => window.clearTimeout(t);
  }, [shown]);

  if (shown === "idle") return null;
  const failed = shown === "error" || ev?.state === "failed";
  const s1: Step = shown === "signing" ? "now" : ev || shown !== "error" ? "done" : "fail";
  const s2: Step = !ev ? "wait" : ev.state === "failed" ? "fail" : shown === "pending" ? "now" : "done";
  const s3: Step = failed ? "fail" : shown === "success" ? "done" : "wait";
  const title = failed ? "Transaction not completed" : shown === "success" ? "Transaction confirmed" : shown === "signing" ? "Confirm in your wallet" : "Waiting for a block";
  const copy = () => { if (!ev) return; void navigator.clipboard?.writeText(ev.hash).then(() => setCopied(true)).catch(() => {}); };

  return (
    <section className={`txs txs-${failed ? "error" : shown}`} role="status" aria-live="polite" aria-label="Transaction status">
      <header>
        <b>{title}</b>
        {(shown === "success" || failed) && <button type="button" className="txs-x" aria-label="Close transaction status" onClick={() => setShown("idle")}>×</button>}
      </header>
      <ol>
        <li data-step={s1}><i aria-hidden />{s1 === "now" ? "Approve the request in your wallet" : s1 === "fail" ? "Not sent from the wallet" : "Signed in your wallet"}</li>
        <li data-step={s2}><i aria-hidden />
          {ev ? <span>Sent <code>{short(ev.hash)}</code> <button type="button" className="txs-copy" onClick={copy}>{copied ? "Copied" : "Copy hash"}</button></span> : "Sent to Portaldot V3"}
          {ev?.state === "slow" && shown === "pending" && <small>Taking longer than usual. It can take up to a minute; do not send it again.</small>}
        </li>
        <li data-step={s3}><i aria-hidden />{s3 === "done" ? "Confirmed on chain, figures refreshed" : s3 === "fail" ? "Not confirmed. The error message on screen says why" : "Confirmed on chain"}</li>
      </ol>
    </section>
  );
}
