import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

/** netswitch.ts bundled with ./network; `env` stands in for Vite's import.meta.env (the build-time VITE_* values) */
const load = (env = {}) => {
  const src = buildSync({ entryPoints: [fileURLToPath(new URL("../src/lib/netswitch.ts", import.meta.url))], bundle: true, write: false, format: "esm", define: { "import.meta.env": JSON.stringify(env) } }).outputFiles[0].text;
  return import("data:text/javascript," + encodeURIComponent(src));
};
const { switchToPortaldotWith, PORTALDOT_ADD_PARAMS } = await load();

/** Mock EIP-1193 wallet that enforces the rules OKX/MetaMask apply. */
function mockWallet({ known = false, unknownErr = { code: 4902, message: "Unrecognized chain ID" }, switchAfterAdd = false, reject = "" } = {}) {
  const calls = [];
  let chain = "0x1";
  return {
    calls, get chain() { return chain; },
    async request({ method, params }) {
      calls.push(method);
      if (reject === method) throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      if (method === "wallet_switchEthereumChain") {
        if (!known) throw Object.assign(new Error(unknownErr.message), { code: unknownErr.code });
        chain = params[0].chainId; return null;
      }
      if (method === "wallet_addEthereumChain") {
        const p = params[0];
        if (p.nativeCurrency && p.nativeCurrency.decimals !== 18)
          throw Object.assign(new Error(`Expected the number 18 for nativeCurrency.decimals when nativeCurrency is provided. Received: ${p.nativeCurrency.decimals}`), { code: -32602 });
        known = true; if (switchAfterAdd) chain = p.chainId; return null;
      }
      throw new Error("unexpected " + method);
    },
  };
}
const target = "0x" + (420420777).toString(16);

test("add params use 18 decimals and the public RPC", () => {
  assert.equal(PORTALDOT_ADD_PARAMS.nativeCurrency.decimals, 18);
  assert.equal(PORTALDOT_ADD_PARAMS.chainId, target);
  assert.deepEqual(PORTALDOT_ADD_PARAMS.rpcUrls, ["https://test-evm-rpc-v3.portaldot.dev"]);
});
test("network: VITE_CHAIN_ID / VITE_CHAIN_NAME / VITE_NATIVE_SYMBOL / VITE_RPC_URL override the testnet defaults", async () => {
  const { PORTALDOT_ADD_PARAMS: p } = await load({ VITE_CHAIN_ID: "12345", VITE_CHAIN_NAME: "Example Net", VITE_NATIVE_SYMBOL: "EXM", VITE_RPC_URL: " https://rpc.example.invalid , https://rpc2.example.invalid" });
  assert.deepEqual(p, { chainId: "0x3039", chainName: "Example Net", nativeCurrency: { name: "EXM", symbol: "EXM", decimals: 18 }, rpcUrls: ["https://rpc.example.invalid"] });
  const blank = (await load({ VITE_CHAIN_ID: " ", VITE_CHAIN_NAME: "", VITE_NATIVE_SYMBOL: "", VITE_RPC_URL: "" })).PORTALDOT_ADD_PARAMS;
  assert.deepEqual(blank, PORTALDOT_ADD_PARAMS); // empty variables keep the testnet defaults
  assert.deepEqual([PORTALDOT_ADD_PARAMS.chainName, PORTALDOT_ADD_PARAMS.nativeCurrency.symbol], ["Portaldot V3 Testnet", "tPOTv3"]);
  await assert.rejects(load({ VITE_CHAIN_ID: "abc" }), /VITE_CHAIN_ID/);
});
test("known chain: switch only, no add", async () => {
  const w = mockWallet({ known: true });
  await switchToPortaldotWith(w);
  assert.deepEqual(w.calls, ["wallet_switchEthereumChain"]); assert.equal(w.chain, target);
});
test("unknown chain (4902): switch → add → switch", async () => {
  const w = mockWallet();
  await switchToPortaldotWith(w);
  assert.deepEqual(w.calls, ["wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain"]); assert.equal(w.chain, target);
});
for (const err of [{ code: -32603, message: "Unrecognized chain ID 0x190f1b49. Try adding the chain using wallet_addEthereumChain first." }, { code: 4001_0, message: "Chain not added" }, { code: 5000, message: "x" }])
  test(`OKX/mobile variant ${err.code}: still adds`, async () => {
    const w = mockWallet({ unknownErr: err });
    await switchToPortaldotWith(w);
    assert.equal(w.calls[1], "wallet_addEthereumChain"); assert.equal(w.chain, target);
  });
test("user rejection is not treated as unknown chain", async () => {
  const w = mockWallet({ known: true, reject: "wallet_switchEthereumChain" });
  await assert.rejects(switchToPortaldotWith(w), /cancelled/); assert.deepEqual(w.calls, ["wallet_switchEthereumChain"]);
});
test("rejected add surfaces a clear message", async () => {
  const w = mockWallet({ reject: "wallet_addEthereumChain" });
  await assert.rejects(switchToPortaldotWith(w), /Adding Portaldot V3 was cancelled/);
});
