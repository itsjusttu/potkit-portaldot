// Dependency-free so it can be unit-tested against mock providers.
export const PORTALDOT_ADD_PARAMS = {
  chainId: `0x${(420420777).toString(16)}`,
  chainName: "Portaldot V3 Testnet",
  nativeCurrency: { name: "tPOTv3", symbol: "tPOTv3", decimals: 18 }, // wallets require 18
  rpcUrls: ["https://test-evm-rpc-v3.portaldot.dev"],
};

/** "Chain not added yet": 4902 (EIP-3085), -32603 wrapping 4902 (mobile MetaMask), OKX/others' message variants. */
export function isUnknownChain(e: unknown): boolean {
  const x = e as { code?: number; data?: { originalError?: { code?: number } }; message?: string; cause?: unknown };
  const code = x?.code ?? x?.data?.originalError?.code;
  if (code === 4902 || code === 4901 || code === 5000 || code === -32603 && /4902|unrecognized|not added|unknown chain/i.test(String(x?.message))) return true;
  if (/unrecognized chain|not been added|not added|unknown chain|unsupported chain|chain.*not.*(found|exist|supported)|try adding/i.test(String(x?.message ?? ""))) return true;
  return x?.cause ? isUnknownChain(x.cause) : false;
}
export const isUserRejected = (e: unknown): boolean => {
  const x = e as { code?: number; message?: string; cause?: unknown };
  return x?.code === 4001 || /user rejected|user denied|cancel/i.test(String(x?.message ?? "")) || (x?.cause ? isUserRejected(x.cause) : false);
};

/** Switch first; add only if the wallet doesn't know the chain; then switch again. */
export async function switchToPortaldotWith(eth: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } | null = null) {
  if (!eth) throw new Error("No wallet selected. Click Connect wallet and pick one.");
  const sw = () => eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: PORTALDOT_ADD_PARAMS.chainId }] });
  try {
    await sw();
    return;
  } catch (e) {
    if (isUserRejected(e)) throw new Error("Network switch was cancelled in the wallet.");
    if (!isUnknownChain(e)) throw e;
  }
  try {
    await eth.request({ method: "wallet_addEthereumChain", params: [PORTALDOT_ADD_PARAMS] });
  } catch (e) {
    if (isUserRejected(e)) throw new Error("Adding Portaldot V3 was cancelled in the wallet.");
    throw e;
  }
  // some wallets (OKX, Rabby) add without switching
  await sw().catch((e) => { if (isUserRejected(e)) throw new Error("Network switch was cancelled in the wallet."); });
}

