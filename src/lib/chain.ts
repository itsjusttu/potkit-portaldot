import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  getAddress,
  encodeDeployData,
  fallback,
  http,
  isAddress,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hash,
} from "viem";
import { Fraction, Lens, PotKit, REASON_CODES } from "../generated/artifacts";
import { selectedProvider } from "./wallets";
import { backoffMs, isTransient, loadStep, onScanOk, onScanRefused, saveStep, SCAN_MIN, startScan, TRANSIENT_RETRIES } from "./scanstep";

const env = import.meta.env as Record<string, string | undefined>;
/** VITE_RPC_URL (primary) and optional VITE_RPC_URL2 (comma-separated lists allowed) — baked in at build time. */
export const RPC_URLS = [
  ...new Set(
    [env.VITE_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev", env.VITE_RPC_URL2 ?? ""]
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
const rpc = (url: string) => http(url, { retryCount: 3, retryDelay: 400, timeout: 20_000 });
const transport = RPC_URLS.length > 1 ? fallback(RPC_URLS.map(rpc)) : rpc(RPC_URLS[0]);
/** First block worth scanning for events (set after deploying; see .env.example). */
export const ENV_FROM_BLOCK = (env.VITE_FROM_BLOCK ?? "").trim();

export const portaldot = defineChain({
  id: 420420777,
  name: "Portaldot V3 Testnet",
  // The Substrate side of POT uses 14 decimals, but the Ethereum JSON-RPC adapter reports balances in
  // 18-decimal wei (like every EVM chain), and wallets refuse anything other than 18 here.
  nativeCurrency: { name: "tPOTv3", symbol: "tPOTv3", decimals: 18 },
  // VITE_RPC_URL overrides the RPC (used for local ganache screenshots / dev); defaults to the public testnet RPC.
  rpcUrls: { default: { http: RPC_URLS } },
});

export const CONSOLE = "https://node-console.portaldot.dev/";
export const GUIDE = "https://github.com/ItsCogumellum/portaldot-v3-testnet-guide";
export const KINDS = ["Invoice", "Content right", "Equipment"] as const;
export const ZERO = "0x0000000000000000000000000000000000000000";

type Eth = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (e: string, h: (...a: any[]) => void) => void;
  removeListener?: (e: string, h: (...a: any[]) => void) => void;
};

/** The provider of the wallet the user picked (see lib/wallets). Null until one is selected. */
export function ethereum(): Eth | null {
  return (selectedProvider() as Eth | null) ?? null;
}
/** Is any EVM wallet present in the browser at all? */
export const anyWallet = () => typeof window !== "undefined" && Boolean((window as unknown as { ethereum?: Eth }).ethereum);

export const inFrame = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/** Read-only client: talks to the RPC directly, never through the wallet, so judges can browse without one. */
const reader = createPublicClient({ chain: portaldot, transport, pollingInterval: 2_000 });
const MIN_VALID_BLOCK_TIME = Date.UTC(2020, 0, 1) / 1000;
let latestBlockClock: { number: bigint; timestamp: number; cachedAt: number } | undefined;
/** Estimate old block times from one recent block; old Portaldot testnet state may be pruned. */
export async function estimateBlockTimestamps(blockNumbers: bigint[]) {
  const result = new Map<bigint, number>();
  let clock = latestBlockClock;
  if (!clock || Date.now() - clock.cachedAt > 30_000) {
    const latest = await reader.getBlock().catch(() => null);
    const timestamp = latest ? Number(latest.timestamp) : 0;
    if (!latest || !Number.isFinite(timestamp) || timestamp < MIN_VALID_BLOCK_TIME || timestamp > Date.now() / 1000 + 3600) return result;
    clock = { number: latest.number, timestamp, cachedAt: Date.now() };
    latestBlockClock = clock;
  }
  for (const block of new Set(blockNumbers)) {
    if (block > clock.number) continue;
    const estimate = clock.timestamp - Number(clock.number - block) * 6;
    if (estimate >= MIN_VALID_BLOCK_TIME && estimate <= clock.timestamp) result.set(block, estimate);
  }
  return result;
}
const rawWallet = () => {
  const eth = ethereum();
  if (!eth) throw new Error("No wallet selected. Click Connect wallet and pick one.");
  return createWalletClient({ chain: portaldot, transport: custom(eth) });
};
/** Gas + fee plan for a write.
 *  - gas: +20% on top of the RPC's estimate (Portaldot's eth_estimateGas can come in slightly low). On Portaldot the
 *    estimate also covers the storage deposit, so the gas limit is worth hundreds of tPOT on a deploy: the buffer is
 *    capped so gas × fee + value never exceeds the sender's balance (a wallet / node rejects a tx whose *maximum*
 *    cost is above the balance, even though only the used gas is charged). Never below the raw estimate.
 *  - fee: we pass the chain's own gas price as maxFeePerGas with a zero tip. Left to itself a wallet adds its usual
 *    priority fee (e.g. 1.5 gwei) and a base-fee multiplier, which on Portaldot (base fee ≈ 39,000 wei) would show
 *    an absurd maximum fee and fail with "insufficient funds". Portaldot's base fee is constant. */
const KEEP = 10n ** 18n; // keep 1 tPOT of headroom (existential deposit + per-tx fee) when the buffer has to shrink
export function gasPlan(estimate: bigint, fee: bigint, balance: bigint | undefined, value = 0n): bigint {
  const want = (estimate * 12n) / 10n;
  if (balance === undefined || fee <= 0n) return want;
  const room = balance > value + KEEP ? (balance - value - KEEP) / fee : 0n;
  return want <= room ? want : room > estimate ? room : estimate;
}
async function feeFields(account: Address, estimate: bigint, value: bigint | undefined) {
  const [price, block, balance] = await Promise.all([
    reader.getGasPrice(),
    reader.getBlock().catch(() => undefined),
    reader.getBalance({ address: account }).catch(() => undefined),
  ]);
  const base = block?.baseFeePerGas ?? null;
  const fee = base !== null && base > price ? base : price;
  const gas = gasPlan(estimate, fee, balance, value ?? 0n);
  // Legacy (type 0) tx with an explicit gasPrice: some wallets (e.g. OKX) re-price EIP-1559 fields with their own
  // multiplier, which on Portaldot inflates the shown max fee past the balance. Portaldot's base fee is constant.
  return { gas, gasPrice: fee, type: "legacy" as const };
}
const accountOf = (a: unknown) => (typeof a === "string" ? a : (a as { address: Address }).address) as Address;
const wallet = () => {
  const w = rawWallet();
  return {
    requestAddresses: () => w.requestAddresses(),
    getChainId: () => w.getChainId(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeContract: async (args: any): Promise<Hash> => {
      const gas = await reader.estimateContractGas(args).catch(() => undefined);
      const fees = gas ? await feeFields(accountOf(args.account), gas, args.value).catch(() => ({})) : {};
      return w.writeContract({ ...args, ...fees });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deployContract: async (args: any): Promise<Hash> => {
      const data = encodeDeployData({ abi: args.abi, bytecode: args.bytecode, args: args.args ?? [] } as never);
      const gas = await reader.estimateGas({ account: args.account, data }).catch(() => undefined);
      const fees = gas ? await feeFields(accountOf(args.account), gas, 0n).catch(() => ({})) : {};
      return w.deployContract({ ...args, ...fees });
    },
  };
};

/** Batch reads run the Lens contract's bytecode inside eth_call ("deployless" read): it is never deployed,
 *  so these helpers add no code / storage deposit to the on-chain contracts. If the target has no code we
 *  rethrow as a "returned no data" error so isNoCode() / NO_CODE keep working for wrong addresses. */
async function lensRead<T>(functionName: string, args: readonly unknown[], target: Address): Promise<T> {
  try {
    return (await reader.readContract({ abi: Lens.abi, code: Lens.bytecode, functionName, args } as never)) as T;
  } catch (e) {
    const code = await reader.getCode({ address: target }).catch(() => "0x");
    if (!code || code === "0x") throw new Error(`${NO_CODE} (returned no data)`);
    throw e;
  }
}

export const addr = (v: string): Address | "" => (isAddress(v) ? getAddress(v) : "");
export const short = (v: string) => (v.length < 12 ? v : `${v.slice(0, 6)}…${v.slice(-4)}`);
export const units = (raw: bigint) => {
  const s = formatUnits(raw, 18);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};

/** Readable text for each PotKit revert reason. On-chain the reasons are one-letter Error(string) codes
 *  (to save code deposit); REASON_CODES (generated by scripts/compile.mjs) maps the codes back. */
const REASONS: Record<string, string> = {
  "not minter": "Only the issuer (or an approved minter) can mint receipts.",
  "not issuer": "Only the issuer can do that.",
  from: "You are not the owner of that receipt (or it is already locked).",
  auth: "You are not allowed to move that receipt.",
  "need all units": "You must hold every outstanding share to redeem (cancel your open listings first).",
  balance: "Not enough shares in your wallet.",
  "note length": "Note must be 1–140 characters.",
  kind: "Unknown receipt kind.",
  settled: "This invoice is already settled; its shares can no longer be listed or bought — claim your payout instead.",
  "not settled": "That receipt has not been settled yet.",
  "not locked": "That receipt is not locked into shares.",
  "no shares": "You hold no shares of that receipt.",
  "not depositor": "Only the depositor can redeem a fully claimed receipt.",
  "claim first": "Every share must be claimed before a settled receipt can be redeemed.",
  underpaid: "Amount is below the invoice face value.",
  amount: "Amount is out of range.",
  price: "Price is out of range.",
  allowance: "Token allowance too low.",
  "due date": "Due date must be in the future.",
  "own listing": "You cannot buy your own listing.",
  value: "The tPOT sent does not match the price; reload and try again.",
  "not seller": "Only the seller can cancel.",
  closed: "That listing is closed.",
  "no listing": "That listing does not exist.",
  "no token": "That receipt does not exist.",
  units: "Units must be between 1 and 1,000,000,000,000.",
  receiver: "The receiving contract does not accept ERC-721 receipts.",
  zero: "The zero address is not allowed.",
  pay: "The payout transfer failed.",
  clone: "Could not create the share token.",
};
const CODES = REASON_CODES as Record<string, string>;
/** the revert reason inside an error, decoded from PotKit's one-letter code when possible */
export function revertReason(error: unknown): string {
  let cur = error as { reason?: string; data?: { errorName?: string; args?: unknown[] }; cause?: unknown } | undefined;
  for (let i = 0; cur && i < 8; i++) {
    const r = cur.reason ?? (cur.data?.errorName === "Error" ? String(cur.data.args?.[0] ?? "") : "");
    if (r) return CODES[r] ?? r;
    cur = cur.cause as typeof cur;
  }
  const raw = `${(error as Error)?.message ?? ""} ${(error as { details?: string })?.details ?? ""}`;
  const m = raw.match(/(?:following reason:\s*|execution reverted:?\s*|revert(?:ed)?\s+)([A-Za-z])\s*(?:\n|$)/);
  return m ? CODES[m[1]] ?? "" : "";
}


/** Error that carries the hash of the transaction it belongs to, so the UI can show it. */
export class TxError extends Error {
  constructor(message: string, public hash: Hash, public cause?: unknown) { super(message); }
}
export const NO_CODE = "This address doesn't match this PotKit version or isn't deployed on this network.";
export const isNoCode = (e: unknown) => /returned no data|zero data/i.test(`${(e as Error)?.message ?? ""} ${(e as { shortMessage?: string })?.shortMessage ?? ""}`);

export function explain(error: unknown): string {
  const tx = error instanceof TxError ? ` · tx ${error.hash}` : "";
  return explainRaw(error instanceof TxError ? error.cause ?? error : error) + tx;
}
function explainRaw(error: unknown): string {
  if (error instanceof TxError) return error.message;
  if (isNoCode(error)) return NO_CODE;
  const e = error as { shortMessage?: string; message?: string; details?: string };
  const raw = `${e?.shortMessage ?? ""} ${e?.details ?? ""} ${e?.message ?? ""}`;
  if (/user rejected|user denied|rejected the request/i.test(raw)) return "Rejected in wallet.";
  if (/insufficient funds|gas required exceeds|lack of funds/i.test(raw))
    return "Not enough tPOTv3 for gas. Fund the mapped account, not the 0x address (see the banner above).";
  const why = revertReason(error);
  if (why && REASONS[why]) return REASONS[why];
  // our own input checks throw plain Errors whose text is already meant for the user
  if (error instanceof Error && error.constructor === Error && !e.shortMessage) return error.message;
  for (const [k, v] of Object.entries(REASONS)) if (raw.includes(`"${k}"`) || new RegExp(`: ${k}(?:\\s*$|\\n)`).test(raw)) return v;
  return (e?.shortMessage ?? e?.message ?? String(error)).replace(/\s+/g, " ").slice(0, 180);
}

// ---- wallet --------------------------------------------------------------
export async function connect() {
  const [account] = await wallet().requestAddresses();
  if (!account) throw new Error("Wallet returned no account");
  return account;
}
export async function silentAccount(): Promise<Address | ""> {
  const eth = ethereum();
  if (!eth) return "";
  const list = (await eth.request({ method: "eth_accounts" })) as string[];
  return list[0] ? getAddress(list[0]) : "";
}
export const walletChainId = () => wallet().getChainId();

import { switchToPortaldotWith } from "./netswitch";
export { PORTALDOT_ADD_PARAMS, isUnknownChain } from "./netswitch";
export const switchToPortaldot = () => switchToPortaldotWith(ethereum());

export async function disconnectWallet() {
  // EIP-2255 revoke (MetaMask & others); harmless if unsupported
  await ethereum()?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => {});
}

// ---- tx lifecycle events (UI toasts subscribe) -----------------------------
export type TxEvent = { hash: Hash; state: "pending" | "slow" | "confirmed" | "failed" };
const txListeners = new Set<(e: TxEvent) => void>();
export const onTx = (f: (e: TxEvent) => void) => { txListeners.add(f); return () => { txListeners.delete(f); }; };
const emitTx = (e: TxEvent) => txListeners.forEach((f) => f(e));

async function confirm(hash: Hash) {
  emitTx({ hash, state: "pending" });
  try {
    const r = await reader.waitForTransactionReceipt({ hash, pollingInterval: 2_000, timeout: 60_000 }).catch((e) => {
      if (!/timed? ?out|WaitForTransactionReceiptTimeout/i.test(`${(e as Error).name} ${(e as Error).message}`))
        throw new TxError("Could not confirm the transaction", hash, e);
      emitTx({ hash, state: "slow" });
      return reader.waitForTransactionReceipt({ hash, pollingInterval: 2_000, timeout: 600_000 }).catch((retryError) => {
        if (/timed? ?out|WaitForTransactionReceiptTimeout/i.test(`${(retryError as Error).name} ${(retryError as Error).message}`))
          throw new TxError("Still unconfirmed after 10 minutes — the testnet may be slow. Check the hash before retrying", hash);
        throw new TxError("Could not confirm the transaction", hash, retryError);
      });
    });
    if (r.status !== "success") throw new TxError("Transaction reverted on-chain", hash);
    emitTx({ hash, state: "confirmed" });
    return r;
  } catch (e) {
    emitTx({ hash, state: "failed" });
    throw e instanceof TxError ? e : new TxError("Transaction failed", hash, e);
  }
}

// ---- writes --------------------------------------------------------------
/** One contract does everything (receipts, vault, settlement pool, market): addrs.receipt === addrs.vault. */
export type DeployStep = { key: "kit"; address: Address; block: bigint; hash: Hash };
/** Pseudo-address for "native tPOT" as a payment token (settlement and market prices are in tPOT). */
export const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address;
export const PAY_SYMBOL = "tPOT";
export const PAY_DECIMALS = 18;

/** Deploys PotKit — one transaction. `onStep` fires as soon as it confirms (persist it!). */
export async function deployKit(account: Address, onStep?: (s: DeployStep) => void) {
  const h = await wallet().deployContract({ abi: PotKit.abi, bytecode: PotKit.bytecode, account, chain: portaldot });
  const r = await confirm(h);
  if (!r.contractAddress) throw new TxError("PotKit deploy returned no address", h);
  const kit = getAddress(r.contractAddress);
  onStep?.({ key: "kit", address: kit, block: r.blockNumber, hash: h });
  return { kit, hash: h };
}

export async function mint(account: Address, kit: Address, kind: number, note: string) {
  const hash = await wallet().writeContract({
    address: kit, abi: PotKit.abi, functionName: "mint", args: [account, kind, note], account, chain: portaldot,
  });
  const r = await confirm(hash);
  const log = parseEventLogs({ abi: PotKit.abi, logs: r.logs, eventName: "Transfer" }).find((l) => getAddress(l.address) === getAddress(kit));
  if (!log) throw new Error("Mint confirmed but no Transfer event found");
  return { hash, id: Number((log.args as { tokenId: bigint }).tokenId) };
}

/** Locks the receipt, sets its terms (face value in tPOT, optional due date) and issues the shares — one transaction. */
export async function fractionalize(account: Address, a: Addrs, id: number, supply: string, face: string, due?: Date) {
  const owner = await reader.readContract({ address: a.receipt, abi: PotKit.abi, functionName: "ownerOf", args: [BigInt(id)] });
  if (owner !== account) throw new Error("You are not the owner of that receipt.");
  const value = parseUnits(face, PAY_DECIMALS);
  if (value <= 0n) throw new Error("Enter a positive face value.");
  const dueTs = due ? BigInt(Math.floor(due.getTime() / 1000)) : 0n;
  const hash = await wallet().writeContract({
    address: a.vault, abi: PotKit.abi, functionName: "fractionalize", args: [BigInt(id), BigInt(supply), value, dueTs], account, chain: portaldot,
  });
  const r = await confirm(hash);
  const tokenLog = r.logs.find((l) => getAddress(l.address) !== getAddress(a.vault));
  return { hash, token: tokenLog ? getAddress(tokenLog.address) : undefined };
}

export async function transferUnits(account: Address, token: Address, to: string, amount: string) {
  if (!isAddress(to)) throw new Error("Recipient is not a valid 0x address.");
  if (getAddress(to) === account) throw new Error("Choose a different recipient.");
  const raw = parseUnits(amount, 18);
  const bal = await reader.readContract({ address: token, abi: Fraction.abi, functionName: "balanceOf", args: [account] });
  if (bal < raw) throw new Error(`You hold only ${units(bal)} units.`);
  const hash = await wallet().writeContract({ address: token, abi: Fraction.abi, functionName: "transfer", args: [getAddress(to), raw], account, chain: portaldot });
  await confirm(hash);
  return hash;
}

export async function redeem(account: Address, kit: Address, id: number) {
  const hash = await wallet().writeContract({ address: kit, abi: PotKit.abi, functionName: "redeem", args: [BigInt(id)], account, chain: portaldot });
  await confirm(hash);
  return hash;
}

// ---- settlement (native tPOT) ---------------------------------------------
export const fmt = (raw: bigint, decimals: number) => {
  const s = formatUnits(raw, decimals);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};
/** Payment token info. Settlement and market payments are native tPOT, so this is the wallet's tPOT balance. */
export async function tokenInfo(_token: Address | "", who: Address | "") {
  const balance = who ? await reader.getBalance({ address: who }) : 0n;
  return { decimals: PAY_DECIMALS, symbol: PAY_SYMBOL, balance };
}

/** settle(id) with msg.value = amount tPOT (anyone can pay; at least the face value) */
export async function settle(account: Address, kit: Address, id: number, amount: string) {
  const raw = parseUnits(amount, PAY_DECIMALS);
  if (raw <= 0n) throw new Error("Enter a positive amount.");
  const balance = await reader.getBalance({ address: account });
  if (balance < raw) throw new Error(`Not enough tPOT: paying ${fmt(raw, PAY_DECIMALS)} ${PAY_SYMBOL} needs more than your balance of ${fmt(balance, PAY_DECIMALS)} ${PAY_SYMBOL} (plus gas: on Portaldot settling also locks a ~4 tPOT storage deposit).`);
  const hash = await wallet().writeContract({ address: kit, abi: PotKit.abi, functionName: "settle", args: [BigInt(id)], value: raw, account, chain: portaldot });
  await confirm(hash);
  return hash;
}

export async function claim(account: Address, kit: Address, id: number) {
  const hash = await wallet().writeContract({ address: kit, abi: PotKit.abi, functionName: "claim", args: [BigInt(id)], account, chain: portaldot });
  await confirm(hash);
  return hash;
}

// ---- market (native tPOT) ---------------------------------------------------
export type Listing = {
  lid: number; seller: Address; fraction: Address; payToken: Address; price: bigint; remaining: bigint; receiptId: number;
};
export const listingCount = async (kit: Address) => Number(await lensRead<bigint>("listingCount", [kit], kit));
export async function loadListings(kit: Address): Promise<Listing[]> {
  const n = await listingCount(kit);
  const out: Listing[] = [];
  for (let start = Math.max(0, n - 200); start < n; start += 50) {
    const ls = await lensRead<readonly LensListing[]>("listings", [kit, BigInt(start), 50n], kit);
    ls.forEach((l, i) => out.push({ ...l, lid: start + i, receiptId: Number(l.receiptId) }));
  }
  return out.reverse();
}
/** what buy() must be sent: ceil(price * amount / 1e18) */
export const listingCost = (price: bigint, amount: bigint) => (price * amount + 10n ** 18n - 1n) / 10n ** 18n;
/** price is tPOT per whole share (decimal string); amount is shares (decimal string). One transaction: the
 *  shares move into escrow inside PotKit, no token approval needed. */
export async function listShares(account: Address, kit: Address, receiptId: number, fraction: Address, price: string, amount: string) {
  const raw = parseUnits(amount, 18);
  const bal = await reader.readContract({ address: fraction, abi: Fraction.abi, functionName: "balanceOf", args: [account] });
  if (bal < raw) throw new Error(`You hold only ${units(bal)} units.`);
  const hash = await wallet().writeContract({ address: kit, abi: PotKit.abi, functionName: "list", args: [BigInt(receiptId), parseUnits(price, PAY_DECIMALS), raw], account, chain: portaldot });
  await confirm(hash);
  return hash;
}
/** buy pays the exact tPOT cost as msg.value; the seller is paid in the same transaction */
export async function buyShares(account: Address, kit: Address, l: Listing, amount: string) {
  const raw = parseUnits(amount, 18);
  if (raw <= 0n || raw > l.remaining) throw new Error(`Enter between 0 and ${units(l.remaining)} shares.`);
  const cost = listingCost(l.price, raw);
  const balance = await reader.getBalance({ address: account });
  if (balance < cost) throw new Error(`That costs ${fmt(cost, PAY_DECIMALS)} ${PAY_SYMBOL}; you hold ${fmt(balance, PAY_DECIMALS)}.`);
  const hash = await wallet().writeContract({ address: kit, abi: PotKit.abi, functionName: "buy", args: [BigInt(l.lid), raw], value: cost, account, chain: portaldot });
  await confirm(hash);
  return hash;
}
export async function cancelListing(account: Address, kit: Address, lid: number) {
  const hash = await wallet().writeContract({ address: kit, abi: PotKit.abi, functionName: "cancel", args: [BigInt(lid)], account, chain: portaldot });
  await confirm(hash);
  return hash;
}

// ---- reads (work without a wallet) ----------------------------------------
/** receipt and vault are the same PotKit contract (kept as two fields so the UI reads naturally) */
export type Addrs = { receipt: Address; vault: Address };
export const kitAddrs = (kit: Address): Addrs => ({ receipt: kit, vault: kit });
export type Row = {
  id: number; owner: Address; kind: number; note: string;
  fraction: Address | ""; depositor: Address | ""; supply: bigint;
  settle: Settle;
  status: Status; dueDate: number; // unix seconds, 0 = none
};
export const STATUSES = ["Free", "Pending", "Due soon", "Overdue", "Settled"] as const;
export type Status = (typeof STATUSES)[number];
export type Settle = {
  token: Address | ""; faceValue: bigint; settled: boolean; amount: bigint; supply: bigint; paidOut: bigint;
  decimals: number; symbol: string;
};

type LensRow = { id: bigint; owner: Address; kind: number; note: string; fraction: Address; depositor: Address; supply: bigint };
type LensListing = { seller: Address; fraction: Address; payToken: Address; price: bigint; remaining: bigint; receiptId: bigint };
type LensSettlement = { token: Address; faceValue: bigint; settled: boolean; amount: bigint; supply: bigint; paidOut: bigint };

export const receiptCount = async (kit: Address) => Number(await lensRead<bigint>("count", [kit], kit));

/** Reads a page of rows. Each row costs several internal calls, so a big page can exceed the RPC's eth_call
 *  gas cap; on failure we retry with smaller pages (20 → 10 → 5) and stitch them together. */
export async function loadRows(vault: Address, start = 0, limit = 20): Promise<Row[]> {
  let lastErr: unknown;
  for (const size of [...new Set([limit, 10, 5].filter((x) => x <= limit))]) {
    try {
      if (size === limit) return await loadRowsOnce(vault, start, limit);
      // same window, fetched in smaller chunks
      let from = start;
      const n = await receiptCount(vault);
      if (!from) from = Math.max(1, n - limit + 1);
      const end = Math.min(n, from + limit - 1);
      const out: Row[] = [];
      for (let s = from; s <= end; s += size) out.unshift(...(await loadRowsOnce(vault, s, Math.min(size, end - s + 1))));
      return out;
    } catch (e) {
      lastErr = e;
      if (isNoCode(e)) break; // wrong address: smaller pages will not help
    }
  }
  throw lastErr;
}

async function loadRowsOnce(vault: Address, start: number, limit: number): Promise<Row[]> {
  let from = start;
  if (!from) {
    const n = await receiptCount(vault);
    from = Math.max(1, n - limit + 1);
  }
  const win = [vault, BigInt(from), BigInt(limit)] as const;
  const [rows, sets, [st, dd]] = await Promise.all([
    lensRead<readonly LensRow[]>("rows", win, vault),
    lensRead<readonly LensSettlement[]>("settlements", win, vault),
    lensRead<readonly [readonly number[], readonly bigint[]]>("statuses", win, vault),
  ]);
  return rows
    .map((r, i) => ({
      id: Number(r.id), owner: r.owner, kind: r.kind, note: r.note,
      fraction: (r.fraction === ZERO ? "" : r.fraction) as Address | "",
      depositor: (r.depositor === ZERO ? "" : r.depositor) as Address | "",
      supply: r.supply,
      settle: {
        ...sets[i], token: (sets[i].token === ZERO ? "" : sets[i].token) as Address | "",
        decimals: PAY_DECIMALS, symbol: PAY_SYMBOL,
      },
      status: STATUSES[st[i]] ?? "Free", dueDate: Number(dd[i]),
    }))
    .reverse();
}

export async function loadBalances(vault: Address, who: Address, rows: Row[]) {
  const out = new Map<number, bigint>();
  if (!rows.length) return out;
  const lo = Math.min(...rows.map((r) => r.id));
  const hi = Math.max(...rows.map((r) => r.id));
  const bal = await lensRead<readonly bigint[]>("balances", [vault, who, BigInt(lo), BigInt(hi - lo + 1)], vault);
  bal.forEach((b, i) => out.set(lo + i, b));
  return out;
}

export async function loadClaimables(vault: Address, who: Address, rows: Row[]) {
  const out = new Map<number, bigint>();
  if (!rows.length) return out;
  const lo = Math.min(...rows.map((r) => r.id));
  const hi = Math.max(...rows.map((r) => r.id));
  const c = await lensRead<readonly bigint[]>("claimables", [vault, who, BigInt(lo), BigInt(hi - lo + 1)], vault);
  c.forEach((b, i) => out.set(lo + i, b));
  return out;
}

export async function loadMeta(kit: Address, who: Address | "") {
  const [issuer, canMint] = await lensRead<readonly [Address, boolean]>("meta", [kit, who || ZERO], kit);
  return { issuer, canMint };
}

/** ERC-721 metadata of a receipt. tokenURI() on-chain points at https://potkit.pro/api/r?id=…, which serves
 *  this same JSON; here we build it straight from chain state (Lens, in eth_call). */
export async function readTokenUri(kit: Address, id: number) {
  const [uri, json] = await Promise.all([
    reader.readContract({ address: kit, abi: PotKit.abi, functionName: "tokenURI", args: [BigInt(id)] }),
    lensRead<string>("tokenJson", [kit, BigInt(id)], kit),
  ]);
  return { uri, ...(JSON.parse(json) as { name: string; description: string; attributes: { trait_type: string; value: string }[] }) };
}

// ---- v17: native balance + on-chain event feed --------------------------------
export const nativeBalance = (who: Address) => reader.getBalance({ address: who });

export type ChainEvent = {
  kind: "mint" | "lock" | "terms" | "due" | "settle" | "claim" | "redeem" | "list" | "buy" | "cancel";
  hash: Hash; block: bigint; logIndex: number; time: number; // unix s (0 if unknown)
  timeApprox?: boolean;
  dueDate?: number;
  id: number; actors: Address[]; // everyone involved, for "mine" filtering
  amount?: bigint; value?: bigint; lid?: number; text: string;
};

/** Scans PotKit events from `fromBlock` (deploy block) — or the last `span` blocks if unknown — in chunks,
 *  because many RPCs cap the eth_getLogs block range. ok=false means some chunk could not be read.
 *  Everything PotKit does is one contract: receipt Transfer (mint) + one generic Activity event. */
export async function loadEvents(a: Addrs, _market: Address | "", listings: Listing[], fromBlockHint?: bigint, span = 50_000n): Promise<{ events: ChainEvent[]; ok: boolean }> {
  const latest = await reader.getBlockNumber();
  const fromBlock = fromBlockHint !== undefined && fromBlockHint <= latest ? fromBlockHint : latest > span ? latest - span : 0n;
  let ok = true;
  // Window size comes from ./scanstep: large by default, halved when the RPC refuses a range (and never grown back past
  // that size), retried with a backoff when the gateway fails transiently, and remembered for this browser session.
  const stepKey = `potkit.scanStep.v1:${RPC_URLS[0]}`;
  let scanState = startScan(loadStep(stepKey));
  async function scan<T>(get: (f: bigint, t: bigint) => Promise<T[]>): Promise<T[]> {
    const out: T[] = [];
    for (let f = fromBlock; f <= latest; ) {
      const t = f + scanState.step - 1n > latest ? latest : f + scanState.step - 1n;
      let attempt = 0;
      for (;;) {
        try {
          out.push(...(await get(f, t)));
          f = t + 1n;
          scanState = onScanOk(scanState);
          break;
        } catch (e) {
          if (isTransient(e)) {
            if (attempt < TRANSIENT_RETRIES) { await new Promise((r) => setTimeout(r, backoffMs(attempt++))); continue; }
            ok = false; f = t + 1n; break; // the gateway kept failing: skip this window and say the history is incomplete
          }
          if (scanState.step > SCAN_MIN) { scanState = onScanRefused(scanState); break; } // retry the same start with a smaller window
          ok = false; f = t + 1n; break;
        }
      }
    }
    return out;
  }
  type L = { eventName: string; args: Record<string, unknown>; transactionHash: Hash; blockNumber: bigint; logIndex: number };
  const logs = (await scan((f, t) => reader.getContractEvents({ address: a.vault, abi: PotKit.abi, fromBlock: f, toBlock: t }))) as unknown as L[];
  saveStep(stepKey, scanState.ceiling);
  // Reconstruct sellers from on-chain list events as well as the latest listing
  // snapshot. Closed or older listings may no longer be included in the snapshot.
  const sellerByLid = new Map<number, Address>(listings.map((l) => [l.lid, l.seller]));
  for (const l of logs) {
    if (l.eventName !== "Activity" || Number(l.args.kind) !== 6) continue;
    sellerByLid.set(Number(l.args.a as bigint), l.args.actor as Address);
  }
  const out: ChainEvent[] = [];
  const base = (l: L) => ({ hash: l.transactionHash, block: l.blockNumber ?? 0n, logIndex: l.logIndex ?? 0, time: 0 });
  for (const l of logs) {
    const x = l.args;
    if (l.eventName === "Transfer") {
      if (x.from === ZERO) out.push({ ...base(l), kind: "mint", id: Number(x.tokenId as bigint), actors: [x.to as Address], text: `Receipt #${x.tokenId} minted` });
      continue;
    }
    if (l.eventName !== "Activity") continue;
    const id = Number(x.id as bigint); const who = x.actor as Address; const k = Number(x.kind as bigint);
    const A = x.a as bigint, B = x.b as bigint, C = x.c as bigint;
    if (k === 1) {
      out.push({ ...base(l), kind: "lock", id, actors: [who], amount: A, text: `#${id} locked into ${A.toString()} shares` });
      out.push({ ...base(l), kind: "terms", id, actors: [who], value: B, dueDate: Number(C), text: `#${id} terms: ${fmt(B, PAY_DECIMALS)} ${PAY_SYMBOL}${C ? ` due ${new Date(Number(C) * 1000).toLocaleDateString()}` : ""}` });
    } else if (k === 2) out.push({ ...base(l), kind: "redeem", id, actors: [who], text: `#${id} redeemed` });
    else if (k === 4) out.push({ ...base(l), kind: "settle", id, actors: [who], value: A, text: `#${id} settled · ${fmt(A, PAY_DECIMALS)} ${PAY_SYMBOL} paid` });
    else if (k === 5) out.push({ ...base(l), kind: "claim", id, actors: [who], amount: A, value: B, text: `#${id} payout claimed` });
    else if (k === 6) out.push({ ...base(l), kind: "list", id, lid: Number(A), actors: [who], amount: C, value: B, text: `${units(C)} shares of #${id} listed` });
    else if (k === 7) {
      const seller = sellerByLid.get(Number(A));
      out.push({ ...base(l), kind: "buy", id, lid: Number(A), actors: [who, ...(seller ? [seller] : [])], amount: B, value: C, text: `${units(B)} shares of #${id} bought` });
    } else if (k === 8) out.push({ ...base(l), kind: "cancel", id, lid: Number(A), actors: [who], amount: B, text: `Listing ${A} cancelled` });
  }
  const seen = new Set<string>();
  for (let i = out.length - 1; i >= 0; i--) { const e = out[i]!; const k = `${e.hash}|${e.kind}|${e.id}|${e.lid ?? ""}|${e.amount ?? ""}|${e.value ?? ""}`; if (seen.has(k)) out.splice(i, 1); else seen.add(k); }
  out.sort((p, q) => (p.block === q.block ? q.logIndex - p.logIndex : p.block > q.block ? -1 : 1));
  const recent = out.slice(0, 200);
  const times = await estimateBlockTimestamps(recent.map((e) => e.block));
  recent.forEach((e) => { e.time = times.get(e.block) ?? 0; e.timeApprox = e.time > 0; });
  return { events: recent, ok };
}
export const formatNative = (v: bigint) => `${Number(formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 })} tPOTv3`;

// ---- B8: Portaldot (pallet-revive) H160 -> mapped Substrate account ----------
import { blake2b } from "@noble/hashes/blake2b";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(b: Uint8Array) {
  let n = 0n;
  for (const x of b) n = n * 256n + BigInt(x);
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of b) { if (x) break; s = "1" + s; }
  return s;
}
/** SS58 (prefix 42) of the account revive maps an Ethereum address to: the 20 bytes followed by 12 × 0xEE.
 *  Verified against the testnet guide: 0xf7eC65d1…4142 → 5Hfmuhj1AHrTBJiC9zUPnJo1cfG2G52LLMwofSigBnjtto8Y. */
export function mappedAddress(h160: string, prefix = 42): string {
  const hex = h160.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) throw new Error("Not a 0x address");
  const body = new Uint8Array(33);
  body[0] = prefix;
  for (let i = 0; i < 20; i++) body[1 + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  body.fill(0xee, 21);
  const pre = new TextEncoder().encode("SS58PRE");
  const msg = new Uint8Array(pre.length + body.length); msg.set(pre); msg.set(body, pre.length);
  const sum = blake2b(msg, { dkLen: 64 });
  const out = new Uint8Array(35); out.set(body); out[33] = sum[0]; out[34] = sum[1];
  return base58(out);
}
