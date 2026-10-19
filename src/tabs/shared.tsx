import { useRef, type ReactNode } from "react";
import { fmt, KINDS, type Row } from "../lib/chain";

const STATUS_CLASS: Record<Row["status"], string> = { Free: "", Pending: "lock", "Due soon": "warn", Overdue: "bad", Settled: "paid" };
export const day = (ts: number) => new Date(ts * 1000).toLocaleDateString();

export function SettleBadge({ r, terms = true }: { r: Row; terms?: boolean }) {
  if (!r.fraction) return <span className="tag">free</span>;
  return (
    <>
      <span className={`tag ${STATUS_CLASS[r.status]}`}>{r.status}{r.dueDate && !r.settle.settled ? ` · ${day(r.dueDate)}` : ""}</span>
      {terms && (r.settle.settled
        ? <span className="tag paid">paid {fmt(r.settle.amount, r.settle.decimals)} {r.settle.symbol}</span>
        : r.settle.faceValue > 0n && <span className="tag">due {fmt(r.settle.faceValue, r.settle.decimals)} {r.settle.symbol}</span>)}
    </>
  );
}

export const pct = (x: number, digits = 1) => `${(x * 100).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;

/** Live preview of the receipt NFT (same fields the on-chain tokenURI exposes). */
export function ReceiptArt({ id, kind, note, face, due, supply, stage }: { id?: number; kind: number; note: string; face: string; due: string; supply: string; stage: string }) {
  const lines = note.match(/.{1,30}(\s|$)/g)?.slice(0, 2).map((s) => s.trim()) ?? [""];
  return (
    <svg className="rart" viewBox="0 0 340 220" role="img" aria-label={`Receipt preview: ${KINDS[kind]} ${note}`}>
      <defs>
        <linearGradient id="rg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#0b1418" /><stop offset="1" stopColor="#020304" /></linearGradient>
        <pattern id="rgrid" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0v14" fill="none" stroke="rgba(111,195,211,.07)" /></pattern>
      </defs>
      <rect width="340" height="220" fill="url(#rg)" />
      <rect width="340" height="220" fill="url(#rgrid)" />
      <rect x=".5" y=".5" width="339" height="219" fill="none" stroke="rgba(255,255,255,.18)" />
      <path d="M12 12h18M12 12v18M328 12h-18M328 12v18M12 208h18M12 208v-18M328 208h-18M328 208v-18" stroke="#6fc3d3" strokeWidth="1.5" fill="none" />
      <text x="24" y="40" className="ra-k">POTKIT RECEIPT · {KINDS[kind].toUpperCase()}</text>
      <text x="316" y="40" textAnchor="end" className="ra-id">{id ? `#${id}` : "#—"}</text>
      <text x="24" y="78" className="ra-t">{lines[0] || "Untitled invoice"}</text>
      {lines[1] && <text x="24" y="100" className="ra-t">{lines[1]}</text>}
      <line x1="24" x2="316" y1="124" y2="124" stroke="rgba(255,255,255,.12)" />
      <text x="24" y="146" className="ra-l">FACE VALUE</text><text x="24" y="168" className="ra-v">{face ? `${face} tPOT` : "—"}</text>
      <text x="132" y="146" className="ra-l">DUE</text><text x="132" y="168" className="ra-v">{due || "—"}</text>
      <text x="232" y="146" className="ra-l">SHARES</text><text x="232" y="168" className="ra-v">{supply || "—"}</text>
      <text x="24" y="186" className="ra-s" textLength={stage.length > 30 ? 292 : undefined} lengthAdjust="spacingAndGlyphs">● {stage}</text>
      <text x="24" y="201" className="ra-l">PORTALDOT V3 · ERC-721</text>
    </svg>
  );
}

/** Number placeholder: pulsing bar until the first chain read finishes (avoids flashing 0). */
export const N = ({ l, children }: { l: boolean; children: ReactNode }) => (l ? <span className="skel kpi-skel" aria-label="Loading" /> : <>{children}</>);

// ---------------- v21: hologram paper receipt (Explore + Portfolio) ----------------
const STAMP: Record<Row["status"], [string, string]> = { Free: ["DRAFT", "draft"], Pending: ["OPEN", "open"], "Due soon": ["DUE SOON", "open"], Overdue: ["OVERDUE", "late"], Settled: ["PAID", "paid"] };
const noTilt = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Paper-receipt card with torn edge, barcode, status stamp and a foil layer that follows the pointer.
 *  `facts` = [label, value] pairs; `bar` = 0..1 progress with its label; `children` = action buttons (unchanged handlers). */
export function PaperReceipt({ r, amount, facts, bar, children }: { r: Row; amount: ReactNode; facts: [string, ReactNode][]; bar?: { label: string; value: number }; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current; if (!el || noTilt()) return;
    const b = el.getBoundingClientRect(); const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
    el.style.transform = `rotateY(${(px - 0.5) * 16}deg) rotateX(${(0.5 - py) * 16}deg)`;
    el.style.setProperty("--fx", `${px * 100}%`); el.style.setProperty("--fy", `${py * 100}%`);
  };
  const reset = () => { const el = ref.current; if (!el) return; el.style.transform = ""; el.style.removeProperty("--fx"); el.style.removeProperty("--fy"); };
  const [stamp, tone] = STAMP[r.status];
  return (
    <div className="prc-wrap">
      <div ref={ref} className={`prc prc-${tone}`} onPointerMove={move} onPointerLeave={reset} onPointerUp={(e) => { if (e.pointerType !== "mouse") reset(); }}>
        <div className="prc-paper">
          <div className="prc-foil" aria-hidden />
          <div className="prc-hd"><b>RECEIPT #{String(r.id).padStart(4, "0")}</b><i>{r.status === "Free" ? "Not locked" : r.status}</i></div>
          <span className="prc-kind">{KINDS[r.kind]} · {r.note}</span>
          <hr />
          <div className="prc-big">{amount}</div>
          <dl>{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {bar && <><div className="prc-sold" role="progressbar" aria-label={bar.label} aria-valuenow={Math.round(bar.value * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(1, bar.value)) * 100}%` }} /></div>
            <dl className="prc-sold-l"><div><dt>{bar.label}</dt><dd>{Math.round(bar.value * 100)}%</dd></div></dl></>}
          <div className="prc-bar" aria-hidden />
          <div className="prc-stamp" aria-hidden>{stamp}</div>
        </div>
      </div>
      {children && <div className="prc-acts">{children}</div>}
    </div>
  );
}
