// Compiles TinyReceiver.yul with the repo's solc and writes tiny-receiver.json (initcode + runtime) next to it.
import solc from "solc";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Yul",
  sources: { "TinyReceiver.yul": { content: readFileSync(join(here, "TinyReceiver.yul"), "utf8") } },
  settings: { evmVersion: "paris", optimizer: { enabled: true, details: { yul: true } }, // paris: no PUSH0, same as the PotKit build
    outputSelection: { "*": { "*": ["evm.bytecode.object", "evm.deployedBytecode.object"] } } },
})));
if (out.errors?.some((e) => e.severity === "error")) { console.error(out.errors); process.exit(1); }
const c = out.contracts["TinyReceiver.yul"].TinyReceiver;
const res = { initcode: `0x${c.evm.bytecode.object}`, runtime: `0x${c.evm.deployedBytecode.object}` };
writeFileSync(join(here, "tiny-receiver.json"), JSON.stringify(res, null, 2) + "\n");
console.log(`TinyReceiver: ${c.evm.bytecode.object.length / 2} bytes initcode, ${c.evm.deployedBytecode.object.length / 2} bytes runtime`);
