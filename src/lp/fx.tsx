import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

/* Scroll effects for the landing page, written for PotKit. Nothing takes over scrolling: the page scrolls natively and these
   helpers only read the scroll position and write CSS variables. With reduced motion the variables stay at their end state. */

export const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (t: number) => { const x = clamp(t); return x * x * (3 - 2 * x); };

/** Progress of a tall element through the viewport, 0 when its top reaches the viewport top, 1 when its bottom reaches
    the viewport bottom (use with a position: sticky child). `apply` writes CSS variables; it runs on animation frames only. */
export function usePinProgress<T extends HTMLElement>(ref: RefObject<T | null>, apply: (p: number, el: T) => void) {
  const fn = useRef(apply); fn.current = apply;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (reduced()) { fn.current(1, el); return; }
    let raf = 0, last = -1;
    const calc = () => {
      raf = 0;
      const r = el.getBoundingClientRect(), total = r.height - innerHeight;
      const p = total > 0 ? clamp(-r.top / total) : 0;
      if (Math.abs(p - last) > 0.0005) { last = p; fn.current(p, el); }
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(calc); };
    calc(); addEventListener("scroll", on, { passive: true }); addEventListener("resize", on);
    return () => { if (raf) cancelAnimationFrame(raf); removeEventListener("scroll", on); removeEventListener("resize", on); };
  }, [ref]);
}

/** 0 when the element's top enters the viewport bottom, 1 when its bottom leaves the viewport top (parallax). */
export function useCrossProgress<T extends HTMLElement>(ref: RefObject<T | null>, name = "--c") {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (reduced()) { el.style.setProperty(name, "0.5"); return; }
    let raf = 0;
    const calc = () => { raf = 0; const r = el.getBoundingClientRect(); el.style.setProperty(name, clamp((innerHeight - r.top) / (innerHeight + r.height)).toFixed(4)); };
    const on = () => { if (!raf) raf = requestAnimationFrame(calc); };
    calc(); addEventListener("scroll", on, { passive: true }); addEventListener("resize", on);
    return () => { if (raf) cancelAnimationFrame(raf); removeEventListener("scroll", on); removeEventListener("resize", on); };
  }, [ref, name]);
}

/** Words that go from faint to full ink as `--p` (set by a pin progress hook on a parent) rises. */
export function Words({ text, className = "" }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <p className={`lp-words ${className}`} style={{ "--n": words.length } as CSSProperties}>
      {words.map((w, i) => <span key={i} className="w" style={{ "--i": i } as CSSProperties}>{w}{i < words.length - 1 ? " " : ""}</span>)}
    </p>
  );
}

/** Counts up to `to` once the element is on screen. With reduced motion it shows the final value at once. */
export function Count({ to, decimals = 0, prefix = "", suffix = "", ms = 1100 }: { to: number; decimals?: number; prefix?: string; suffix?: string; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(reduced() ? to : 0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (reduced() || typeof IntersectionObserver === "undefined") { setV(to); return; }
    let raf = 0, started = false;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting) || started) return;
      started = true; io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => { const k = clamp((t - t0) / ms); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [to, ms]);
  return <span ref={ref} className="num">{prefix}{v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

/** Index of the step whose element crosses the middle of the viewport. */
export function useActiveStep(refs: RefObject<(HTMLElement | null)[]>, count: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const els = (refs.current ?? []).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setI(els.indexOf(e.target as HTMLElement)); }), { rootMargin: "-45% 0px -45% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [refs, count]);
  return i;
}
