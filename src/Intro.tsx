import { useEffect, useRef, useState } from "react";
import "./intro.css";

export const INTRO_KEY = "potkit.intro.v2";
const KEY = INTRO_KEY, TICKS = 48, MS = 3000;
let forcedIntro: boolean | null = null;
function consumeIntroParam() {
  if (forcedIntro !== null) return forcedIntro;
  try {
    const url = new URL(location.href);
    const introParam = url.searchParams.get("intro") === "1";
    if (introParam) {
      url.searchParams.delete("intro");
      history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    forcedIntro = introParam || (
      document.referrer !== "" &&
      new URL(document.referrer).hostname === location.hostname.replace(/^app\./, "") &&
      (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "navigate"
    );
    return forcedIntro;
  } catch { return forcedIntro = false; }
}
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
/** Dotted "land" globe: Fibonacci sphere, continents faked with a smooth trig field so no map asset is needed. */
const DOTS = (() => {
  const out: [number, number, number, number][] = [], N = 5200;
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, lat = Math.asin(y), lon = i * 2.39996323;
    const v = Math.sin(lon * 1.3 + 1) * Math.cos(lat * 2.1) + 0.7 * Math.sin(lat * 4 + lon * 0.8) + 0.45 * Math.cos(lon * 3 - lat * 2);
    if (v > 0.35 || rnd() < 0.05) out.push([Math.cos(lat) * Math.cos(lon), y, Math.cos(lat) * Math.sin(lon), rnd()]);
  }
  return out;
})();

export function Intro() {
  const [phase, setPhase] = useState<"run" | "out" | "done">(() => {
    try {
      const forced = consumeIntroParam();
      if (!forced && (sessionStorage.getItem(KEY) || matchMedia("(prefers-reduced-motion: reduce)").matches)) return "done";
      sessionStorage.setItem(KEY, "1");
      return "run";
    } catch { return "run"; }
  });
  const [pct, setPct] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setPhase("out"); setTimeout(() => setPhase("done"), 900);
  };

  useEffect(() => {
    if (phase !== "run") return;
    const c = cv.current!, g = c.getContext("2d")!, dpr = Math.min(devicePixelRatio || 1, 2);
    let S = 0, raf = 0; const t0 = performance.now();
    const fit = () => { S = Math.min(innerWidth * 0.8, innerHeight * 0.5, 460); c.width = c.height = S * dpr; c.style.width = c.style.height = S + "px"; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit(); addEventListener("resize", fit);
    const frame = (now: number) => {
      const t = Math.min((now - t0) / MS, 1), e = t < 1 ? 1 - Math.pow(1 - t, 2.2) : 1, a = now / 2600, R = S * 0.46, cx = S / 2;
      g.clearRect(0, 0, S, S);
      g.strokeStyle = `rgba(255,255,255,${0.16 + Math.sin(now / 700) * .035})`; g.lineWidth = 0.7;
      for (let m = 0; m < 6; m++) { g.beginPath(); g.ellipse(cx, cx, R * Math.abs(Math.cos(a + (m * Math.PI) / 6)), R, 0, 0, 7); g.stroke(); }
      for (const l of [-0.5, 0, 0.5]) { g.beginPath(); g.ellipse(cx, cx - l * R, R * Math.sqrt(1 - l * l), R * 0.12 * Math.sqrt(1 - l * l), 0, 0, 7); g.stroke(); }
      const ca = Math.cos(a), sa = Math.sin(a), show = e * DOTS.length;
      for (let i = 0; i < show; i++) {
        const [x, y, z, r] = DOTS[i], X = x * ca + z * sa, Z = -x * sa + z * ca, f = (Z + 1) / 2;
        g.fillStyle = `rgba(255,255,255,${0.16 + f * 0.65 + r * 0.08})`;
        g.fillRect(cx + X * R, cx - y * R, 0.8 + f * 1.1 + r * 0.4, 0.8 + f * 1.1 + r * 0.4);
      }
      setPct(Math.round(e * 100));
      if (t < 1) raf = requestAnimationFrame(frame); else setTimeout(finish, 450);
    };
    raf = requestAnimationFrame(frame);
    addEventListener("keydown", finish);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", fit); removeEventListener("keydown", finish); };
  }, [phase === "run"]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "done") return null;
  const lit = Math.round((pct / 100) * TICKS);
  return (
    <div className={`pk-intro ${phase}`} role="presentation" onClick={finish}>
      <div className="pk-stage">
        {[1.32, 1.62, 2.05, 2.7].map((k, i) => <i key={i} className="pk-orbit" style={{ width: `calc(var(--pk-g) * ${k})`, animationDelay: `${i * 0.15}s` }} />)}
        <canvas ref={cv} aria-hidden />
        <img className="pk-logo" src="/potkit-p-circle-black.svg" alt="" width={44} height={44} />
      </div>
      <div className="pk-load">
        <span>{pct === 100 ? "Workspace ready" : "Preparing your PotKit workspace"}</span>
        <b>{pct}<small> %</small></b>
        <div className="pk-ticks" aria-hidden>{Array.from({ length: TICKS }, (_, i) => <i key={i} className={i < lit ? "on" : ""} />)}</div>
      </div>
      <span className="pk-skip">Click anywhere to skip</span>
    </div>
  );
}
