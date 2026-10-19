import { useEffect, useRef } from "react";

/**
 * Hero visual: a "share field". One bright node (the locked receipt) sits at the
 * centre; share nodes orbit it on tilted rings, each joined to the centre by a
 * line. A slow wave lifts the rings, and the cursor leans the whole field.
 * Original to PotKit — not a globe and not string art.
 */
export function Field() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const N = reduce ? 90 : 170;
    type Node = { r: number; a: number; sp: number; ring: number; s: number };
    const nodes: Node[] = [];
    const RINGS = 5;
    for (let i = 0; i < N; i++) {
      const ring = i % RINGS;
      nodes.push({ r: 0.2 + ring * 0.16 + Math.random() * 0.05, a: (i / N) * Math.PI * 2 + ring * 0.4, sp: (0.05 + ring * 0.012) * (i % 2 ? 1 : -1), ring, s: ring === 0 ? 2.2 : 1.2 + Math.random() * 1.1 });
    }
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const size = () => { w = c.clientWidth || 600; h = c.clientHeight || 600; c.width = Math.max(1, w * dpr); c.height = Math.max(1, h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size();
    const ro = new ResizeObserver(size); ro.observe(c);
    let mx = 0, my = 0, tx = 0, ty = 0;
    const onMove = (e: PointerEvent) => { const b = c.getBoundingClientRect(); tx = (e.clientX - b.left) / b.width - 0.5; ty = (e.clientY - b.top) / b.height - 0.5; };
    addEventListener("pointermove", onMove);
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(draw); }, { threshold: 0 });
    io.observe(c);
    const onVis = () => { if (!document.hidden && visible && !raf) raf = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", onVis);
    const t0 = performance.now();
    const C = "111,195,211", M = "180,138,200";
    const draw = (now: number) => {
      if (document.hidden || !visible) { raf = 0; return; }
      const t = reduce ? 4 : (now - t0) / 1000;
      mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
      ctx.clearRect(0, 0, w, h);
      const cx = w * (0.5 + mx * 0.06), cy = h * (0.5 + my * 0.06);
      const R = Math.min(w, h) * 0.46;
      const tilt = 0.55 + my * 0.25;
      // faint ring guides
      ctx.strokeStyle = `rgba(${C},.10)`;
      for (let k = 1; k <= RINGS; k++) { ctx.beginPath(); ctx.ellipse(cx, cy, R * (0.2 + (k - 1) * 0.16), R * (0.2 + (k - 1) * 0.16) * tilt, 0, 0, 7); ctx.stroke(); }
      // spokes, then nodes
      ctx.globalCompositeOperation = "lighter";
      for (const n of nodes) {
        const a = n.a + t * n.sp;
        const wave = Math.sin(t * 0.6 + n.ring * 0.9) * 0.035;
        const rr = n.r + wave;
        const x = cx + Math.cos(a) * rr * R, y = cy + Math.sin(a) * rr * R * tilt;
        const col = n.ring % 2 ? M : C;
        ctx.strokeStyle = `rgba(${col},${(0.05 + (1 - n.r) * 0.13).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = `rgba(${col},${(0.45 + (1 - n.r) * 0.5).toFixed(3)})`;
        ctx.fillRect(x - n.s / 2, y - n.s / 2, n.s, n.s);
      }
      // the receipt at the centre
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(${C},.9)`;
      ctx.fillRect(cx - 3, cy - 3, 6, 6);
      const pulse = 14 + Math.sin(t * 1.4) * 4;
      ctx.strokeStyle = `rgba(${C},${(0.35 + Math.sin(t * 1.4) * 0.15).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(cx, cy, pulse, 0, 7); ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); raf = -1; ro.disconnect(); io.disconnect(); removeEventListener("pointermove", onMove); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return <canvas ref={ref} className="lx-field" aria-hidden />;
}
