import type { Address, Hash } from "viem";
import type { TxPhase } from "../hooks/useTx";
import type { Addrs, ChainEvent, DeployStep, Listing, Row } from "../lib/chain";

export type Tab = "dashboard" | "issue" | "trade" | "portfolio" | "explore" | "verify" | "history" | "profile";
export const TABS: Tab[] = ["dashboard", "issue", "trade", "portfolio", "explore", "verify", "history"];
export type Log = { at: string; action: string; detail: string; hash?: Hash };

export type Ctx = {
  account: Address | ""; chainOk: boolean | null; gated: boolean; busy: string; phase: TxPhase;
  addrs: Addrs | null; setAddrs: (a: Addrs | null) => void; shared: boolean;
  /** payment token: always NATIVE (tPOT); market: the PotKit contract (same as addrs.vault) */
  usd: Address | ""; market: Address | "";
  rows: Row[]; held: Map<number, bigint>; claims: Map<number, bigint>; listings: Listing[];
  events: ChainEvent[]; eventsLoading: boolean; loading: boolean; eventsOk: boolean;
  total: number; loadOlder: () => void; saveStep: (s: DeployStep) => void; resetDeployment: () => void;
    /** usdBal / usdRaw: the wallet's tPOT balance (what settlement and market payments use) */
  canMint: boolean; issuer: string; usdBal: string; usdRaw: bigint; native: bigint | null; nativeLoading: boolean; nativeError: boolean;
  log: Log[]; note: (action: string, detail: string, hash?: Hash) => void;
  run: (label: string, job: () => Promise<void>) => Promise<void>; ready: () => Address; refresh: () => Promise<void>;
  setTab: (t: Tab, params?: Record<string, string>) => void; connect: () => void; judgeLink: string;
  switchNetwork: () => void;
  walletName: string; openPay: (id: number) => void; param: (k: string) => string;
};

/** face value per whole share, in wei of tPOT */
export const faceShare = (r: Row) => (r.settle.faceValue > 0n && r.supply > 0n ? (r.settle.faceValue * 10n ** 18n) / r.supply : 0n);
export const daysTo = (ts: number) => (ts ? (ts * 1000 - Date.now()) / 86_400_000 : 0);
