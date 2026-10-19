import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import { DEFAULTS } from "./config";
import { appShareUrl, homeUrl } from "./routes";
import { WalletButton, WalletModal, useWallets } from "./WalletUi";
import { rememberedId, select, selected, type WalletOption } from "./lib/wallets";
import { Checklist, Drawer, Empty, GasTip, Ico, Toasts, toast, type Step } from "./AppUi";
import { FaucetButton } from "./Faucet";
import {
  addr, anyWallet, connect, CONSOLE, disconnectWallet, ethereum, explain, fmt, GUIDE, inFrame, KINDS, kitAddrs, loadBalances, loadClaimables, loadEvents,
  loadListings, loadMeta, loadRows, nativeBalance, ENV_FROM_BLOCK, isNoCode, NATIVE, NO_CODE, PAY_SYMBOL, receiptCount, type DeployStep, portaldot, settle, short, silentAccount, switchToPortaldot, units, walletChainId,
  type Addrs, type ChainEvent, type Listing, type Row,
} from "./lib/chain";
import { TABS, type Ctx, type Log, type Tab } from "./tabs/ctx";
import { SettleBadge } from "./tabs/shared";
import { Dashboard } from "./tabs/Dashboard";
import { Issue } from "./tabs/Issue";
import { Trade } from "./tabs/Trade";
import { Portfolio } from "./tabs/Portfolio";
import { Explore } from "./tabs/Explore";
import { Verify } from "./tabs/Verify";
import { History } from "./tabs/History";
import { Profile } from "./tabs/Profile";

const ALIAS: Record<string, Tab> = { desk: "issue", market: "trade", board: "explore", log: "history", activity: "history" };
const ALL: Tab[] = [...TABS, "profile"];
function initialTab(): Tab {
  const t = (new URLSearchParams(location.search).get("tab") ?? "").toLowerCase();
  return (ALL as string[]).includes(t) ? (t as Tab) : ALIAS[t] ?? "dashboard";
}
// v6: one PotKit contract (v5 saved separate Receipt / Vault / TestUSD / Market addresses with another ABI)
const STORE = "potkit.v6";
const TAB_KEEP = ["kit", "receipt", "vault", "usd", "market"];
// Saved-deployment keys. `.block` = first block of our own deploy (event scan start),
// `.fp` = fingerprint of the .env defaults this storage belongs to.
const SAVED_KEYS = [STORE, `${STORE}.block`];
const ENV_FP = [DEFAULTS.kit, ENV_FROM_BLOCK].map((x) => x.trim().toLowerCase()).join("|");
export function clearSavedDeployment() { SAVED_KEYS.forEach((k) => localStorage.removeItem(k)); }
/** When the baked-in .env deployment changes (you redeployed), stale browser-saved addresses must not win. */
(function syncEnvFingerprint() {
  try {
    const prev = localStorage.getItem(`${STORE}.fp`);
    const envSet = ENV_FP.replace(/\|/g, "") !== "";
    if ((prev !== null && prev !== ENV_FP) || (prev === null && envSet)) clearSavedDeployment();
    localStorage.setItem(`${STORE}.fp`, ENV_FP);
  } catch { /* storage unavailable */ }
})();
const savedBlock = () => { const b = localStorage.getItem(`${STORE}.block`) ?? ""; return /^\d+$/.test(b) ? BigInt(b) : undefined; };

function initialAddrs(): { a: Addrs | null; shared: boolean } {
  const q = new URLSearchParams(window.location.search);
  // ?kit=0x… (older links: ?vault= / ?receipt= — all the same contract now)
  const fromUrl = addr(q.get("kit") ?? "") || addr(q.get("vault") ?? "") || addr(q.get("receipt") ?? "");
  if (fromUrl) return { a: kitAddrs(fromUrl), shared: true };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    const k = addr(saved.vault ?? "");
    if (k) return { a: kitAddrs(k), shared: false };
  } catch { /* ignore corrupt storage */ }
  const k = addr(DEFAULTS.kit);
  return k ? { a: kitAddrs(k), shared: true } : { a: null, shared: false };
}

const TITLES: Record<Tab, [string, string]> = {
  dashboard: ["Dashboard", "Your PotKit workspace: receipts, market activity and quick actions from Portaldot V3."],
  issue: ["Issue", "Turn an unpaid invoice into an on-chain receipt and tradeable shares — three guided steps."],
  trade: ["Trade", "Buy discounted claims on future payouts, or sell your shares for tPOT today."],
  portfolio: ["Portfolio", "Your allocation, value at settlement, profit on bought shares and payouts ready to claim."],
  explore: ["Explore", "Every receipt, listing and event on this deployment, read live from Portaldot V3."],
  verify: ["Verify", "An independent, shareable proof of a receipt's backing, terms and settlement."],
  history: ["History", "Your transactions as a timeline, straight from on-chain events."],
  profile: ["Profile", "Your wallet identity, balances and footprint on PotKit."],
};
const TAB_PATHS: Record<Tab, string> = {
  dashboard: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  issue: "M12 4v16M4 12h16", trade: "M7 7h12l-3-3M17 17H5l3 3", portfolio: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  explore: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4", verify: "M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6zM8.5 12l2.5 2.5 4.5-5",
  history: "M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4", profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6",
};
const TabIco = ({ t }: { t: Tab }) => <svg className="ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d={TAB_PATHS[t]} /></svg>;

export function App() {
  const init = useMemo(initialAddrs, []);
  const [addrs, setAddrsState] = useState<Addrs | null>(init.a);
  const [shared, setShared] = useState(init.shared);
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [params, setParams] = useState<Record<string, string>>(() => Object.fromEntries([...new URLSearchParams(location.search)].filter(([k]) => !TAB_KEEP.includes(k) && k !== "tab")));
  const setTab = (t: Tab, p: Record<string, string> = {}) => {
    setTabState(t); setParams(p);
    const q = new URLSearchParams(location.search);
    [...q.keys()].filter((k) => !TAB_KEEP.includes(k)).forEach((k) => q.delete(k));
    if (t !== "issue") q.set("tab", t);
    Object.entries(p).forEach(([k, v]) => q.set(k, v));
    history.replaceState(null, "", `${location.pathname}${q.toString() ? `?${q}` : ""}`);
    window.scrollTo({ top: 0 });
  };
  const [account, setAccount] = useState<Address | "">("");
  const [chainOk, setChainOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [held, setHeld] = useState<Map<number, bigint>>(new Map());
  const [claims, setClaims] = useState<Map<number, bigint>>(new Map());
  const [canMint, setCanMint] = useState(false);
  const [issuer, setIssuer] = useState("");
  // settlement and market payments are native tPOT; the market is the PotKit contract itself
  const usd: Address | "" = addrs ? NATIVE : "";
  const market: Address | "" = addrs?.vault ?? "";
  const [native, setNative] = useState<bigint | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [eventsOk, setEventsOk] = useState(true);
  const [loading, setLoading] = useState(Boolean(init.a));
  const [total, setTotal] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [payFor, setPayFor] = useState<number | null>(null);
  const [payAmt, setPayAmt] = useState("");
  const [guide, setGuide] = useState(false);
  const [needGas, setNeedGas] = useState(false); // set when a write fails for insufficient gas
  useEffect(() => { setNeedGas(false); }, [account]); // the warning belongs to the wallet that failed
  const [log, setLog] = useState<Log[]>(() => { try { return JSON.parse(localStorage.getItem(`${STORE}.log`) ?? "[]"); } catch { return []; } });

  const setAddrs = (a: Addrs | null) => { setAddrsState(a); setShared(false); if (a) localStorage.setItem(STORE, JSON.stringify(a)); else localStorage.removeItem(STORE); };
  const note = (action: string, detail: string, hash?: `0x${string}`) =>
    setLog((l) => { const next = [{ at: new Date().toISOString(), action, detail, hash }, ...l].slice(0, 100); localStorage.setItem(`${STORE}.log`, JSON.stringify(next)); return next; });

  // ---- wallet: restore silently, follow account/network changes ----
  const wallets = useWallets();
  const [picker, setPicker] = useState(false);
  const [walletId, setWalletId] = useState<string>(() => rememberedId() ?? "");
  const [picking, setPicking] = useState("");
  const [provTick, setProvTick] = useState(0);
  useEffect(() => {
    if (selected() || !walletId) return;
    const w = wallets.find((x) => x.id === walletId && x.provider);
    if (w) { select(w); setProvTick((t) => t + 1); }
  }, [wallets, walletId]);
  useEffect(() => {
    const eth = ethereum();
    if (!eth) { if (inFrame()) setNotice("Wallets cannot attach inside an embedded preview. Open this page in a full browser tab."); setAccount(""); setChainOk(null); return; }
    const sync = async () => {
      const acc = await silentAccount().catch(() => "" as const);
      setAccount(acc);
      setChainOk(acc ? (await walletChainId().catch(() => 0)) === portaldot.id : null);
    };
    void sync();
    eth.on?.("accountsChanged", sync); eth.on?.("chainChanged", sync);
    return () => { eth.removeListener?.("accountsChanged", sync); eth.removeListener?.("chainChanged", sync); };
  }, [provTick]);

  // ---- chain reads ----
  const refresh = useCallback(async () => {
    if (!addrs) return;
    try {
      const r = await loadRows(addrs.vault, 0, Math.max(20, rows.length));
      setRows(r);
      setTotal(await receiptCount(addrs.vault).catch(() => r.length));
      const [bal, meta, cl, ls] = await Promise.all([
        account ? loadBalances(addrs.vault, account, r) : Promise.resolve(new Map<number, bigint>()),
        loadMeta(addrs.receipt, account),
        account ? loadClaimables(addrs.vault, account, r) : Promise.resolve(new Map<number, bigint>()),
        market ? loadListings(market).catch(() => []) : Promise.resolve([] as Listing[]),
      ]);
      setHeld(bal); setClaims(cl); setListings(ls); setLoading(false); setCanMint(meta.canMint); setIssuer(meta.issuer);
      if (account) setNative(await nativeBalance(account).catch(() => null));
      setEventsLoading(true);
      const sameAsEnv = addrs.receipt.toLowerCase() === DEFAULTS.receipt.trim().toLowerCase();
      const from = savedBlock() ?? (sameAsEnv && /^\d+$/.test(ENV_FROM_BLOCK) ? BigInt(ENV_FROM_BLOCK) : undefined);
      const ev = await loadEvents(addrs, market, ls, from).catch(() => ({ events: [] as ChainEvent[], ok: false }));
      setEvents(ev.events); setEventsOk(ev.ok);
      setEventsLoading(false);
    } catch (e) { setLoading(false); setNotice(isNoCode(e) ? NO_CODE : `Could not read Portaldot: ${explain(e)}`); setEventsLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrs, account, market]);
  const loadOlder = () => void (async () => {
    if (!addrs || !rows.length) return;
    const oldest = Math.min(...rows.map((r) => r.id));
    if (oldest <= 1) return;
    const from = Math.max(1, oldest - 20);
    try {
      const more = await loadRows(addrs.vault, from, oldest - from);
      const all = [...rows, ...more];
      setRows(all);
      if (account) { const [b, cl] = await Promise.all([loadBalances(addrs.vault, account, all), loadClaimables(addrs.vault, account, all)]); setHeld(b); setClaims(cl); }
    } catch (e) { toast({ kind: "err", title: "Could not load older receipts", detail: explain(e) }); }
  })();
  const saveStep = (st: DeployStep) => {
    localStorage.setItem(`${STORE}.block`, st.block.toString());
    setAddrs(kitAddrs(st.address));
    note("PotKit deployed", `${short(st.address)} · block ${st.block}`, st.hash);
  };
  const resetDeployment = () => {
    clearSavedDeployment();
    const k = addr(DEFAULTS.kit);
    setAddrsState(k ? kitAddrs(k) : null); setShared(Boolean(k));
    setRows([]); setListings([]); setEvents([]);
    toast({ kind: "ok", title: "Saved deployment cleared", detail: k ? "Using the deployment baked into this build." : "Deploy a fresh PotKit contract on the Issue tab." });
  };
  useEffect(() => { void refresh(); }, [refresh]);

  // spinner on the button that started an action
  const lastBtn = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => { lastBtn.current = (e.target as HTMLElement).closest("button"); };
    document.addEventListener("click", on, true);
    return () => document.removeEventListener("click", on, true);
  }, []);
  async function run(label: string, job: () => Promise<void>) {
    if (busy) return;
    const btn = lastBtn.current;
    btn?.classList.add("loading"); btn?.setAttribute("aria-busy", "true");
    setBusy(label); setNotice("");
    try { await job(); await refresh(); } catch (e) { const d = explain(e); if (/Not enough tPOTv3/i.test(d)) setNeedGas(true); toast({ kind: "err", title: "Action failed", detail: d }); }
    finally { btn?.classList.remove("loading"); btn?.removeAttribute("aria-busy"); setBusy(""); }
  }
  const connectWallet = () => { if (inFrame()) return setNotice("Open this page in a full browser tab to use a wallet."); setPicker(true); };
  const pickWallet = async (w: WalletOption) => {
    const prev = selected(); select(w); setPicking(w.id);
    try {
      const acc = await connect();
      setWalletId(w.id); setProvTick((t) => t + 1); setAccount(acc);
      setChainOk((await walletChainId()) === portaldot.id); setPicker(false);
      toast({ kind: "ok", title: `Connected with ${w.name}`, detail: short(acc) });
    } catch (e) { select(prev); setProvTick((t) => t + 1); toast({ kind: "err", title: `${w.name} did not connect`, detail: explain(e) }); }
    finally { setPicking(""); }
  };
  const disconnect = async () => {
    const name = selected()?.name ?? "wallet";
    await disconnectWallet(); select(null); setWalletId(""); setProvTick((t) => t + 1);
    toast({ kind: "ok", title: "Disconnected", detail: `${name} is no longer used by PotKit.` });
    if (tab === "profile") setTab("issue");
  };
  const copyAddr = () => (navigator.clipboard?.writeText(account) ?? Promise.reject()).catch(() => toast({ kind: "err", title: "Copy failed", detail: account }));
  const switchNet = () => void run("net", async () => { await switchToPortaldot(); setChainOk((await walletChainId()) === portaldot.id); });
  const ready = () => { if (!account) throw new Error("Connect your wallet first."); if (!chainOk) throw new Error("Switch your wallet to Portaldot V3 first."); return account; };
  const gated = Boolean(account) && chainOk === false;
  const judgeLink = addrs ? appShareUrl(`?kit=${addrs.vault}`) : "";
  const usdRaw = native ?? 0n;
  const usdBal = native === null ? "" : `${fmt(native, 18)} ${PAY_SYMBOL}`;
  const openPay = (id: number) => { const r = rows.find((x) => x.id === id); setPayAmt(r && r.settle.faceValue > 0n ? fmt(r.settle.faceValue, r.settle.decimals).replace(/,/g, "") : ""); setPayFor(id); };

  const c: Ctx = {
    account, chainOk, gated, busy, addrs, setAddrs, shared, usd, market, rows, held, claims, listings, events, eventsLoading, loading, eventsOk, total, loadOlder, saveStep, resetDeployment,
    canMint, issuer, usdBal, usdRaw, native, log, note, run, ready, refresh, setTab, connect: connectWallet, judgeLink,
    walletName: selected()?.name ?? "Wallet", openPay, param: (k) => params[k] ?? "",
  };

  // demo guide (floating, collapsible)
  const isDep = (r: Row) => r.depositor === account || r.owner === account;
  const demo: Step[] = [
    { label: "Mint a receipt", done: rows.some(isDep), go: () => { setTab("issue"); setGuide(false); } },
    { label: "Lock, set terms & issue shares", done: rows.some((r) => r.fraction && r.depositor === account) || events.some((e) => e.kind === "lock" && e.actors[0] === account), go: () => { setTab("issue"); setGuide(false); } },
    { label: "List shares", done: listings.some((l) => l.seller === account) || events.some((e) => e.kind === "list" && e.actors[0] === account) || log.some((l) => l.action === "Listed"), go: () => { setTab("trade"); setGuide(false); } },
    { label: "Buy shares (2nd wallet)", done: rows.some((r) => r.fraction && r.depositor !== account && (held.get(r.id) ?? 0n) > 0n) || events.some((e) => e.kind === "buy" && (e.actors.includes(account as Address) || events.some((x) => x.kind === "list" && x.lid === e.lid && x.actors[0] === account))), go: () => { setTab("trade"); setGuide(false); } },
    { label: "Settle invoice", done: rows.some((r) => r.settle.settled) || events.some((e) => e.kind === "settle"), go: () => { setTab("explore"); setGuide(false); } },
    { label: "Claim payout", done: log.some((l) => l.action === "Payout claimed") || events.some((e) => e.kind === "claim" && e.actors[0] === account), go: () => { setTab("portfolio"); setGuide(false); } },
    { label: "Redeem the receipt", done: events.some((e) => e.kind === "redeem" && e.actors[0] === account), go: () => { setTab("portfolio"); setGuide(false); } },
  ];
  const demoDone = demo.filter((s) => s.done).length;
  const payRow = rows.find((r) => r.id === payFor);

  const needsWallet = tab !== "dashboard" && tab !== "explore" && tab !== "verify";
  return (
    <div className="shell">
      <aside className="side">
        <a className="side-brand" href={homeUrl()} aria-label="PotKit home" data-tip="Home">
          <span className="logo" aria-hidden><span className="lg-d">◆</span><span className="lg-a">←</span></span>
          <span><b>Pot<span className="grad">Kit</span></b><small>dApp · Portaldot V3</small></span>
        </a>
        <nav className="side-nav" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t} className={`side-item ${tab === t ? "on" : ""}`} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>
              <TabIco t={t} /><span>{TITLES[t][0]}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          {account && <button className={`side-item ${tab === "profile" ? "on" : ""}`} onClick={() => setTab("profile")}><TabIco t="profile" /><span>Profile</span></button>}
          <span className={`net ${chainOk ? "ok" : ""}`}><i />{chainOk ? "Portaldot V3" : account ? "Wrong network" : "Not connected"}</span>
          <span className="mono muted">chain {portaldot.id}</span>
        </div>
      </aside>
      <main>
        <header className="top">
          <div className="crumb">
            <a className="icon-btn" href={homeUrl()} aria-label="Go to PotKit home" data-tip="Home">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></svg>
            </a>
            <span className="muted crumb-root">PotKit /</span> <b>{TITLES[tab][0]}</b>
          </div>
          <nav>
            <WalletButton account={account} label={short(account)} net={chainOk ? "ok" : chainOk === false ? "wrong" : "unknown"}
              onConnect={connectWallet} onProfile={() => setTab("profile")} onCopy={copyAddr} onExplore={() => setTab("explore", { addr: account })}
              onDisconnect={() => void disconnect()} onSwitchNet={switchNet} />
          </nav>
        </header>
        <WalletModal open={picker} wallets={wallets} busyId={picking} onPick={(w) => void pickWallet(w)} onClose={() => setPicker(false)} />

        {gated && (
          <div className="netbar" role="alert">
            <Ico n="swap" />
            <span><b>Wrong network.</b> Actions are paused until you switch to Portaldot V3 Testnet (chain {portaldot.id}).</span>
            <button className="btn sm primary" disabled={Boolean(busy)} onClick={switchNet}>{busy === "net" ? "Switching…" : "Switch network"}</button>
          </div>
        )}

        <div className={`page-head ph-${tab}`}>
          <p className="kicker">PotKit · {TITLES[tab][0]}</p>
          <h1 key={tab}>{TITLES[tab][0]}</h1>
          <p className="muted">{TITLES[tab][1]}</p>
          {tab === "explore" && addrs && <button className="btn sm ph-act" onClick={() => void navigator.clipboard?.writeText(judgeLink).then(() => toast({ kind: "ok", title: "Judge link copied", detail: "Opens these exact contracts." }))}><Ico n="link" /> Copy judge link</button>}
          {tab === "issue" && <div className="quick-route"><span><i>01</i> Connect wallet</span><b>→</b><span><i>02</i> Check Portaldot &amp; gas</span><b>→</b><span><i>03</i> Create a receipt</span>{!account ? <button onClick={connectWallet}>Connect wallet <Ico n="arrow" /></button> : <a href="#wizard">Start issuing <Ico n="arrow" /></a>}</div>}
        </div>

        {notice && <p className="banner" role="status">{notice}</p>}
        {needsWallet && (inFrame() || (!anyWallet() && !wallets.some((w) => w.provider))) ? (
          <Empty icon="◇" title="No wallet detected" tone="warn" body={inFrame() ? "Wallets can't attach inside an embedded preview. Open this page in a full browser tab." : "Install any EVM browser wallet (OKX, Rabby, MetaMask, Coinbase and more), then reload. Explore and Verify work without a wallet."}>
            <button className="btn primary" onClick={() => setPicker(true)}>Choose a wallet</button>
          </Empty>
        ) : needsWallet && !account ? (
          <Empty icon="◎" title="Connect your wallet" body="Connect to issue invoices, trade shares and claim payouts. Explore and Verify work without a wallet.">
            <button className="btn primary" disabled={Boolean(busy)} onClick={connectWallet}>Connect Wallet</button>
          </Empty>
        ) : (
          <>
            {account && needGas && (
              <div className="nogas" role="alert">
                <div><b>Not enough gas for that transaction.</b> <span className="muted small">Gas is paid in tPOTv3 by your mapped account.</span></div>
                <FaucetButton account={account} compact onFunded={() => { setNeedGas(false); void refresh(); }} />
                <button className="t-x" aria-label="Dismiss" onClick={() => setNeedGas(false)}><Ico n="x" /></button>
              </div>
            )}
            {account && (tab === "issue" || tab === "trade") && <GasTip consoleUrl={CONSOLE} guideUrl={GUIDE} account={account} />}
            <div className={`tabbody t-${tab} ${gated && tab !== "explore" && tab !== "verify" ? "gated" : ""}`} inert={(gated && tab !== "explore" && tab !== "verify") || undefined}>
              {tab === "issue" && <Issue c={c} />}
              {tab === "dashboard" && <Dashboard c={c} />}
              {tab === "trade" && <Trade c={c} />}
              {tab === "portfolio" && <Portfolio c={c} />}
              {tab === "explore" && <Explore c={c} />}
              {tab === "verify" && <Verify c={c} />}
              {tab === "history" && <History c={c} />}
              {tab === "profile" && account && <Profile c={c} />}
            </div>
          </>
        )}
      </main>

      {account && (
        <div className={`guide ${guide ? "open" : ""}`}>
          {guide && (
            <div className="guide-pop" role="dialog" aria-label="Demo guide">
              <Checklist dismissible={false} storeKey={`${STORE}.guide`} title="Demo guide" doneText="Demo path complete" steps={demo} />
            </div>
          )}
          <button className="guide-btn" aria-label="Demo guide" aria-expanded={guide} onClick={() => setGuide(!guide)}>
            <Ico n={guide ? "x" : "guide"} /> <span>Demo guide</span> <span className="num g-count">{loading ? "…" : `${demoDone}/${demo.length}`}</span>
          </button>
        </div>
      )}

      <Drawer open={payFor !== null} onClose={() => setPayFor(null)} kicker="Settle invoice" title={payRow ? `Pay #${payRow.id} · ${payRow.note}` : "Pay invoice"}>
        {payRow && (
          <>
            <div className="tags"><SettleBadge r={payRow} /></div>
            <p className="muted">The debtor pays PotKit in tPOT; the receipt is marked settled and every share becomes a pro-rata payout ticket. Payment is final.</p>
            <dl className="facts">
              <div><dt>Kind</dt><dd>{KINDS[payRow.kind]}</dd></div>
              <div><dt>Face value</dt><dd className="num">{`${fmt(payRow.settle.faceValue, payRow.settle.decimals)} ${payRow.settle.symbol}`}</dd></div>
              <div><dt>Shares</dt><dd className="num">{units(payRow.supply)}</dd></div>
              <div><dt>Paid in</dt><dd>{PAY_SYMBOL} (native)</dd></div>
            </dl>
            <label htmlFor="pay-amt">Amount ({PAY_SYMBOL})</label>
            <input id="pay-amt" inputMode="decimal" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
            <button className="btn primary block" disabled={Boolean(busy) || gated || !account} onClick={() => void run("settle", async () => {
              const amt = payAmt.trim(); if (!/^\d+(\.\d+)?$/.test(amt) || Number(amt) <= 0) throw new Error("Enter a positive amount.");
              const h = await settle(ready(), addrs!.vault, payRow.id, amt);
              note("Invoice settled", `#${payRow.id} · ${amt} ${PAY_SYMBOL} paid`, h); setPayFor(null);
            })}>{!account ? "Connect wallet to pay" : busy === "settle" ? "Confirm in wallet…" : `Pay ${payAmt || "…"} ${PAY_SYMBOL} & settle`}</button>
          </>
        )}
      </Drawer>
      <Toasts />
    </div>
  );
}
