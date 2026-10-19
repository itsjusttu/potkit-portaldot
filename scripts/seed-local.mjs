// Seeds a local ganache (chain id 420420777, http://localhost:8545) with demo data for screenshots / local UI testing.
// Usage: start ganache with --chain.chainId 420420777 --wallet.deterministic, then `node scripts/seed-local.mjs`.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, parseEventLogs } from "viem";
const A = JSON.parse(readFileSync(new URL("../src/generated/artifacts.json", import.meta.url), "utf8"));
const chain = defineChain({ id: 420420777, name: "local", nativeCurrency: { name: "E", symbol: "E", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost:8545"] } } });
const pub = createPublicClient({ chain, transport: http() });
const wal = createWalletClient({ chain, transport: http() });
const [alice, bob, carol] = await wal.getAddresses();
const E18 = 10n ** 18n;
const ok = async (h) => { const r = await pub.waitForTransactionReceipt({ hash: h }); if (r.status !== "success") throw new Error("revert"); return r; };
const kit = getAddress((await ok(await wal.deployContract({ abi: A.PotKit.abi, bytecode: A.PotKit.bytecode, account: alice, gas: 8_000_000n }))).contractAddress);
const w = (fn, args, account = alice, value) => wal.writeContract({ address: kit, abi: A.PotKit.abi, functionName: fn, args, account, gas: 6_000_000n, ...(value ? { value } : {}) }).then(ok);
const now = async () => (await pub.getBlock()).timestamp;
async function mint(kind, note) { const r = await w("mint", [alice, kind, note]); return parseEventLogs({ abi: A.PotKit.abi, logs: r.logs, eventName: "Transfer" })[0].args.tokenId; }
async function lock(id, units, face, due = 0n) { const r = await w("fractionalize", [id, units, face, due]); return getAddress(r.logs.find((l) => getAddress(l.address) !== kit).address); }
// overdue invoice (due tomorrow, then time-warp 2 days)
const i1 = await mint(0, "Invoice 017 — brand identity"); await lock(i1, 1000n, 8n * E18, (await now()) + 86400n);
await pub.request({ method: "evm_increaseTime", params: [2 * 86400] }); await pub.request({ method: "evm_mine", params: [] });
// due soon + listed + partly bought (0.009 tPOT per share vs 0.01 face)
const i2 = await mint(0, "Invoice 042 — content delivery"); await lock(i2, 1000n, 10n * E18, (await now()) + 2n * 86400n);
await w("list", [i2, 9n * 10n ** 15n, 900n * E18]);
await w("buy", [0n, 300n * E18], bob, 27n * 10n ** 17n);
// pending (far due date) + listed
const i3 = await mint(1, "Clip rights — episode 3"); await lock(i3, 500n, 6n * E18, (await now()) + 30n * 86400n);
await w("list", [i3, 11n * 10n ** 15n, 200n * E18]);
// settled + partly claimed
const i4 = await mint(0, "Invoice 031 — UX audit"); const t4 = await lock(i4, 1000n, 12n * E18);
await wal.writeContract({ address: t4, abi: A.Fraction.abi, functionName: "transfer", args: [bob, 400n * E18], account: alice, gas: 6_000_000n }).then(ok);
await w("settle", [i4], carol, 12n * E18);
await w("claim", [i4], bob);
// free receipt
await mint(2, "Camera body — Sony A7 IV");
console.log(JSON.stringify({ kit, alice, bob }));
