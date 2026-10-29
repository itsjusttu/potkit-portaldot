import { createWalletClient, custom, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { portaldot, type Row } from "./chain";
import { selectedProvider } from "./wallets";
import { ackMessage, ackTypes } from "../tabs/insights";

/* Debtor acknowledgement: an off-chain EIP-712 signature (no gas, no contract change). It proves that a wallet
   signed "I acknowledge receipt #N with these terms"; it does not prove who controls that wallet in real life. */
const domain = (kit: Address) => ({ name: "PotKit Acknowledgement", version: "1", chainId: portaldot.id, verifyingContract: kit });

export async function signAck(account: Address, kit: Address, r: Row): Promise<Hex> {
  const provider = selectedProvider();
  if (!provider) throw new Error("Connect a wallet first.");
  const client = createWalletClient({ account, chain: portaldot, transport: custom(provider as Parameters<typeof custom>[0]) });
  return client.signTypedData({ account, domain: domain(kit), types: ackTypes, primaryType: "Acknowledge", message: ackMessage(r) });
}

/** True when `sig` was made by `by` over the receipt's current on-chain terms. */
export async function checkAck(kit: Address, r: Row, sig: Hex, by: Address): Promise<boolean> {
  try {
    const who = await recoverTypedDataAddress({ domain: domain(kit), types: ackTypes, primaryType: "Acknowledge", message: ackMessage(r), signature: sig });
    return who.toLowerCase() === by.toLowerCase();
  } catch { return false; }
}
