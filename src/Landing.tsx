import { useEffect, useRef, useState } from "react";
import { L, app, ext, page } from "./docs/Chrome";
import { KIT, SNAPSHOT, useLive } from "./lp/useLive";
import "./styles/brand.css";
import "./lp/lp.css";
import hero2400 from "./assets/hero/hero-2400.webp";
import hero1600 from "./assets/hero/hero-1600.webp";
import heroM960 from "./assets/hero/hero-m-960.webp";
import heroM640 from "./assets/hero/hero-m-640.webp";

/* PotKit landing (potkit.pro). Structure: announcement bar, nav, full-viewport photo hero with a marquee of real facts,
   how it works, live testnet figures, honest limits, closing call to action, footer. Everything on the page is either a
   fact stated in the repository or a figure read from the chain; the receipt in "How it works" is labelled illustrative.
   Hero photo: own work (Dragon Bridge, Da Nang, at dusk). */

const REPO = "https://github.com/itsjusttu/potkit-portaldot";
const RPC = "https://test-evm-rpc-v3.portaldot.dev";

const MARQUEE = ["Portaldot V3", "ERC-721 receipt", "ERC-20 shares", "Escrow market", "Native tPOT", "On-chain verify", "Chain 420420777", "One hand-written Yul contract", "Open source"];

const STEPS: [string, string][] = [
  ["Tokenise", "Mint the invoice as an ERC-721 receipt, then lock it with a face value and a due date. A fixed supply of ERC-20 shares is issued to you."],
  ["List", "Offer shares at a discount on the escrow market. You choose how many shares and at what price."],
  ["Buy shares", "Investors pay native tPOT for any amount of shares, a whole listing or a part of it. The seller is paid at once."],
  ["Debtor settles", "The debtor pays at least the face value into the contract. Anyone can pay, once."],
  ["Holders claim", "Each holder burns shares and claims their pro-rata part. Nothing is paid out until the debtor pays."],
];

const LIMITS: [string, string][] = [
  ["Invoices are not verified", "The issuer enters the invoice details. PotKit does not check that the invoice or the debtor is real."],
  ["Payment is not guaranteed", "Buying shares is a credit risk on the issuer and the debtor. If the debtor does not pay, holders are not paid."],
  ["Testnet only", "Everything runs on the Portaldot V3 testnet with test tokens that have no value."],
  ["Unaudited", "The contract was written and tested by one person. It has not been audited by anyone else and it cannot be changed after deployment."],
];

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const day = (ts: number) => (ts ? new Date(ts * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "No due date");
const statusClass = (s: string) => (s === "Settled" ? "ok" : s === "Overdue" ? "late" : "open");

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const live = useLive(statsRef);

  const judge = new URLSearchParams(location.search);
  const hasJudge = ["kit", "vault", "receipt"].some((k) => judge.has(k));
  const launch = app(hasJudge ? location.search : "");
  const tab = (t: string, extra = "") => app(`?${hasJudge ? `${location.search.slice(1)}&` : `kit=${KIT}&`}tab=${t}${extra}`);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on(); addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);

  // scroll reveal: fade and 12px rise, once. Without JavaScript or with reduced motion everything stays visible.
  useEffect(() => {
    const el = root.current; if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>(".lp-rv")];
    if (typeof IntersectionObserver === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) { items.forEach((i) => i.classList.add("in")); return; }
    el.classList.add("lp-js");
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, []);

  const closeMenu = () => setMenu(false);
  const NAV: [string, string][] = [["Product", "#testnet"], ["How it works", "#how"], ["Verify", tab("verify")], ["Docs", page("/help")], ["GitHub", REPO]];
  const r = live.receipt;

  return (
    <div className={`lp ${scrolled ? "scrolled" : ""} ${menu ? "menu-open" : ""}`} ref={root}>
      <a className="lp-skip" href="#lp-main">Skip to content</a>

      <div className="lp-top">
        <div className="lp-bar"><div className="lp-wrap">
          <span>Live on Portaldot V3 testnet · Open-source · Unaudited</span>
          <a href={REPO} {...ext}>View the repository<span aria-hidden> →</span></a>
        </div></div>
        <header className="lp-head"><div className="lp-wrap lp-head-in">
          <a className="lp-logo" href="/" aria-label="PotKit home"><svg viewBox="0 0 32 32" width="26" height="26" aria-hidden><rect width="32" height="32" rx="7" fill="currentColor" opacity=".16" /><path d="M11 24V8h6.4a5.1 5.1 0 0 1 0 10.2H11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg><span>PotKit</span></a>
          <nav id="lp-nav" className="lp-nav" aria-label="Main">
            {NAV.map(([label, href]) => <a key={label} href={href} onClick={closeMenu} {...(href.startsWith("http") ? ext : {})}>{label}</a>)}
            <a className="lp-btn solid lp-nav-cta" href={launch}>Launch App</a>
          </nav>
          <a className="lp-btn solid lp-head-cta" href={launch}>Launch App</a>
          <button type="button" className="lp-burger" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} aria-controls="lp-nav" onClick={() => setMenu(!menu)}><i /><i /></button>
        </div></header>
      </div>

      <main id="lp-main">
        {/* hero: the photo fills the first screen, a navy tint at the top and a dark fade at the bottom keep text and marquee readable */}
        <section className="lp-hero" id="top">
          <picture className="lp-hero-pic">
            <source media="(max-width: 700px)" srcSet={`${heroM640} 640w, ${heroM960} 960w`} sizes="100vw" />
            <img src={hero2400} srcSet={`${hero1600} 1600w, ${hero2400} 2400w`} sizes="100vw" width={2400} height={1350} alt="The Dragon Bridge over the Han River in Da Nang at dusk, the city lights reflected on the water" fetchPriority="high" decoding="async" />
          </picture>
          <div className="lp-hero-shade" aria-hidden />
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <h1>Get paid today, not in 60 days.</h1>
              <p className="lp-sub">Invoice financing for small businesses, on-chain.</p>
              <div className="lp-cta">
                <a className="lp-btn solid lg" href={launch}>Launch App</a>
                <a className="lp-btn ghost lg" href={tab("verify", "&id=1")}>See a live receipt</a>
              </div>
              <p className="lp-fine">Testnet demo. Invoice details are provided by the issuer and not verified; payment is not guaranteed.</p>
            </div>
            <a className="lp-scroll" href="#how"><span>Scroll to explore</span><i aria-hidden /></a>
          </div>
          <div className="lp-marquee" role="group" aria-label="What PotKit is built on">
            <div className="lp-mq-track">
              {[0, 1].map((k) => (
                <ul key={k} aria-hidden={k === 1 || undefined}>{MARQUEE.map((m) => <li key={m}>{m}</li>)}</ul>
              ))}
            </div>
          </div>
        </section>

        {/* how it works */}
        <section className="lp-sec" id="how">
          <div className="lp-wrap lp-how">
            <div className="lp-how-text lp-rv">
              <p className="lp-eyebrow">How it works</p>
              <h2>From an unpaid invoice to cash, in five steps</h2>
              <ol className="lp-steps">
                {STEPS.map(([t, d], i) => <li key={t}><b>{String(i + 1).padStart(2, "0")}</b><div><h3>{t}</h3><p>{d}</p></div></li>)}
              </ol>
            </div>
            <figure className="lp-how-art lp-rv">
              <img src={hero1600} width={1600} height={900} loading="lazy" decoding="async" alt="" />
              <figcaption className="lp-doc" aria-label="Illustrative receipt">
                <span className="lp-tag">Illustrative example · not live data</span>
                <dl>
                  <div><dt>Receipt no.</dt><dd className="num">#000</dd></div>
                  <div><dt>Issuer</dt><dd>Small business</dd></div>
                  <div><dt>Debtor</dt><dd>Client</dd></div>
                  <div><dt>Due date</dt><dd className="num">In 60 days</dd></div>
                  <div className="big"><dt>Face value</dt><dd className="num">1,000 tPOT</dd></div>
                </dl>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* live on testnet */}
        <section className="lp-sec lp-alt" id="testnet" ref={statsRef}>
          <div className="lp-wrap">
            <div className="lp-head-sec lp-rv">
              <p className="lp-eyebrow">Live on testnet</p>
              <h2>Real figures, read from the contract</h2>
              <p className="lp-lead">Your browser reads these from the PotKit contract on the Portaldot V3 testnet. A dash means the public RPC did not answer; nothing is filled in.</p>
            </div>
            <div className="lp-stats lp-rv" aria-live="polite">
              <div className="lp-stat"><span>Receipts minted</span>{live.receipts !== null ? <b className="num">{live.receipts}</b> : <b className={live.phase === "loading" ? "lp-skel" : "num dim"}>{live.phase === "loading" ? " " : "—"}</b>}<small>On the kit contract</small></div>
              <div className="lp-stat"><span>tPOT traded</span>{live.traded !== null ? <b className="num">{live.traded}</b> : <b className={live.phase === "loading" ? "lp-skel" : "num dim"}>{live.phase === "loading" ? " " : "—"}</b>}<small>Sum of share purchases in the scanned events</small></div>
              <div className="lp-stat"><span>State-changing transactions</span><b className="num">{live.txs ?? SNAPSHOT.txs}</b><small>{live.txsLive ? "Counted from the event logs just now. All from two wallets, both the builder's" : `Snapshot, counted ${SNAPSHOT.date}. All from two wallets, both the builder's`}</small></div>
            </div>
            <div className="lp-live lp-rv">
              <article className="lp-receipt" aria-label="A receipt read from the chain">
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
                </> : live.phase === "loading" ? <div className="lp-skel-card" aria-busy="true"><i /><i /><i /></div> : <>
                  <h3>Verify a receipt</h3>
                  <p className="lp-lead">The receipt could not be read just now. Open the verifier and enter a receipt number, no wallet needed.</p>
                  <a className="lp-link" href={tab("verify")}>Open the verifier<span aria-hidden> →</span></a>
                </>}
              </article>
              <div className="lp-proof">
                <h3>Check it yourself</h3>
                <p>The contract is public. Every step of the recorded run, from deploy to redeem, has a transaction hash you can look up.</p>
                <dl>
                  <div><dt>Contract</dt><dd className="num"><a href={`https://github.com/itsjusttu/potkit-portaldot#testnet-evidence`} {...ext}>{shortAddr(KIT)}</a></dd></div>
                  <div><dt>Chain</dt><dd className="num">Portaldot V3 testnet · 420420777</dd></div>
                  <div><dt>Deployed</dt><dd className="num">Block 97421 · 2026-10-19</dd></div>
                </dl>
                <a className="lp-link" href={`${REPO}#testnet-evidence`} {...ext}>Read the evidence table<span aria-hidden> →</span></a>
              </div>
            </div>
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
              {LIMITS.map(([t, d]) => <li className="lp-rv" key={t}><h3>{t}</h3><p>{d}</p></li>)}
            </ul>
          </div>
        </section>

        {/* closing band */}
        <section className="lp-final" id="start">
          <picture className="lp-hero-pic">
            <source media="(max-width: 700px)" srcSet={`${heroM640} 640w`} sizes="100vw" />
            <img src={hero1600} width={1600} height={900} loading="lazy" decoding="async" alt="" />
          </picture>
          <div className="lp-hero-shade final" aria-hidden />
          <div className="lp-wrap lp-final-in lp-rv">
            <h2>See an invoice become a receipt you can verify</h2>
            <p>No wallet is needed to look around. Connect one only to issue, buy or claim.</p>
            <a className="lp-btn solid lg" href={launch}>Launch App</a>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-cols">
            <div className="lp-foot-brand"><a className="lp-logo" href="/" aria-label="PotKit home"><svg viewBox="0 0 32 32" width="24" height="24" aria-hidden><rect width="32" height="32" rx="7" fill="currentColor" opacity=".16" /><path d="M11 24V8h6.4a5.1 5.1 0 0 1 0 10.2H11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg><span>PotKit</span></a><p>Invoice financing on Portaldot V3. Testnet demo built by one person.</p></div>
            <nav aria-label="Product"><h4>Product</h4><a href={launch}>Launch App</a><a href={tab("verify")}>Verify a receipt</a><a href={tab("trade")}>Trade</a></nav>
            <nav aria-label="Learn"><h4>Docs</h4><a href={page("/how-it-works")}>How it works</a><a href={page("/protocol")}>Protocol</a><a href={page("/security")}>Security</a><a href={page("/help")}>Help</a></nav>
            <nav aria-label="Project"><h4>Project</h4><a href={REPO} {...ext}>GitHub</a><a href={L.hackathon} {...ext}>DoraHacks page</a><a href={L.discord} {...ext}>Portaldot Discord</a></nav>
          </div>
          <div className="lp-foot-base">
            <span>Chain 420420777 · RPC {RPC.replace("https://", "")} · Contract <span className="num">{shortAddr(KIT)}</span></span>
            <span>Hero photo: Dragon Bridge, Da Nang, own work. © 2026 PotKit, MIT licence.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
