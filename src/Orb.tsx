import { useEffect, useRef, useState } from "react";

/** A rotating sphere of dots with land-like clusters (value noise, no map data) and a few pulsing nodes joined by arcs: receipts and payments moving between holders. */
const hash = (x: number, y: number, z: number) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440670441); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sm = (t: number) => t * t * (3 - 2 * t);
const vn = (x: number, y: number, z: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
  const l = (p: number, q: number, t: number) => p + (q - p) * t, c = (i: number, j: number, k: number) => hash(xi + i, yi + j, zi + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf), l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf), zf);
};
const isLand = (x: number, y: number, z: number) => vn(x * 2.1 + 5, y * 2.1, z * 2.1) * 0.65 + vn(x * 4.4, y * 4.4 + 9, z * 4.4) * 0.35 > 0.53;
const PTS = (() => {
  const a: number[] = []; const g = Math.PI * (3 - Math.sqrt(5)); const C = 11000;
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; // fixed seed: same sphere every load
  for (let i = 0; i < C; i++) {
    const y = Math.max(-1, Math.min(1, 1 - (i / (C - 1)) * 2)); const r = Math.sqrt(1 - y * y); const t = g * i + (rnd() - 0.5) * 1.1;
    const x = Math.cos(t) * r, z = Math.sin(t) * r;
    if (isLand(x, y, z) || rnd() < 0.12) a.push(x, y, z);
  }
  return a;
})();
const COUNT = PTS.length / 3;
const DOT_BINS = Array.from({ length: 4 }, () => new Float32Array(COUNT * 2));
const DOT_COUNTS = new Uint32Array(4);
const ll = (lat: number, lon: number): [number, number, number] => [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
const NODES = [ll(0.5, 0.2), ll(0.1, 1.5), ll(-0.35, 2.7), ll(0.35, 3.9), ll(-0.1, 5.2)];
const arc = (a: number[], b: number[], s: number) => {
  const d = Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!)); const w = Math.acos(d) || 1e-3;
  const k1 = Math.sin((1 - s) * w) / Math.sin(w), k2 = Math.sin(s * w) / Math.sin(w), lift = 1 + 0.16 * Math.sin(Math.PI * s);
  return [(a[0]! * k1 + b[0]! * k2) * lift, (a[1]! * k1 + b[1]! * k2) * lift, (a[2]! * k1 + b[2]! * k2) * lift];
};
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function DotSphere({ className = "", speed = 0.16, tilt = 0.38, interactive = false }: { className?: string; speed?: number; tilt?: number; interactive?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let w = 0, h = 0, raf = 0, rot = 0.8, last = 0, still = reduced() && !interactive, tx = 0, ty = 0, mx = 0, my = 0;
    const move = (e: PointerEvent) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; };
    if (interactive && !still) addEventListener("pointermove", move);
    const size = () => { const r = cv.getBoundingClientRect(); const d = Math.min(devicePixelRatio || 1, 1.5); w = r.width; h = r.height; cv.width = Math.round(w * d); cv.height = Math.round(h * d); ctx.setTransform(d, 0, 0, d, 0, 0); };
    const frame = (now: number) => {
      const t = now / 1000; if (!still && !document.hidden) rot += (t - last) * speed; last = t;
      mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
      const ro = rot + mx * 1.1, ti = tilt + my * 0.5;
      const R = Math.min(w, h) * 0.42, cx = w / 2, cy = h / 2, cr = Math.cos(ro), sr = Math.sin(ro), ct = Math.cos(ti), st = Math.sin(ti);
      const P = (x: number, y: number, z: number): [number, number, number] => { const x1 = x * cr + z * sr, z1 = -x * sr + z * cr; return [cx + x1 * R, cy + (y * ct - z1 * st) * R, y * st + z1 * ct]; };
      ctx.clearRect(0, 0, w, h);
      DOT_COUNTS.fill(0);
      for (let i = 0; i < COUNT; i++) {
        const x = PTS[i * 3]!, y = PTS[i * 3 + 1]!, z = PTS[i * 3 + 2]!;
        const x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
        const px = cx + x1 * R, py = cy + (y * ct - z1 * st) * R, depth = y * st + z1 * ct;
        const layer = Math.min(3, Math.floor(((depth + 1) / 2) * 4)), offset = DOT_COUNTS[layer]! * 2;
        DOT_BINS[layer]![offset] = px; DOT_BINS[layer]![offset + 1] = py; DOT_COUNTS[layer]++;
      }
      const alpha = [0.12, 0.28, 0.55, 0.9];
      DOT_BINS.forEach((b, k) => { ctx.fillStyle = `rgba(222,240,246,${alpha[k]})`; const s = k > 1 ? 1.7 : 1.1; for (let i = 0; i < DOT_COUNTS[k]! * 2; i += 2) ctx.fillRect(b[i]!, b[i + 1]!, s, s); });
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(111,195,211,.55)";
      NODES.forEach((a, i) => {
        const b = NODES[(i + 1) % NODES.length]!; ctx.beginPath(); let pen = false;
        for (let s = 0; s <= 24; s++) { const v = arc(a, b, s / 24); const [px, py, z] = P(v[0]!, v[1]!, v[2]!); if (z < -0.05) { pen = false; continue; } if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; } }
        ctx.stroke();
      });
      NODES.forEach((n, i) => {
        const [px, py, z] = P(n[0], n[1], n[2]); if (z < -0.05) return;
        const ph = still ? 0.3 : (t * 0.7 + i * 0.27) % 1;
        ctx.fillStyle = "#6fc3d3"; ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(111,195,211,${0.5 * (1 - ph)})`; ctx.beginPath(); ctx.arc(px, py, 4 + ph * 16, 0, 7); ctx.stroke();
      });
      if (!still) raf = requestAnimationFrame(frame);
    };
    size(); const rz = new ResizeObserver(() => { size(); if (still) frame(0); }); rz.observe(cv);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); rz.disconnect(); still = true; removeEventListener("pointermove", move); };
  }, [speed, tilt, interactive]);
  return <canvas ref={ref} className={className} aria-hidden />;
}

/** Two bright arcs on a ring around the sphere, with end dots (HUD feel). Coordinates are in the parent's 0-100 box. */
export const Arcs = ({ className = "" }: { className?: string }) => (
  <svg className={`arcs ${className}`} viewBox="0 0 100 100" aria-hidden overflow="visible">
    <path d="M4.04 11.43A60 60 0 0 0 4.04 88.57" /><path d="M95.96 11.43A60 60 0 0 1 95.96 88.57" />
    <circle cx="4.04" cy="11.43" r=".7" /><circle cx="95.96" cy="11.43" r=".7" />
  </svg>
);

const KEY = "potkit.intro";
export const introSeen = () => { try { return reduced() || sessionStorage.getItem(KEY) === "1"; } catch { return false; } };

/** Loading screen shown once per browser session: sphere, dotted rings, percent counter and a tick bar. */
export function Intro({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0); const [out, setOut] = useState(false);
  const done = useRef(false);
  const finish = () => { if (done.current) return; done.current = true; setOut(true); try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode */ } setTimeout(onDone, 560); };
  useEffect(() => {
    const t0 = performance.now(); let raf = 0;
    const tick = (now: number) => { const k = Math.min(1, (now - t0) / 3200); setP(Math.round(100 * (1 - Math.pow(1 - k, 2.2)))); if (k < 1) raf = requestAnimationFrame(tick); else finish(); };
    raf = requestAnimationFrame(tick);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    addEventListener("keydown", esc);
    return () => { cancelAnimationFrame(raf); removeEventListener("keydown", esc); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={`intro${out ? " out" : ""}`} role="status" aria-label="Loading PotKit">
      <div className="intro-stage">
        <i className="intro-ring" style={{ inset: "-12%" }} /><i className="intro-ring" style={{ inset: "-26%" }} /><i className="intro-ring" style={{ inset: "-44%" }} />
        <Arcs /><DotSphere speed={0.28} interactive />
      </div>
      <b className="intro-logo"><i />PotKit</b>
      <div className="intro-meta">
        <span>Syncing with Portaldot V3</span>
        <b className="intro-pct">{p}<small>%</small></b>
        <div className="intro-bar" aria-hidden>{Array.from({ length: 40 }, (_, i) => <i key={i} className={i < p * 0.4 ? "on" : ""} />)}</div>
      </div>
      <button className="intro-skip" onClick={finish}>Skip</button>
    </div>
  );
}
