import metamask from "../assets/wallets/metamask.svg";
import okx from "../assets/wallets/okx.svg";
import phantom from "../assets/wallets/phantom.svg";
import rabby from "../assets/wallets/rabby.svg";
import coinbase from "../assets/wallets/coinbase.svg";
import trust from "../assets/wallets/trust.svg";
import bitget from "../assets/wallets/bitget.png";
import brave from "../assets/wallets/brave.svg";
const LOGO: Record<string, string> = { "io.metamask": metamask, "com.okex.wallet": okx, "app.phantom": phantom, "io.rabby": rabby, "com.coinbase.wallet": coinbase, "com.trustwallet.app": trust, "com.bitget.web3": bitget, "com.brave.wallet": brave };
// Wallet discovery: EIP-6963 first, then known injected globals. The selected provider is used for every write.
export type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (e: string, h: (...a: any[]) => void) => void;
  removeListener?: (e: string, h: (...a: any[]) => void) => void;
  [k: string]: unknown;
};
export type WalletOption = {
  id: string; // rdns when known
  name: string;
  icon?: string; // data: URI from EIP-6963 (never hotlinked)
  badge: { letter: string; bg: string; fg: string };
  install?: string;
  provider?: Eip1193; // present = detected
  via?: "eip6963" | "injected";
};

type Known = { id: string; name: string; install: string; badge: WalletOption["badge"]; detect: (w: any) => Eip1193 | undefined };
const eth = (w: any) => w.ethereum as (Eip1193 & Record<string, unknown>) | undefined;
const fromList = (w: any, f: (p: any) => boolean) => {
  const e = eth(w);
  const list: any[] = (e?.providers as any[]) ?? (e ? [e] : []);
  return list.find(f);
};
export const KNOWN: Known[] = [
  { id: "io.metamask", name: "MetaMask", install: "https://metamask.io/download/", badge: { letter: "M", bg: "#f6851b", fg: "#fff" },
    detect: (w) => fromList(w, (p) => p.isMetaMask && !p.isRabby && !p.isBraveWallet && !p.isOkxWallet && !p.isPhantom && !p.isTrust && !p.isBitKeep && !p.isCoinbaseWallet) },
  { id: "com.okex.wallet", name: "OKX Wallet", install: "https://web3.okx.com/", badge: { letter: "OKX", bg: "#000", fg: "#fff" }, detect: (w) => w.okxwallet ?? fromList(w, (p) => p.isOkxWallet) },
  { id: "app.phantom", name: "Phantom", install: "https://phantom.com/download", badge: { letter: "P", bg: "#ab9ff2", fg: "#1c1c1c" }, detect: (w) => w.phantom?.ethereum },
  { id: "io.rabby", name: "Rabby", install: "https://rabby.io/", badge: { letter: "R", bg: "#7084ff", fg: "#fff" }, detect: (w) => fromList(w, (p) => p.isRabby) },
  { id: "com.coinbase.wallet", name: "Coinbase Wallet", install: "https://www.coinbase.com/wallet/downloads", badge: { letter: "C", bg: "#0052ff", fg: "#fff" },
    detect: (w) => w.coinbaseWalletExtension ?? fromList(w, (p) => p.isCoinbaseWallet) },
  { id: "com.trustwallet.app", name: "Trust Wallet", install: "https://trustwallet.com/download", badge: { letter: "T", bg: "#0500ff", fg: "#fff" },
    detect: (w) => w.trustwallet ?? fromList(w, (p) => p.isTrust || p.isTrustWallet) },
  { id: "com.bitget.web3", name: "Bitget Wallet", install: "https://web3.bitget.com/wallet-download", badge: { letter: "B", bg: "#00f0ff", fg: "#000" },
    detect: (w) => w.bitkeep?.ethereum ?? fromList(w, (p) => p.isBitKeep || p.isBitgetWallet) },
  { id: "com.brave.wallet", name: "Brave Wallet", install: "https://brave.com/wallet/", badge: { letter: "B", bg: "#fb542b", fg: "#fff" }, detect: (w) => fromList(w, (p) => p.isBraveWallet) },
];

// ---- EIP-6963 -----------------------------------------------------------------
type Detail = { info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193 };
const announced = new Map<string, Detail>();
const subs = new Set<() => void>();
let started = false;
export function startDiscovery() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("eip6963:announceProvider", ((e: CustomEvent<Detail>) => {
    const d = e.detail;
    if (!d?.info?.rdns || !d.provider?.request) return;
    announced.set(d.info.rdns, d);
    subs.forEach((f) => f());
  }) as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}
export const onWalletsChanged = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const safeIcon = (s: string) => (/^data:image\/(svg\+xml|png|jpeg|webp|gif)[;,]/.test(s) ? s : undefined);

/** Popular wallets (detected or not) first, then any other EIP-6963 wallet. */
export function listWallets(): WalletOption[] {
  const w = window as any;
  const out: WalletOption[] = KNOWN.map((k) => {
    const a = announced.get(k.id);
    if (a) return { id: k.id, name: a.info.name || k.name, icon: safeIcon(a.info.icon) ?? LOGO[k.id], badge: k.badge, install: k.install, provider: a.provider, via: "eip6963" };
    const p = (() => { try { return k.detect(w); } catch { return undefined; } })();
    return { id: k.id, name: k.name, icon: LOGO[k.id], badge: k.badge, install: k.install, provider: p, via: p ? "injected" : undefined };
  });
  for (const [rdns, a] of announced) {
    if (KNOWN.some((k) => k.id === rdns)) continue;
    out.push({ id: rdns, name: a.info.name, icon: safeIcon(a.info.icon), badge: { letter: a.info.name.slice(0, 1).toUpperCase(), bg: "#2a2a35", fg: "#fff" }, provider: a.provider, via: "eip6963" });
  }
  // generic injected provider nobody claimed
  const g = eth(w);
  if (g && !out.some((o) => o.provider === g)) out.push({ id: "injected", name: "Browser wallet", badge: { letter: "◇", bg: "#2a2a35", fg: "#fff" }, provider: g, via: "injected" });
  return out.sort((a, b) => Number(Boolean(b.provider)) - Number(Boolean(a.provider)));
}

// ---- selection --------------------------------------------------------------
const KEY = "potkit.wallet";
let current: WalletOption | null = null;
export const selected = () => current;
export const selectedProvider = () => current?.provider ?? null;
export function select(w: WalletOption | null) {
  current = w;
  if (w) localStorage.setItem(KEY, w.id); else localStorage.removeItem(KEY);
}
export const rememberedId = () => localStorage.getItem(KEY);
