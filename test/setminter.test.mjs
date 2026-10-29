import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import ganache from "ganache";
import { createPublicClient, createWalletClient, defineChain, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// scripts/set-minter.mjs run as a real child process against a local ganache with PotKit deployed (chain id 420420777, like the script expects)
const A = JSON.parse(readFileSync(new URL("../src/generated/artifacts.json", import.meta.url), "utf8"));
const SCRIPT = fileURLToPath(new URL("../scripts/set-minter.mjs", import.meta.url));
const K = A.PotKit.abi;
const keyOf = (n) => `0x${n.repeat(32)}`; // throwaway test keys, never used anywhere else
const ISSUER_KEY = keyOf("11"), OTHER_KEY = keyOf("22"), TESTER_KEY = keyOf("33");
const [issuer, other, tester] = [ISSUER_KEY, OTHER_KEY, TESTER_KEY].map((k) => privateKeyToAccount(k));
const CODE = Object.fromEntries(Object.entries(A.REASON_CODES).map(([c, reason]) => [reason, c]));

let server, url, kit, pub, wal;
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });

before(async () => {
  const port = await freePort();
  const funds = "0x56BC75E2D63100000"; // 100 ether
  server = ganache.server({ logging: { quiet: true }, chain: { chainId: 420420777, hardfork: "shanghai" }, wallet: { accounts: [ISSUER_KEY, OTHER_KEY, TESTER_KEY].map((secretKey) => ({ secretKey, balance: funds })) } });
  await server.listen(port, "127.0.0.1");
  url = `http://127.0.0.1:${port}`;
  const chain = defineChain({ id: 420420777, name: "local", nativeCurrency: { name: "E", symbol: "E", decimals: 18 }, rpcUrls: { default: { http: [url] } } });
  pub = createPublicClient({ chain, transport: http(url) });
  wal = createWalletClient({ chain, transport: http(url) });
  const hash = await wal.deployContract({ abi: K, bytecode: A.PotKit.bytecode, account: issuer, gas: 6_000_000n });
  kit = getAddress((await pub.waitForTransactionReceipt({ hash })).contractAddress);
});
after(async () => { await server?.close(); });

/** runs the script; the outer environment (a real ISSUER_PRIVATE_KEY, VITE_KIT) must not leak into the test */
function run(argv, env = {}) {
  const e = { ...process.env, VITE_RPC_URL: url, ...env };
  delete e.VITE_KIT;
  if (!("ISSUER_PRIVATE_KEY" in env)) delete e.ISSUER_PRIVATE_KEY;
  return new Promise((res) => execFile(process.execPath, [SCRIPT, ...argv], { env: e, timeout: 90_000 }, (err, stdout, stderr) => res({ code: err ? (err.code ?? 1) : 0, out: `${stdout}${stderr}` })));
}
const txCount = () => pub.getTransactionCount({ address: issuer.address });
/** behaviour, not storage: can this wallet mint right now? */
const canMint = (who) => pub.simulateContract({ address: kit, abi: K, functionName: "mint", args: [who, 0, "x"], account: who }).then(() => true, (e) => {
  assert.match(`${e.message}\n${e.details ?? ""}`, new RegExp(`(reason:\\s*\\n?|revert )${CODE["not minter"]}\\s*(\\n|$)`), "reverted for another reason than not minter");
  return false;
});

test("dry run reads the chain, prints calldata and an estimate, and sends nothing", async () => {
  const before = await txCount();
  const r = await run([tester.address, "--kit", kit]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`issuer {5}${issuer.address}`));
  assert.match(r.out, /minter now: false {3}wanted: true/);
  assert.match(r.out, /calldata {3}0xcf456ae7/);
  assert.match(r.out, /estimate {3}about [\d.]+ tPOTv3 \(gas \d+\)/);
  assert.match(r.out, /DRY RUN/);
  assert.equal(await txCount(), before);
  assert.equal(await canMint(tester.address), false);
});

test("the wallet is found whatever the argument order (the kit address must not be mistaken for it)", async () => {
  for (const argv of [["--kit", kit, tester.address], [tester.address, "--kit", kit]]) {
    const r = await run(argv);
    assert.equal(r.code, 0, r.out);
    assert.ok(r.out.includes(`wallet     ${tester.address}`), r.out);
  }
});

test("bad input is refused with a reason and nothing is sent", async () => {
  const before = await txCount();
  const cases = [
    [["0x1234"], /not a 40-hex-digit/],
    [["0x" + "0".repeat(40), "--kit", kit], /zero address/],
    [[tester.address, "--bogus", "--kit", kit], /Unknown option/],
    [[tester.address, "--kit"], /--kit needs an address/],
    [[tester.address, "--kit", other.address], /No contract at/],
    [[tester.address.replace(/[a-fA-F]/, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())), "--kit", kit], /does not match its checksum/],
  ];
  for (const [argv, re] of cases) { const r = await run(argv); assert.notEqual(r.code, 0, `${argv.join(" ")}: ${r.out}`); assert.match(r.out, re); }
  assert.equal(await txCount(), before);
});

test("--send needs the issuer's key: missing, malformed or another wallet's key sends nothing and never prints the key", async () => {
  const before = await txCount();
  const none = await run([tester.address, "--kit", kit, "--send"]);
  assert.notEqual(none.code, 0); assert.match(none.out, /ISSUER_PRIVATE_KEY is not set/);
  const bad = await run([tester.address, "--kit", kit, "--send"], { ISSUER_PRIVATE_KEY: "not-a-key" });
  assert.notEqual(bad.code, 0); assert.match(bad.out, /malformed/);
  const wrong = await run([tester.address, "--kit", kit, "--send"], { ISSUER_PRIVATE_KEY: OTHER_KEY });
  assert.notEqual(wrong.code, 0); assert.match(wrong.out, /not the issuer/);
  for (const r of [none, bad, wrong]) assert.ok(!r.out.includes(OTHER_KEY.slice(2)) && !r.out.includes("not-a-key"), "the key must never be printed");
  assert.equal(await txCount(), before);
  assert.equal(await canMint(tester.address), false);
});

test("the issuer is not offered an approval (it can always mint)", async () => {
  const r = await run([issuer.address, "--kit", kit]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /is the issuer, which can always mint/);
});

test("approve, mint as the approved wallet, then revoke: minters mint but cannot approve others, and old receipts stay", async () => {
  const on = await run([tester.address, "--kit", kit, "--send"], { ISSUER_PRIVATE_KEY: ISSUER_KEY });
  assert.equal(on.code, 0, on.out);
  assert.match(on.out, /confirmed {2}block \d+/);
  assert.match(on.out, /minter now true/);
  assert.ok(!on.out.includes(ISSUER_KEY.slice(2)), "the key must never be printed");
  assert.equal(await canMint(tester.address), true);
  // the approved wallet mints a receipt to itself, and cannot approve anyone else
  const mintHash = await wal.writeContract({ address: kit, abi: K, functionName: "mint", args: [tester.address, 0, "TEST receipt"], account: tester, gas: 6_000_000n });
  assert.equal((await pub.waitForTransactionReceipt({ hash: mintHash })).status, "success");
  await assert.rejects(pub.simulateContract({ address: kit, abi: K, functionName: "setMinter", args: [other.address, true], account: tester }), (e) => new RegExp(`(reason:\\s*\\n?|revert )${CODE["not issuer"]}\\s*(\\n|$)`).test(`${e.message}\n${e.details ?? ""}`));
  // approving twice is a no-op, not a second transaction
  const again = await run([tester.address, "--kit", kit]);
  assert.match(again.out, /minter now: true {3}wanted: true/); assert.match(again.out, /Nothing to do/);
  const off = await run([tester.address, "--kit", kit, "--off", "--send"], { ISSUER_PRIVATE_KEY: ISSUER_KEY });
  assert.equal(off.code, 0, off.out);
  assert.match(off.out, /minter now false/);
  assert.equal(await canMint(tester.address), false);
  assert.equal(await pub.readContract({ address: kit, abi: K, functionName: "ownerOf", args: [1n] }), tester.address);
});
