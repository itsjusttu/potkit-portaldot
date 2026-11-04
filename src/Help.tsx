import { useEffect, useRef, useState, type CSSProperties } from "react";
import { L, ext, IcoTelegram } from "./docs/Chrome";
import { HELP_FAQ, HELP_LINKS } from "./docs/helpData";
import { LpShell, REPO, RPC, shortAddr } from "./lp/Shell";
import { KIT } from "./lp/useLive";

/* Help page (potkit.pro/help) in the same system as the landing page: search, three steps to get started, guides, FAQ,
   network details and how to reach the builder. The guides and the FAQ text are the ones the app has always had
   (src/docs/helpData.ts); the steps and the network details restate facts from the README. */

const STEPS: [string, string, [string, string]?][] = [
  ["Install an EVM wallet", "MetaMask, Rabby, OKX and other EVM wallets work. Explore and Verify need no wallet at all."],
  ["Switch to Portaldot V3", "The app offers a one-click switch to the V3 testnet (chain 420420777, gas token tPOTv3)."],
  ["Get test tokens", "Test tokens come from the Portaldot team; the PotKit faucet is closed. Gas is paid by your mapped account, and the V3 testnet guide shows how to map yours.", ["Open the testnet guide", L.guide]],
];
const TOPICS = ["wallet", "invoice", "shares", "settlement", "overdue", "fee"];

const NETWORK: [string, string, string?][] = [
  ["Network", "Portaldot V3 testnet"],
  ["Chain ID", "420420777"],
  ["Gas token", "tPOTv3"],
  ["RPC", RPC.replace("https://", ""), RPC],
  ["PotKit contract", shortAddr(KIT), `${REPO}#testnet-evidence`],
  ["Node console", "node-console.portaldot.dev", "https://node-console.portaldot.dev"],
];

export function Help() {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.title = "Help · PotKit";
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); search.current?.focus(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  const q = query.trim().toLowerCase();
  const links = HELP_LINKS.filter((x) => !q || `${x.title} ${x.desc} ${x.tag}`.toLowerCase().includes(q));
  const faqs = HELP_FAQ.filter(([a, b]) => !q || `${a} ${b}`.toLowerCase().includes(q));

  return (
    <LpShell plain>
      <section className="hp-hero">
        <div className="lp-wrap">
          <p className="lp-eyebrow lp-rv">Help center</p>
          <h1 className="lp-rv">How can we help?</h1>
          <p className="lp-lead lp-rv">Guides, answers and a direct line to the builder. From creating a receipt to claiming a settlement.</p>
          <label className="hp-search lp-rv">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" /></svg>
            <input ref={search} type="search" placeholder="Search guides and questions" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search help guides and frequently asked questions" />
            <kbd aria-hidden>Ctrl K</kbd>
          </label>
          <div className="hp-topics lp-rv" aria-label="Popular topics">
            {TOPICS.map((t) => <button key={t} type="button" className={q === t ? "on" : ""} aria-pressed={q === t} onClick={() => setQuery(q === t ? "" : t)}>{t}</button>)}
          </div>
        </div>
      </section>

      {!q && (
        <section className="lp-sec hp-steps-sec">
          <div className="lp-wrap">
            <div className="lp-head-sec lp-rv"><p className="lp-eyebrow">Before you start</p><h2>Get going in three steps</h2></div>
            <ol className="hp-steps">
              {STEPS.map(([t, d, cta], i) => (
                <li key={t} className="lp-rv" style={{ "--d": `${i * 80}ms` } as CSSProperties}>
                  <b className="num">{String(i + 1).padStart(2, "0")}</b>
                  <h3>{t}</h3><p>{d}</p>
                  {cta && <a className="lp-link" href={cta[1]} {...ext}>{cta[0]}<span aria-hidden> ↗</span></a>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section className="lp-sec lp-alt" id="guides">
        <div className="lp-wrap">
          <div className="lp-head-sec lp-rv"><p className="lp-eyebrow">Guides</p><h2>Find your way around</h2></div>
          <div className="hp-cards">
            {links.map((x, i) => (
              <a key={x.title} className="hp-card lp-rv" href={x.href} style={{ "--d": `${(i % 3) * 70}ms` } as CSSProperties}>
                <span className="ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={x.ico} /></svg></span>
                <small>{x.tag}</small><b>{x.title}</b><span className="d">{x.desc}</span>
                <i className="go" aria-hidden>→</i>
              </a>
            ))}
          </div>
          {!links.length && !faqs.length && <p className="hp-empty">No matches. Try “wallet”, “invoice”, “shares” or “settlement”.</p>}
        </div>
      </section>

      <section className="lp-sec" id="faq">
        <div className="lp-wrap hp-faq-wrap">
          <div className="hp-faq-head lp-rv">
            <p className="lp-eyebrow">Questions</p>
            <h2>Frequently asked</h2>
            <p className="lp-lead">Straight answers, including the uncomfortable ones: nobody guarantees the debtor pays, and the contract is unaudited.</p>
          </div>
          <div className="hp-faq">
            {faqs.map(([a, b], i) => (
              <details key={a} className="lp-rv" style={{ "--d": `${Math.min(i, 4) * 50}ms` } as CSSProperties}>
                <summary>{a}<span aria-hidden /></summary>
                <p>{b}</p>
              </details>
            ))}
            {!faqs.length && <p className="hp-empty">No questions match “{query}”.</p>}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-alt" id="network">
        <div className="lp-wrap hp-net">
          <div className="lp-rv">
            <p className="lp-eyebrow">Network details</p>
            <h2>Everything your wallet asks for</h2>
            <p className="lp-lead">PotKit runs on the Portaldot V3 testnet. The app adds the network for you; these are the values if you want to enter them by hand.</p>
          </div>
          <dl className="hp-dl lp-rv">
            {NETWORK.map(([k, v, href]) => <div key={k}><dt>{k}</dt><dd className="num">{href ? <a href={href} {...ext}>{v}</a> : v}</dd></div>)}
          </dl>
        </div>
      </section>

      <section className="lp-sec" id="contact">
        <div className="lp-wrap">
          <div className="hp-contact lp-rv">
            <div>
              <p className="lp-eyebrow">Still need help?</p>
              <h2>Ask the builder directly</h2>
              <p className="lp-lead">Questions, bugs or feedback about PotKit? PotKit is built by one person, and a message gets a direct reply.</p>
            </div>
            <div className="hp-contact-acts">
              <a className="lp-btn solid" href="https://t.me/itsjusttu" {...ext}><IcoTelegram /> Telegram</a>
              <a className="lp-btn line" href="https://mail.google.com/mail/?view=cm&fs=1&to=levantu170605@gmail.com" {...ext}>Email</a>
              <a className="lp-btn line" href={`${REPO}/issues`} {...ext}>GitHub issues</a>
              <a className="lp-btn line" href={L.discord} {...ext}>Portaldot Discord</a>
            </div>
          </div>
        </div>
      </section>
    </LpShell>
  );
}
