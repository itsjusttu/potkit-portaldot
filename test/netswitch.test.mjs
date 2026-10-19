import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const src = transformSync(readFileSync(new URL("../src/lib/netswitch.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const { switchToPortaldotWith, PORTALDOT_ADD_PARAMS } = await import("data:text/javascript," + encodeURIComponent(src));

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
