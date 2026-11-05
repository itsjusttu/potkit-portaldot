import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { rememberedId, select, selected, type WalletOption } from "../lib/wallets";
import { anyWallet, connect, disconnectWallet, ethereum, explain, inFrame, portaldot, short, silentAccount, walletChainId } from "../lib/chain";
import { toast } from "../AppUi";
import { useWallets } from "../WalletUi";
import { onPrivy, openPrivy, privyMuted, privyOn, privySettled, privyWasUsed, setPrivyMuted, type PrivyPick } from "../lib/privyBus";

/** Pauses (ms) before each re-ask of a remembered wallet that has not given an account yet; stops at the first account. */
const RESTORE_RETRY_MS = [500, 1500, 3500, 7000];

/** One explicit wallet state instead of several loose booleans. Priority: connecting > ready/wrong-network > no-wallet > disconnected. */
export type WalletStatus = "no-wallet" | "disconnected" | "connecting" | "wrong-network" | "ready";

/**
 * Owns everything about the wallet connection: provider discovery, silent restore, account/network
 * following, the picker modal and connect/disconnect. App only reads `status` and calls the actions.
 */
export function useWalletStatus() {
  const wallets = useWallets();
  const [account, setAccount] = useState<Address | "">("");
  const [chainOk, setChainOk] = useState<boolean | null>(null);
  const [picker, setPicker] = useState(false);
  const [picking, setPicking] = useState("");
  const [walletId, setWalletId] = useState<string>(() => rememberedId() ?? "");
  const [tick, setTick] = useState(0); // bumps whenever the active provider changes
  const embedded = inFrame();

  // with Privy (VITE_PRIVY_APP_ID set) the wallet Privy has connected becomes the active provider; Privy restores it after a reload
  const privyMode = privyOn();
  const [privyPick, setPrivyPick] = useState<PrivyPick>(null);
  // after a reload, show "connecting" until Privy has restored (or not) the wallet used last time; never longer than 8 s
  const [privyWaiting, setPrivyWaiting] = useState(() => privyMode && privyWasUsed() && !privyMuted() && !privySettled());
  useEffect(() => { if (!privyWaiting) return; const t = setTimeout(() => setPrivyWaiting(false), 8000); return () => clearTimeout(t); }, [privyWaiting]);
  useEffect(() => {
    if (!privyMode) return;
    return onPrivy((w) => {
      if (privySettled()) setPrivyWaiting(false);
      setPrivyPick(w);
      if (w) { select({ id: "privy", name: w.name, icon: w.icon, badge: { letter: w.name.slice(0, 1).toUpperCase(), bg: "#16233B", fg: "#fff" }, provider: w.provider, via: "eip6963" }); setWalletId("privy"); }
      else if (selected()?.id === "privy") select(null);
      setTick((t) => t + 1);
    });
  }, [privyMode]);

  // restore the remembered wallet as soon as its provider announces itself
  useEffect(() => {
    if (privyMode || selected() || !walletId) return;
    const w = wallets.find((x) => x.id === walletId && x.provider);
    if (w) { select(w); setTick((t) => t + 1); }
  }, [wallets, walletId]);

  // follow account / network changes of the active provider
  useEffect(() => {
    const eth = ethereum();
    if (!eth) { setAccount(""); setChainOk(null); return; }
    let dead = false, got = false;
    const sync = async () => {
      const acc = await silentAccount().catch(() => null);
      if (acc === null) return; // the wallet did not answer (an extension can still be waking up): keep what is shown, a retry follows
      const ok = acc ? (await walletChainId().catch(() => 0)) === portaldot.id : null;
      if (dead) return; // a newer provider or unmount superseded this read
      got = Boolean(acc);
      setAccount(acc); setChainOk(ok);
    };
    void sync();
    // A wallet the user connected before can fail or answer with no account on the first calls after a reload, so ask again a few times
    const retries = rememberedId() ? RESTORE_RETRY_MS.map((ms) => setTimeout(() => { if (!dead && !got) void sync(); }, ms)) : [];
    const onFocus = () => { if (!dead && !got && rememberedId()) void sync(); }; // coming back to the tab is another natural moment to ask
    window.addEventListener("focus", onFocus);
    eth.on?.("accountsChanged", sync); eth.on?.("chainChanged", sync);
    return () => { dead = true; retries.forEach(clearTimeout); window.removeEventListener("focus", onFocus); eth.removeListener?.("accountsChanged", sync); eth.removeListener?.("chainChanged", sync); };
  }, [tick]);

  const noWallet = embedded || (!anyWallet() && !wallets.some((w) => w.provider));
  const status: WalletStatus = useMemo(() => {
    if (picking) return "connecting";
    if (account) return chainOk === null ? "connecting" : chainOk ? "ready" : "wrong-network";
    if (privyWaiting) return "connecting";
    return noWallet ? "no-wallet" : "disconnected";
  }, [picking, account, chainOk, noWallet, privyWaiting]);

  const open = useCallback(() => { if (embedded) return; if (privyMode) { setPrivyMuted(false); if (openPrivy()) return; } setPicker(true); }, [embedded, privyMode]);
  const close = useCallback(() => setPicker(false), []);

  const pick = useCallback(async (w: WalletOption) => {
    const prev = selected(); select(w); setPicking(w.id);
    try {
      const acc = await connect();
      setWalletId(w.id); setTick((t) => t + 1); setAccount(acc);
      setChainOk((await walletChainId()) === portaldot.id); setPicker(false);
      toast({ kind: "ok", title: `Connected with ${w.name}`, detail: short(acc) });
    } catch (e) {
      select(prev); setTick((t) => t + 1);
      toast({ kind: "err", title: `${w.name} did not connect`, detail: explain(e) });
    } finally { setPicking(""); }
  }, []);

  const disconnect = useCallback(async () => {
    const name = selected()?.name ?? "wallet";
    if (privyMode) { setPrivyMuted(true); privyPick?.disconnect(); }
    await disconnectWallet(); select(null); setWalletId(""); setTick((t) => t + 1);
    toast({ kind: "ok", title: "Disconnected", detail: `${name} is no longer used by PotKit.` });
  }, [privyMode, privyPick]);

  /** re-read the chain id after a wallet_switchEthereumChain */
  const recheckChain = useCallback(async () => { setChainOk((await walletChainId()) === portaldot.id); }, []);

  return { wallets, account, chainOk, status, restoring: privyWaiting && !account, noWallet, embedded, picker, picking, tick, open, close, pick, disconnect, recheckChain };
}
