import { useMemo, useState, type FormEvent } from "react";
import "./theme-tokens.css";
import "./landing.css";
import "./landing-polish.css";
import "./landing-xero.css";
import { Footer, Header, L, Reveal, app, ext, page, useLenis, Arrow } from "./docs/Chrome";
import { Ico } from "./docs/Art";

/* ---------- ASCII field: static value-noise "land" drawn in characters (own pattern, no map data) ---------- */
const ramp = " ..:-=+*#%@";
function asciiField(cols: number, rows: number) {
  const h = (x: number, y: number) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = (t: number) => t * t * (3 - 2 * t);
  const vn = (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      const v = vn(x / 17, y / 9) * .62 + vn(x / 7 + 40, y / 4 + 11) * .38;
      if (v < .5) { line += " "; continue; }
      const k = Math.min(ramp.length - 1, Math.floor((v - .5) / .32 * (ramp.length - 1)) + 1);
      line += ramp[k];
    }
    out.push(line);
  }
  return out.join("\n");
}

/* ---------- schematic device mock: explanatory labels, never sample balances or returns ---------- */
function Phone({ variant }: { variant: "book" | "buy" }) {
  return (
    <div className={`lx-phone ${variant}`} role="img" aria-label={variant === "book" ? "Illustration of the PotKit invoice book" : "Illustration of buying invoice shares"}>
      <div className="lx-phone-screen">
        <div className="lx-phone-bar"><b>9:41</b><i /></div>
        {variant === "book" ? (
          <>
            <small className="cap">PotKit · illustrative flow</small>
            <div className="big">Invoice <em>receipt</em></div>
            <div className="lx-phone-flow">
              <div><span>01</span><b>Mint receipt</b><small>Record terms on-chain</small></div>
              <div><span>02</span><b>Lock in vault</b><small>Create fixed-supply shares</small></div>
              <div><span>03</span><b>List shares</b><small>Offer at a chosen price</small></div>
              <div><span>04</span><b>Settle &amp; claim</b><small>After the debtor pays</small></div>
            </div>
          </>
        ) : (
          <>
            <b className="ttl">Trade invoice shares</b>
            <small className="cap">PotKit · illustrative flow</small>
            <div className="lx-phone-flow">
              <div><span>01</span><b>Browse listings</b><small>Review terms and due date</small></div>
              <div><span>02</span><b>Buy shares</b><small>Pay the listed price in tPOT</small></div>
              <div><span>03</span><b>Wait for settlement</b><small>Debtor pays into the pool</small></div>
              <div><span>04</span><b>Claim your share</b><small>Pro-rata on-chain payout</small></div>
            </div>
            <div className="go">Illustrative flow · testnet only</div>
          </>
        )}
      </div>
    </div>
  );
}

const ROLES = [
  { id: "issuers", k: "Issuers", t: "Unlock liquidity from work already delivered", d: "Create an issuer-provided on-chain receipt, lock it and offer fixed-supply shares at a discount. If investors buy, you receive tPOT now; the receipt is not independently authenticated.", cta: ["Issue an invoice", "?tab=issue"] },
  { id: "investors", k: "Investors", t: "Buy discounted claims on receivables", d: "Every listing shows its discount to face value and due date. Shares are escrowed by the market, prices are in tPOT, and payouts are pro-rata on settlement.", cta: ["Browse listings", "?tab=trade"] },
  { id: "debtors", k: "Debtors & judges", t: "Settle once. Check the on-chain record", d: "A debtor can pay once in tPOT and holders can claim pro-rata. Share a read-only proof of custody, terms and settlement state; it does not attest to off-chain invoice authenticity.", cta: ["Verify a receipt", "?tab=verify"] },
] as const;

const NODES = [
  { n: "Receipt", ic: "mint", x: 26, y: 16 }, { n: "Vault", ic: "lock", x: 74, y: 16 },
  { n: "Shares", ic: "trade", x: 9, y: 50 }, { n: "Market", ic: "settle", x: 91, y: 50 },
  { n: "Escrow", ic: "escrow", x: 26, y: 84 }, { n: "Proof", ic: "tests", x: 74, y: 84 },
] as const;

const BENTO = [
  { k: "dark", ic: "mint", n: "Receipt", tag: "ERC-721", d: "Invoice record with issuer, kind and note, read straight from chain state." },
  { k: "light", ic: "trade", n: "Market", tag: "Liquidity", d: "Fixed-price listings with escrowed shares, partial buys and exact native-tPOT pricing." },
  { k: "light", ic: "lock", n: "Vault", tag: "Custody", d: "Locks the receipt, fixes its terms, mints the shares and takes payment in tPOT." },
  { k: "dark", ic: "settle", n: "Payout", tag: "Pro-rata", d: "The debtor pays once; every holder claims their share of the pool on-chain." },
] as const;

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
const DOCS = [
  { t: "How it works", d: "One invoice, four contract moves: mint, lock, trade, settle.", m: "Lifecycle", h: "/how-it-works", seed: 3 },
  { t: "Protocol reference", d: "Every function, event and storage rule of the single Yul contract.", m: "Reference", h: "/protocol", seed: 8 },
  { t: "Security model and its limits", d: "What is enforced on-chain and what is not, stated plainly.", m: "Security", h: "/security", seed: 15 },
] as const;
const STACK = ["Portaldot V3", "Yul", "ERC-721", "ERC-20", "tPOT", "viem", "Vite", "React"];

export function Landing() {
  const [tab, setTab] = useState<keyof typeof SNIPPETS>("settle (PotKit.yul)");
  const [role, setRole] = useState(0);
  const [rid, setRid] = useState("");
  const scrolled = useLenis();
  const judgeParams = new URLSearchParams(location.search);
  const hasJudge = ["kit", "vault", "receipt"].some((key) => judgeParams.has(key));
  const launch = app(hasJudge ? location.search : "");
  const ascii = useMemo(() => asciiField(170, 74), []);
  const docArt = useMemo(() => DOCS.map((d) => asciiField(46, 14).split("\n").map((l, i) => (i + d.seed) % 3 ? l : l.replace(/ /g, "·")).join("\n")), []);
  const r = ROLES[role]!;
  const go = (e: FormEvent) => {
    e.preventDefault();
    const n = rid.trim().replace(/^#/, "");
    const params = new URLSearchParams(hasJudge ? location.search : "");
    params.set("tab", "verify");
    if (/^\d+$/.test(n)) params.set("id", n);
    location.href = app(`?${params.toString()}`);
  };

  return (
    <div className="lx lx-x">
      <main>
        {/* ===== hero: black frame, ASCII field, centred copy, device peeking from the bottom ===== */}
        <section className="lx-hero lx-hero-x" id="top">
          <div className="lx-hero-frame">
            <pre className="lx-ascii" aria-hidden>{ascii}</pre>
            <Header scrolled={scrolled} />
            <div className="lx-hero-copy">
              <Reveal><a className="lx-chip" href={page("/how-it-works")}><i /> Portaldot V3 testnet <span>|</span> How it works <Arrow /></a></Reveal>
              <Reveal delay={80}><p className="lx-eyebrow">ON-CHAIN RECEIVABLES MARKET</p></Reveal>
              <Reveal delay={120}><h1>Make invoices<br /><span>work sooner.</span></h1></Reveal>
              <Reveal delay={180}><p>PotKit turns an unpaid invoice into a locked receipt and tradeable shares—so issuers can access liquidity and holders can claim pro-rata when the debtor settles.</p></Reveal>
              <Reveal delay={240}>
                <div className="lx-cta-row">
                  <a className="lx-btn primary lg" href={launch}>Launch App <Arrow /></a>
                  <a className="lx-btn lg" href={page("/how-it-works")}>See how it works</a>
                </div>
              </Reveal>
              <Reveal delay={300}>
                <ul className="lx-trust">
                  <li><Ico n="escrow" />Escrowed on-chain</li>
                  <li><Ico n="lock" />Testnet · no real value</li>
                  <li><Ico n="tests" />1 contract · hand-written Yul</li>
                </ul>
              </Reveal>
              <Reveal delay={340}>
                <form className="lx-pillform" onSubmit={go}>
                  <label htmlFor="hero-receipt">Already have a receipt?</label>
                  <input id="hero-receipt" value={rid} onChange={(e) => setRid(e.target.value)} inputMode="numeric" placeholder="Enter receipt #" aria-label="Receipt number to verify" />
                  <button type="submit" aria-label="Verify receipt on-chain"><Arrow /></button>
                </form>
              </Reveal>
            </div>
            <div className="lx-hero-device">
              <div className="lx-float-note l"><b>ISSUE &amp; LOCK</b>Receipt locked, shares minted</div>
              <Phone variant="book" />
              <div className="lx-float-note r"><b>TRADE &amp; SETTLE</b>Paid when the debtor settles</div>
            </div>
          </div>
        </section>

        <div className="lx-paper">
          {/* ===== two feature cards ===== */}
          <section id="how" className="lx-psec">
            <Reveal className="lx-phead"><h2>From invoice<br />to payout</h2><p>One invoice, four contract moves: mint it, lock it, trade the shares, settle once. Every step is a readable rule on-chain.</p></Reveal>
            <div className="lx-duo">
              <Reveal as="article" className="lx-wcard">
                <span className="lx-pillbadge"><Ico n="mint" />Issue &amp; lock</span>
                <div className="lx-peek a"><Phone variant="book" /></div>
                <h3>Mint a receipt, lock it, sell shares at a discount.</h3>
              </Reveal>
              <Reveal as="article" delay={120} className="lx-wcard">
                <span className="lx-pillbadge"><Ico n="trade" />Trade &amp; settle</span>
                <div className="lx-peek b"><Phone variant="buy" /></div>
                <h3>Buy discounted claims. Claim pro-rata when it settles.</h3>
              </Reveal>
            </div>
          </section>

          {/* ===== roles: tab list + node diagram ===== */}
          <section id="roles" className="lx-psec">
            <Reveal className="lx-flow">
              <ul className="lx-rolelist" role="tablist" aria-label="Roles">
                {ROLES.map((x, i) => <li key={x.id}><button role="tab" aria-selected={role === i} className={role === i ? "on" : ""} onClick={() => setRole(i)}>{x.k}{role === i && <Arrow />}</button></li>)}
              </ul>
              <div className="lx-diagram" aria-hidden>
                <svg className="lx-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {NODES.map((n) => <path key={n.n} d={`M50 50 C ${(50 + n.x) / 2} 50, ${(50 + n.x) / 2} ${n.y}, ${n.x} ${n.y}`} vectorEffect="non-scaling-stroke" />)}
                </svg>
                {NODES.map((n) => <span key={n.n} className="lx-node" style={{ left: `${n.x}%`, top: `${n.y}%` }} title={n.n}><Ico n={n.ic} /></span>)}
                <span className="lx-core"><i />PotKit</span>
              </div>
              <div className="lx-rolecopy" key={r.id}>
                <h3>{r.t}</h3>
                <p>{r.d}</p>
                <a className="lx-link dark" href={app(r.cta[1])}>{r.cta[0]} <Arrow /></a>
              </div>
            </Reveal>
          </section>

          {/* ===== bento: black / white cards around a device ===== */}
          <section id="protocol" className="lx-psec">
            <Reveal className="lx-bento">
              {BENTO.map((b, i) => (
                <article key={b.n} className={`lx-bcard ${b.k} p${i}`}>
                  <header><span className="lx-bico"><Ico n={b.ic} /></span><a className="lx-bgo" href={page("/protocol")} aria-label={`${b.n} in the protocol reference`}><Arrow /></a></header>
                  <div><small>{b.tag}</small><h3>{b.n}</h3><p>{b.d}</p></div>
                </article>
              ))}
              <div className="lx-bphone"><Phone variant="buy" /></div>
            </Reveal>
            <p className="lx-pnote">All of it lives in <b>one ~3.9 KB contract</b> (hand-written Yul). Every lock gets its own ERC-20 share token, an 82-byte forwarder. Payments are native <b>tPOT</b>.</p>
          </section>

          {/* ===== code + security: black block ===== */}
          <section id="mechanism" className="lx-psec">
            <Reveal className="lx-darkblock">
              <div className="lx-dhead"><span className="lx-tag">Open by default</span><h2>Minimal by design.</h2><p>Every rule is a few readable lines of Yul, enforced on-chain.</p></div>
              <div className="lx-code">
                <div className="lx-code-tabs" role="tablist">{Object.keys(SNIPPETS).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k as keyof typeof SNIPPETS)}>{k}</button>)}</div>
                <pre><code>{SNIPPETS[tab].map((l, i) => <span key={i}><i>{i + 1}</i>{l}{"\n"}</span>)}</code></pre>
              </div>
              <div className="lx-safety" id="security">
                {SAFETY.map(([ic, t, d]) => <article key={t}><Ico n={ic} /><h3>{t}</h3><p>{d}</p></article>)}
              </div>
            </Reveal>
          </section>

          {/* ===== docs cards (ASCII art in place of photos) ===== */}
          <section id="learn" className="lx-psec">
            <Reveal className="lx-rowhead"><h2>Docs &amp; reference</h2><a className="lx-link dark" href={page("/help")}>All guides <Arrow /></a></Reveal>
            <div className="lx-docs">
              {DOCS.map((d, i) => (
                <Reveal as="article" key={d.t} delay={i * 90} className="lx-dcard">
                  <a href={page(d.h)}>
                    <div className="lx-dart" aria-hidden><pre>{docArt[i]}</pre></div>
                    <small>{d.m}</small><h3>{d.t}</h3><p>{d.d}</p>
                    <span className="lx-dmeta">Read <Arrow /></span>
                  </a>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ===== stack marquee ===== */}
          <section className="lx-psec lx-stack" aria-label="Built with">
            <h2>Built with</h2>
            <div className="lx-marq" aria-hidden><div className="lx-marq-in">{[0, 1].map((k) => <span key={k}>{STACK.map((s) => <b key={s}>{s}</b>)}</span>)}</div></div>
          </section>
        </div>

        {/* ===== final call to action ===== */}
        <section id="hackathon" className="lx-final-x">
          <Reveal className="lx-final-in2">
            <div><h2>Built for Portaldot Hacker House 2026</h2><p>Track 4 · Ecosystem DApps (RWA). Testnet demo settled in native tPOT, no real value.</p></div>
            <div className="lx-cta-row"><a className="lx-btn primary lg" href={launch}>Launch App <Arrow /></a><a className="lx-btn lg" href={L.hackathon} {...ext}>View on DoraHacks</a></div>
          </Reveal>
        </section>
      </main>
      <Footer />
    </div>
  );
}
