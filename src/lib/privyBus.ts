/* Small bridge between the Privy SDK (loaded as its own chunk by src/lib/privy.tsx, only when an App ID is set) and the wallet
   hook. Without VITE_PRIVY_APP_ID nothing here is used and the app keeps its own wallet picker. Privy is used to connect only:
   the connected wallet's EIP-1193 provider is handed to the existing wallet code, which signs and sends every transaction. */
import type { Eip1193 } from "./wallets";

export const PRIVY_APP_ID = ((import.meta.env.VITE_PRIVY_APP_ID as string | undefined) ?? "").trim();
export const privyOn = () => PRIVY_APP_ID.length > 0;

export type PrivyPick = { address: string; name: string; id: string; icon?: string; provider: Eip1193; disconnect: () => void } | null;

let opener: (() => void) | null = null;
const subs = new Set<(w: PrivyPick) => void>();
let last: PrivyPick = null;

/** Registered by the Privy bridge once the SDK is ready. */
export const setPrivyOpener = (fn: (() => void) | null) => { opener = fn; };
/** Opens Privy's connect modal; false when the SDK is not loaded (yet). */
export const openPrivy = () => { if (!opener) return false; opener(); return true; };
/** The bridge publishes the wallet Privy has connected (or null). */
export const publishPrivy = (w: PrivyPick) => { last = w; subs.forEach((f) => f(w)); };
export const onPrivy = (f: (w: PrivyPick) => void) => { subs.add(f); f(last); return () => { subs.delete(f); }; };

// After "Disconnect" in PotKit the wallet stays connected inside Privy's own store (MetaMask cannot be disconnected from a site
// programmatically), so PotKit ignores it until the next explicit connect.
const OFF = "potkit.privy.off";
export const privyMuted = () => { try { return localStorage.getItem(OFF) === "1"; } catch { return false; } };
export const setPrivyMuted = (v: boolean) => { try { if (v) localStorage.setItem(OFF, "1"); else localStorage.removeItem(OFF); } catch { /* storage blocked */ } };
