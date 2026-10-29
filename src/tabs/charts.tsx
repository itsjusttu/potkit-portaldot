import { useState } from "react";
import { cumulative } from "./insights";

/* Dashboard charts: plain SVG, no library. Entrance motion lives in night-motion.css and is off for reduced motion. */

/** Dot matrix: one column per day, one lit dot per event (two kinds stacked), faint dots fill the rest. Hover shows the day. */
export function DotMatrix({ a, b, dates }: { a: number[]; b: number[]; dates: string[] }) {
  const rows = 10, cw = 10, gap = 4;
  const [hi, setHi] = useState<number | null>(null);
  const at = (e: React.PointerEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); return Math.min(a.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * a.length))); };
  return (
    <div className="nv-chart" onPointerMove={(e) => setHi(at(e))} onPointerLeave={() => setHi(null)}>
      <svg className="nv-matrix" viewBox={`0 0 ${a.length * (cw + gap)} ${rows * (cw + gap)}`} preserveAspectRatio="none" role="img" aria-label={`On-chain events per day over the last ${a.length} days`}>
        {a.map((na, x) => (
          <g key={x} className={`m-col ${hi === x ? "hot" : ""}`} style={{ "--x": x } as React.CSSProperties}>
            {Array.from({ length: rows }, (_, y) => {
              const fb = rows - 1 - y, nb = b[x] ?? 0;
              const cls = fb < Math.min(na, rows) ? "m-a" : fb < Math.min(na + nb, rows) ? "m-b" : "m-0";
              return <rect key={y} x={x * (cw + gap)} y={y * (cw + gap)} width={cw} height={cw} rx={2} className={cls} />;
            })}
          </g>
        ))}
      </svg>
      {hi !== null && <div className="nv-tip" style={{ left: `clamp(5rem, ${((hi + 0.5) / a.length) * 100}%, calc(100% - 5rem))` }} role="status"><b>{dates[hi]}</b><span>{(a[hi] ?? 0) + (b[hi] ?? 0)} event{(a[hi] ?? 0) + (b[hi] ?? 0) === 1 ? "" : "s"}</span><small>{a[hi] ?? 0} issued/listed · {b[hi] ?? 0} trades/payments</small></div>}
    </div>
  );
}

/** Cumulative line of the last period (solid) against the period before it (dotted). */
export function Lines({ cur, prev }: { cur: number[]; prev: number[] }) {
  const cc = cumulative(cur), cp = cumulative(prev), max = Math.max(1, ...cc, ...cp), W = 300, H = 120;
  const path = (xs: number[]) => xs.map((v, i) => `${i ? "L" : "M"}${(i / Math.max(1, xs.length - 1)) * W} ${H - (v / max) * (H - 8) - 4}`).join(" ");
  return (
    <svg className="nv-lines" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Cumulative on-chain events, last period against the period before">
      <path d={`${path(cc)} L${W} ${H} L0 ${H} Z`} className="l-fill" /><path d={path(cp)} className="l-b" /><path d={path(cc)} className="l-a" />
    </svg>
  );
}

/** Small sparkline of a cumulative series with the last point marked. */
export function Spark({ xs, tone }: { xs: number[]; tone: "violet" | "green" | "blue" }) {
  const W = 200, H = 56, max = Math.max(...xs), min = Math.min(...xs), span = max - min || 1;
  const pts = xs.map((v, i) => [(i / Math.max(1, xs.length - 1)) * W, H - 6 - ((v - min) / span) * (H - 14)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg className={`nv-spark s-${tone}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="sp-base" /><path d={`${d} L${W} ${H} L0 ${H} Z`} className="sp-fill" /><path d={d} className="sp-line" />
      <circle cx={last[0]} cy={last[1]} r="3.5" className="sp-dot" />
    </svg>
  );
}

/** Needle gauge (0–100). The needle is drawn at 0 and turned to the value, so it sweeps in on load. */
export function Needle({ pct, label }: { pct: number | null; label: string }) {
  const v = Math.min(100, Math.max(0, pct ?? 0)), cx = 100, cy = 92, r = 70;
  return (
    <svg className="nv-needle" viewBox="0 0 200 112" role="img" aria-label={label}>
      {Array.from({ length: 31 }, (_, i) => { const t = Math.PI * (1 - i / 30); return <line key={i} x1={cx + Math.cos(t) * (r + 10)} y1={cy - Math.sin(t) * (r + 10)} x2={cx + Math.cos(t) * (r + 13)} y2={cy - Math.sin(t) * (r + 13)} className="n-tick" />; })}
      <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} pathLength={100} className="n-track" />
      {v > 0 && <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} pathLength={100} className="n-fill" strokeDasharray={`${v} 100`} />}
      <g className="n-hand-g" style={{ transform: `rotate(${v * 1.8}deg)` }}><line x1={cx} y1={cy} x2={cx - (r - 18)} y2={cy} className="n-hand" /></g>
      <circle cx={cx} cy={cy} r="6" className="n-hub" />
      <text x={cx - r} y={cy + 16} className="n-end">0</text><text x={cx + r} y={cy + 16} className="n-end">100</text>
    </svg>
  );
}
