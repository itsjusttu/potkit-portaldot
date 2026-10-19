// Measures PotKit's real on-chain costs on Portaldot V3 without spending anything:
//   * deploy: eth_estimateGas of the PotKit deploy transaction
//   * demo flow: eth_estimateGas of scripts/measure/Harness.sol (which deploys PotKit and runs the first
//     n steps of the demo in its constructor) for n = 0..9; the differences are the per-step costs
//   * verification: eth_call of the same harness with steps = 99 returns what actually happened
// Usage: node scripts/measure.mjs [from-address]   (needs curl; from must hold ~0.05 tPOT for the value)
import solc from "solc";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeAbiParameters, decodeAbiParameters } from "viem";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.RPC ?? "https://test-evm-rpc-v3.portaldot.dev";
const FROM = process.argv[2] ?? "0xd1affc3b88e23bcbff209b36267744f8e2035bfb";
const rpc = (method, params) => {
  const out = execFileSync("curl", ["-s", "-X", "POST", "-H", "content-type: application/json", "--data-binary", "@-", RPC], { input: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), maxBuffer: 1 << 26 }).toString();
  const j = JSON.parse(out);
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 400));
  return j.result;
};
const A = JSON.parse(readFileSync(join(root, "src/generated/artifacts.json"), "utf8"));
const src = (p) => ({ content: readFileSync(join(root, p), "utf8") });
const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "scripts/measure/Harness.sol": src("scripts/measure/Harness.sol"), "contracts/IPotKit.sol": src("contracts/IPotKit.sol") },
  settings: { optimizer: { enabled: true, runs: 1 }, evmVersion: "paris", outputSelection: { "*": { "*": ["evm.bytecode.object"] } } },
}), { import: (p) => ({ contents: readFileSync(join(root, p), "utf8") }) }));
for (const e of out.errors ?? []) if (e.severity === "error") throw new Error(e.formattedMessage);
const H = "0x" + out.contracts["scripts/measure/Harness.sol"].Harness.evm.bytecode.object;
const gp = BigInt(rpc("eth_gasPrice", []));
const tpot = (g) => Number(g * gp) / 1e18;
const data = (steps) => H + encodeAbiParameters([{ type: "bytes" }, { type: "uint256" }], [A.PotKit.bytecode, BigInt(steps)]).slice(2);
const VALUE = "0x" + (5n * 10n ** 16n).toString(16); // 0.05 tPOT
const estimate = (tx) => BigInt(rpc("eth_estimateGas", [{ from: FROM, ...tx }]));

console.log(`gasPrice ${gp} wei; tPOT = gas * gasPrice / 1e18`);
const deploy = estimate({ data: A.PotKit.bytecode });
console.log(`PotKit deploy: ${tpot(deploy).toFixed(2)} tPOT (${(A.PotKit.bytecode.length - 2) / 2} bytes initcode)`);
const fresh = "0x" + [...Array(40)].map(() => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const transfer = estimate({ to: fresh, value: "0x" + (10n ** 18n).toString(16) });
console.log(`tPOT transfer to a fresh 2nd wallet: ${tpot(transfer).toFixed(2)} tPOT fee`);
const names = ["harness + PotKit + buyer", "mint (30-char note)", "fractionalize + terms (first lock: creates the share token)", "list", "buy (2nd wallet, native tPOT)", "settle (native tPOT)", "claim (seller)", "claim (buyer)", "redeem", "re-lock same receipt (reuses token)"];
let prev = 0n;
const steps = [];
for (let n = 0; n < names.length; n++) {
  const g = estimate({ data: data(n), value: VALUE });
  steps.push({ step: names[n], tpot: n ? tpot(g - prev) : tpot(g) });
  prev = g;
}
console.table(steps.map((s) => ({ step: s.step, tPOT: s.tpot.toFixed(2) })));
const flow = steps.slice(1, 9).reduce((a, s) => a + s.tpot, 0);
console.log(`demo flow (steps 1-8, storage + weight, without per-tx base fees): ${flow.toFixed(2)} tPOT`);
const v = rpc("eth_call", [{ from: FROM, data: data(99), value: VALUE }, "latest"]);
const [o, uri, name, symbol, buyerBal] = decodeAbiParameters([{ type: "uint256[16]" }, { type: "string" }, { type: "string" }, { type: "string" }, { type: "uint256" }], v);
console.log("verify (eth_call):", { sellerPaid: o[0], buyerShares: o[1], claimSeller: o[2], claimBuyer: o[3], redeemed: o[4], poolLeft: o[5], supplyAfter: o[6], tokenReused: o[7], potkitCode: o[8], tokenCode: o[9], oddWeiTransfer: o[10], oddClaim: o[11], uri, name, symbol, buyerBal });
console.log(JSON.stringify({ gasPrice: String(gp), deploy: tpot(deploy), transfer: tpot(transfer), steps }));
