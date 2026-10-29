import { useEffect, useRef, useState, type FormEvent } from "react";
import { Ico } from "../AppUi";
import type { Row } from "../lib/chain";

/** Floating card under the "Verify a receipt" pill: type a receipt number or pick a recent one. Read-only; it only
    opens the Verify page, where the state is read from the chain. */
export function QuickVerify({ open, onClose, rows, onGo, onFull }: { open: boolean; onClose: () => void; rows: Row[]; onGo: (id: number) => void; onFull: () => void }) {
  const [v, setV] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (e: Event) => { if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return; if (e.type === "pointerdown" && (e.target as Element).closest?.(".qv, .top-verify")) return; onClose(); };
    window.addEventListener("pointerdown", close); window.addEventListener("keydown", close);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", close); };
  }, [open, onClose]);
  if (!open) return null;
  const n = Number(v.replace(/^#/, "").trim());
  const ok = Number.isInteger(n) && n > 0;
  const recent = [...rows].sort((a, b) => b.id - a.id).slice(0, 3);
  const submit = (e: FormEvent) => { e.preventDefault(); if (ok) { setV(""); onGo(n); } };
  return (
    <div className="qv" role="dialog" aria-label="Verify a receipt">
      <header><span className="nv-ico"><Ico n="shield" /></span><h3>Verify a receipt</h3><button type="button" className="nv-x" aria-label="Close" onClick={onClose}><Ico n="x" /></button></header>
      <form onSubmit={submit}>
        <label htmlFor="qv-id">Receipt number</label>
        <div className="qv-row"><input id="qv-id" ref={input} inputMode="numeric" placeholder="e.g. 2" value={v} aria-invalid={Boolean(v) && !ok} aria-describedby="qv-msg" onChange={(e) => setV(e.target.value)} /><button type="submit" className="btn primary" disabled={!ok}>Verify</button></div>
        <small id="qv-msg" className={v && !ok ? "field-error" : "muted"}>{v && !ok ? "Enter a whole receipt number, like 2." : "Reads custody, terms and settlement from the chain."}</small>
      </form>
      {recent.length > 0 && <div className="qv-recent"><span>Recent receipts</span><div>{recent.map((r) => <button key={r.id} type="button" onClick={() => onGo(r.id)}><b className="num">#{r.id}</b>{r.note.slice(0, 22) || "Receipt"}</button>)}</div></div>}
      <p className="qv-note">PotKit proves on-chain state only. It does not verify the off-chain invoice.</p>
      <button type="button" className="nv-link" onClick={onFull}>Open the Verify page <Ico n="arrow" size={14} /></button>
    </div>
  );
}
