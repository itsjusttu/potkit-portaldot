import { useEffect, useRef, useState, type ReactNode } from "react";
import "../landing.css";
import "./docs.css";
import "../landing-polish.css";
import "./docs-polish.css";
import "./help.css";
import { Footer, Header, Reveal, app, page, useLenis, Arrow } from "./Chrome";
import { MarketArt, ReceiptArt, VaultArt } from "./Art";

type Sec = { id: string; t: string; body: ReactNode };
type Doc = { path: string; kicker: string; title: string; lede: string; secs: Sec[]; next: [string, string] };

const C = ({ children }: { children: ReactNode }) => <code className="dx-c">{children}</code>;
const Fn = ({ sig, who, children }: { sig: string; who?: string; children: ReactNode }) => (
  <div className="dx-fn"><div className="dx-fn-h"><code>{sig}</code>{who && <span>{who}</span>}</div><p>{children}</p></div>
);
const Callout = ({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) => <div className={`dx-call ${tone}`}>{children}</div>;
const Table = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => (
  <div className="dx-tw"><table className="dx-t"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
);

const HELP_LINKS = [
  { title: "Getting started", desc: "Connect a wallet, understand the network, and learn the receipt lifecycle.", href: "/how-it-works", tag: "Guide" },
  { title: "Issue an invoice", desc: "Mint a receipt, lock it, and set its face value and due date.", href: "/how-it-works#mint", tag: "Issuers" },
  { title: "Trade receipt shares", desc: "Learn about listings, escrow, prices, and buying shares.", href: "/how-it-works#trade", tag: "Markets" },
  { title: "Settlement & claims", desc: "See how invoice payments are split between share holders.", href: "/how-it-works#settle", tag: "Holders" },
  { title: "Verify a receipt", desc: "Check backing, terms, status, and settlement from chain data.", href: app("?tab=verify"), tag: "Verification" },
  { title: "Security model", desc: "Understand custody, contract permissions, and testnet limits.", href: "/security", tag: "Security" },
];
const HELP_FAQ = [
  ["What is a PotKit receipt?", "A receipt is an NFT representing an invoice or other receivable. Its owner can lock it and issue fixed-supply shares backed by the receipt."],
  ["Why does the app ask me to switch networks?", "PotKit transactions run on the Portaldot V3 testnet. Read-only pages such as Explore and Verify can still be used without switching."],
  ["How do I issue an invoice?", "Connect an eligible wallet, mint a receipt, then lock it with the invoice amount and optional due date. Minting is limited to the contract issuer and approved minters."],
  ["Can I sell only part of my shares?", "Yes. A seller chooses the share amount and price when creating a listing. Buyers can take a partial amount, and the seller can cancel the unsold remainder."],
  ["How are holders paid after settlement?", "The debtor pays at least the face value in native tPOT. Each holder claims their pro-rata share; the contract's cumulative rounding distributes the pool exactly."],
  ["Does PotKit charge a protocol fee?", "The current contract has no protocol fee. Market prices are set by sellers; the contract does not promise invoice payment or investment returns."],
  ["Where can I find a transaction?", "Open History in the app for wallet activity, or follow the transaction hash in your wallet. Chain events are public and may take a moment to load."],
];
function HelpBrowse() {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); search.current?.focus(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  const normalized = query.trim().toLowerCase();
  const links = HELP_LINKS.filter((x) => !normalized || `${x.title} ${x.desc} ${x.tag}`.toLowerCase().includes(normalized));
  const faqs = HELP_FAQ.filter(([q, a]) => !normalized || `${q} ${a}`.toLowerCase().includes(normalized));
  return <div className="help-browse">
    <label className="help-search"><span aria-hidden>⌕</span><input ref={search} type="search" placeholder="Search guides and FAQs" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search help guides and frequently asked questions" /><kbd>⌘ K</kbd></label>
    <h3>Guides &amp; resources</h3>
    <div className="help-cards">{links.map((x) => <a className="help-card" href={x.href} key={x.title}><small>{x.tag}</small><b>{x.title}</b><span>{x.desc}</span><i aria-hidden>↗</i></a>)}</div>
    {!links.length && !faqs.length && <p className="help-empty">No matches. Try “wallet”, “invoice”, “shares”, or “settlement”.</p>}
    <h3>Frequently asked questions</h3>
    <div className="help-faq">{faqs.map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden>+</span></summary><p>{a}</p></details>)}</div>
  </div>;
}

/* ---------- diagrams (hand-drawn SVG) ---------- */
const Box = ({ x, y, w = 150, h = 54, t, s, tone = "c" }: { x: number; y: number; w?: number; h?: number; t: string; s?: string; tone?: "c" | "m" | "n" }) => (
  <g className={`dg-box ${tone}`}><rect x={x} y={y} width={w} height={h} /><text x={x + w / 2} y={y + (s ? 23 : 32)} className="dg-t">{t}</text>{s && <text x={x + w / 2} y={y + 41} className="dg-s">{s}</text>}</g>
);
const Ar = ({ d, label, lx, ly }: { d: string; label?: string; lx?: number; ly?: number }) => (
  <g className="dg-ar"><path d={d} markerEnd="url(#dgA)" />{label && <text x={lx} y={ly} className="dg-l">{label}</text>}</g>
);
const Defs = () => <defs><marker id="dgA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" className="dg-head" /></marker></defs>;

const Lifecycle = () => (
  <figure className="dx-fig"><svg viewBox="0 0 900 300" role="img" aria-label="Lifecycle: mint, lock with terms, list, buy, settle, claim, redeem">
    <Defs />
    <Box x={10} y={30} t="1 · Mint" s="mint(to, kind, note)" />
    <Box x={235} y={30} w={210} t="2 · Lock + terms" s="fractionalize(id, units, face, due)" />
    <Box x={685} y={30} w={200} t="3 · List" s="list (escrow)" tone="m" />
    <Box x={685} y={190} w={200} t="4 · Buy" s="buy · pays tPOT (partial ok)" tone="m" />
    <Box x={460} y={190} t="5 · Settle" s="settle · pays tPOT" />
    <Box x={235} y={190} t="6 · Claim" s="claim (pro-rata tPOT)" />
    <Box x={10} y={190} t="7 · Redeem" s="NFT back to owner" tone="n" />
    <Ar d="M160 57h72" /><Ar d="M445 57h237" /><Ar d="M785 84v103" />
    <Ar d="M685 217h-72" /><Ar d="M460 217h-72" /><Ar d="M235 217h-72" />
    <Ar d="M310 84 C 300 140 140 140 90 187" label="or: holder of 100% shares, before settle" lx={120} ly={150} />
  </svg><figcaption>Every box is one on-chain transaction against the same PotKit contract. Steps 3–4 can repeat many times. After settlement and once every share is claimed, the depositor redeems the receipt.</figcaption></figure>
);

const Architecture = () => (
  <figure className="dx-fig"><svg viewBox="0 0 900 320" role="img" aria-label="Contract architecture">
    <Defs />
    <Box x={300} y={30} w={300} h={110} t="PotKit (one contract)" s="receipts · vault · settlement pool · market" />
    <Box x={30} y={220} w={200} t="Share token ×N" s="ERC-20 · KIT{id} · 82 bytes" tone="m" />
    <Box x={350} y={220} w={200} t="Lens" s="batch views · eth_call only" tone="n" />
    <Box x={670} y={220} w={200} t="Wallets" s="pay & receive native tPOT" tone="n" />
    <Ar d="M230 247 C 280 247 300 170 330 143" label="forwards ERC-20 calls" lx={150} ly={196} />
    <Ar d="M360 143 C 330 190 260 220 233 230" label="emits Transfer / Approval" lx={300} ly={215} />
    <Ar d="M450 217V143" label="peek(slots)" lx={460} ly={185} />
    <Ar d="M770 217 C 770 170 640 120 603 110" label="settle · buy · claim" lx={690} ly={170} />
  </svg><figcaption>No proxy, no admin key over funds, no off-chain server. The UI reads everything with eth_call: batch reads run the never-deployed Lens contract inside eth_call.</figcaption></figure>
);

const Payout = () => (
  <figure className="dx-fig"><svg viewBox="0 0 900 230" role="img" aria-label="Pro-rata payout">
    <Defs />
    <Box x={20} y={80} w={160} t="Debtor" s="pays ≥ faceValue tPOT" tone="n" />
    <Box x={300} y={70} w={200} h={74} t="PotKit pool" s="amount = msg.value" />
    {[["Holder A", "40% → 4.00 tPOT"], ["Holder B", "35% → 3.50 tPOT"], ["Last holder", "25% → rest (incl. dust)"]].map(([t, s], i) => (
      <g key={t}><Box x={640} y={10 + i * 72} w={240} h={56} t={t} s={s} tone="m" /><Ar d={`M500 107 C 570 107 570 ${38 + i * 72} 637 ${38 + i * 72}`} /></g>
    ))}
    <Ar d="M180 107h117" label="settle()" lx={240} ly={98} />
  </svg><figcaption>Example with 10 tPOT paid. Each claim burns all of the caller's shares. Payouts use cumulative rounding (each claim pays ⌊amount·burnedAfter/supply⌋ − ⌊amount·burnedBefore/supply⌋), so the pool empties exactly whatever the claim order.</figcaption></figure>
);

const States = () => (
  <figure className="dx-fig"><svg viewBox="0 0 900 170" role="img" aria-label="Status state machine">
    <Defs />
    <Box x={10} y={55} w={130} t="Free" s="not locked" tone="n" />
    <Box x={200} y={55} w={130} t="Pending" s="locked, unpaid" />
    <Box x={390} y={55} w={130} t="DueSoon" s="≤ 3 days to due" />
    <Box x={580} y={55} w={130} t="Overdue" s="past due" tone="m" />
    <Box x={760} y={55} w={130} t="Settled" s="paid, final" />
    <Ar d="M140 82h57" /><Ar d="M330 82h57" /><Ar d="M520 82h57" /><Ar d="M710 82h47" />
    <Ar d="M265 55 C 265 5 825 5 825 52" label="settle() from any unpaid state" lx={545} ly={20} />
  </svg><figcaption>Computed by <code className="dx-c">Lens.statuses</code> (inside eth_call) from the due date and block time — nothing is stored or pushed by a keeper.</figcaption></figure>
);

const Escrow = () => (
  <figure className="dx-fig"><svg viewBox="0 0 900 200" role="img" aria-label="Escrow model">
    <Defs />
    <Box x={20} y={20} w={170} t="Seller" s="list (no approval)" tone="m" />
    <Box x={365} y={20} w={170} h={160} t="PotKit market" s="holds listed shares" />
    <Box x={710} y={20} w={170} t="Buyer" s="sends exact tPOT" tone="m" />
    <Box x={20} y={126} w={170} t="Seller" s="receives tPOT / unsold" tone="m" />
    <Box x={710} y={126} w={170} t="Buyer" s="receives shares" tone="m" />
    <Ar d="M190 47h172" label="shares → escrow" lx={276} ly={38} />
    <Ar d="M707 47H538" label="buy(id, amount) + value" lx={622} ly={38} />
    <Ar d="M538 153h169" label="shares" lx={622} ly={144} />
    <Ar d="M362 153H193" label="cost (rounded up) / cancel" lx={276} ly={144} />
  </svg><figcaption>The buyer's tPOT is forwarded to the seller in the same transaction; PotKit never keeps market payments. Listed shares cannot be double-sold because they are custodied.</figcaption></figure>
);

/* ---------- content ---------- */
const DOCS: Record<string, Doc> = {
  "/help": {
    path: "/help", kicker: "Help center", title: "Help & Support",
    lede: "Guides, answers, and support for using PotKit. Find your way from creating a receipt to claiming a settlement.",
    next: ["/how-it-works", "How PotKit works"],
    secs: [
      { id: "answers", t: "Find an answer", body: <HelpBrowse /> },
      { id: "contact", t: "Still need help?", body: <div className="help-contact"><div><small>PotKit community</small><h3>Talk to the community</h3><p>Prepare a support request in the app, then share it in the Portaldot Discord support channel. Your details are only shared when you choose to post them.</p></div><a className="help-contact-link" href="https://discord.gg/G33tVtCsNW" target="_blank" rel="noreferrer">Open Discord <Arrow /></a></div> },
    ],
  },
  "/how-it-works": {
    path: "/how-it-works", kicker: "Guide", title: "How PotKit works",
    lede: "PotKit turns an unpaid invoice into an on-chain receipt, splits it into fixed-supply shares that can be sold for tPOT today, and pays every holder pro-rata when the debtor settles. One small contract on Portaldot V3, no backend.",
    next: ["/protocol", "Protocol reference"],
    secs: [
      { id: "overview", t: "Overview", body: <>
        <p>A business that has delivered work usually waits 30–90 days to be paid.</p>
        <p>PotKit lets the issuer <b>record</b> that receivable as an NFT, <b>lock</b> it so it cannot be moved or sold twice, and <b>fractionalise</b> it into ERC-20 shares.</p>
        <p>Investors buy shares at a discount to face value; when the debtor pays, the money is split among whoever holds the shares at that moment. Every payment is native <b>tPOT</b>.</p>
        <Lifecycle />
      </> },
      { id: "roles", t: "Roles", body: <>
        <Table head={["Role", "Who", "What they can do on-chain"]} rows={[
          [<b>Issuer / minter</b>, "The PotKit deployer, plus addresses it allow-lists via setMinter", "Mint receipts (kind + short note) to any address."],
          [<b>Depositor</b>, "Whoever locks the receipt", "Sets the terms while locking, receives 100% of the shares, redeems the receipt once a settled invoice is fully claimed."],
          [<b>Investor</b>, "Any wallet", "Buys listed shares with tPOT, lists their own shares, claims payout after settlement."],
          [<b>Debtor / payer</b>, "Any wallet", "Pays the invoice into PotKit in tPOT, at least the face value."],
          [<b>Verifier / judge</b>, "Anyone, no wallet needed", "Reads backing, terms, status and settlement through the Verify page."],
        ]} />
      </> },
      { id: "mint", t: "1 · Mint a receipt", body: <>
        <p>The issuer calls <C>mint(to, kind, note)</C>.</p>
        <p><C>kind</C> is 0 = Invoice, 1 = Content right, 2 = Equipment. The note is 1–140 bytes, stored on-chain in packed form.</p>
        <p><C>tokenURI(id)</C> returns <C>https://potkit.pro/api/r?id=…</C>. That endpoint has no database: it runs the Lens contract inside <C>eth_call</C> and returns the JSON built from chain state (name, note, kind), escaping the note safely. The app builds the same JSON the same way.</p>
        <Callout>Minting is permissioned: only the issuer or an allow-listed minter can attest a receipt. Anyone can hold and transfer it afterwards.</Callout>
      </> },
      { id: "lock", t: "2 · Lock, set terms & issue shares", body: <>
        <p>The owner calls <C>fractionalize(id, units, faceValue, dueDate)</C> with 1 to 10¹² whole units: no NFT approval needed, one transaction.</p>
        <p>PotKit takes the NFT, records the terms (face value in wei of tPOT, optional future due date) and gives the receipt its ERC-20 share token named <C>PotKit Fraction #id</C> / <C>KIT{"{id}"}</C> (18 decimals), minting <C>units × 10¹⁸</C> to the depositor. The token is an 82-byte forwarder; the balances live in PotKit. A receipt that is redeemed and locked again keeps the same token address.</p>
        <p>Backing is structural: while any shares exist, the NFT stays in PotKit. A wallet holding <b>every</b> outstanding share can <C>redeem</C> before settlement to burn them and take the NFT back.</p>
        <States />
      </> },
      { id: "trade", t: "3 · List & buy", body: <>
        <p>A holder calls <C>list(id, price, amount)</C>. The shares move into escrow inside PotKit (no approval needed). <C>price</C> is in wei of tPOT per <b>one whole share</b>.</p>
        <p>Buyers call <C>buy(listingId, amount)</C> for any amount up to what remains, sending exactly <C>⌈price × amount / 10¹⁸⌉</C> wei as the transaction value (rounded up, so the seller is never short-changed). The seller is paid in the same transaction. Sellers can <C>cancel</C> at any time to get unsold shares back.</p>
        <Callout>There are no protocol fees. Price discovery is entirely up to sellers: the discount is the difference between the listing price and the face value per share.</Callout>
      </> },
      { id: "settle", t: "4 · Settle", body: <>
        <p>The debtor (or anyone paying on their behalf) calls <C>settle(id)</C> sending at least the face value in tPOT. Any overpayment also goes to holders.</p>
        <p>Settlement is final: buying and listing stop and the pool is split among the share holders.</p>
      </> },
      { id: "claim", t: "5 · Claim & redeem", body: <>
        <p>Each holder calls <C>claim(id)</C>. It burns <b>all</b> of the caller's shares and pays their pro-rata part of the pool in tPOT. Cumulative rounding means the payouts always add up to exactly what was paid in.</p>
        <Payout />
        <p>Sellers with open listings at settlement simply <C>cancel</C> to get their escrowed shares back and then claim.</p>
        <p>Once every share is claimed, the depositor calls <C>redeem(id)</C> to take the receipt NFT back; its vault storage is cleared (refunding the storage deposit) and it can be tokenised again later.</p>
      </> },
      { id: "verify", t: "Verify & data", body: <>
        <p>The app's <a className="dx-a" href={app("?tab=verify")}>Verify</a> tab takes a receipt id or a KIT share-token address and checks, from the chain only:</p>
        <ul className="dx-ul"><li>the receipt exists and the NFT is locked in PotKit</li><li>a share token was issued and payment terms are on-chain</li><li>due / overdue status, and whether payment was at least face value</li></ul>
        <p>It produces a VERIFIED / ISSUES FOUND / UNBACKED verdict with a shareable link and works without a wallet.</p>
        <p>There is no backend or database. Lists such as Explore use Lens (<C>rows</C>, <C>settlements</C>, <C>statuses</C>, <C>balances</C>, <C>claimables</C>, <C>listings</C>, max 50 per call), executed inside <C>eth_call</C>; PotKit itself only exposes the raw <C>peek(slots)</C> read.</p>
      </> },
      { id: "costs", t: "Why one contract?", body: <>
        <p>Portaldot V3 (pallet-revive) charges a refundable <b>storage deposit</b>: about 0.079 tPOT per byte of contract code and about 3.9 tPOT per storage slot. The original four Solidity contracts cost ≈ 1,386 tPOT to deploy, more than a participant's 500 tPOT allowance.</p>
        <p>PotKit is now one ~3.9 KB contract, hand-written in Yul, deployable in one transaction for ≈ 330 tPOT; the whole demo flow (mint → lock → list → buy → settle → claim → redeem) costs ≈ 50 tPOT more. Everything view-only (status, claimable, metadata JSON) is computed off-chain by Lens.</p>
      </> },
    ],
  },
  "/protocol": {
    path: "/protocol", kicker: "Reference", title: "Protocol reference",
    lede: "Every public function and event of PotKit, written from the source (contracts/PotKit.yul, ABI in contracts/IPotKit.sol). No external dependencies, no proxies.",
    next: ["/security", "Security model"],
    secs: [
      { id: "architecture", t: "Architecture", body: <><Architecture />
        <Table head={["Piece", "Standard", "Role"]} rows={[
          ["PotKit", "ERC-721 + ERC-165 + metadata", "Receipts, custody, terms, native-tPOT settlement and payouts, fixed-price market"],
          ["Share token", "ERC-20 (18 dp)", "One 82-byte forwarder per receipt; identical code everywhere, balances kept in PotKit"],
          ["Lens", "— (never deployed)", "Batch reads + metadata JSON for the UI and api/r, executed inside eth_call"],
        ]} /></> },
      { id: "receipt", t: "Receipts (ERC-721)", body: <>
        <div className="dx-art"><ReceiptArt /></div>
        <p>Name <C>PotKit Receipt</C>, symbol <C>RCPT</C>. Ids start at 1.</p>
        <Fn sig="mint(address to, uint8 kind, string note) → id" who="issuer or minter">kind &lt; 3; note 1–140 bytes. Emits Transfer(0, to, id).</Fn>
        <Fn sig="setMinter(address who, bool allowed)" who="issuer">Allow-list a minter.</Fn>
        <Fn sig="issuer() → address">The deployer.</Fn>
        <Fn sig="tokenURI(uint256 id) → string"><C>https://potkit.pro/api/r?id=…</C>; the JSON (name “PotKit Receipt #id”, description = note, attribute Kind) is rendered from chain state by <C>Lens.tokenJson</C>.</Fn>
        <Fn sig="balanceOf · ownerOf · approve · getApproved · setApprovalForAll · isApprovedForAll · transferFrom · safeTransferFrom">Standard ERC-721. safeTransferFrom checks onERC721Received for contracts.</Fn>
        <p className="dx-ev"><b>Events</b> Transfer · Approval · ApprovalForAll</p>
      </> },
      { id: "vault", t: "Vault & settlement", body: <>
        <div className="dx-art"><VaultArt /></div>
        <p>Limits: 1 ≤ units ≤ 10¹²; 0 &lt; faceValue &lt; 2⁹⁶ wei; due date 0 (none) or in the future. Status “Due soon” = within 3 days.</p>
        <Fn sig="fractionalize(id, units, faceValue, uint64 dueDate) → token" who="receipt owner">Takes the NFT, records the terms, creates (or reuses) the share token and mints units×10¹⁸ to the caller.</Fn>
        <Fn sig="redeem(id)" who="holder of every outstanding share">Before settlement: the holder of 100% gets the NFT back. After settlement: once all shares are claimed, the depositor. Clears terms and settlement, bumps the lock cycle (old allowances die).</Fn>
        <Fn sig="settle(id) payable" who="anyone">msg.value ≥ faceValue. One time only; the whole value becomes the pool.</Fn>
        <Fn sig="claim(id) → payout" who="share holder">Burns all caller shares; pays pro-rata in tPOT with cumulative rounding.</Fn>
        <Fn sig="peek(uint256[] slots) → uint256[]">Raw storage reads (layout documented in PotKit.yul). Lens builds rows, settlements, statuses, balances, claimables and listings from it.</Fn>
        <p className="dx-ev"><b>Events</b> Activity(id, actor, kind, a, b, c): 1 lock(units, face, due) · 2 redeem · 4 settle(amount) · 5 claim(shares, payout) · 6 list(lid, price, amount) · 7 buy(lid, amount, cost) · 8 cancel(lid, returned)</p>
      </> },
      { id: "fraction", t: "Share tokens (ERC-20)", body: <>
        <p>Each receipt's share token is an 82-byte contract with the same code for every receipt (Portaldot stores that code once). Any call to it is forwarded to PotKit with the original caller appended; when PotKit itself calls the token it emits the standard <C>Transfer</C> / <C>Approval</C> event from the token's address. <C>name</C>, <C>symbol</C>, <C>decimals</C> (18), <C>totalSupply</C> (claimed shares are burned), <C>balanceOf</C>, <C>allowance</C>, <C>transfer</C>, <C>approve</C>, <C>transferFrom</C> behave as usual; an allowance of <C>type(uint256).max</C> is unlimited.</p>
        <p className="dx-ev"><b>Events</b> Transfer · Approval</p>
      </> },
      { id: "market", t: "Market", body: <>
        <div className="dx-art"><MarketArt /></div>
        <Fn sig="list(id, price, amount) → listingId" who="share holder">Receipt locked and not settled; 0 &lt; price &lt; 2⁹⁶ wei per whole share; 0 &lt; amount &lt; 2¹²⁸. Escrows the shares.</Fn>
        <Fn sig="buy(listingId, amount) payable → cost" who="anyone but the seller">amount ≤ remaining; not settled; msg.value must equal ⌈price × amount / 10¹⁸⌉. Pays the seller, delivers the shares.</Fn>
        <Fn sig="cancel(listingId)" who="seller">Returns all unsold shares; allowed even after settlement.</Fn>
        <Fn sig="Lens.listings(kit, start, limit ≤ 50) · Lens.listingCount(kit)">Views (eth_call). Listing ids start at 0.</Fn>
      </> },
      { id: "errors", t: "Revert reasons", body: <>
        <p>To save code deposit, PotKit reverts with a one-letter <C>Error(string)</C> code; <C>REASON_CODES</C> in the generated artifacts maps each letter to the reason below, and the app shows the readable text.</p>
        <Table head={["Reason", "Where", "Meaning"]} rows={[
          [<C>not minter</C>, "mint", "Caller is neither issuer nor minter"],
          [<C>note length</C>, "mint", "Empty or > 140 bytes"],
          [<C>from</C>, "fractionalize / transfers", "Caller does not own the receipt (or it is locked)"],
          [<C>need all units</C>, "redeem", "Caller does not hold every outstanding share"],
          [<><C>claim first</C> / <C>not depositor</C></>, "redeem after settle", "Shares still unclaimed / only the depositor redeems"],
          [<C>underpaid</C>, "settle", "msg.value below face value"],
          [<C>value</C>, "buy", "msg.value is not exactly the cost"],
          [<C>settled</C>, "list / buy / settle", "Invoice already paid"],
          [<C>not locked</C>, "settle / list / redeem", "Receipt is not locked into shares"],
        ]} />
      </> },
    ],
  },
  "/security": {
    path: "/security", kicker: "Security", title: "Security model",
    lede: "What the contract enforces, how value moves, and — just as important — what PotKit does not protect against. This is a hackathon testnet build.",
    next: ["/how-it-works", "How it works"],
    secs: [
      { id: "status", t: "Status & scope", body: <>
        <Callout tone="warn"><b>Not audited. Testnet only.</b> PotKit runs on Portaldot V3 testnet with test tPOT. Do not use with real value.</Callout>
        <p>One hand-written Yul contract (≈ 450 lines with comments), no external dependencies, no proxies and no upgrade path. Hand-written Yul has none of Solidity's automatic checks, so every bound is explicit in the code and covered by tests.</p>
        <p>There is <b>no owner, no pause and no admin function over funds</b>; the issuer can only manage minters.</p>
      </> },
      { id: "access", t: "Access control", body: <>
        <Table head={["Action", "Allowed caller", "Enforced by"]} rows={[
          ["Mint receipt", "Issuer or allow-listed minter", <C>"not minter"</C>],
          ["Manage minters", "Issuer", <C>"not issuer"</C>],
          ["Lock receipt + set terms", "NFT owner (no approval needed)", <C>"from"</C>],
          ["Settle", "Anyone, ≥ face value in tPOT", <C>"underpaid"</C>],
          ["Redeem NFT before settle", "Holder of 100% shares", <C>"need all units"</C>],
          ["Redeem NFT after settle", "Depositor, all shares claimed", <C>"claim first" / "not depositor"</C>],
          ["Move a locked receipt", "Nobody", <C>"auth"</C>],
          ["Cancel listing", "Seller", <C>"not seller"</C>],
        ]} />
      </> },
      { id: "reentrancy", t: "Reentrancy & ordering", body: <>
        <p>tPOT is only sent in <C>claim</C> (to the claimer) and <C>buy</C> (to the seller), and in both cases <b>last</b>, after every storage update (checks-effects-interactions). A re-entering call sees the final state: a second claim finds no shares, a second buy finds the reduced remaining amount.</p>
        <p>The only other external calls are to PotKit's own share tokens (to emit events) and the ERC-721 receiver check in <C>safeTransferFrom</C>, after the transfer is recorded.</p>
        <p>Share tokens cannot be spoofed: a token only emits events when PotKit calls it; any other caller is forwarded to PotKit with its real address appended.</p>
      </> },
      { id: "escrow", t: "Backing & escrow", body: <>
        <Escrow />
        <ul className="dx-ul">
          <li>The receipt NFT cannot leave PotKit while any unclaimed shares exist.</li>
          <li>Listed shares are held by PotKit, so a listing can never point at shares the seller has moved.</li>
          <li>Buying and listing are blocked after settlement, so nobody can buy a share that is already a claim ticket.</li>
          <li>Sellers cannot buy their own listing.</li>
        </ul>
      </> },
      { id: "math", t: "Rounding & dust", body: <>
        <ul className="dx-ul">
          <li><b>Market cost rounds up</b> (<C>(price × amount + 10¹⁸ − 1) / 10¹⁸</C>): the seller is never short-changed, and the buyer must send exactly that amount.</li>
          <li><b>Payouts use cumulative rounding</b>, so the sum paid equals what was received exactly, in any claim order.</li>
          <li>Field sizes are range-checked on entry (face value and price &lt; 2⁹⁶, amounts &lt; 2¹²⁸, units ≤ 10¹²) so packed storage never overflows.</li>
        </ul>
      </> },
      { id: "trust", t: "Trust assumptions", body: <>
        <Callout tone="warn">PotKit proves what happened <b>on-chain</b>. It cannot prove that the off-chain invoice is real, or that the debtor will pay.</Callout>
        <ul className="dx-ul">
          <li><b>Issuer truth.</b> A receipt is an attestation by the issuer/minter. The contract checks who minted it, not whether the invoice exists.</li>
          <li><b>Debtor willingness.</b> Nothing forces payment. “Overdue” is a computed status with no penalty, collateral or liquidation.</li>
          <li><b>No oracle.</b> No price feed or off-chain data; face value and due date are whatever the depositor set.</li>
          <li><b>Pricing.</b> Market prices are set by sellers; there is no check against face value.</li>
          <li><b>Issuer key.</b> The issuer can add minters; a compromised issuer key could mint misleading receipts (it cannot touch locked receipts or funds).</li>
          <li><b>Metadata endpoint.</b> tokenURI points at potkit.pro; the JSON there is derived from chain state, and the app and Verify read the chain directly.</li>
          <li><b>Privacy.</b> Notes and all activity are public on-chain.</li>
        </ul>
      </> },
      { id: "tests", t: "Tests", body: <>
        <p><C>npm test</C> runs the automated tests on a local chain:</p>
        <ul className="dx-ul">
          <li>ERC-721 behaviour (approvals, operators, safe transfers to receiver contracts), bad mints, minters, lossless notes and JSON escaping</li>
          <li>Locking with terms, the 82-byte share tokens (identical code, no spoofed events), ERC-20 transfer / approve / transferFrom, redeem and re-lock</li>
          <li>Native-tPOT settlement, multi-holder pro-rata claims with exact pool emptying, payouts to contracts, the status lifecycle</li>
          <li>Market escrow, exact-value buys, rounding, cancel, post-settlement rules; network-switching and faucet tests for the app</li>
        </ul>
        <p>On top, <C>scripts/measure.mjs</C> runs the whole demo flow on the real Portaldot RPC inside <C>eth_call</C> / <C>eth_estimateGas</C>. Tests are not a substitute for an audit or formal verification.</p>
      </> },
    ],
  },
};

export const DOC_PATHS = Object.keys(DOCS);

export function Docs({ path }: { path: string }) {
  const d = DOCS[path] ?? DOCS["/how-it-works"];
  const scrolled = useLenis();
  const [cur, setCur] = useState(d.secs[0].id);
  useEffect(() => {
    document.title = `${d.title} · PotKit`;
    const els = d.secs.map((s) => document.getElementById(s.id)!).filter(Boolean);
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setCur(v.target.id); }, { rootMargin: "-20% 0px -65% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [d]);
  return (
    <div className={`lx dx ${path === "/help" ? "dx-help" : ""}`}>
      <div className="lx-bg" aria-hidden />
      <Header scrolled={scrolled} active={d.path} />
      <main>
        <section className="dx-hero">
          <Reveal><span className="lx-tag">{d.kicker}</span></Reveal>
          <Reveal delay={80}><h1>{d.title}</h1></Reveal>
          <Reveal delay={160}><p>{d.lede}</p></Reveal>
        </section>
        <div className="dx-wrap">
          <label className="dx-toc-sel-wrap">
            <select className="dx-toc-sel" aria-label="On this page" value={cur} onChange={(e) => { location.hash = e.target.value; /* id without #; browser scrolls */ }}>
              {d.secs.map((s) => <option key={s.id} value={s.id}>{s.t}</option>)}
            </select>
          </label>
          <aside className="dx-toc" aria-label="On this page">
            <small>On this page</small>
            {d.secs.map((s) => <a key={s.id} href={`#${s.id}`} className={cur === s.id ? "on" : ""}>{s.t}</a>)}
            <a className="dx-toc-app" href={app()}>Launch App <Arrow /></a>
          </aside>
          <article className="dx-body">
            {d.secs.map((s) => <section key={s.id} id={s.id} className="dx-sec"><h2>{s.t}</h2>{s.body}</section>)}
            <a className="dx-next" href={page(d.next[0])}><small>Next</small><b>{d.next[1]}</b><Arrow /></a>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
