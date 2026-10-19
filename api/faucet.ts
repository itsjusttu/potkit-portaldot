/**
 * Vercel Function (Node runtime): POST /api/faucet {address} sends test gas; GET returns status.
 * Env (server-only, never VITE_): FAUCET_PRIVATE_KEY, FAUCET_AMOUNT (default 0.5), FAUCET_THRESHOLD,
 * FAUCET_MAX_PER_HOUR (default 30), FAUCET_RPC_URL || VITE_RPC_URL, and optionally
 * KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN for shared rate limits.
 */
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, clientIp, kvStore, memoryStore, readConfig, request, status, type Chain, type Reply, type Store } from "./_faucet-core.js";

declare const process: { env: Record<string, string | undefined> };
export const config = { runtime: "nodejs" };

const env = process.env;
const RPC = (env.FAUCET_RPC_URL || env.VITE_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev").split(",")[0].trim();
const portaldot = defineChain({ id: CHAIN_ID, name: "Portaldot V3 Testnet", nativeCurrency: { name: "tPOTv3", symbol: "tPOTv3", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });

const cfg = readConfig(env);
let chain: Chain | null = null;
if (cfg.enabled) {
  const pk = env.FAUCET_PRIVATE_KEY!.trim();
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`);
  const transport = http(RPC, { timeout: 15_000, retryCount: 1 });
  const pub = createPublicClient({ chain: portaldot, transport });
  const wallet = createWalletClient({ chain: portaldot, transport, account });
  const fee = async () => {
    const [gas, price] = await Promise.all([
      pub.estimateGas({ account, to: account.address, value: 1n }).catch(() => 21_000n),
      pub.getGasPrice(),
    ]);
    return { gas: (gas * 3n) / 2n + 10_000n, price: (price * 3n) / 2n }; // 50% buffer on both
  };
  chain = {
    faucetAddress: account.address,
    getBalance: (a) => pub.getBalance({ address: a as `0x${string}` }),
    feeBuffer: async () => { const f = await fee(); return f.gas * f.price; },
    send: async (to, value) => { const f = await fee(); return wallet.sendTransaction({ to: to as `0x${string}`, value, gas: f.gas, gasPrice: f.price }); },
  };
}
const kvUrl = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL, kvTok = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
const store: Store = kvUrl && kvTok ? kvStore(kvUrl, kvTok) : memoryStore();

const json = (r: Reply) => new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET(req: Request) {
  return json(await status(cfg, chain, new URL(req.url).searchParams.get("address")));
}
export async function POST(req: Request) {
  let body: unknown = {};
  try { body = await req.json(); } catch { /* handled as bad_address */ }
  try { return json(await request(cfg, chain, store, { body, ip: clientIp(req.headers) })); }
  catch (e) { return json({ status: 500, body: { ok: false, error: "internal", message: "Unexpected faucet error.", detail: String((e as Error)?.message ?? e).slice(0, 200) } }); }
}
