// Compiles the contracts with solc-js (pinned in package.json) and writes
//   src/generated/artifacts.ts   (typed ABI + bytecode for the frontend)
//   src/generated/artifacts.json (same, for node tests and scripts)
//
// PotKit.yul is the only contract that gets deployed. Its ABI comes from contracts/IPotKit.sol
// (IPotKit + IFraction). Lens.sol is never deployed (it runs inside eth_call).
import solc from "solc";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { yulPrep } from "./yulprep.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "contracts");

function compile(input) {
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  let failed = false;
  for (const e of out.errors ?? []) {
    console.error(e.formattedMessage);
    if (e.severity === "error") failed = true;
  }
  if (failed) process.exit(1);
  return out;
}

// --- PotKit.yul -------------------------------------------------------------------------------
// Portaldot (pallet-revive) charges a storage deposit for every byte of deployed code, so we optimise
// for SIZE. The Yul is hand-tuned; the optimizer only prunes ("u") and runs the EVM peephole optimizer:
// solc's inliner makes this contract ~2x bigger.
const { src: yul, codes: REASON_CODES } = yulPrep(readFileSync(join(dir, "PotKit.yul"), "utf8"));
const compileYul = (content) => compile({
  language: "Yul",
  sources: { "PotKit.yul": { content } },
  settings: {
    optimizer: { enabled: true, runs: 1, details: { yul: true, yulDetails: { optimizerSteps: "u:" } } },
    evmVersion: "paris", // no PUSH0: safest on young EVM-compatible chains
    outputSelection: { "*": { "*": ["evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
}).contracts["PotKit.yul"].PotKit;
const pk = compileYul(yul);

// Testnet variant: the grace period after settlement (4 fixed data bytes at the end of the runtime) is 600 s
// (10 minutes) instead of 30 days, so a testnet run can check both sides of it. Nothing else may differ: the
// source changes only in that data line, and the bytecode only in those 4 bytes (checked here, the build stops
// otherwise). Only the 30-day build goes into the app bundle; the variant is in artifacts.json for tests and
// the testnet helper page.
const GRACE_MAIN = 'data "grace" hex"00278d00"'; // 2,592,000 s = 30 days
const GRACE_TEST = 'data "grace" hex"00000258"'; // 600 s = 10 minutes
if (yul.split(GRACE_MAIN).length !== 2) throw new Error("PotKit.yul must contain the 30-day grace data line exactly once");
const pkTest = compileYul(yul.replace(GRACE_MAIN, GRACE_TEST));
function onlyGraceDiffers(a, b) {
  if (a.length !== b.length) return false;
  const diff = [];
  for (let i = 0; i < a.length; i += 2) if (a.slice(i, i + 2) !== b.slice(i, i + 2)) diff.push(i / 2);
  const at = a.lastIndexOf("00278d00") / 2; // the data item sits at the end of the runtime
  return diff.length > 0 && diff.every((i) => i >= at && i < at + 4) && b.slice(at * 2, at * 2 + 8) === "00000258";
}
if (!onlyGraceDiffers(pk.evm.deployedBytecode.object, pkTest.evm.deployedBytecode.object) || !onlyGraceDiffers(pk.evm.bytecode.object, pkTest.evm.bytecode.object))
  throw new Error("the 10-minute PotKit build differs from the 30-day build in more than the grace constant");

// --- Solidity: interfaces (ABI), Lens, test helpers ------------------------------------------------
const sources = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sol"))) sources[f] = { content: readFileSync(join(dir, f), "utf8") };
for (const f of readdirSync(join(dir, "test")).filter((f) => f.endsWith(".sol"))) sources[`test/${f}`] = { content: readFileSync(join(dir, "test", f), "utf8") };
const so = compile({
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 1 },
    metadata: { appendCBOR: false },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
});

const result = {
  PotKit: { abi: so.contracts["IPotKit.sol"].IPotKit.abi, bytecode: `0x${pk.evm.bytecode.object}` },
  Fraction: { abi: so.contracts["IPotKit.sol"].IFraction.abi },
  Lens: { abi: so.contracts["Lens.sol"].Lens.abi, bytecode: `0x${so.contracts["Lens.sol"].Lens.evm.bytecode.object}` },
  REASON_CODES,
};
console.log(`PotKit: ${pk.evm.bytecode.object.length / 2} bytes initcode, ${pk.evm.deployedBytecode.object.length / 2} bytes runtime (grace 30 days; the 10-minute testnet build differs only in those 4 bytes)`);
console.log(`Lens (never deployed): ${so.contracts["Lens.sol"].Lens.evm.bytecode.object.length / 2} bytes`);

mkdirSync(join(root, "src/generated"), { recursive: true });
const forTests = { ...result, PotKitGrace10m: { bytecode: `0x${pkTest.evm.bytecode.object}`, runtime: `0x${pkTest.evm.deployedBytecode.object}` }, PotKitRuntime: `0x${pk.evm.deployedBytecode.object}`, TestReceiver: { abi: so.contracts["test/TestReceiver.sol"].TestReceiver.abi, bytecode: `0x${so.contracts["test/TestReceiver.sol"].TestReceiver.evm.bytecode.object}` } };
writeFileSync(join(root, "src/generated/artifacts.json"), JSON.stringify(forTests));
let ts = "// generated by scripts/compile.mjs — do not edit\n";
for (const [n, v] of Object.entries(result)) ts += `export const ${n} = ${JSON.stringify(v)} as const;\n`;
writeFileSync(join(root, "src/generated/artifacts.ts"), ts);
