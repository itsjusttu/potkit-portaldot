/**
 * PotKit test-gas faucet — pure logic (no imports) so it can be unit-tested with mocks.
 * The Vercel route (api/faucet.ts) wires this to viem + optional Upstash/Vercel KV.
 *
 * Units: the Portaldot V3 Ethereum JSON-RPC reports native balances in 18-decimal wei
 * (the Substrate side uses 14 decimals; the eth adapter scales). A native transfer to a 0x
 * address credits the account revive maps it to (20 bytes + 12×0xEE, the "5…" gas account).
 */

export const CHAIN_ID = 420420777;
export const DAY = 86_400;

export type Json = Record<string, unknown>;
export type Reply = { status: number; body: Json };

/** Minimal rate-limit store. `claim` atomically sets key if absent (true = claimed). */
export interface Store {
  claim(key: string, ttlSec: number): Promise<boolean>;
  release(key: string): Promise<void>;
  /** increment a counter that expires after ttlSec; returns the new value */
  incr(key: string, ttlSec: number): Promise<number>;
  readonly kind: "memory" | "kv";
}

export interface Chain {
  faucetAddress: string;
  getBalance(addr: string): Promise<bigint>;
  /** send `value` wei to `to`; returns tx hash. Must add its own gas buffer. */
  send(to: string, value: bigint): Promise<string>;
  /** worst-case fee for one transfer (gas × price with buffer), wei */
  feeBuffer(): Promise<bigint>;
}

export interface Config {
  enabled: boolean;
  amount: bigint;      // wei per request
  threshold: bigint;   // skip if recipient already has >= this
  perHour: number;     // global cap on sends per rolling hour bucket
  reason?: string;     // why disabled
}

const ADDR = /^0x[0-9a-fA-F]{40}$/;
export const isAddress = (a: unknown): a is string => typeof a === "string" && ADDR.test(a.trim());

/** Parse a decimal tPOTv3 amount ("0.5") into 18-dp wei without floating point. */
export function parseAmount(s: string | undefined, fallback: string): bigint {
  const v = (s ?? "").trim() || fallback;
  if (!/^\d+(\.\d{1,18})?$/.test(v)) throw new Error(`bad amount: ${v}`);
  const [i, f = ""] = v.split(".");
  return BigInt(i) * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
}
export const fmtWei = (w: bigint) => {
  const i = w / 10n ** 18n, f = (w % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "").slice(0, 4);
  return f ? `${i}.${f}` : `${i}`;
};

export function readConfig(env: Record<string, string | undefined>): Config {
  const amount = parseAmount(env.FAUCET_AMOUNT, "0.5");
  const threshold = env.FAUCET_THRESHOLD ? parseAmount(env.FAUCET_THRESHOLD, "0") : amount;
  const perHour = Math.max(1, Number(env.FAUCET_MAX_PER_HOUR) || 30);
  const key = (env.FAUCET_PRIVATE_KEY ?? "").trim();
  const ok = /^(0x)?[0-9a-fA-F]{64}$/.test(key);
  return { enabled: ok, amount, threshold, perHour, reason: ok ? undefined : key ? "FAUCET_PRIVATE_KEY is malformed" : "FAUCET_PRIVATE_KEY not set" };
}

const err = (status: number, code: string, message: string, extra: Json = {}): Reply => ({ status, body: { ok: false, error: code, message, ...extra } });
const isRpcDown = (e: unknown) => /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|timed? ?out|HTTP request failed|503|502|network/i.test(String((e as Error)?.message ?? e));

/** GET: public status for the UI. Optional ?address= adds the recipient's balance/eligibility. */
export async function status(cfg: Config, chain: Chain | null, address?: string | null): Promise<Reply> {
  const base = { ok: true, enabled: cfg.enabled, chainId: CHAIN_ID, amount: fmtWei(cfg.amount), amountWei: cfg.amount.toString(), threshold: fmtWei(cfg.threshold), symbol: "tPOTv3" };
  if (!cfg.enabled || !chain) return { status: 200, body: { ...base, enabled: false, reason: cfg.reason ?? "faucet disabled" } };
  try {
    const bal = await chain.getBalance(chain.faucetAddress);
    const body: Json = { ...base, address: chain.faucetAddress, balance: fmtWei(bal), empty: bal < cfg.amount };
    if (address && isAddress(address)) {
      const rb = await chain.getBalance(address.trim());
      body.recipient = { address: address.trim(), balance: fmtWei(rb), eligible: rb < cfg.threshold };
    }
    return { status: 200, body };
  } catch (e) {
    return err(502, "rpc_unavailable", "Portaldot RPC is not reachable right now. Try again in a minute.", { enabled: true, detail: String((e as Error)?.message ?? e).slice(0, 160) });
  }
}

/** POST {address, chainId?}: validate, check limits, send. */
export async function request(cfg: Config, chain: Chain | null, store: Store, input: { body: unknown; ip: string; now?: number }): Promise<Reply> {
  if (!cfg.enabled || !chain) return err(503, "faucet_disabled", "The faucet is not configured on this deployment.", { reason: cfg.reason });
  const b = (input.body && typeof input.body === "object" ? input.body : {}) as { address?: unknown; chainId?: unknown };
  if (!isAddress(b.address)) return err(400, "bad_address", "Send a 0x address (40 hex characters).");
  if (b.chainId !== undefined && Number(b.chainId) !== CHAIN_ID) return err(400, "wrong_chain", `This faucet only serves Portaldot V3 (chain ${CHAIN_ID}).`);
  const to = (b.address as string).trim();
  const addrKey = `faucet:addr:${to.toLowerCase()}`, ipKey = `faucet:ip:${input.ip || "unknown"}`;

  let recipientBal: bigint, faucetBal: bigint, fee: bigint;
  try {
    [recipientBal, faucetBal, fee] = await Promise.all([chain.getBalance(to), chain.getBalance(chain.faucetAddress), chain.feeBuffer()]);
  } catch (e) {
    return err(502, "rpc_unavailable", "Portaldot RPC is not reachable right now. Try again in a minute.");
  }
  if (recipientBal >= cfg.threshold) return err(409, "already_funded", `This address already has ${fmtWei(recipientBal)} tPOTv3 — enough gas for now.`, { balance: fmtWei(recipientBal) });
  if (faucetBal < cfg.amount + fee) return err(503, "faucet_empty", "The faucet is out of test gas. Please ask in the Portaldot Discord or try later.", { faucetBalance: fmtWei(faucetBal) });

  // rate limits: claim address + ip for 24h, then the global hourly bucket
  if (!(await store.claim(addrKey, DAY))) return err(429, "rate_limited", "This address already received test gas in the last 24 hours.", { scope: "address" });
  if (!(await store.claim(ipKey, DAY))) { await store.release(addrKey); return err(429, "rate_limited", "One request per network per 24 hours. Try again tomorrow.", { scope: "ip" }); }
  const hour = Math.floor((input.now ?? Date.now()) / 3_600_000);
  const n = await store.incr(`faucet:hour:${hour}`, 3600);
  if (n > cfg.perHour) { await store.release(addrKey); await store.release(ipKey); return err(429, "rate_limited", "The faucet is busy (hourly limit reached). Try again later.", { scope: "global" }); }

  try {
    const hash = await chain.send(to, cfg.amount);
    return { status: 200, body: { ok: true, hash, to, amount: fmtWei(cfg.amount), symbol: "tPOTv3", limiter: store.kind } };
  } catch (e) {
    await store.release(addrKey); await store.release(ipKey); // let them retry after a failed send
    const m = String((e as Error)?.message ?? e);
    if (/insufficient funds|lack of funds/i.test(m)) return err(503, "faucet_empty", "The faucet is out of test gas.");
    if (isRpcDown(e)) return err(502, "rpc_unavailable", "Portaldot RPC is not reachable right now. Try again in a minute.");
    return err(500, "send_failed", "The transfer could not be sent.", { detail: m.slice(0, 200) });
  }
}

/** Best-effort in-memory store (per warm serverless instance — NOT shared across instances). */
export function memoryStore(clock: () => number = Date.now): Store {
  const m = new Map<string, { v: number; exp: number }>();
  const live = (k: string) => { const e = m.get(k); if (e && e.exp <= clock()) { m.delete(k); return undefined; } return e; };
  return {
    kind: "memory",
    async claim(k, ttl) { if (live(k)) return false; m.set(k, { v: 1, exp: clock() + ttl * 1000 }); return true; },
    async release(k) { m.delete(k); },
    async incr(k, ttl) { const e = live(k); const v = (e?.v ?? 0) + 1; m.set(k, { v, exp: e?.exp ?? clock() + ttl * 1000 }); return v; },
  };
}

/** Upstash Redis / Vercel KV REST store (shared across instances). */
export function kvStore(url: string, token: string, f: typeof fetch = fetch): Store {
  const cmd = async (...args: (string | number)[]) => {
    const r = await f(url.replace(/\/$/, ""), { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(args.map(String)) });
    if (!r.ok) throw new Error(`kv ${r.status}`);
    return ((await r.json()) as { result: unknown }).result;
  };
  return {
    kind: "kv",
    async claim(k, ttl) { return (await cmd("SET", k, "1", "NX", "EX", ttl)) === "OK"; },
    async release(k) { await cmd("DEL", k); },
    async incr(k, ttl) { const v = Number(await cmd("INCR", k)); if (v === 1) await cmd("EXPIRE", k, ttl); return v; },
  };
}

/** Client IP from Vercel headers (first x-forwarded-for hop). */
export const clientIp = (h: { get(n: string): string | null }) => (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "").trim() || "unknown";
