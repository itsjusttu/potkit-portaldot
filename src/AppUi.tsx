import { mappedAddress } from "./lib/chain";
import { FaucetButton } from "./Faucet";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { onTx, short, STATUSES, type Listing, type Row, type TxEvent } from "./lib/chain";

// ---------------- toasts ----------------
export type Toast = { id: number; kind: "pending" | "ok" | "err" | "info"; title: string; hash?: string; detail?: string };
let push: (t: Omit<Toast, "id">) => void = () => {};
export const toast = (t: Omit<Toast, "id">) => push(t);

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    let id = 0;
    const timers = new Map<number, number>();
    const drop = (tid: number, ms: number) => { timers.set(tid, window.setTimeout(() => setList((l) => l.filter((x) => x.id !== tid)), ms)); };
    push = (t) => { const tid = ++id; setList((l) => [...l.slice(-4), { ...t, id: tid }]); if (t.kind !== "pending") drop(tid, t.kind === "err" ? 9000 : 5000); };
    const off = onTx((e: TxEvent) => {
      setList((l) => {
        const i = l.findIndex((x) => x.hash === e.hash);
        if (e.state === "pending") return i >= 0 ? l : [...l.slice(-4), { id: ++id, kind: "pending", title: "Transaction pending", hash: e.hash }];
        const kind = e.state === "confirmed" ? "ok" : "err";
        const title = e.state === "confirmed" ? "Transaction confirmed" : "Transaction failed";
        const next = i >= 0 ? l.map((x, j) => (j === i ? { ...x, kind, title } as Toast : x)) : [...l, { id: ++id, kind, title, hash: e.hash } as Toast];
        const t = next.find((x) => x.hash === e.hash)!;
        drop(t.id, kind === "err" ? 9000 : 5000);
        return next;
      });
    });
    return () => { off(); timers.forEach((t) => clearTimeout(t)); };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="t-ico" aria-hidden>{t.kind === "pending" ? <i className="spin" /> : t.kind === "ok" ? "✓" : t.kind === "err" ? "!" : "i"}</span>
          <div className="t-body">
            <b>{t.title}</b>
            {t.detail && <span className="muted">{t.detail}</span>}
            {t.hash && (
              <span className="t-hash mono">
                {short(t.hash)}
                <button className="t-copy" onClick={() => void navigator.clipboard?.writeText(t.hash!)} aria-label="Copy transaction hash">copy</button>
              </span>
            )}
          </div>
          <button className="t-x" aria-label="Dismiss" onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}><Ico n="x" /></button>
        </div>
      ))}
    </div>
  );
}

// ---------------- getting started ----------------
export type Step = { label: string; done: boolean; action?: ReactNode; go?: () => void };
export function Checklist({ steps, storeKey, title = "Getting started", doneText = "All set — you're ready to demo", dismissible = true }: { steps: Step[]; storeKey: string; title?: string; doneText?: string; dismissible?: boolean }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem(storeKey) === "hidden");
  const [open, setOpen] = useState(true);
  const done = steps.filter((s) => s.done).length;
  if (hidden) return null;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className={`check ${open ? "" : "closed"}`}>
      <header>
        <button className="check-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="kicker">{title}</span>
          <b>{done === steps.length ? doneText : next >= 0 ? `Next: ${steps[next].label} · ${done}/${steps.length}` : ""}</b>
          <span className="check-bar"><i style={{ width: `${(done / steps.length) * 100}%` }} /></span>
          <span className="chev" aria-hidden>{open ? "–" : "+"}</span>
        </button>
        {dismissible && <button className="t-x" aria-label="Dismiss checklist" onClick={() => { localStorage.setItem(storeKey, "hidden"); setHidden(true); }}><Ico n="x" /></button>}
      </header>
      {open && (
        <ol>
          {steps.map((s, i) => (
            <li key={s.label} className={s.done ? "done" : i === next ? "next" : ""} aria-current={i === next ? "step" : undefined}>
              <span className="box" aria-hidden>{s.done ? <Ico n="check" /> : i + 1}</span>
              {s.go ? <button className="lbl link" onClick={s.go}>{s.label}<span className="sr-only">{s.done ? " (done)" : ""}</span></button> : <span className="lbl">{s.label}</span>}
              {!s.done && i === next && (s.action ?? (s.go && <button className="btn sm primary" onClick={s.go}>Go <Ico n="arrow" /></button>))}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------------- empty / error states ----------------
export function Empty({ icon, title, body, children, tone = "" }: { icon: string; title: string; body: ReactNode; children?: ReactNode; tone?: "" | "warn" | "err" }) {
  return (
    <div className={`empty ${tone}`}>
      <span className="e-ico" aria-hidden>{icon}</span>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      {children && <div className="row" style={{ justifyContent: "center" }}>{children}</div>}
    </div>
  );
}

// ---------------- board charts (SVG) ----------------
export const STATUS_COLORS: Record<string, string> = { Free: "#5b6a6e", Pending: "#b48ac8", "Due soon": "#c9a95a", Overdue: "#cf7487", Settled: "#3fae84" };

export function StatusBars({ rows, loading = false }: { rows: Row[]; loading?: boolean }) {
  const counts = STATUSES.map((s) => ({ s, c: rows.filter((r) => r.status === s).length }));
  const max = Math.max(1, ...counts.map((x) => x.c));
  return (
    <div className="bars" role="img" aria-label={counts.map(({ s, c }) => `${s} ${c}`).join(", ")}>
      {counts.map(({ s, c }) => (
        <div className="bar" key={s}>
          <span className="b-l">{s}</span>
          <span className="b-t"><i style={{ width: `${(c / max) * 100}%`, background: STATUS_COLORS[s] }} /></span>
          <b>{loading ? <span className="skel kpi-skel sm" aria-label="Loading" /> : c}</b>
        </div>
      ))}
    </div>
  );
}

// ---------------- icons (inline SVG, no glyph fallbacks) ----------------
const PATHS: Record<string, string> = {
  wallet: "M3 6.5h18v13H3zM3 9h18M16 14h2", activity: "M3 12h4l3-8 4 16 3-8h4",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  copy: "M9 9h10v10H9zM5 15V5h10", check: "M5 12.5 10 17l9-10", arrow: "M5 12h13M13 6l6 6-6 6", swap: "M7 7h12l-3-3M17 17H5l3 3",
  power: "M12 3v8M6.3 6.8a8 8 0 1 0 11.4 0", x: "M6 6l12 12M18 6 6 18", dash: "M6 12h12", info: "M12 11v6M12 7.5v.5", ext: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6", search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  mint: "M12 5v14M5 12h14", lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3", terms: "M7 4h10v16H7zM10 9h4M10 13h4", settle: "M4 7h16v10H4zM12 10v4M8 12h.01M16 12h.01",
  claim: "M12 4v11M7 10l5 5 5-5M5 20h14", tag: "M4 4h8l8 8-8 8-8-8zM8.5 8.5h.01", cart: "M3 4h2l2.5 11h10L20 8H6.5M9 20h.01M17 20h.01", cancel: "M6 6l12 12M18 6 6 18",
  redeem: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4", faucet: "M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z", deploy: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5",
  shield: "M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z", link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  filter: "M4 5h16l-6 8v6l-4-2v-4z", guide: "M5 4h11l3 3v13H5zM9 10h6M9 14h6M9 18h3", send: "M4 12l16-8-6 16-3-7z",
  book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22zM4 5.5v14A2.5 2.5 0 0 1 6.5 17H20M8 7h8M8 10h8",
  github: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.7a5.2 5.2 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6s-1.2-.4-3.8 1.4a13.2 13.2 0 0 0-6.9 0C5.5.2 4.3.6 4.3.6a4.8 4.8 0 0 0-.1 3.6 5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.2 6.4 6.2 6.7A3.4 3.4 0 0 0 8 17.1V22",
  help: "M9.1 9a3 3 0 1 1 5.4 1.8c-.9 1.2-2.5 1.7-2.5 3.7M12 18h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
};
export function Ico({ n, size = 16 }: { n: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="ico-svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {n === "info" && <circle cx="12" cy="12" r="9" />}<path d={PATHS[n]} />
    </svg>
  );
}

// ---------------- shortened address with copy ----------------
export function Addr({ a, label }: { a: string; label?: string }) {
  const [ok, setOk] = useState(false);
  if (!a) return <span className="muted">—</span>;
  return (
    <span className="addr mono" title={a}>
      {label && <span className="addr-l">{label}</span>}
      <span>{short(a)}</span>
      <button className="addr-c" aria-label={`Copy ${label ?? "address"} ${a}`} onClick={() => void navigator.clipboard?.writeText(a).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); })}>
        <Ico n={ok ? "check" : "copy"} size={14} />
      </button>
    </span>
  );
}

// ---------------- dismissible gas tip ----------------
export function GasTip({ consoleUrl, guideUrl, account }: { consoleUrl: string; guideUrl: string; account?: string }) {
  const K = "potkit.gastip";
  const [hidden, setHidden] = useState(() => localStorage.getItem(K) === "hidden");
  const [copied, setCopied] = useState(false);
  let mapped = "";
  try { mapped = account ? mappedAddress(account) : ""; } catch { /* not an address */ }
  if (hidden) return null;
  return (
    <details className="tip">
      <summary><Ico n="info" /> First time on Portaldot? How gas works</summary>
      <p>
        Gas is paid in tPOTv3 by your <b>mapped</b> Substrate account, not the 0x address. Map it once in the{" "}
        <a href={consoleUrl} target="_blank" rel="noreferrer">node console</a> (Developer → Runtime calls → reviveApi → accountId), then fund that account.{" "}
        <a href={guideUrl} target="_blank" rel="noreferrer">Testnet guide</a>
      </p>
      {account && <FaucetButton account={account} />}
      {mapped && (
        <p className="tl-hash">
          <span className="muted small">Fund this gas account:</span> <span className="mono">{mapped}</span>
          <button className="wp-copy" aria-label="Copy mapped gas account" onClick={() => void navigator.clipboard?.writeText(mapped).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1300); })}><Ico n={copied ? "check" : "copy"} size={14} />{copied ? "Copied" : "Copy"}</button>
        </p>
      )}
      <button className="t-x tip-x" aria-label="Dismiss gas tip" onClick={() => { localStorage.setItem(K, "hidden"); setHidden(true); }}><Ico n="x" /></button>
    </details>
  );
}

// ---------------- side drawer (Escape / backdrop closes, focus moves in and back) ----------------
export function Drawer({ open, title, kicker, onClose, children }: { open: boolean; title: string; kicker?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, button:not(.dr-x)")?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const f = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, select, a[href]") ?? [])];
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); opener?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dr-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="dr-head"><div>{kicker && <p className="kicker">{kicker}</p>}<h3>{title}</h3></div>
          <button className="t-x dr-x" aria-label="Close" onClick={onClose}><Ico n="x" /></button></header>
        <div className="dr-body">{children}</div>
      </aside>
    </div>
  );
}

// ---------------- generic donut ----------------
export function Donut({ parts, center, sub }: { parts: { label: string; value: number; color: string }[]; center: string; sub: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const C = 2 * Math.PI * 52; let acc = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={`${sub}: ${parts.map((p) => `${p.label} ${total ? Math.round((p.value / total) * 100) : 0}%`).join(", ")}`}>
        <circle cx="70" cy="70" r="52" className="d-bg" />
        {total > 0 && parts.map((p) => { const len = (p.value / total) * C; const el = <circle key={p.label} cx="70" cy="70" r="52" className="d-seg" stroke={p.color} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />; acc += len; return el; })}
        <text x="70" y="68" className="d-num">{center}</text>
        <text x="70" y="86" className="d-lbl">{sub}</text>
      </svg>
      <ul className="legend">
        {parts.map((p) => <li key={p.label}><i style={{ background: p.color }} /><span>{p.label}</span><b>{total ? Math.round((p.value / total) * 100) : 0}%</b></li>)}
      </ul>
    </div>
  );
}

export const PALETTE = ["#7c6cff", "#b48ac8", "#c9a95a", "#3fae84", "#cf7487", "#7f9fc8", "#7aa7ae", "#9b8aa8"];

// ---------------- v21: count-up for metric values ----------------
const reduceMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Animates the numeric part of a formatted value ("2,400", "+30", "720.5") from 0 on mount / change (~1.2s, ease-out). */
export function CountUp({ v }: { v: ReactNode }) {
  const text = typeof v === "string" || typeof v === "number" ? String(v) : null;
  const m = text?.match(/^([+-]?)([\d,]*\.?\d+)(.*)$/s) ?? null;
  const target = m ? Number(m[2].replace(/,/g, "")) : NaN;
  const decimals = m && m[2].includes(".") ? m[2].split(".")[1].length : 0;
  const [cur, setCur] = useState(target);
  useEffect(() => {
    if (!Number.isFinite(target) || target === 0 || reduceMotion()) { setCur(target); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 1200); setCur(target * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (!m || !Number.isFinite(target)) return <>{v}</>;
  const shown = cur.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: m[2].includes(",") || target >= 1000 });
  return <>{m[1]}{shown}{m[3]}</>;
}
