import { useEffect, useRef, useState } from "react";
import "./landing.css";
import "./landing-polish.css";
import { Footer, Header, L, Reveal, app, ext, page, useLenis, Arrow } from "./docs/Chrome";
import { DotSphere } from "./Orb";
import { Ico, MarketArt, ReceiptArt, VaultArt } from "./docs/Art";

/** HUD ring around the share field: slow counter-rotating ticks + three labelled readouts. */
const Hud = () => (
  <svg className="lx-hud" viewBox="0 0 600 600" aria-hidden>
    <g className="lx-hud-r1">{Array.from({ length: 72 }, (_, i) => <path key={i} d={`M300 ${i % 6 ? 22 : 14}V30`} transform={`rotate(${i * 5} 300 300)`} />)}</g>
    <g className="lx-hud-r2"><circle cx="300" cy="300" r="250" /><path d="M300 42a258 258 0 0 1 180 74" className="arc" /><path d="M120 484a258 258 0 0 1-60-80" className="arc m" /></g>
    <path d="M40 70V40h30M560 70V40h-30M40 530v30h30M560 530v30h-30" className="lx-hud-k" />
  </svg>
);
const READOUTS = [["Receipt", "locked in vault"], ["Shares", "fixed supply"], ["Payout", "pro-rata"]];

/** Full-page spatial dust field: fades in on entry and subtly bends around the pointer. */
function SpatialField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;
    const ctx = context;
    const count = Math.min(460, Math.max(280, Math.round(innerWidth * innerHeight / 2600)));
    let width = 0, height = 0, dpr = 1, raf = 0, start = performance.now(), scroll = scrollY;
    let px = innerWidth / 2, py = innerHeight / 2, sx = px, sy = py, pointerOn = false;
    const points = Array.from({ length: count }, (_, i) => {
      const angle = i * 2.399963 + Math.random() * .3;
      const radius = Math.sqrt((i + .5) / count) * .72 + Math.random() * .12;
      return { x: .5 + Math.cos(angle) * radius * .62, y: .48 + Math.sin(angle) * radius * .76, phase: Math.random() * 6.28, size: .65 + Math.random() * 1.35, drift: .25 + Math.random() * .8 };
    });
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 1.25); width = innerWidth; height = innerHeight;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const move = (event: PointerEvent) => { if (event.pointerType !== "touch") { px = event.clientX; py = event.clientY; pointerOn = true; } };
    const leave = () => { pointerOn = false; };
    const onScroll = () => { scroll = scrollY; };
    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      const entry = Math.min(1, (now - start) / 1700);
      const time = now * .00032;
      const cx = width * .5, cy = height * .49 - scroll * .035;
      const influence = pointerOn ? 1 : 0;
      sx += (px - sx) * .08; sy += (py - sy) * .08;
      const smoothPX = sx, smoothPY = sy;
      ctx.globalAlpha = entry * .76;
      if (influence) {
        const glow = ctx.createRadialGradient(smoothPX, smoothPY, 0, smoothPX, smoothPY, 210);
        glow.addColorStop(0, "rgba(111,129,255,.11)"); glow.addColorStop(1, "rgba(111,129,255,0)");
        ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
      }
      for (const p of points) {
        const wave = Math.sin(time * p.drift + p.phase);
        let x = p.x * width + Math.cos(time * .55 + p.phase) * 28 * p.drift;
        let y = p.y * height + Math.sin(time * .7 + p.phase) * 32 * p.drift - scroll * .035;
        const dx = x - smoothPX, dy = y - smoothPY, dist = Math.hypot(dx, dy);
        if (influence && dist < 230) {
          const force = (1 - dist / 230) * 38;
          x += (dx / (dist || 1) + -dy / (dist || 1) * .32) * force;
          y += (dy / (dist || 1) + dx / (dist || 1) * .32) * force;
        }
        const centerDist = Math.hypot((x - cx) / (width * .52), (y - cy) / (height * .6));
        const alpha = Math.max(.05, (1 - centerDist * .72) * (.44 + (wave + 1) * .2));
        ctx.fillStyle = `rgba(${Math.round(164 + (p.phase % 1) * 70)},${Math.round(187 + (p.phase % 1) * 38)},255,${alpha})`;
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    resize();
    addEventListener("resize", resize); addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave); addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); removeEventListener("pointermove", move); document.documentElement.removeEventListener("pointerleave", leave); removeEventListener("scroll", onScroll); };
  }, []);
  return <canvas ref={canvasRef} className="lx-spatial-field" aria-hidden="true" />;
}

function useScrollField() {
  useEffect(() => {
    const orb = document.querySelector<HTMLElement>(".lx-orb");
    const dust = document.querySelector<HTMLElement>(".lx-bg");
    const marker = document.querySelector<HTMLElement>(".lx-story-marker");
    if (!orb || !dust) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".lx-hero, .lx-sec"));
    const markerIndex = marker?.querySelector<HTMLElement>("[data-index]");
    const markerName = marker?.querySelector<HTMLElement>("[data-name]");
    const markerLine = marker?.querySelector<HTMLElement>("i");
    let raf = 0;
    const update = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const progress = Math.max(0, Math.min(1, scrollY / Math.max(innerHeight * .9, 1)));
        orb.style.setProperty("--scroll-y", `${-progress * 92}px`);
        orb.style.setProperty("--scroll-scale", `${1 - progress * .2}`);
        dust.style.setProperty("--scroll-bg-y", `${progress * 38}px`);
        const active = sections.reduce((found, section, index) => section.getBoundingClientRect().top < innerHeight * .48 ? index : found, 0);
        if (markerIndex) markerIndex.textContent = `${String(active + 1).padStart(2, "0")} / ${String(sections.length).padStart(2, "0")}`;
        if (markerName) markerName.textContent = sections[active]?.id?.replaceAll("-", " ").toUpperCase() || "OVERVIEW";
        if (markerLine) markerLine.style.transform = `scaleX(${(active + 1) / sections.length})`;
      });
    };
    addEventListener("scroll", update, { passive: true }); addEventListener("resize", update); update();
    return () => { cancelAnimationFrame(raf); removeEventListener("scroll", update); removeEventListener("resize", update); };
  }, []);
}

const ROLES = [
  { id: "issuers", k: "Issuers", t: "Unlock liquidity from work already delivered", d: "Create an issuer-provided on-chain receipt, lock it and offer fixed-supply shares at a discount. If investors buy, you receive tPOT now; the receipt is not independently authenticated.", cta: ["Issue an invoice", "?tab=issue"], art: "doc" },
  { id: "investors", k: "Investors", t: "Buy discounted claims on receivables", d: "Every listing shows its discount to face value and due date. Shares are escrowed by the market, prices are in tPOT, and payouts are pro-rata on settlement.", cta: ["Browse listings", "?tab=trade"], art: "flow" },
  { id: "debtors", k: "Debtors & judges", t: "Settle once. Check the on-chain record", d: "A debtor can pay once in tPOT and holders can claim pro-rata. Share a read-only proof of custody, terms and settlement state; it does not attest to off-chain invoice authenticity.", cta: ["Verify a receipt", "?tab=verify"], art: "seal" },
] as const;

const Panel = ({ art }: { art: string }) => (
  <div className="lx-panel" aria-hidden>
    <svg viewBox="0 0 400 300">
      <defs><pattern id={`g-${art}`} width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0v20" fill="none" className="lx-pg" /></pattern></defs>
      <rect width="400" height="300" fill={`url(#g-${art})`} />
      {art === "doc" && <g className="lx-float"><rect x="150" y="50" width="100" height="140" className="lx-st" /><rect x="140" y="62" width="100" height="140" className="lx-st dim" /><path d="M165 80h70M165 98h70M165 116h44" className="lx-st" /><path d="M150 190l8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8" className="lx-st" /></g>}
      {art === "flow" && <g><path d="M30 230 C120 230 140 90 230 90 S330 150 370 110" className="lx-st" />{Array.from({ length: 7 }, (_, i) => <circle key={i} r="3" className="lx-dot" style={{ animationDelay: `${-i * 0.9}s` }} />)}</g>}
      {art === "seal" && <g className="lx-float"><circle cx="200" cy="140" r="70" className="lx-st" /><circle cx="200" cy="140" r="54" className="lx-st dim" /><path d="M172 140l20 20 36-40" className="lx-st thick" /></g>}
    </svg>
  </div>
);

const CONTRACTS = [
  { n: "Receipt", d: "ERC-721 invoice record with issuer, kind and note, read straight from chain state.", tag: "ERC-721", Art: ReceiptArt },
  { n: "Vault", d: "Locks the receipt, fixes its terms, mints the shares, takes payment in tPOT and pays holders pro-rata.", tag: "Custody", Art: VaultArt },
  { n: "Market", d: "Fixed-price listings with escrowed shares, partial buys and exact native-tPOT pricing.", tag: "Liquidity", Art: MarketArt },
];
const SNIPPETS: Record<string, string[]> = {
  "settle (PotKit.yul)": [
    "/// anyone pays msg.value >= faceValue tPOT into the pool",
    "function settle(id) {",
    "    let ts := k(id, 7)",
    "    let t := sload(ts)",
    '    need(unitsOf(t), "not locked")',
    '    need(iszero(settled(t)), "settled")',
    '    need(iszero(lt(callvalue(), shr(160, sload(k(id, 8))))), "underpaid")',
    "    sstore(ts, or(t, shl(240, 1)))   // effects only: no external call",
    "    sstore(k(id, 9), callvalue())",
    "}",
  ],
  "buy (PotKit.yul)": [
    "/// msg.value must equal ceil(price * amount / 1e18)",
    "function buy(lid, amount) {",
    '    need(iszero(eq(caller(), seller)), "own listing")',
    '    need(iszero(settled(t)), "settled")',
    "    let c := cost(shr(160, a), amount)",
    '    need(eq(callvalue(), c), "value")',
    "    sstore(add(w, 1), sub(b, shl(128, amount)))   // effects first",
    "    moveShares(id, low(t), address(), caller(), amount)",
    "    pay(seller, c)                                // then the tPOT",
    "}",
  ],
};
const SAFETY = [
  ["escrow", "Escrowed by design", "Listed shares sit in escrow inside PotKit and the NFT stays locked while shares exist."],
  ["guard", "Checks before calls", "Checks-effects-interactions on every value-moving function: tPOT is sent last."],
  ["tests", "Automated tests", "ERC-721/ERC-20 behaviour, pro-rata rounding, status lifecycle, market rules and network switching, on a local chain."],
] as const;

export function Landing() {
  const [tab, setTab] = useState<keyof typeof SNIPPETS>("settle (PotKit.yul)");
  const scrolled = useLenis();
  useScrollField();
  const judgeParams = new URLSearchParams(location.search);
  const hasJudge = ["kit", "vault", "receipt"].some((key) => judgeParams.has(key));
  const launch = app(hasJudge ? location.search : "");

  return (
    <div className="lx">
      <div className="lx-bg" aria-hidden />
      <SpatialField />
      <Header scrolled={scrolled} />
      <main>
        <section className="lx-hero" id="top">
          <div className="lx-hero-frame">
            <div className="lx-hero-copy">
              <Reveal><span className="lx-tag">RWA · Portaldot V3 testnet</span></Reveal>
              <Reveal delay={80}><h1>Invoices that<br />pay you now</h1></Reveal>
              <Reveal delay={160}><p>Turn an unpaid invoice into vault-backed, tradeable shares. Holders can claim on-chain only when the debtor pays.</p></Reveal>
            </div>
            <div className="lx-orb"><DotSphere className="lx-sphere" speed={0.42} interactive /><Hud />
              {READOUTS.map(([k, v], i) => <span key={k} className={`lx-ro r${i}`}><i />{k}<b>{v}</b></span>)}
            </div>
            <Reveal delay={240} className="lx-hero-entry"><div className="lx-cta-row"><a className="lx-btn primary" href={launch}>Launch App <Arrow /></a><a className="lx-btn" href={page("/how-it-works")}>How it works</a></div></Reveal>
            <Reveal delay={300} className="lx-hero-stats">
              <div><small>Network</small><b>Portaldot V3</b></div>
              <div><small>Chain ID</small><b className="mono">420420777</b></div>
              <div><small>Contracts</small><b>1 contract · Yul</b></div>
            </Reveal>
          </div>
        </section>

        <div className="lx-strip" aria-hidden>
          <div className="lx-strip-in">{[0, 1].map((k) => <span key={k}>ERC-721 receipts · Vault custody · ERC-20 shares · Escrowed market · Pro-rata payout · On-chain status · Shareable proofs · </span>)}</div>
        </div>

        <section id="how" className="lx-sec">
          <Reveal className="lx-sec-head"><span className="lx-tag">How it works</span><h2>One invoice, four contract moves</h2></Reveal>
          <ol className="lx-steps">
            {[["mint", "Mint", "The invoice becomes an ERC-721 receipt."], ["lock", "Lock", "The Vault holds it and issues fixed shares."], ["trade", "Trade", "Sell shares at a discount for cash today."], ["settle", "Settle", "Debtor pays once; holders claim pro-rata."]].map(([ic, t, d], i) => (
              <Reveal as="article" key={t} delay={i * 90} className="lx-step"><div className="lx-step-h"><span className="mono">0{i + 1}</span><Ico n={ic} /></div><h3>{t}</h3><p>{d}</p></Reveal>
            ))}
          </ol>
          <Reveal className="lx-more"><a className="lx-link" href={page("/how-it-works")}>Learn the full lifecycle <Arrow /></a></Reveal>
        </section>

        {ROLES.map((r, i) => (
          <section key={r.k} id={r.id} className={`lx-sec lx-role ${i % 2 ? "flip" : ""}`}>
            <Reveal className="lx-role-art"><Panel art={r.art} /></Reveal>
            <Reveal delay={120} className="lx-role-copy">
              <span className="lx-tag">{r.k}</span>
              <h2>{r.t}</h2>
              <p>{r.d}</p>
              <a className="lx-link" href={app(r.cta[1])}>{r.cta[0]} <Arrow /></a>
            </Reveal>
          </section>
        ))}

        <section id="protocol" className="lx-sec lx-center">
          <Reveal className="lx-sec-head"><span className="lx-tag">Protocol</span><h2>One contract powering PotKit</h2></Reveal>
          <div className="lx-cards">
            {CONTRACTS.map((c, i) => (
              <Reveal as="article" key={c.n} delay={i * 100} className="lx-card">
                <div className="lx-card-art"><c.Art /></div>
                <span className="lx-tag">{c.tag}</span><h3>{c.n}</h3><p>{c.d}</p>
              </Reveal>
            ))}
          </div>
          <p className="lx-note">All three roles live in <b>one ~3.9 KB contract</b> (hand-written Yul, so deploying costs a fraction of the old four-contract setup). Every lock gets its own ERC-20 share token: an 82-byte forwarder. Payments are native <b>tPOT</b>.</p>
          <Reveal className="lx-more"><a className="lx-link" href={page("/protocol")}>Read the protocol reference <Arrow /></a></Reveal>
        </section>

        <section id="mechanism" className="lx-sec lx-center">
          <Reveal className="lx-sec-head"><h2>Open by default, minimal by design</h2><p>Every rule is a few readable lines of Yul, enforced on-chain.</p></Reveal>
          <Reveal className="lx-code">
            <div className="lx-code-tabs" role="tablist">{Object.keys(SNIPPETS).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k as keyof typeof SNIPPETS)}>{k}</button>)}</div>
            <pre><code>{SNIPPETS[tab].map((l, i) => <span key={i}><i>{i + 1}</i>{l}{"\n"}</span>)}</code></pre>
          </Reveal>
        </section>

        <section id="security" className="lx-sec">
          <Reveal className="lx-sec-head"><span className="lx-tag">Security</span><h2>Simple rules, enforced on-chain</h2></Reveal>
          <div className="lx-safety">
            {SAFETY.map(([ic, t, d], i) => <Reveal as="article" key={t} delay={i * 90}><Ico n={ic} /><h3>{t}</h3><p>{d}</p></Reveal>)}
          </div>
          <Reveal className="lx-more"><a className="lx-link" href={page("/security")}>See the security model and its limits <Arrow /></a></Reveal>
        </section>

        <section id="hackathon" className="lx-sec lx-final">
          <Reveal className="lx-final-in">
            <div><h2>Built for Portaldot Hacker House 2026</h2><p>Track 4 · Ecosystem DApps (RWA). Testnet demo settled in native tPOT, no real value.</p></div>
            <div className="lx-cta-row"><a className="lx-btn primary" href={launch}>Launch App</a><a className="lx-btn" href={L.hackathon} {...ext}>View on DoraHacks</a></div>
          </Reveal>
        </section>
      </main>
      <div className="lx-story-marker" aria-hidden="true"><span data-index>01 / 09</span><i /><b data-name>OVERVIEW</b><small>SCROLL ↓</small></div>
      <Footer />
    </div>
  );
}
