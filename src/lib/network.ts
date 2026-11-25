// The network the app talks to, baked in at build time from VITE_* variables (see .env.example). Every default is the
// Portaldot V3 testnet, so a build without these variables behaves exactly as before. Dependency-free on purpose:
// netswitch.ts, the landing chrome and node tests import it without pulling in viem.
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const val = (key: string, fallback: string) => (env[key] ?? "").trim() || fallback;

const id = Number(val("VITE_CHAIN_ID", "420420777"));
if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`VITE_CHAIN_ID must be a positive integer, got "${env.VITE_CHAIN_ID}"`);

export const NETWORK = {
  /** EVM chain id (VITE_CHAIN_ID) */
  id,
  /** name shown in the app and sent to wallets when adding the chain (VITE_CHAIN_NAME) */
  name: val("VITE_CHAIN_NAME", "Portaldot V3 Testnet"),
  /** symbol of the native gas token as wallets show it (VITE_NATIVE_SYMBOL); always 18 decimals on the EVM side */
  symbol: val("VITE_NATIVE_SYMBOL", "tPOTv3"),
  /** JSON-RPC URLs from VITE_RPC_URL (comma-separated list allowed); the first one is the primary */
  rpcUrls: val("VITE_RPC_URL", "https://test-evm-rpc-v3.portaldot.dev").split(",").map((u) => u.trim()).filter(Boolean),
} as const;
