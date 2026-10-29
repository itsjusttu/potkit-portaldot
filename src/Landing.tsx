import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import "./theme-tokens.css";
import "./landing-pk.css";
import { L, app, ext, page } from "./docs/Chrome";

/* PotKit landing (potkit.pro). One visual idea runs through the page: a receivable is recorded as a receipt, the receipt
   is locked and split into shares, and a settlement flows back to every holder. The hero, the lifecycle walkthrough and
   the closing call to action all draw that same violet-to-blue "split and converge" line. Every figure inside a mock-up
   is illustrative, never live data, and no customer, partner or usage claim is made anywhere. */

const REPO = "https://github.com/itsjusttu/potkit-portaldot";
const X = "https://x.com/potkitpro";
type Item = { label: string; href: string; note?: string; internal?: boolean };
const RESOURCES: Item[] = [
  { label: "Help Center", href: page("/help"), note: "Guides and contact", internal: true },
  { label: "Security model", href: page("/security"), note: "What is and is not enforced", internal: true },
  { label: "Portaldot whitepaper", href: L.whitepaper, note: "Network design" },
  { label: "Developer docs", href: L.docs, note: "Build on Portaldot" },
  { label: "V3 testnet guide", href: L.guide, note: "Map account, get gas" },
];
const COMMUNITY: Item[] = [
  { label: "PotKit on X", href: X },
  { label: "PotKit on GitHub", href: REPO },
  { label: "Portaldot Discord", href: L.discord },
  { label: "Hacker House 2026 · DoraHacks", href: L.hackathon },
];

/* landing-only display, body and code faces (the app keeps its own); the page stays readable with the fallbacks */
if (typeof document !== "undefined" && !document.getElementById("pl-fonts")) {
  const l = document.createElement("link");
  l.id = "pl-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400&family=Hanken+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap";
  document.head.appendChild(l);
}

/* ---------- hooks ---------- */
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reveal-on-scroll (data-rv gains .is-in) and off-screen pausing (data-live gains .is-idle). Content is only hidden once
    .pl-js is set, and reduced motion shows everything at once. */
function usePageMotion(root: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => { root.current?.classList.add("pl-js"); return () => root.current?.classList.remove("pl-js"); }, [root]);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const nodes = [...el.querySelectorAll<HTMLElement>("[data-rv]")];
    if (reducedMotion() || typeof IntersectionObserver === "undefined") { nodes.forEach((n) => n.classList.add("is-in")); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    nodes.forEach((n) => io.observe(n));
    const live = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("is-idle", !e.isIntersecting)), { rootMargin: "120px 0px" });
    el.querySelectorAll("[data-live]").forEach((n) => live.observe(n));
    return () => { io.disconnect(); live.disconnect(); };
  }, [root]);
}

function useScrolled() {
  const [s, setS] = useState(false);
  useEffect(() => {
    let raf = 0;
    const run = () => { raf = 0; setS(scrollY > 16); };
    const on = () => { if (!raf) raf = requestAnimationFrame(run); };
    run(); addEventListener("scroll", on, { passive: true });
    return () => { removeEventListener("scroll", on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return s;
}

/** true while the element is on screen (defaults to true so nothing waits on the observer) */
function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [v, setV] = useState(true);
  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => e && setV(e.isIntersecting));
    io.observe(el); return () => io.disconnect();
  }, [ref]);
  return v;
}

/** Steps 0..len-1 on a timer while active; settles on the last frame for reduced motion and pauses while the tab is hidden. */
function useCycle(len: number, ms: number, active = true) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reducedMotion() || !active) return;
    const t = setInterval(() => { if (!document.hidden) setI((v) => (v + 1) % len); }, ms);
    return () => clearInterval(t);
  }, [len, ms, active]);
  return reducedMotion() ? len - 1 : i;
}

/* ---------- primitives ---------- */
const Arr = () => <svg className="pl-arr" viewBox="0 0 16 16" aria-hidden><path d="M4 12 12 4M6 4h6v6" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
const Rv = ({ as: Tag = "div", kind = "up", delay = 0, className = "", children }: { as?: "div" | "li" | "article"; kind?: "up" | "left" | "right" | "scale"; delay?: number; className?: string; children: ReactNode }) => {
  const T = Tag as "div";
  return <T data-rv={kind} className={className} style={{ "--d": `${delay}ms` } as React.CSSProperties}>{children}</T>;
};

const I = {
  receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  wallet: <path d="M4 7h15v12H4zM4 7l2-3h11l2 3M15 13h3" />,
  token: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 10h7M8.5 14h7" />,
  shield: <path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6zM9 12l2 2 4-4" />,
  docs: <path d="M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6" />,
  code: <path d="M9 8l-5 4 5 4M15 8l5 4-5 4M13 5l-2 14" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
};
const Ico = ({ n }: { n: keyof typeof I }) => <svg className="pl-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{I[n]}</svg>;

/** Accessible tabs with roving tabindex; arrows follow the orientation, Home/End jump. */
function Tabs<T extends string>({ id, label, tabs, value, onChange, vertical = false, numbered = vertical, progress = false, onDone, className = "" }: { id: string; label: string; tabs: { id: T; label: string; sub?: string }[]; value: T; onChange: (v: T) => void; vertical?: boolean; numbered?: boolean; progress?: boolean; onDone?: () => void; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const key = (e: KeyboardEvent, i: number) => {
    const n = tabs.length; let j = i;
    const next = vertical ? ["ArrowDown", "ArrowRight"] : ["ArrowRight"], prev = vertical ? ["ArrowUp", "ArrowLeft"] : ["ArrowLeft"];
    if (next.includes(e.key)) j = (i + 1) % n; else if (prev.includes(e.key)) j = (i - 1 + n) % n; else if (e.key === "Home") j = 0; else if (e.key === "End") j = n - 1; else return;
    e.preventDefault(); onChange(tabs[j]!.id); refs.current[j]?.focus();
  };
  const at = Math.max(0, tabs.findIndex((t) => t.id === value));
  return (
    <div className={`pl-tabs ${vertical ? "v" : "h"} ${progress ? "auto" : ""} ${className}`} role="tablist" aria-label={label} aria-orientation={vertical ? "vertical" : "horizontal"} style={{ "--i": at, "--n": tabs.length } as React.CSSProperties}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[i] = el; }} id={`${id}-tab-${t.id}`} role="tab" type="button" aria-selected={value === t.id} aria-controls={`${id}-panel`} tabIndex={value === t.id ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={(e) => key(e, i)}>
          {numbered && <b>{String(i + 1).padStart(2, "0")}</b>}<span>{t.label}{t.sub && <small>{t.sub}</small>}</span>{progress && value === t.id && <i className="pl-tab-prog" aria-hidden onAnimationEnd={onDone} />}
        </button>
      ))}
      <i className="pl-tabs-ind" aria-hidden />
    </div>
  );
}

function Menu({ label, items }: { label: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); ref.current?.querySelector<HTMLElement>("button")?.focus(); } };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className={`pl-menu ${open ? "open" : ""}`} ref={ref} onMouseEnter={() => matchMedia("(hover: hover)").matches && setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>{label}<svg className="pl-chev" viewBox="0 0 12 12" aria-hidden><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg></button>
      <div className="pl-pop">
        {items.map((i) => <a key={i.label} href={i.href} {...(i.internal ? {} : ext)}><b>{i.label}</b>{i.note && <small>{i.note}</small>}<Arr /></a>)}
      </div>
    </div>
  );
}

function Header({ scrolled, launch, demo }: { scrolled: boolean; launch: string; demo: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc);
  }, [open]);
  const close = () => setOpen(false);
  const label = demo ? "Open demo" : "Launch App";
  return (
    <header className={`pl-head ${scrolled ? "scrolled" : ""} ${open ? "menu-open" : ""}`}>
      <div className="pl-wrap pl-head-in">
        <a className="pl-logo" href={page("/")} aria-label="PotKit home"><img src="/potkit-p-circle-white.svg" alt="" width={28} height={28} />PotKit</a>
        <nav id="pl-nav" className="pl-nav" aria-label="Main">
          <a href={page("/how-it-works")} onClick={close}>How it works</a>
          <a href={page("/protocol")} onClick={close}>Protocol</a>
          <Menu label="Resources" items={RESOURCES} />
          <Menu label="Community" items={COMMUNITY} />
          <a className="pl-btn primary pl-nav-cta" href={launch} onClick={close}>{label}</a>
        </nav>
        <a className="pl-btn primary pl-head-cta" href={launch}>{label} <Arr /></a>
        <button type="button" className="pl-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="pl-nav" onClick={() => setOpen(!open)}><i /><i /><i /></button>
      </div>
    </header>
  );
}

/* ---------- the PotKit motif: receipt → split into shares → converge on settlement (illustrative) ---------- */
const SHARE_Y = [64, 132, 200, 268, 336];
const SOLD = [false, true, false, true, true]; // which illustrative share lots changed hands in the "trade" step
const branch = (y: number) => `M232 200 C 292 200 292 ${y} 352 ${y}`;
const merge = (y: number) => `M376 ${y} C 436 ${y} 436 200 490 200`;

function Motif({ step, className = "" }: { step: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const g = `pl-g${uid}`, f = `pl-f${uid}`;
  const lit = (on: boolean, d: string, k: string) => (
    <g key={k} className={`m-line ${on ? "on" : ""}`}><path className="m-base" d={d} pathLength={100} /><path className="m-draw" d={d} pathLength={100} stroke={`url(#${g})`} />{on && <path className="m-dot" d={d} pathLength={100} filter={`url(#${f})`} />}</g>
  );
  return (
    <svg className={`pl-motif s${step} ${className}`} viewBox="0 0 560 400" aria-hidden>
      <defs>
        <linearGradient id={g} gradientUnits="userSpaceOnUse" x1="140" y1="0" x2="520" y2="0"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#5b8cff" /></linearGradient>
        <filter id={f} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g className={`m-receipt ${step === 0 ? "hot" : ""}`}>
        <rect x="40" y="134" width="132" height="132" rx="14" />
        <path d="M64 170h60M64 192h84M64 214h48" /><rect className="m-seal" x="128" y="226" width="22" height="22" rx="5" />
        <text x="106" y="292">{step === 0 ? "receipt minted" : "receipt locked"}</text>
      </g>
      {lit(step >= 1, "M172 200 H232", "t")}
      {SHARE_Y.map((y, k) => lit(step >= 1, branch(y), `b${k}`))}
      {SHARE_Y.map((y, k) => lit(step >= 3, merge(y), `m${k}`))}
      {SHARE_Y.map((y, k) => (
        <g key={`n${k}`} className={`m-node ${step >= 1 ? "on" : ""} ${step >= 2 && SOLD[k] ? "sold" : ""}`} style={{ "--k": k } as React.CSSProperties}>
          <circle cx="364" cy={y} r="15" /><text x="364" y={y + 4}>20</text>
        </g>
      ))}
      <text className="m-cap" x="364" y="30">{step >= 2 ? "shares · several holders" : "100 shares"}</text>
      <g className={`m-pool ${step >= 3 ? "on" : ""}`}>
        <circle className="m-halo" cx="516" cy="200" r="34" /><circle cx="516" cy="200" r="24" />
        <path d="M506 200l7 7 13-14" />
        <text x="548" y="256" className="m-end">{step >= 3 ? "settled · pro-rata" : "settlement"}</text>
      </g>
    </svg>
  );
}

/** A fan of fine light lines gathering into one point ("right": the point sits on the right edge, "left": on the left
    edge, "down": at the bottom centre). Lines draw in once, then a few dots travel toward the point. Decorative only. */
function Fan({ dir = "right", n = 34, className = "" }: { dir?: "right" | "left" | "down"; n?: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const W = 800, H = 600;
  const lines = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1), y = (-0.3 * H + t * 1.6 * H).toFixed(1), edge = Math.abs(t - 0.5) * 2;
    return { d: `M0 ${y} C ${W * 0.42} ${y} ${W * 0.64} ${H / 2} ${W} ${H / 2}`, o: +(0.85 - edge * 0.7).toFixed(2) };
  });
  const down = dir === "down";
  const g = dir === "left" ? `translate(${W} 0) scale(-1 1)` : down ? `translate(${H} 0) rotate(90)` : undefined;
  const fit = dir === "right" ? "xMaxYMid slice" : dir === "left" ? "xMinYMid slice" : "xMidYMax slice";
  return (
    <svg className={`pl-fan ${className}`} viewBox={down ? `0 0 ${H} ${W}` : `0 0 ${W} ${H}`} preserveAspectRatio={fit} aria-hidden>
      <defs><linearGradient id={`pl-fan${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0"><stop offset="0" stopColor="#6a4cff" stopOpacity="0" /><stop offset=".55" stopColor="#7b5cff" stopOpacity=".55" /><stop offset="1" stopColor="#cdbdff" /></linearGradient></defs>
      <g transform={g}>
        {lines.map((l, k) => <path key={k} className="fan-l" d={l.d} pathLength={100} stroke={`url(#pl-fan${uid})`} style={{ "--k": k, "--o": l.o } as React.CSSProperties} />)}
        {lines.filter((_, k) => k % 5 === 2).map((l, k) => <path key={`d${k}`} className="fan-dot" d={l.d} pathLength={100} style={{ "--k": k } as React.CSSProperties} />)}
      </g>
    </svg>
  );
}

/** Closing-section pattern: slow horizontal bars, like due dates on a timeline. */
const BARS: [number, number, number, string][] = [[4, 38, 14, "v"], [57, 22, 4, "b"], [86, 9, 18, "g"], [11, 40, 46, "g"], [1, 64, 66, "v"], [68, 24, 60, "b"], [33, 36, 84, "v"], [80, 16, 86, "g"]];
const Bars = () => <div className="pl-bars" aria-hidden>{BARS.map(([l, w, t, c], k) => <i key={k} className={c} style={{ left: `${l}%`, width: `${w}%`, top: `${t}%`, "--k": k } as React.CSSProperties} />)}</div>;

/* ---------- product mock-ups (illustrative figures only) ---------- */
const STAGES = [
  { k: "Mint", status: "Minted", custody: "Issuer wallet", log: "Receipt #1 minted to the issuer", listed: 0, paid: 0 },
  { k: "Lock", status: "Locked", custody: "PotKit contract", log: "Locked into 100 shares · face 1 tPOT", listed: 0, paid: 0 },
  { k: "Trade", status: "Trading", custody: "PotKit contract", log: "60 shares bought by other holders", listed: 60, paid: 0 },
  { k: "Settle", status: "Settled", custody: "PotKit contract", log: "1 tPOT paid in · holders claim pro-rata", listed: 0, paid: 100 },
] as const;

const Illustrative = () => <span className="pl-tag">Illustrative example · not live data</span>;

function IssueVisual() {
  const i = useCycle(3, 2300);
  const labels = ["Mint receipt", "Continue", "Lock & issue shares"];
  return (
    <div className="pl-ui" role="img" aria-label="Illustrative issue flow: receipt, terms, lock">
      <Illustrative />
      <ol className="pl-ui-steps">{["Receipt", "Terms", "Lock"].map((n, k) => <li key={n} className={k < i ? "done" : k === i ? "on" : ""}><span>{k < i ? "✓" : k + 1}</span>{n}</li>)}</ol>
      <div className="pl-fields" key={i}>
        {i === 0 && <><div><small>Kind</small><b>Invoice</b></div><div className="wide"><small>Note</small><b>Invoice 042 — content delivery</b></div></>}
        {i === 1 && <><div><small>Face value</small><b>1 tPOT</b></div><div><small>Due date</small><b>In 60 days</b></div><div><small>Shares to issue</small><b>100</b></div></>}
        {i === 2 && <><div className="wide"><small>One transaction</small><b>Receipt moves into PotKit · 100 shares minted to you</b></div><div className="wide"><small>Then</small><b>Anyone can settle by paying at least the face value</b></div></>}
      </div>
      <span className="pl-ui-btn" key={`b${i}`}>{labels[i]}</span>
    </div>
  );
}

const LISTINGS = [
  { n: "Invoice 042", p: "0.009", d: "10.0%", a: "—", due: "Overdue", av: "100", closed: true },
  { n: "Invoice 057", p: "0.098", d: "2.0%", a: "31.7%", due: "23d", av: "60" },
  { n: "Invoice 063", p: "0.095", d: "5.0%", a: "19.4%", due: "94d", av: "250" },
];
function TradeVisual() {
  const i = useCycle(2, 2200);
  return (
    <div className="pl-ui" role="img" aria-label="Illustrative market table with price, discount, estimated APR, due date and available shares">
      <Illustrative />
      <div className="pl-trow head"><span>Invoice</span><span>Price</span><span>Discount</span><span>Est. APR</span><span>Due</span><span>Avail.</span></div>
      {LISTINGS.map((r, k) => (
        <div key={r.n} className={`pl-trow ${k - 1 === i ? "hi" : ""} ${r.closed ? "closed" : ""}`}><span>{r.n}</span><span>{r.p}</span><span>{r.d}</span><span>{r.a}</span><span>{r.due}</span><span>{r.av}</span></div>
      ))}
      <div className="pl-quote"><div><small>Quick buy · spend</small><b>0.50 tPOT</b></div><div><small>Shares received</small><b>5.1</b></div><span className="pl-ui-btn">Buy shares</span></div>
    </div>
  );
}

function SettleVisual() {
  return (
    <div className="pl-ui" role="img" aria-label="Illustrative settlement and pro-rata claim">
      <Illustrative />
      <div className="pl-pay"><div><small>Pay invoice · amount (tPOT)</small><b>1</b></div><span className="pl-ui-btn">Pay 1 tPOT &amp; settle</span></div>
      <p className="pl-note">Minimum is the face value. Any extra goes to the pool for holders and is not refunded.</p>
      <div className="pl-claims">
        {[["Holder A", 40], ["Holder B", 35], ["Holder C", 25]].map(([n, v], k) => (
          <div key={n as string} className="pl-claim" style={{ "--w": `${v}%`, "--k": k } as React.CSSProperties}><label>{n}<b>{(Number(v) / 100).toFixed(2)} tPOT</b></label><i><s /></i></div>
        ))}
      </div>
    </div>
  );
}

function ProofVisual() {
  return (
    <div className="pl-ui" role="img" aria-label="Illustrative read-only proof of custody, terms and settlement state">
      <Illustrative />
      <div className="pl-card"><small>PROOF · RECEIPT #1</small><ul className="pl-checks"><li>Receipt locked in PotKit</li><li>Terms fixed on-chain: 1 tPOT, 100 shares</li><li>Settlement state: unpaid</li></ul></div>
      <p className="pl-note">Read-only, shareable link. It does not attest that the off-chain invoice is genuine.</p>
    </div>
  );
}

/** The light "ledger" card beside the sticky motif: receipt state for the current step. */
function LedgerCard({ step }: { step: number }) {
  const s = STAGES[step]!;
  return (
    <div className="pl-ledger" role="img" aria-label={`Illustrative receipt state: ${s.status}`}>
      <div className="pl-ledger-top"><small>RECEIPT #1 · INVOICE 042</small><span key={s.status} className={`pl-chip st-${s.status.toLowerCase()}`}>{s.status}</span></div>
      <dl>
        <div><dt>Custody</dt><dd key={s.custody}>{s.custody}</dd></div>
        <div><dt>Held by others</dt><dd>{s.listed}%</dd></div>
        <div><dt>Paid out</dt><dd>{s.paid}%</dd></div>
      </dl>
      <div className="pl-meter" aria-hidden><s style={{ width: `${s.paid || s.listed}%` }} className={s.paid ? "paid" : ""} /></div>
      <p key={s.log} className="pl-ledger-log">{s.log}</p>
      <Illustrative />
    </div>
  );
}

/* ---------- content (existing PotKit copy and verifiable facts) ---------- */
const FEATURES = [
  { id: "issue", k: "Issue", sub: "Mint and lock a receipt", t: "Turn finished work into shares you can sell today", d: "Describe the claim, mint an ERC-721 receipt, then lock it with a face value, an optional due date and a fixed number of ERC-20 shares. One transaction, no approval needed. The details are issuer-provided; PotKit does not verify the invoice behind them.", cta: ["Issue an invoice", "?tab=issue"] },
  { id: "trade", k: "Trade", sub: "Discount and due date up front", t: "See the discount and the due date before you buy", d: "Listed shares sit in escrow inside PotKit. Prices are in native tPOT, buyers can take part of a listing, and the exact cost is rounded up on-chain. Sellers can cancel to get the remaining shares back.", cta: ["Browse listings", "?tab=trade"] },
  { id: "settle", k: "Settle", sub: "One payment, pro-rata claims", t: "Anyone can settle; every holder claims their share", d: "Anyone can pay at least the face value in tPOT. Any extra goes to holders and is not refunded. Each holder claims pro-rata and the rounding sums exactly. After the due date an unpaid receipt shows Overdue; nothing is paid or recovered automatically.", cta: ["How settlement works", page("/how-it-works")] },
  { id: "verify", k: "Verify", sub: "A read-only public proof", t: "Share a proof anyone can check, no wallet needed", d: "A public link shows custody, terms and settlement state read straight from the contract. It does not attest that the off-chain invoice is genuine.", cta: ["Verify a receipt", "?tab=verify"] },
] as const;
const ROLES = [
  { k: "Issuers", t: "Unlock liquidity from work already delivered", d: "Create an issuer-provided on-chain receipt, lock it and offer fixed-supply shares at a discount. If investors buy, you receive tPOT now; the receipt is not independently authenticated.", cta: ["Issue an invoice", "?tab=issue"] },
  { k: "Investors", t: "Buy discounted claims on receivables", d: "Every listing shows its discount to face value and due date. Shares are escrowed by the market, prices are in tPOT, and payouts are pro-rata on settlement. Payment is not guaranteed.", cta: ["Browse listings", "?tab=trade"] },
  { k: "Debtors & judges", t: "Settle once. Check the on-chain record", d: "A debtor can pay once in tPOT and holders can claim pro-rata. Share a read-only proof of custody, terms and settlement state; it does not attest to off-chain invoice authenticity.", cta: ["Verify a receipt", "?tab=verify"] },
] as const;
const SNIPPETS = {
  settle: ["/// anyone pays msg.value >= faceValue tPOT into the pool", "function settle(id) {", "    let ts := k(id, 7)", "    let t := sload(ts)", '    need(unitsOf(t), "not locked")', '    need(iszero(settled(t)), "settled")', '    need(iszero(lt(callvalue(), shr(160, sload(k(id, 8))))), "underpaid")', "    sstore(ts, or(t, shl(240, 1)))   // effects only: no external call", "    sstore(k(id, 9), callvalue())", "}"],
  buy: ["/// msg.value must equal ceil(price * amount / 1e18)", "function buy(lid, amount) {", '    need(iszero(eq(caller(), seller)), "own listing")', '    need(iszero(settled(t)), "settled")', "    let c := cost(shr(160, a), amount)", '    need(eq(callvalue(), c), "value")', "    sstore(add(w, 1), sub(b, shl(128, amount)))   // effects first", "    moveShares(id, low(t), address(), caller(), amount)", "    pay(seller, c)                                // then the tPOT", "}"],
} as const;
const CODE_TABS = [{ id: "settle", label: "settle()", sub: "excerpt" }, { id: "buy", label: "buy()", sub: "excerpt" }] as const;
const TEST_NAMES = ["settle in native tPOT by anyone; holders claim pro-rata; payouts sum exactly; then redeem", "overpayment stays in the pool; settle on unlocked reverts", "Market: partial + full buy with exact tPOT, cost rounds up, cancel returns rest", "Redeem needs every share, returns the NFT; re-lock resets allowances", "Share tokens are 82-byte forwarders with identical code"];
const METRICS = [["~3.9 KB", "Hand-written Yul contract"], ["82 B", "Share-token forwarder code"], ["3", "Receipt kinds"]] as const;
const CONNECT: [string, string, keyof typeof I][] = [
  ["Any EVM wallet", "OKX, Rabby, MetaMask, Coinbase and other browser wallets can connect; Explore and Verify work without one.", "wallet"],
  ["Native tPOT", "Settlement and market prices are paid in the network's native testnet token. There is no extra token to deploy.", "token"],
  ["Public verification", "Share a read-only proof of custody, terms and settlement state with a link, no wallet needed.", "shield"],
  ["Portaldot tooling", "Built for Portaldot V3. The testnet guide covers account mapping and gas.", "docs"],
];
const HUB_L: (keyof typeof I)[] = ["wallet", "token", "receipt"];
const HUB_R: (keyof typeof I)[] = ["shield", "docs", "link"];
const STEPS = [
  { t: "Mint", d: "The issuer describes the claim and mints an ERC-721 receipt: kind, note and issuer-provided details, written on-chain." },
  { t: "Lock", d: "Locking moves the receipt into PotKit, fixes face value and due date, and mints a fixed supply of ERC-20 shares to the issuer." },
  { t: "Trade", d: "Shares are listed at a fixed tPOT price and held in escrow. Buyers pay the exact cost; the seller is paid in the same transaction." },
  { t: "Settle & claim", d: "Anyone can pay at least the face value. Holders then claim their pro-rata part of the pool in tPOT. Redeeming returns the NFT once everything is claimed." },
] as const;
const EXPLORE: { t: string; k: string; d: string; href: string; art: number }[] = [
  { t: "Invoice", k: "Receipt kind", d: "A receivable for work already delivered, recorded as an issuer-provided receipt.", href: "?tab=issue", art: 0 },
  { t: "Content right", k: "Receipt kind", d: "A claim on content revenue, with the same terms, shares and settlement rules.", href: "?tab=issue", art: 1 },
  { t: "Equipment", k: "Receipt kind", d: "An equipment-related receivable that follows the same lifecycle.", href: "?tab=issue", art: 2 },
  { t: "Issuers", k: "Role", d: "Mint, lock and offer shares at a discount.", href: "?tab=issue", art: 1 },
  { t: "Investors", k: "Role", d: "Compare discount, APR and due date, then buy shares.", href: "?tab=trade", art: 2 },
  { t: "Debtors & judges", k: "Role", d: "Settle once and share a read-only proof.", href: "?tab=verify", art: 0 },
];
const LEARN: { t: string; d: string; m: string; h: string; internal?: boolean }[] = [
  { t: "How it works", d: "One invoice, four contract moves: mint, lock, trade, settle.", m: "Lifecycle", h: page("/how-it-works"), internal: true },
  { t: "Protocol reference", d: "Every function, event and storage rule of the single Yul contract.", m: "Reference", h: page("/protocol"), internal: true },
  { t: "Security model and its limits", d: "What is enforced on-chain and what is not, stated plainly.", m: "Security", h: page("/security"), internal: true },
  { t: "V3 testnet guide", d: "Map your account and get gas on Portaldot V3.", m: "Testnet", h: L.guide },
];
const FACTS = ["Portaldot V3 testnet", "Hand-written Yul contract", "ERC-721 receipts", "ERC-20 shares", "Native tPOT settlement", "Automated tests", "Open-source repository", "Portaldot Hacker House 2026"];

/* ---------- page ---------- */
export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  usePageMotion(root);
  const scrolled = useScrolled();
  const judge = new URLSearchParams(location.search);
  const hasJudge = ["kit", "vault", "receipt"].some((k) => judge.has(k));
  const launch = app(hasJudge ? location.search : "");
  const tabHref = (q: string) => (q.startsWith("?") ? app(`${hasJudge ? location.search + "&" : "?"}${q.slice(1)}`) : q);

  const heroRef = useRef<HTMLElement>(null);
  const heroOn = useInView(heroRef);
  const [pick, setPick] = useState<number | null>(null);
  const auto = useCycle(STAGES.length, 2800, heroOn && pick === null);
  const heroStep = pick ?? auto;

  const [feat, setFeat] = useState<(typeof FEATURES)[number]["id"]>("issue");
  const f = FEATURES.find((x) => x.id === feat)!;
  const [featAuto, setFeatAuto] = useState(true);
  const nextFeat = () => setFeat((v) => FEATURES[(FEATURES.findIndex((x) => x.id === v) + 1) % FEATURES.length]!.id);
  const [code, setCode] = useState<(typeof CODE_TABS)[number]["id"]>("settle");
  const [step, setStep] = useState(0);
  const [rid, setRid] = useState("");
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  const walkRef = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLDivElement>(null);
  const [sl, setSl] = useState({ p: 0, w: 1, start: true, end: false });

  useEffect(() => {
    const els = stepRefs.current.filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const i = els.indexOf(e.target as HTMLElement);
      if (e.isIntersecting) setStep(i);
      else if (e.boundingClientRect.top > innerHeight / 2) setStep(Math.max(0, i - 1)); // scrolled back up past this step
    }), { rootMargin: "-45% 0px -45% 0px" });
    els.forEach((e) => io.observe(e));
    // back above the walkthrough: return to the first step even after a fast jump
    const top = new IntersectionObserver(([e]) => { if (e && !e.isIntersecting && e.boundingClientRect.top > 0) setStep(0); });
    if (walkRef.current) top.observe(walkRef.current);
    return () => { io.disconnect(); top.disconnect(); };
  }, []);
  const onSlide = useCallback(() => {
    const el = slider.current; if (!el) return;
    const m = el.scrollWidth - el.clientWidth;
    setSl({ p: m > 0 ? el.scrollLeft / m : 0, w: el.scrollWidth ? el.clientWidth / el.scrollWidth : 1, start: el.scrollLeft < 4, end: el.scrollLeft > m - 4 });
  }, []);
  useEffect(() => { onSlide(); addEventListener("resize", onSlide); return () => removeEventListener("resize", onSlide); }, [onSlide]);
  const slide = (dir: number) => slider.current?.scrollBy({ left: dir * Math.min(440, (slider.current?.clientWidth ?? 440) * 0.8), behavior: reducedMotion() ? "auto" : "smooth" });
  const go = (e: FormEvent) => {
    e.preventDefault();
    const n = rid.trim().replace(/^#/, "");
    const params = new URLSearchParams(hasJudge ? location.search : "");
    params.set("tab", "verify");
    if (/^\d+$/.test(n)) params.set("id", n);
    location.href = app(`?${params.toString()}`);
  };
  const hs = STAGES[heroStep]!;

  return (
    <div className="pl" ref={root}>
      <a className="pl-skip" href="#pl-main">Skip to content</a>
      <div className="pl-bar"><div className="pl-wrap"><span><i className="pl-pulse" aria-hidden />Portaldot V3 testnet demo · no real value</span><a href={launch}>Launch the demo <Arr /></a></div></div>
      <Header scrolled={scrolled} launch={launch} demo={hasJudge} />
      <main id="pl-main">
        {/* 1 · asymmetric hero: message left, the receipt → shares → settlement motif right */}
        <section className="pl-hero" id="top" ref={heroRef} data-live>
          <div className="pl-glow" aria-hidden />
          <div className="pl-wrap pl-hero-grid">
            <div className="pl-hero-copy">
              <p className="pl-kicker pl-in" style={{ "--d": "60ms" } as React.CSSProperties}>On-chain receivables · Portaldot V3</p>
              <h1 className="pl-in" style={{ "--d": "140ms" } as React.CSSProperties}>Split an unpaid invoice into shares. <em>Settle it once, for every holder.</em></h1>
              <p className="pl-lede pl-in" style={{ "--d": "260ms" } as React.CSSProperties}>PotKit turns an unpaid invoice into a locked receipt and tradeable shares—so issuers can access liquidity and holders can claim pro-rata when the debtor settles.</p>
              <div className="pl-cta pl-in" style={{ "--d": "380ms" } as React.CSSProperties}>
                <a className="pl-btn primary lg" href={launch}>Launch App <Arr /></a>
                <a className="pl-btn ghost lg" href={page("/how-it-works")}>See how it works</a>
              </div>
              <p className="pl-limits pl-in" style={{ "--d": "480ms" } as React.CSSProperties}>Issuer-provided details are not verified by PotKit. Payment is not guaranteed.</p>
            </div>
            <div className="pl-hero-art pl-in" style={{ "--d": "300ms" } as React.CSSProperties}>
              <Fan dir="right" className="pl-fan-hero" /><Fan dir="down" n={24} className="pl-fan-m" />
              <div className="pl-art-top"><span className={`pl-chip st-${hs.status.toLowerCase()}`} key={hs.status}>{hs.status}</span><span className="pl-art-log" key={hs.log}>{hs.log}</span>{pick !== null && <button type="button" className="pl-art-auto" onClick={() => setPick(null)}>Auto</button>}</div>
              <Motif step={heroStep} />
              <div className="pl-art-steps" role="group" aria-label="Show a lifecycle step in the illustration" style={{ "--i": heroStep } as React.CSSProperties}>
                {STAGES.map((s, k) => <button key={s.k} type="button" aria-pressed={heroStep === k} className={k < heroStep ? "done" : ""} onClick={() => setPick(k)}><i />{s.k}</button>)}
                <span className="pl-art-ind" aria-hidden />
              </div>
              <span className="pl-art-tag">Illustrative example · not live data</span>
            </div>
          </div>
        </section>

        {/* evidence strip: checkable facts (no customer logos) */}
        <section className="pl-strip" aria-label="What PotKit is built on" data-live>
          <div className="pl-wrap pl-strip-in">
            <p>Built on facts<br />you can check</p>
            <div className="pl-marq"><div className="pl-marq-in">{[0, 1].map((k) => <ul key={k} aria-hidden={k === 1}>{FACTS.map((x) => <li key={x}>{x}</li>)}</ul>)}</div></div>
          </div>
        </section>

        {/* 2 · lifecycle: steps scroll on the left, the same motif follows on the right (no scroll hijacking) */}
        <section className="pl-sec pl-walk" id="lifecycle">
          <div className="pl-wrap pl-walk-grid" ref={walkRef}>
            <div className="pl-walk-text">
              <Rv><p className="pl-kicker">How value moves</p></Rv>
              <Rv delay={60}><h2>One receipt, many holders, one settlement.</h2></Rv>
              <Rv delay={120}><p className="pl-body">Four contract moves take one invoice from a record to a payout.</p></Rv>
              <ol className="pl-walk-steps" style={{ "--p": step / (STEPS.length - 1) } as React.CSSProperties}>
                {STEPS.map((s, k) => (
                  <li key={s.t} ref={(el) => { stepRefs.current[k] = el; }} className={k === step ? "on" : k < step ? "done" : ""}>
                    <span className="pl-walk-n">{String(k + 1).padStart(2, "0")}</span><h3>{s.t}</h3><p>{s.d}</p>
                    <div className="pl-walk-m" data-live><Motif step={k} /></div>
                  </li>
                ))}
              </ol>
              <a className="pl-link" href={page("/how-it-works")}>Learn more <Arr /></a>
            </div>
            <div className="pl-walk-vis" data-live>
              <div className="pl-walk-panel"><Motif step={step} /><LedgerCard step={step} /></div>
            </div>
          </div>
        </section>

        {/* 3 · product areas: vertical tabs, copy and mock-up change together */}
        <section className="pl-sec pl-deep pl-product" id="product" data-live>
          <div className="pl-wrap">
            <div className="pl-head2">
              <Rv><p className="pl-kicker">The product</p></Rv>
              <Rv delay={60}><h2>Four actions, one record.</h2></Rv>
              <Rv delay={120}><p className="pl-body">PotKit records custody, terms and payment state on-chain. It does not verify the invoice itself.</p></Rv>
            </div>
            <Rv kind="scale" delay={80} className="pl-prod-grid">
              <Tabs id="feat" label="PotKit product areas" numbered className="line" tabs={FEATURES.map((x) => ({ id: x.id, label: x.k }))} value={feat} onChange={(v) => { setFeatAuto(false); setFeat(v); }} progress={featAuto} onDone={nextFeat} />
              <div className="pl-prod-panel" role="tabpanel" id="feat-panel" aria-labelledby={`feat-tab-${feat}`}>
                <div className="pl-prod-copy" key={`c-${feat}`}><h3>{f.t}</h3><p>{f.d}</p><a className="pl-link" href={tabHref(f.cta[1])}>{f.cta[0]} <Arr /></a></div>
                <div className="pl-frame" key={`v-${feat}`}>{feat === "issue" ? <IssueVisual /> : feat === "trade" ? <TradeVisual /> : feat === "settle" ? <SettleVisual /> : <ProofVisual />}</div>
              </div>
            </Rv>
          </div>
        </section>

        {/* 4 · roles as lanes on one line, no tabs */}
        <section className="pl-sec pl-roles" id="roles">
          <div className="pl-wrap">
            <Rv><h2 className="pl-narrow">Every side of an invoice works from the same on-chain record.</h2></Rv>
            <ol className="pl-lanes" data-rv="up">
              {ROLES.map((r, k) => (
                <li key={r.k} style={{ "--k": k } as React.CSSProperties}>
                  <span className="pl-lane-node" aria-hidden />
                  <small>{r.k}</small><h3>{r.t}</h3><p>{r.d}</p>
                  <a className="pl-link" href={tabHref(r.cta[1])}>{r.cta[0]} <Arr /></a>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 5 · checkable proof in a bento grid (repository facts only) */}
        <section className="pl-sec pl-deep pl-proof" id="proof">
          <div className="pl-wrap">
            <div className="pl-head2 split">
              <Rv><h2>Built to be checked, not taken on trust.</h2></Rv>
              <Rv delay={80}><p className="pl-body">A single hand-written Yul contract on Portaldot V3 holds the receipts, the vault, the settlement pool and the market. Read it, run the tests, then decide.</p></Rv>
            </div>
            <div className="pl-bento">
              <Rv kind="scale" className="pl-cell pl-code">
                <div className="pl-code-bar"><span>contracts/PotKit.yul</span><Tabs id="code" label="Contract excerpts" className="seg" tabs={CODE_TABS.map((x) => ({ id: x.id, label: x.label }))} value={code} onChange={setCode} /></div>
                <div role="tabpanel" id="code-panel" aria-labelledby={`code-tab-${code}`}>
                  <pre tabIndex={0} key={code}><code>{SNIPPETS[code].map((l, k) => <span key={k} style={{ "--k": k } as React.CSSProperties}><i>{k + 1}</i>{l}{"\n"}</span>)}</code></pre>
                </div>
                <p className="pl-cell-note">{code === "settle" ? "Checks, then state changes; settle makes no external call." : "State is updated first; the tPOT is sent last."}</p>
              </Rv>
              <div className="pl-cell pl-metrics">
                {METRICS.map(([v, c], k) => <Rv key={c} delay={k * 90} className="pl-metric"><b>{v}</b><span>{c}</span></Rv>)}
              </div>
              <Rv delay={100} className="pl-cell pl-tests"><small>Automated tests · local chain</small><ul>{TEST_NAMES.map((t) => <li key={t}>{t}</li>)}</ul></Rv>
              <Rv delay={140} className="pl-cell pl-repo">
                <ul className="pl-files"><li><Ico n="code" />contracts/PotKit.yul</li><li><Ico n="docs" />src/</li><li><Ico n="shield" />test/</li></ul>
                <a className="pl-btn ghost" href={REPO} {...ext}>github.com/itsjusttu/potkit-portaldot <Arr /></a>
                <p>Everything here can be checked in the repository or on the testnet. PotKit records issuer-provided information and does not guarantee that any invoice will be paid.</p>
              </Rv>
            </div>
          </div>
        </section>

        {/* connect: wallets, tPOT and links gather into one contract */}
        <section className="pl-sec pl-connect-sec" id="connect" data-live>
          <div className="pl-wrap">
            <div className="pl-head2 center">
              <Rv><h2>Works with what you already use.</h2></Rv>
              <Rv delay={60}><p className="pl-body">Browser wallets, the native testnet token and plain links. There is no backend to trust and nothing to install.</p></Rv>
              <Rv delay={120}><a className="pl-link" href={L.guide} {...ext}>Read the V3 testnet guide <Arr /></a></Rv>
            </div>
            <div className="pl-hub" aria-hidden>
              <div className="pl-hub-side l"><Fan dir="right" n={26} /><span className="pl-hub-flow">{HUB_L.map((n, k) => <b key={k} style={{ "--k": k } as React.CSSProperties}><i><Ico n={n} /></i></b>)}</span></div>
              <span className="pl-hub-core"><img src="/potkit-p-mark-black.svg" alt="" width={56} height={56} /></span>
              <div className="pl-hub-side r"><Fan dir="left" n={26} /><span className="pl-hub-flow">{HUB_R.map((n, k) => <b key={k} style={{ "--k": k } as React.CSSProperties}><i><Ico n={n} /></i></b>)}</span></div>
            </div>
            <ul className="pl-connect" aria-label="What you need">
              {CONNECT.map(([t, d, i], k) => <Rv as="li" key={t} delay={k * 90}><span className="pl-connect-ico"><Ico n={i} /></span><b>{t}</b><span>{d}</span></Rv>)}
            </ul>
          </div>
        </section>

        {/* 6 · explore slider */}
        <section className="pl-sec pl-explore" id="explore">
          <div className="pl-wrap">
            <div className="pl-explore-head"><Rv><h2>Explore by receipt kind and role</h2></Rv>
              <div className="pl-slide-btns"><button type="button" aria-label="Previous" disabled={sl.start} onClick={() => slide(-1)}>←</button><button type="button" aria-label="Next" disabled={sl.end} onClick={() => slide(1)}>→</button></div></div>
            <div className="pl-slider" ref={slider} onScroll={onSlide} tabIndex={0} role="region" aria-label="Receipt kinds and roles">
              {EXPLORE.map((c) => (
                <a key={c.t} className="pl-xcard" href={tabHref(c.href)}>
                  <span className={`pl-xart a${c.art}`} aria-hidden><i /><i /><i /><i /></span>
                  <small>{c.k}</small><b>{c.t}</b><span className="pl-xdesc">{c.d}</span><span className="pl-xgo">Open in app <Arr /></span>
                </a>
              ))}
            </div>
            <div className="pl-track" aria-hidden><i style={{ width: `${sl.w * 100}%`, left: `${sl.p * (1 - sl.w) * 100}%` }} /></div>
          </div>
        </section>

        {/* 7 · resources */}
        <section className="pl-sec pl-deep pl-learn" id="learn">
          <div className="pl-wrap pl-learn-grid">
            <div><Rv><h2>Learn more about PotKit and how it works</h2></Rv><Rv delay={80}><a className="pl-btn ghost" href={page("/help")}>Open the Help Center <Arr /></a></Rv></div>
            <ul className="pl-list">
              {LEARN.map((l, k) => <Rv as="li" key={l.t} delay={k * 70}><a href={l.h} {...(l.internal ? {} : ext)}><span className="pl-chip2">{l.m}</span><h3>{l.t}</h3><p>{l.d}</p><Arr /></a></Rv>)}
            </ul>
          </div>
        </section>

        {/* 8 · closing call to action: the line converges into one point */}
        <section className="pl-final" id="start" data-live>
          <Bars />
          <div className="pl-wrap pl-final-in">
            <Rv><h2>Try the full lifecycle on testnet.</h2><p className="pl-body">Built for Portaldot Hacker House 2026 · Track 4, Ecosystem DApps (RWA). Settled in native tPOT, no real value.</p></Rv>
            <Rv delay={100} className="pl-cta center"><a className="pl-btn primary lg" href={launch}>Launch App <Arr /></a><a className="pl-btn ghost lg" href={L.hackathon} {...ext}>View on DoraHacks</a></Rv>
            <Rv delay={160}><form className="pl-verify" onSubmit={go}><label htmlFor="pl-rid">Already have a receipt?</label><div><input id="pl-rid" inputMode="numeric" placeholder="Receipt #" value={rid} onChange={(e) => setRid(e.target.value)} /><button type="submit" className="pl-btn primary">Verify</button></div></form></Rv>
          </div>
        </section>
      </main>

      <footer className="pl-foot">
        <div className="pl-wrap">
          <div className="pl-foot-cols">
            <nav aria-label="Product"><h4>Product</h4><a href={launch}>Launch app</a><a href={app("?tab=issue")}>Issue an invoice</a><a href={app("?tab=trade")}>Trade shares</a><a href={app("?tab=verify")}>Verify a receipt</a></nav>
            <nav aria-label="Learn"><h4>Learn</h4><a href={page("/how-it-works")}>How it works</a><a href={page("/protocol")}>Protocol reference</a><a href={page("/security")}>Security model</a><a href={page("/help")}>Help Center</a></nav>
            <nav aria-label="Resources"><h4>Resources</h4>{RESOURCES.filter((x) => !x.internal).map((x) => <a key={x.label} href={x.href} {...ext}>{x.label}</a>)}<a href={L.repo} {...ext}>Portaldot node repo</a></nav>
            <nav aria-label="Community"><h4>Community</h4>{COMMUNITY.map((x) => <a key={x.label} href={x.href} {...ext}>{x.label}</a>)}</nav>
          </div>
          <div className="pl-foot-base"><span className="pl-logo sm"><img src="/potkit-p-circle-white.svg" alt="" width={24} height={24} />PotKit</span><span>© 2026 PotKit · Not affiliated with Portaldot · Testnet only</span></div>
        </div>
      </footer>
    </div>
  );
}
