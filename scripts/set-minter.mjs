// Issuer-only admin helper: allow-list (or remove) a minter on a PotKit deployment.
// Only the issuer (the deployer) can call setMinter, so a judge or tester who wants to mint on the shared kit has to be
// approved by the team. Default is a DRY RUN that only reads the chain; --send signs and broadcasts one transaction.
//
//   node scripts/set-minter.mjs 0xWallet                 dry run: who is the issuer, is 0xWallet a minter, calldata, estimated cost
//   node scripts/set-minter.mjs 0xWallet --send          approve 0xWallet (needs ISSUER_PRIVATE_KEY in the environment)
//   node scripts/set-minter.mjs 0xWallet --off --send    remove the approval again
//   options: --kit 0x…   (default: the deployed kit in the README; VITE_KIT is also honoured)
// The key is read from the process environment only (never from a file) and is never printed.
// A minter can only mint receipts; it cannot approve other wallets. Removing it does not remove receipts it already minted.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, encodeFunctionData, formatEther, getAddress, http, isAddress, keccak256, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const A = JSON.parse(readFileSync(new URL("../src/generated/artifacts.json", import.meta.url), "utf8"));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const usage = "Usage: node scripts/set-minter.mjs 0xWallet [--off] [--send] [--kit 0x…]";
const fail = (msg, code = 1) => { console.error(msg); process.exit(code); };
const looksAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(a ?? "");
const checked = (a, what) => { if (!looksAddress(a)) fail(`${what} is not a 40-hex-digit 0x address.\n${usage}`); if (!isAddress(a)) fail(`${what} has mixed upper and lower case that does not match its checksum: check it for typos.`); return getAddress(a); };

// the wallet is the one address that is not the value of --kit, so the order of the arguments does not matter
const unknown = args.filter((a) => a.startsWith("-") && !["--send", "--off", "--kit"].includes(a));
if (unknown.length) fail(`Unknown option ${unknown.join(", ")}.\n${usage}`);
const targets = args.filter((a, i) => !a.startsWith("-") && args[i - 1] !== "--kit");
if (targets.length !== 1) fail(usage);
if (flag("--kit") && !val("--kit")) fail(`--kit needs an address.\n${usage}`);
const want = !flag("--off");
const send = flag("--send");
const who = checked(targets[0], "The wallet");
const kit = checked(val("--kit") ?? process.env.VITE_KIT ?? "0x3c26351ad8b9dc7bb4f837c5b921879c35e20fb7", "The kit");
if (who === zeroAddress) fail("The zero address cannot be a minter.");

const RPC = (process.env.VITE_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev").split(",")[0].trim();
const chain = defineChain({ id: 420420777, name: "Portaldot V3 Testnet", nativeCurrency: { name: "tPOTv3", symbol: "tPOTv3", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const sym = chain.nativeCurrency.symbol;
const link = (b) => `https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/${b}`;

// refuse a wrong network or a mistyped kit before anything else, with a message that says what is wrong
const rpcChain = await pub.getChainId().catch(() => undefined);
if (rpcChain !== chain.id) fail(`${RPC} ${rpcChain === undefined ? "did not answer" : `is chain ${rpcChain}`}; expected ${chain.id} (Portaldot V3 Testnet). The RPC gateway sometimes returns a transient error: try again.`);
const code = await pub.getCode({ address: kit });
if (!code || code === "0x") fail(`No contract at ${kit} on this network. Check the address or --kit.`);

// the minter flag lives at keccak256(abi.encode(who, 6)) (see the storage map in contracts/PotKit.yul); peek reads raw slots
const isMinter = async () => {
  const slot = BigInt(keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [BigInt(who), 6n])));
  const [v] = await pub.readContract({ address: kit, abi: A.PotKit.abi, functionName: "peek", args: [[slot]] });
  return v === 1n;
};
const issuer = getAddress(await pub.readContract({ address: kit, abi: A.PotKit.abi, functionName: "issuer" }));
const now = await isMinter();
const data = encodeFunctionData({ abi: A.PotKit.abi, functionName: "setMinter", args: [who, want] });

console.log(`chain      ${chain.id} via ${RPC}`);
console.log(`kit        ${kit}`);
console.log(`issuer     ${issuer}   (only this address can call setMinter)`);
console.log(`wallet     ${who}   minter now: ${now}   wanted: ${want}`);
console.log(`calldata   ${data}`);
if (who === issuer) { console.log("This wallet is the issuer, which can always mint: no approval is needed or possible."); process.exit(0); }
if (now === want) { console.log("Nothing to do: the wallet is already in the wanted state."); process.exit(0); }

// simulate from the issuer's address (no key needed): the estimate includes the storage deposit for a new slot
const gasPrice = await pub.getGasPrice();
const balance = await pub.getBalance({ address: issuer });
const est = await pub.estimateGas({ account: issuer, to: kit, data }).catch((e) => { console.log(`estimate   unavailable (${String(e.shortMessage ?? e.message).split("\n")[0].slice(0, 100)})`); return undefined; });
if (est !== undefined) console.log(`estimate   about ${formatEther(est * gasPrice)} ${sym} (gas ${est}); issuer balance ${formatEther(balance)} ${sym}`);
if (!send) { console.log("\nDRY RUN. Add --send (with ISSUER_PRIVATE_KEY set in the environment) to broadcast this transaction."); process.exit(0); }

const key = (process.env.ISSUER_PRIVATE_KEY ?? "").trim();
if (!/^(0x)?[0-9a-fA-F]{64}$/.test(key)) fail("ISSUER_PRIVATE_KEY is not set (or is malformed). Set it in the environment of this command only.");
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
if (account.address !== issuer) fail(`That key controls ${account.address}, not the issuer ${issuer}. The contract would revert with "not issuer".`);
if (est === undefined) fail("The simulation failed, so the transaction would probably revert. Nothing was sent.");

// Portaldot's gas estimate includes the storage deposit and can come in slightly low: +20%, and the chain's own gas price with no tip
const gas = (est * 12n) / 10n;
if (balance < gas * gasPrice) fail(`The issuer has ${formatEther(balance)} ${sym}, less than the ${formatEther(gas * gasPrice)} ${sym} this transaction can cost. Nothing was sent.`);
const wal = createWalletClient({ account, chain, transport: http(RPC) });
const hash = await wal.sendTransaction({ to: kit, data, gas, maxFeePerGas: gasPrice, maxPriorityFeePerGas: 0n });
console.log(`sent       ${hash}`);
const rc = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 }).catch(() => undefined);
if (!rc) fail(`Not confirmed within 120 s. The transaction may still be included: run the dry run again to see the wallet's state (hash ${hash}).`, 2);
if (rc.status !== "success") fail(`Transaction reverted in block ${rc.blockNumber}.`);
console.log(`confirmed  block ${rc.blockNumber}${RPC.includes("portaldot.dev") ? "  " + link(rc.blockNumber) : ""}`);
// another node of the gateway can lag a moment behind the block that just confirmed
let after = await isMinter();
for (let i = 0; i < 5 && after !== want; i++) { await new Promise((r) => setTimeout(r, 2000)); after = await isMinter(); }
console.log(`minter now ${after}`);
if (after !== want) fail("The flag does not show the new value yet: run the dry run again in a minute.", 2);
