/**
 * Vercel Function (Node runtime): GET /api/r?id=N[&kit=0x…] returns the ERC-721 metadata JSON of receipt N.
 * PotKit's on-chain tokenURI(id) is "https://potkit.pro/api/r?id=<id>": building JSON on-chain would cost
 * storage deposit on every deploy, so the JSON is rendered here instead — from chain state only, by running
 * the never-deployed Lens contract inside eth_call (no database, nothing cached beyond a short CDN TTL).
 * Env: VITE_KIT (or VITE_VAULT / VITE_RECEIPT), VITE_RPC_URL.
 */
import { createPublicClient, defineChain, http, isAddress } from "viem";
import { Lens } from "../src/generated/artifacts.js";

declare const process: { env: Record<string, string | undefined> };
export const config = { runtime: "nodejs" };

const env = process.env;
const RPC = (env.VITE_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev").split(",")[0].trim();
const KIT = [env.VITE_KIT, env.VITE_VAULT, env.VITE_RECEIPT].map((v) => (v ?? "").trim()).find(Boolean) ?? "";
const portaldot = defineChain({ id: 420420777, name: "Portaldot V3 Testnet", nativeCurrency: { name: "tPOTv3", symbol: "tPOTv3", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain: portaldot, transport: http(RPC, { timeout: 15_000, retryCount: 1 }) });

const SITE = (env.VITE_SITE_URL || "https://potkit.pro").trim().replace(/\/+$/, "");
/** Adds an `image` to the Lens JSON (wallets / marketplaces show it). Falls back to the untouched JSON on any problem. */
function withImage(json: string, site = SITE): string {
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    if (!o.image) o.image = `${site}/og.png`;
    return JSON.stringify(o);
  } catch { return json; }
}

const reply = (status: number, body: unknown, ttl = 0) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": ttl ? `public, s-maxage=${ttl}` : "no-store" },
  });

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = q.get("id") ?? "";
  const kit = q.get("kit") || KIT;
  if (!/^\d{1,15}$/.test(id) || id === "0") return reply(400, { error: "bad_id" });
  if (!isAddress(kit)) return reply(503, { error: "not_configured", message: "Set VITE_KIT to the PotKit address." });
  try {
    const json = await pub.readContract({ abi: Lens.abi, code: Lens.bytecode, functionName: "tokenJson", args: [kit, BigInt(id)] } as never);
    return reply(200, withImage(json as string), 60);
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    return /no token|reverted/i.test(m) ? reply(404, { error: "no_token" }) : reply(502, { error: "rpc", message: m.slice(0, 200) });
  }
}
