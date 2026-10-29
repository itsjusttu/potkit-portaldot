import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fmt, KINDS, type Row } from "../lib/chain";

/** Node console page of a block. The console is Substrate-based and cannot resolve an EVM transaction hash, so every
    "open in explorer" link points at the block that contains the transaction (the block number is the same on both sides). */
export const blockUrl = (block: bigint | number) => `https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/${block}`;

/** Why a wallet action cannot run right now ("" when it can). Shown as text next to the disabled button. */
export function txBlock(c: { account: string; gated: boolean; busy: string }) {
  if (!c.account) return "Connect a wallet first.";
  if (c.gated) return "Switch your wallet to Portaldot V3 first.";
  if (c.busy) return "Another transaction is waiting for your wallet.";
  return "";
}
/** Receipts the visitor follows; kept in this browser only and shared by Explore and Trade. */
const WATCH = "potkit.watch";
const readWatch = () => { try { return new Set<number>((JSON.parse(localStorage.getItem(WATCH) ?? "[]") as number[]).filter(Number.isInteger)); } catch { return new Set<number>(); } };
export function useWatch() {
  const [ids, setIds] = useState(readWatch);
  const toggle = (id: number) => setIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); try { localStorage.setItem(WATCH, JSON.stringify([...next])); } catch { /* storage blocked */ } return next; });
  return { ids, has: (id: number) => ids.has(id), toggle };
}
export const WatchBtn = ({ on, id, onToggle }: { on: boolean; id: number; onToggle: () => void }) => (
  <button type="button" className={`watch-btn ${on ? "on" : ""}`} aria-pressed={on} aria-label={on ? `Stop watching receipt ${id}` : `Watch receipt ${id}`} title={on ? "Watching" : "Watch"} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
  </button>
);

/** Save generated text (CSV, calendar) as a file in the browser. */
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const Why =({ text }: { text: string }) => (text ? <small className="why" role="note">{text}</small> : null);

/** Plain-language definitions shown next to the terms a new user meets first. */
export const GLOSSARY = {
  receipt: ["Receipt", "An ERC-721 token that records one issuer-provided claim: kind, note and terms. PotKit does not verify the invoice behind it."],
  face: ["Face value", "The amount the debtor is expected to pay, in tPOT. Settling requires paying at least this amount."],
  share: ["Share", "One of a fixed number of ERC-20 tokens created when a receipt is locked. Every share gets an equal part of the settlement."],
  settle: ["Settle", "Paying the receipt in tPOT. Anyone can settle; the payment goes into a pool for share holders and cannot be undone."],
  claim: ["Claim", "Withdrawing your pro-rata part of a settled receipt's pool to your wallet."],
  apr: ["Est. APR", "An annualised estimate from price, face value and due date, assuming full payment on time. It is not a promised return."],
  discount: ["Discount", "How far the share price is below face value per share. A bigger discount is a lower price, not a safer claim."],
} as const;

/** A term with a small "?" that opens its definition. The popover is fixed-positioned and rendered under .shell: a tab body is
    transformed for its page transition, which would otherwise make "fixed" relative to the panel and push the popover off screen. */
export function Term({ k, children }: { k: keyof typeof GLOSSARY; children?: ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [name, text] = GLOSSARY[k];
  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => { if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return; if (e.type === "pointerdown" && btn.current?.contains(e.target as Node)) return; setPos(null); };
    addEventListener("pointerdown", close); addEventListener("keydown", close); addEventListener("scroll", close, true); addEventListener("resize", close);
    return () => { removeEventListener("pointerdown", close); removeEventListener("keydown", close); removeEventListener("scroll", close, true); removeEventListener("resize", close); };
  }, [pos]);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (pos) { setPos(null); return; }
    const b = btn.current!.getBoundingClientRect(), w = Math.min(280, innerWidth - 24);
    setPos({ top: b.bottom + 8, left: Math.max(12, Math.min(b.left - w / 2 + b.width / 2, innerWidth - w - 12)) });
  };
  return (
    <span className="term">
      {children}
      <button ref={btn} type="button" className="term-q" aria-label={`What is ${name.toLowerCase()}?`} aria-expanded={Boolean(pos)} aria-controls={pos ? id : undefined} onClick={toggle}>?</button>
      {pos && createPortal(<span id={id} role="note" className="term-pop" style={{ top: pos.top, left: pos.left }}><b>{name}</b>{text}</span>, document.querySelector(".shell") ?? document.body)}
    </span>
  );
}

const STATUS_CLASS: Record<Row["status"], string> = { Free: "", Pending: "lock", "Due soon": "warn", Overdue: "bad", Settled: "paid" };
/** One date style for the whole app: 21 Nov 2026 (fixed locale, so it never follows the browser language). */
export const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
export const fmtDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
export const day = (ts: number) => fmtDate(new Date(ts * 1000));

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

export const pct = (x: number, digits = 1) => `${(x * 100).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;

/** Live preview of the receipt NFT (same fields the on-chain tokenURI exposes). */
export function ReceiptArt({ id, kind, note, face, due, supply, stage }: { id?: number; kind: number; note: string; face: string; due: string; supply: string; stage: string }) {
  const lines = note.match(/.{1,30}(\s|$)/g)?.slice(0, 2).map((s) => s.trim()) ?? [""];
  return (
    <svg className="rart" viewBox="0 0 340 220" role="img" aria-label={`Receipt preview: ${KINDS[kind]} ${note}`}>
      <defs>
        <linearGradient id="rg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#242424" /><stop offset="1" stopColor="#080808" /></linearGradient>
        <pattern id="rgrid" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0v14" fill="none" stroke="rgba(255,255,255,.09)" /></pattern>
      </defs>
      <rect width="340" height="220" fill="url(#rg)" />
      <rect width="340" height="220" fill="url(#rgrid)" />
      <rect x=".5" y=".5" width="339" height="219" fill="none" stroke="rgba(255,255,255,.18)" />
      <path d="M12 12h18M12 12v18M328 12h-18M328 12v18M12 208h18M12 208v-18M328 208h-18M328 208v-18" stroke="#999999" strokeWidth="1.5" fill="none" />
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
export function PaperReceipt({ r, amount, facts, bar, children, actionsInside = false, statusLabel, statusTone, stampLabel, stampTone, className = "" }: { r: Row; amount: ReactNode; facts: [string, ReactNode][]; bar?: { label: string; value: number }; children?: ReactNode; actionsInside?: boolean; statusLabel?: string; statusTone?: string; stampLabel?: string; stampTone?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current; if (!el || noTilt()) return;
    const b = el.getBoundingClientRect(); const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
    el.style.transform = `rotateY(${(px - 0.5) * 16}deg) rotateX(${(0.5 - py) * 16}deg)`;
    el.style.setProperty("--fx", `${px * 100}%`); el.style.setProperty("--fy", `${py * 100}%`);
  };
  const reset = () => { const el = ref.current; if (!el) return; el.style.transform = ""; el.style.removeProperty("--fx"); el.style.removeProperty("--fy"); };
  const [defaultStamp, defaultTone] = STAMP[r.status];
  const stamp = stampLabel ?? defaultStamp;
  const tone = stampTone ?? defaultTone;
  const badge = statusLabel ?? (r.status === "Free" ? "Not locked" : r.status);
  return (
    <div className="prc-wrap">
      <div ref={ref} className={`prc prc-${tone} ${actionsInside ? "prc-has-inner-acts" : ""} ${className}`} onPointerMove={move} onPointerLeave={reset} onPointerUp={(e) => { if (e.pointerType !== "mouse") reset(); }}>
        <div className="prc-paper">
          <div className="prc-foil" aria-hidden />
          <div className="prc-hd"><b>RECEIPT #{String(r.id).padStart(4, "0")}</b><i className={statusTone ? `prc-status-${statusTone}` : undefined}>{badge}</i></div>
          <span className="prc-kind">{KINDS[r.kind]} · {r.note}</span>
          <hr />
          <div className="prc-big">{amount}</div>
          <dl>{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {bar && <><div className="prc-sold" role="progressbar" aria-label={bar.label} aria-valuenow={Math.round(bar.value * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(1, bar.value)) * 100}%` }} /></div>
            <dl className="prc-sold-l"><div><dt>{bar.label}</dt><dd>{Math.round(bar.value * 100)}%</dd></div></dl></>}
          <div className="prc-bar" aria-hidden />
          <div className="prc-stamp" aria-hidden>{stamp}</div>
          {actionsInside && children && <div className="prc-inner-acts">{children}</div>}
        </div>
      </div>
      {children && !actionsInside && <div className="prc-acts">{children}</div>}
    </div>
  );
}
