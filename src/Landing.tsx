import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ext } from "./docs/Chrome";
import { KIT, useLive } from "./lp/useLive";
import { Bento } from "./lp/Bento";
import { LpShell, REPO, RPC, shortAddr, useLinks } from "./lp/Shell";
import { Count, Words, smooth, useActiveStep, useCrossProgress, usePinProgress } from "./lp/fx";
import hero2400 from "./assets/hero/hero-2400.webp";
import hero1600 from "./assets/hero/hero-1600.webp";
import heroM960 from "./assets/hero/hero-m-960.webp";
import heroM640 from "./assets/hero/hero-m-640.webp";
import city1920 from "./assets/hero/city-1920.mp4";
import city1280 from "./assets/hero/city-1280.mp4";
import poster1920 from "./assets/hero/city-poster-1920.webp";
import poster960 from "./assets/hero/city-poster-960.webp";
/* PotKit landing (potkit.pro). Structure and scroll feel follow the "open finance" landing pages: a full-bleed video hero that
   shrinks into framed art while the headline splits, a floating pill navigation, a pinned block whose cards and charts change
   as you scroll, large counting numerals, large type, a numbered walkthrough and a closing band. All code, copy and assets are PotKit's.
   Every figure is either read from the chain or documented in the repository; the receipt in "How it works" is labelled illustrative.
   Hero video: Pexels video 15170398 (Pexels licence; evening traffic by Diamond Plaza, Ho Chi Minh City), trimmed to a 5.7 s
   crossfaded loop with no audio or metadata. Closing photo: own work (Dragon Bridge, Da Nang, at dusk). */

/** Muted looping street video. It plays only while on screen; with reduced motion it is a still frame. Phones get the 1280 px file. */
function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [still] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [small] = useState(() => matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const v = ref.current; if (!v || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) void v.play().catch(() => {}); else v.pause(); });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  const poster = small ? poster960 : poster1920;
  if (still) return <img src={poster} width={1920} height={1080} alt="" fetchPriority="high" decoding="async" />;
  return <video ref={ref} src={small ? city1280 : city1920} poster={poster} muted loop playsInline autoPlay preload="auto" aria-hidden />;
}

const MARQUEE = ["Portaldot V3", "ERC-721 receipt", "ERC-20 shares", "Escrow market", "Native tPOT", "On-chain verify", "Chain 420420777", "One hand-written Yul contract", "Open source"];
const STATEMENT = "PotKit turns an unpaid invoice into a receipt and tradeable shares on Portaldot V3. When the debtor pays, every holder is paid pro-rata, on-chain.";

const STEPS: { t: string; d: string; state: string; line: string; fill: number }[] = [
  { t: "Tokenise", d: "Mint the invoice as an ERC-721 receipt, then lock it with a face value and a due date. A fixed supply of ERC-20 shares is issued to you.", state: "Minted", line: "Receipt created and locked in the contract", fill: 12 },
  { t: "List", d: "Offer shares at a discount on the escrow market. You choose how many shares and at what price.", state: "Listed", line: "Shares offered at a discount", fill: 30 },
  { t: "Buy shares", d: "Investors pay native tPOT for any amount of shares, a whole listing or a part of it. The seller is paid at once.", state: "Trading", line: "Shares bought, seller paid at once", fill: 52 },
  { t: "Debtor settles", d: "The debtor pays at least the face value into the contract. Anyone can pay, once.", state: "Settled", line: "Face value paid into the contract", fill: 76 },
  { t: "Holders claim", d: "Each holder burns shares and claims their pro-rata part. Nothing is paid out until the debtor pays.", state: "Claimed", line: "Pro-rata payouts claimed", fill: 100 },
];

const LIMITS: [string, string][] = [
  ["Invoices are not verified", "The issuer enters the invoice details. PotKit does not check that the invoice or the debtor is real."],
  ["Payment is not guaranteed", "Buying shares is a credit risk on the issuer and the debtor. If the debtor does not pay, holders are not paid."],
  ["Testnet only", "Everything runs on the Portaldot V3 testnet with test tokens that have no value."],
  ["Unaudited", "The contract was written and tested by one person. It has not been audited by anyone else and it cannot be changed after deployment."],
];

const day = (ts: number) => (ts ? new Date(ts * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "No due date");
const statusClass = (s: string) => (s === "Settled" ? "ok" : s === "Overdue" ? "late" : "open");
const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function Landing() {
  const heroRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLElement>(null);
  const proofRef = useRef<HTMLElement>(null);
  const artRef = useRef<HTMLElement>(null);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  const [idx, setIdx] = useState(0);
  const live = useLive(pinRef);
  const step = useActiveStep(stepRefs, STEPS.length);
  useCrossProgress(artRef);
  const { launch, tab } = useLinks();


  // hero: the photo shrinks into framed art (--e) and then the statement reads in word by word (--s)
  usePinProgress(heroRef, (p, el) => {
    el.style.setProperty("--e", smooth(p / 0.36).toFixed(4));
    el.style.setProperty("--s", clamp((p - 0.32) / 0.5).toFixed(4));
  });
  // pinned block: three panels over the length of the section (--p, and the active panel)
  usePinProgress(pinRef, (p, el) => {
    el.style.setProperty("--p", p.toFixed(4));
    setIdx(Math.min(2, Math.floor(p * 3 * 0.9999)));
  });

  const PANELS = [
    { id: "receipts", title: "Receipts", blurb: "Each invoice becomes an ERC-721 receipt, locked in the contract with a face value and a due date. A fixed supply of ERC-20 shares is issued against it.", cta: ["Explore receipts", tab("explore")] as [string, string] },
    { id: "market", title: "Market", blurb: "Shares are listed at a discount on an escrow market and bought in native tPOT. Sellers set the price; buyers can take any amount.", cta: ["Open the market", tab("trade")] as [string, string] },
    { id: "settle", title: "Settlement", blurb: "The debtor pays the contract and each holder claims a pro-rata part. Until then nothing is paid, and nothing is guaranteed.", cta: ["Verify a receipt", tab("verify")] as [string, string] },
  ];
  const r = live.receipt;
  const cur = STEPS[step]!;

  return (
    <LpShell>
        {/* hero: full-bleed photo; scrolling shrinks it into nested rounded frames and splits the headline either side */}
        <section className="lp-hero" id="top" ref={heroRef}>
          <div className="lp-stage">
            <div className="lp-frame">
              <div className="lp-pic"><HeroVideo /></div>
              <div className="lp-hero-shade" aria-hidden />
              <div className="lp-fr lp-fr2" aria-hidden><img src={poster1920} alt="" loading="lazy" decoding="async" /></div>
              <div className="lp-fr lp-fr3" aria-hidden><img src={poster1920} alt="" loading="lazy" decoding="async" /></div>
            </div>
            <h1 className="lp-h"><span className="l">Get paid today,</span><span className="r">not in 60 days.</span></h1>
            <div className="lp-hcopy">
              <p className="lp-sub">Invoice financing for small businesses, on-chain.</p>
              <div className="lp-cta">
                <a className="lp-btn solid lg" href={launch}>Launch App</a>
                <a className="lp-btn ghost lg" href={tab("verify", "&id=1")}>See a live receipt</a>
              </div>
              <p className="lp-fine">Testnet demo. Invoice details are provided by the issuer and not verified; payment is not guaranteed.</p>
            </div>
            <div className="lp-stmt" aria-hidden={false}>
              <Words text={STATEMENT} />
              <p className="lp-fine2">Invoice details come from the issuer and are not verified. Payment is not guaranteed.</p>
            </div>
            <a className="lp-scroll" href="#how"><span>Scroll to explore</span><i aria-hidden /></a>
            <div className="lp-marquee" role="group" aria-label="What PotKit is built on">
              <div className="lp-mq-track">
                {[0, 1].map((k) => <ul key={k} aria-hidden={k === 1 || undefined}>{MARQUEE.map((m) => <li key={m}>{m}</li>)}</ul>)}
              </div>
            </div>
          </div>
        </section>
        <section className="lp-stmt-m lp-rv"><div className="lp-wrap"><p>{STATEMENT}</p><p className="lp-fine2">Invoice details come from the issuer and are not verified. Payment is not guaranteed.</p></div></section>

        {/* pinned block: Receipts, Market, Settlement. Cards and charts change with the scroll; all figures are read from the chain. */}
        <section className="lp-pin" id="testnet" ref={pinRef}>
          <div className="lp-pin-in">
            <div className="lp-wrap">
              <div className="lp-pin-head lp-rv">
                <p className="lp-eyebrow">Live on testnet</p>
                <h2>Read from the contract, not from a slide</h2>
              </div>
              <Bento live={live} idx={idx} panels={PANELS} />
              <p className="lp-pin-note"><i className={`lp-dot ${live.updatedAt ? "on" : ""}`} aria-hidden />Your browser reads these figures from the PotKit contract on the Portaldot V3 testnet, with the same functions the app uses, and asks again every 15 seconds while this page is open{live.updatedAt ? `. Last read ${new Date(live.updatedAt).toLocaleTimeString("en-GB")}` : ""}. A dash means the public RPC did not answer; nothing is filled in.</p>
            </div>
          </div>
        </section>

        {/* a real receipt and where to check it */}
        <section className="lp-sec lp-alt" ref={proofRef}>
          <div className="lp-wrap lp-live">
            <article className="lp-receipt lp-rv" aria-label="A receipt read from the chain">
              {r ? <>
                <header><span className="num">Receipt #{r.id}</span><i className={`lp-chip ${statusClass(r.status)}`}>{r.status === "Pending" ? "Open" : r.status}</i></header>
                <h3>{r.note || r.kind}</h3>
                <dl>
                  <div><dt>Kind</dt><dd>{r.kind}</dd></div>
                  <div><dt>Due date</dt><dd className="num">{day(r.due)}</dd></div>
                  <div><dt>Shares issued</dt><dd className="num">{r.shares}</dd></div>
                  <div className="big"><dt>Face value</dt><dd className="num">{r.face}</dd></div>
                </dl>
                <a className="lp-link" href={tab("verify", `&id=${r.id}`)}>Verify this receipt on-chain<span aria-hidden> →</span></a>
              </> : live.phase !== "done" ? <div className="lp-skel-card" aria-busy="true"><i /><i /><i /></div> : <>
                <h3>Verify a receipt</h3>
                <p className="lp-lead">The receipt could not be read just now. Open the verifier and enter a receipt number, no wallet needed.</p>
                <a className="lp-link" href={tab("verify")}>Open the verifier<span aria-hidden> →</span></a>
              </>}
            </article>
            <div className="lp-proof lp-rv">
              <p className="lp-eyebrow">Check it yourself</p>
              <h2>The contract is public</h2>
              <p>Every step of the recorded run, from deploy to redeem, has a transaction hash you can look up.</p>
              <dl>
                <div><dt>Contract</dt><dd className="num"><a href={`${REPO}#testnet-evidence`} {...ext}>{shortAddr(KIT)}</a></dd></div>
                <div><dt>Chain</dt><dd className="num">Portaldot V3 testnet · 420420777</dd></div>
                <div><dt>Deployed</dt><dd className="num">Block 97421 · 2026-10-19</dd></div>
              </dl>
              <a className="lp-link" href={`${REPO}#testnet-evidence`} {...ext}>Read the evidence table<span aria-hidden> →</span></a>
            </div>
          </div>
        </section>

        {/* built small on purpose: large numerals that count up */}
        <section className="lp-sec lp-nums" id="small">
          <div className="lp-wrap lp-nums-in">
            <div className="lp-nums-head lp-rv">
              <p className="lp-eyebrow">Built small on purpose</p>
              <h2>Portaldot charges a deposit for every byte, so PotKit is one small contract</h2>
            </div>
            <ul className="lp-bignums">
              {([
                [<Count key="a" to={1} />, "Contract", "Receipts, shares, market and settlement together."],
                [<Count key="b" to={3.9} decimals={1} suffix=" KB" />, "Hand-written Yul", "The whole product, written without a framework."],
                [<Count key="c" to={327} />, "tPOT to deploy", "Down from 1,386 in the first four-contract design. A testnet estimate, not a mainnet cost."],
                [<Count key="d" to={84} />, "Automated tests", "Run on a local chain with npm test."],
              ] as const).map(([n, l, d], i) => (
                <li key={l} className="lp-rv" style={{ "--d": `${i * 70}ms` } as CSSProperties}><b>{n}</b><div><h3>{l}</h3><p>{d}</p></div></li>
              ))}
            </ul>
          </div>
        </section>

        {/* a statement in large type */}
        <section className="lp-sec lp-belief" aria-labelledby="lp-belief-t">
          <div className="lp-wrap">
            <h2 id="lp-belief-t"><span className="lp-line"><span>We believe in</span></span><span className="lp-line d1"><span>finance you can check.</span></span></h2>
            <p className="lp-lead lp-rv">Open source, one public contract and a verifier that needs no wallet. Every figure on this page is read from the chain or documented in the repository.</p>
          </div>
        </section>

        {/* how it works: the active step follows the scroll and the receipt on the right follows the step */}
        <section className="lp-sec lp-alt" id="how">
          <div className="lp-wrap lp-how">
            <div className="lp-how-text">
              <p className="lp-eyebrow lp-rv">How it works</p>
              <h2 className="lp-rv">From an unpaid invoice to cash, in five steps</h2>
              <ol className="lp-steps">
                {STEPS.map((s, i) => (
                  <li key={s.t} ref={(el) => { stepRefs.current[i] = el; }} className={`lp-rv ${i === step ? "act" : i < step ? "done" : ""}`}><b>{String(i + 1).padStart(2, "0")}</b><div><h3>{s.t}</h3><p>{s.d}</p></div></li>
                ))}
              </ol>
            </div>
            <figure className="lp-how-art" ref={artRef}>
              <figcaption className="lp-doc" aria-label="Illustrative receipt">
                <span className="lp-tag">Illustrative example · not live data</span>
                <dl>
                  <div><dt>Receipt no.</dt><dd className="num">#000</dd></div>
                  <div><dt>Status</dt><dd><i className={`lp-chip ${step >= 3 ? "ok" : "open"}`}>{cur.state}</i></dd></div>
                  <div><dt>Issuer</dt><dd>Small business</dd></div>
                  <div><dt>Due date</dt><dd className="num">In 60 days</dd></div>
                  <div className="big"><dt>Face value</dt><dd className="num">1,000 tPOT</dd></div>
                </dl>
                <div className="lp-prog" aria-hidden><i style={{ width: `${cur.fill}%` }} /></div>
                <p className="lp-doc-line">{cur.line}</p>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* honest limits */}
        <section className="lp-sec" id="limits">
          <div className="lp-wrap">
            <div className="lp-head-sec lp-rv">
              <p className="lp-eyebrow">Honest limits</p>
              <h2>What PotKit does not do</h2>
            </div>
            <ul className="lp-limits">
              {LIMITS.map(([t, d], i) => <li className="lp-rv" key={t} style={{ "--d": `${i * 70}ms` } as CSSProperties}><h3>{t}</h3><p>{d}</p></li>)}
            </ul>
          </div>
        </section>

        {/* closing band */}
        <section className="lp-final" id="start">
          <picture className="lp-pic">
            <source media="(max-width: 700px)" srcSet={`${heroM640} 640w, ${heroM960} 960w`} sizes="100vw" />
            <img src={hero1600} srcSet={`${hero1600} 1600w, ${hero2400} 2400w`} sizes="100vw" width={1600} height={900} loading="lazy" decoding="async" alt="" />
          </picture>
          <div className="lp-hero-shade final" aria-hidden />
          <div className="lp-wrap lp-final-in lp-rv">
            <h2>See an invoice become a receipt you can verify</h2>
            <p>No wallet is needed to look around. Connect one only to issue, buy or claim.</p>
            <a className="lp-btn solid lg" href={launch}>Launch App</a>
          </div>
        </section>
          </LpShell>
  );
}
