import { useCallback, useEffect, useRef, useState } from "react";
import { onTx, explain } from "../lib/chain";
import { isUserRejected } from "../lib/txerrors";
import { toast } from "../AppUi";

/** idle → signing (wallet prompt) → pending (hash broadcast, waiting for a block) → success | error → idle */
export type TxPhase = "idle" | "signing" | "pending" | "success" | "error";

/**
 * Transaction lifecycle for every write in the app. `run(label, job)` guards against double submits,
 * marks the clicked button (data-busy, which React never overwrites), tracks the phase from the chain
 * layer's tx events, and turns every failure into a toast — a user rejection is a quiet "cancelled", not an error.
 */
export function useTx(refresh: () => Promise<void>) {
  const [busy, setBusy] = useState("");
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [needGas, setNeedGas] = useState(false);
  const busyRef = useRef("");
  const lastBtn = useRef<HTMLElement | null>(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const click = (e: MouseEvent) => { lastBtn.current = (e.target as HTMLElement).closest("button"); };
    document.addEventListener("click", click, true);
    const off = onTx((e) => { if (busyRef.current) setPhase(e.state === "pending" ? "pending" : e.state === "confirmed" ? "success" : "error"); });
    return () => { document.removeEventListener("click", click, true); off(); };
  }, []);

  const run = useCallback(async (label: string, job: () => Promise<void>) => {
    if (busyRef.current) return;
    const btn = lastBtn.current;
    busyRef.current = label; setBusy(label); setPhase("signing");
    btn?.setAttribute("data-busy", ""); btn?.setAttribute("aria-busy", "true");
    let next: TxPhase = "success";
    try {
      await job();
      await refreshRef.current().catch(() => {}); // a failed re-read must not turn a confirmed tx into an error
    } catch (e) {
      if (isUserRejected(e)) { next = "idle"; toast({ kind: "info", title: "Transaction cancelled", detail: "You rejected the request in your wallet. Nothing was sent." }); }
      else {
        next = "error";
        const d = explain(e);
        if (/Not enough tPOTv3/i.test(d)) setNeedGas(true);
        toast({ kind: "err", title: "Action failed", detail: d });
      }
    } finally {
      btn?.removeAttribute("data-busy"); btn?.removeAttribute("aria-busy");
      busyRef.current = ""; setBusy(""); setPhase(next);
      if (next !== "idle") window.setTimeout(() => setPhase((p) => (p === next ? "idle" : p)), 1600);
    }
  }, []);

  return { busy, phase, needGas, setNeedGas, run };
}
