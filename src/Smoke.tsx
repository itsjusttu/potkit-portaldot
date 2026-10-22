import { useEffect, useRef } from "react";

/**
 * Cursor "jellyfish": soft rounded bell locked to the pointer, with a few short undulating
 * tentacle wisps along the recent path. Visible only while moving; fades in ~0.25 s.
 *
 * Position: canvas is fixed and full-viewport, rendered at 1/2 resolution and CSS-upscaled.
 * Pointer clientX/Y → canvas px via live getBoundingClientRect (covers CSS size, DPR, and any
 * layout shift). Lenis scrolls the document; this canvas stays fixed, so scroll is a no-op for
 * the mapping. A small CSS blur softens the edges without shifting the centroid.
 */
export function Smoke() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d", { alpha: true })!;
    const SCALE = 0.5;
    let rect = c.getBoundingClientRect(), kx = 1, ky = 1, raf = 0;
    const size = () => {
      rect = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(rect.width * SCALE));
      c.height = Math.max(1, Math.round(rect.height * SCALE));
      kx = c.width / Math.max(1, rect.width);
      ky = c.height / Math.max(1, rect.height);
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(c);

    type H = { x: number; y: number; t: number };
    const hist: H[] = [];
    let lastMove = -1e9, cx = -1, cy = -1; // cx/cy = exact last cursor in canvas px
    const onMove = (e: PointerEvent) => {
      // refresh mapping every event so a mid-frame resize/DPR change can't lag the cursor
      rect = c.getBoundingClientRect();
      kx = c.width / Math.max(1, rect.width);
      ky = c.height / Math.max(1, rect.height);
      cx = (e.clientX - rect.left) * kx;
      cy = (e.clientY - rect.top) * ky;
      const now = performance.now();
      hist.push({ x: cx, y: cy, t: now });
      lastMove = now;
      if (hist.length > 18) hist.shift();
      if (!raf) raf = requestAnimationFrame(loop);
    };
    addEventListener("pointermove", onMove, { passive: true });

    const TRAIL_MS = 140;
    const TENT = [
      { off: -1, ph: 0.0, col: "155,128,255" },
      { off: -0.4, ph: 1.9, col: "160,160,160" },
      { off: 0.4, ph: 3.3, col: "155,128,255" },
      { off: 1, ph: 4.8, col: "160,160,160" },
    ];
    const loop = (now: number) => {
      raf = 0;
      ctx.clearRect(0, 0, c.width, c.height);
      while (hist.length && now - hist[0].t > TRAIL_MS) hist.shift();
      const vis = Math.max(0, 1 - (now - lastMove) / 250);
      if (cx < 0 || vis <= 0) return;

      const headX = cx, headY = cy; // lock the bell to the exact last mapped cursor
      const tail = hist[0] ?? { x: headX, y: headY };
      let dx = headX - tail.x, dy = headY - tail.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const nx = -dy, ny = dx;
      const R = 11; // canvas px ≈ 22 CSS px
      const t = now / 1000;

      // tentacles first (dimmer than the bell so the brightness peak stays on the cursor)
      if (hist.length > 2) {
        ctx.lineCap = "round";
        for (const tn of TENT) {
          ctx.beginPath();
          for (let i = hist.length - 1, k = 0; i >= 0; i--, k++) {
            const p = hist[i], f = k / Math.max(1, hist.length - 1);
            const wave = Math.sin(t * 10 + tn.ph + f * 6) * (1 + f * 3);
            const spread = tn.off * R * (0.45 + f * 0.55);
            const x = p.x + nx * (spread + wave) - dx * R * 0.4;
            const y = p.y + ny * (spread + wave) - dy * R * 0.4;
            k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          const g = ctx.createLinearGradient(headX, headY, tail.x, tail.y);
          g.addColorStop(0, `rgba(${tn.col},${0.22 * vis})`);
          g.addColorStop(1, `rgba(${tn.col},0)`);
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }

      // bell + bright core — peak brightness is always here
      const pulse = 1 + Math.sin(t * 7) * 0.05;
      ctx.save();
      ctx.translate(headX, headY);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.scale(0.9 * pulse, 1.05 / pulse);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, `rgba(240,248,250,${vis})`);
      g.addColorStop(0.25, `rgba(255,255,255,${0.75 * vis})`);
      g.addColorStop(0.65, `rgba(160,160,160,${0.28 * vis})`);
      g.addColorStop(1, "rgba(160,160,160,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      raf = requestAnimationFrame(loop);
    };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); removeEventListener("pointermove", onMove); };
  }, []);
  return <canvas ref={ref} className="v9-smoke" aria-hidden />;
}
