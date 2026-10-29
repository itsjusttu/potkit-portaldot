import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { units } from "../lib/chain";
import { Ico, toast } from "../AppUi";
import { faceShare, daysTo, type Ctx } from "./ctx";
import { Needle } from "./charts";
import { salePlan, trimNum } from "./insights";

const PCTS = [25, 50, 75, 100];
const tp = (n: number) => (n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : trimNum(n, 6));

/** "Cash-now planner": a calculator for selling shares of a receipt you hold. It sends nothing; "Open in Trade" carries
    the amount and price into the normal Sell panel, where every check and the wallet confirmation still apply. */
export function SalePlanner({ c, open, onClose }: { c: Ctx; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const sellable = useMemo(() => c.rows.filter((r) => r.fraction && !r.settle.settled && (c.held.get(r.id) ?? 0n) > 0n), [c.rows, c.held]);
  const [id, setId] = useState<number | null>(null);
  const [pct, setPct] = useState(50);
  const [disc, setDisc] = useState(5);
  const row = sellable.find((r) => r.id === id) ?? sellable[0];

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("select, button")?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const f = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), select, input") ?? [])];
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); opener?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;

  const held = row ? c.held.get(row.id) ?? 0n : 0n;
  const days = row ? daysTo(row.dueDate) : 0;
  const plan = row ? salePlan({ face: Number(faceShare(row)) / 1e18, held: Number(held) / 1e18, pct, discount: disc / 100, days }) : null;
  const shareStr = row ? units((held * BigInt(pct)) / 100n) : "";
  const go = () => { if (!row || !plan) return; onClose(); c.setTab("trade", { sell: String(row.id), amt: shareStr, price: trimNum(plan.price) }); toast({ kind: "info", title: "Plan loaded in Trade", detail: `${shareStr} shares of #${row.id} at ${trimNum(plan.price)} tPOT. Check the numbers, then confirm in your wallet.` }); };
  const reason = !c.account ? "Connect a wallet to plan with your own shares." : !sellable.length ? "You hold no unsettled shares to sell." : "";

  // rendered under .shell, outside the tab body: that body is transformed for tab transitions, which would trap a fixed overlay
  return createPortal(
    <div className="nv-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="nv-modal" role="dialog" aria-modal="true" aria-labelledby="pl-t" ref={ref}>
        <header>
          <span className="nv-ico big"><Ico n="swap" /></span>
          <div><h2 id="pl-t">Cash-now planner</h2><p>Estimate what selling shares could raise today. Nothing is sent from here.</p></div>
          <button type="button" className="nv-x" aria-label="Close" onClick={onClose}><Ico n="x" /></button>
        </header>

        {reason ? (
          <div className="nv-modal-empty"><p>{reason}</p>{!c.account ? <button type="button" className="btn primary" onClick={() => { onClose(); c.connect(); }}>Connect wallet</button> : <button type="button" className="btn" onClick={() => { onClose(); c.setTab("issue"); }}>Issue a receipt</button>}</div>
        ) : (
          <>
            <p className="nv-modal-label">Plan</p>
            <div className="nv-rule">
              <div className="nv-node"><span>Sell</span>
                <select aria-label="Receipt to sell" value={row?.id ?? ""} onChange={(e) => setId(Number(e.target.value))}>{sellable.map((r) => <option key={r.id} value={r.id}>#{r.id} · {r.note.slice(0, 24) || "Receipt"}</option>)}</select>
                <small>You hold <b className="num">{units(held)}</b> shares</small></div>
              <i className="nv-link-dot" aria-hidden />
              <div className="nv-node"><span>Amount</span>
                <div className="nv-seg" role="group" aria-label="Share of your position">{PCTS.map((p) => <button key={p} type="button" aria-pressed={pct === p} onClick={() => setPct(p)}>{p}%</button>)}</div>
                <small><b className="num">{shareStr}</b> shares</small></div>
              <i className="nv-link-dot" aria-hidden />
              <div className="nv-node"><span>Discount</span>
                <div className="nv-step"><button type="button" aria-label="Lower discount" disabled={disc <= 1} onClick={() => setDisc((d) => Math.max(1, d - 1))}>−</button><b className="num">{disc}%</b><button type="button" aria-label="Raise discount" disabled={disc >= 30} onClick={() => setDisc((d) => Math.min(30, d + 1))}>+</button></div>
                <small>below face value</small></div>
            </div>

            <p className="nv-modal-label">Impact preview <em>estimate</em></p>
            <div className="nv-impact">
              <div className="nv-impact-g"><Needle pct={plan && plan.apr !== null ? Math.min(100, plan.apr * 100) : null} label="Estimated buyer APR on a 0 to 100 percent scale" /><small>{plan && plan.apr !== null ? <><b className="num">{(plan.apr * 100).toFixed(1)}%</b> est. buyer APR</> : "Add a due date for an APR"}</small></div>
              <dl>
                <div><dt>You would receive</dt><dd className="num big">≈ {plan ? tp(plan.receive) : "—"} tPOT</dd></div>
                <div><dt>Price per share</dt><dd className="num">{plan ? trimNum(plan.price) : "—"} tPOT</dd></div>
                <div><dt>Buyers get if paid in full</dt><dd className="num">{plan ? tp(plan.payout) : "—"} tPOT</dd></div>
                <div><dt>Due</dt><dd className="num">{row?.dueDate ? `in ${Math.max(0, Math.ceil(days))} days` : "no due date"}</dd></div>
              </dl>
            </div>
            <footer>
              <div className="nv-ctl"><Ico n="shield" /><div><b>You stay in control</b><small>Estimates assume full repayment; payment is not guaranteed. You confirm the listing in Trade and can cancel it later.</small></div></div>
              <div className="nv-modal-btns"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={go}>Open in Trade <Ico n="arrow" size={14} /></button></div>
            </footer>
          </>
        )}
      </div>
    </div>,
    document.querySelector(".shell") ?? document.body,
  );
}
