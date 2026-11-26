import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, defineChain, encodeAbiParameters, encodeFunctionData, getAddress, keccak256, parseEventLogs } from "viem";

const A = JSON.parse(readFileSync(new URL("../src/generated/artifacts.json", import.meta.url), "utf8"));
const chain = defineChain({ id: 1337, name: "local", nativeCurrency: { name: "E", symbol: "E", decimals: 18 }, rpcUrls: { default: { http: [] } } });
const E18 = 10n ** 18n;
const ZERO = "0x0000000000000000000000000000000000000000";
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const K = A.PotKit.abi;
const F = A.Fraction.abi;
let pub, wal, alice, bob, carol, dave, erin, frank, kit;

async function ok(hash) {
  const r = await pub.waitForTransactionReceipt({ hash });
  assert.equal(r.status, "success");
  return r;
}
const w = (address, abi, functionName, args, account, value) =>
  wal.writeContract({ address, abi, functionName, args, account, chain, gas: 6_000_000n, ...(value !== undefined ? { value } : {}) });
const sim = (address, abi, functionName, args, account, value) =>
  pub.simulateContract({ address, abi, functionName, args, account, ...(value !== undefined ? { value } : {}) });
const r = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });
const kw = (fn, args, who = alice, value) => w(kit, K, fn, args, who, value);
const ks = (fn, args, who = alice, value) => sim(kit, K, fn, args, who, value);
const kr = (fn, args = []) => r(kit, K, fn, args);
// Lens is never deployed: the UI (and these tests) run it inside eth_call (viem deployless read)
const lens = (functionName, args) => pub.readContract({ abi: A.Lens.abi, code: A.Lens.bytecode, functionName, args });
const bal = (a) => pub.getBalance({ address: a });
/** PotKit reverts with a one-letter Error(string); REASON_CODES maps it back to the readable reason */
const CODE = Object.fromEntries(Object.entries(A.REASON_CODES).map(([c, reason]) => [reason, c]));
async function reverts(p, reason) {
  const code = CODE[reason];
  assert.ok(code, `unknown reason ${reason}`);
  await assert.rejects(p, (e) => {
    const m = `${e.message}\n${e.details ?? ""}\n${e.cause?.message ?? ""}`;
    return new RegExp(`(following reason:\\s*\\n?|revert )${code}\\s*(\\n|$)`).test(m) || m.includes(`reason string '${code}'`);
  });
}
async function mint(to, kind = 0, note = "Invoice 042") {
  const rc = await ok(await kw("mint", [to, kind, note]));
  return parseEventLogs({ abi: K, logs: rc.logs, eventName: "Transfer" })[0].args.tokenId;
}
const DAY = 86_400n;
const GRACE = 30n * DAY; // v2.1: after settlement only holders and sellers act for themselves for 30 days
async function warp(seconds) {
  await pub.request({ method: "evm_increaseTime", params: [Number(seconds)] });
  await pub.request({ method: "evm_mine", params: [] });
}
async function now() {
  return (await pub.getBlock()).timestamp;
}
async function lock(id, units, who = alice, face = 1000n * E18, due = 0n) {
  const rc = await ok(await kw("fractionalize", [id, units, face, due], who));
  const act = parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args;
  assert.equal(act.kind, 1n);
  return getAddress(rc.logs.find((l) => l.address.toLowerCase() !== kit.toLowerCase()).address);
}
/** a fresh TestReceiver contract (acts as a PotKit user through exec); refuse = it rejects plain tPOT transfers */
async function receiver(refuse = false) {
  const d = await ok(await wal.deployContract({ abi: A.TestReceiver.abi, bytecode: A.TestReceiver.bytecode, account: alice, chain, gas: 6_000_000n }));
  const c = getAddress(d.contractAddress);
  if (refuse) await ok(await w(c, A.TestReceiver.abi, "setRefuse", [true], alice));
  return c;
}
/** `contract` calls PotKit (or a share token) as itself; alice sends the transaction */
const asC = (contract, target, abi, functionName, args, value) =>
  w(contract, A.TestReceiver.abi, "exec", [target, encodeFunctionData({ abi, functionName, args })], alice, value);
const credit = (who) => lens("credit", [kit, who]);
/** tx cost in wei (to compute exact native balance changes) */
async function spent(hash) {
  const rc = await ok(hash);
  return { rc, fee: rc.gasUsed * rc.effectiveGasPrice };
}

before(async () => {
  const g = ganache.provider({ logging: { quiet: true }, chain: { hardfork: "shanghai" }, wallet: { deterministic: true, totalAccounts: 6 } });
  // ganache has no wallet_* namespace; answer like a wallet that doesn't support it so viem falls back
  const provider = {
    request: async (args) => {
      if (args.method.startsWith("wallet_")) throw Object.assign(new Error("method not found"), { code: -32601 });
      return g.request(args);
    },
  };
  pub = createPublicClient({ chain, transport: custom(provider) });
  wal = createWalletClient({ chain, transport: custom(provider) });
  [alice, bob, carol, dave, erin, frank] = await wal.getAddresses();
  const d = await ok(await wal.deployContract({ abi: K, bytecode: A.PotKit.bytecode, account: alice, chain, gas: 6_000_000n }));
  kit = getAddress(d.contractAddress);
});

// ---- receipts (ERC-721) ---------------------------------------------------------------------
test("PotKit is a real ERC-721: ERC-165, name, balance, owner, tokenURI + Lens metadata JSON", async () => {
  for (const id of ["0x01ffc9a7", "0x80ac58cd", "0x5b5e139f"]) assert.equal(await kr("supportsInterface", [id]), true);
  assert.equal(await kr("supportsInterface", ["0xffffffff"]), false);
  assert.equal(await kr("name"), "PotKit Receipt");
  assert.equal(await kr("symbol"), "RCPT");
  assert.equal(await kr("issuer"), alice);
  const id = await mint(bob, 1, "Clip rights - episode 3");
  assert.equal(id, 1n);
  assert.equal(await kr("ownerOf", [id]), bob);
  assert.equal(await kr("balanceOf", [bob]), 1n);
  assert.equal(await kr("tokenURI", [id]), "https://potkit.pro/api/r?id=1");
  const json = JSON.parse(await lens("tokenJson", [kit, id]));
  assert.equal(json.name, "PotKit Receipt #1");
  assert.equal(json.description, "Clip rights - episode 3");
  assert.equal(json.attributes[0].value, "Content right");
  await reverts(kr("balanceOf", [ZERO]), "zero");
});

test("Receipts: unknown ids revert, bad mints revert, minters", async () => {
  await reverts(kr("ownerOf", [9999n]), "no token");
  await reverts(kr("tokenURI", [9999n]), "no token");
  await reverts(ks("mint", [bob, 0, "x"], bob), "not minter");
  await reverts(ks("mint", [bob, 3, "x"]), "kind");
  await reverts(ks("mint", [bob, 0, ""]), "note length");
  await reverts(ks("mint", [bob, 0, "x".repeat(141)]), "note length");
  await reverts(ks("mint", [ZERO, 0, "x"]), "zero");
  await reverts(ks("setMinter", [bob, true], bob), "not issuer");
  assert.deepEqual(await lens("meta", [kit, bob]), [alice, false]);
  await ok(await kw("setMinter", [bob, true]));
  assert.deepEqual(await lens("meta", [kit, bob]), [alice, true]);
  await ok(await kw("mint", [bob, 2, "Camera body"], bob));
  await ok(await kw("setMinter", [bob, false]));
  await reverts(ks("mint", [bob, 0, "x"], bob), "not minter");
});

test("Notes are stored losslessly for every length 1..140; JSON escapes quotes, backslashes, control chars", async () => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789 -_/.,:;!?()[]{}#&+=';
  for (const n of [1, 2, 9, 10, 11, 41, 42, 43, 74, 75, 139, 140]) {
    const note = Array.from({ length: n }, (_, i) => alphabet[(i * 7 + n) % alphabet.length]).join("");
    const id = await mint(alice, 0, note);
    assert.equal(await lens("note", [kit, id]), note);
  }
  const tricky = 'say "hi" \\ tab\there';
  const id = await mint(alice, 2, tricky);
  assert.equal(await lens("note", [kit, id]), tricky);
  const json = JSON.parse(await lens("tokenJson", [kit, id]));
  assert.equal(json.description, tricky);
  assert.equal(json.attributes[0].value, "Equipment");
});

test("ERC-721 approve / operator / transferFrom / safeTransferFrom (receiver contract, data, rejection)", async () => {
  const id = await mint(alice);
  await reverts(ks("transferFrom", [alice, bob, id], bob), "auth");
  await reverts(ks("approve", [bob, id], bob), "auth");
  await ok(await kw("approve", [bob, id]));
  assert.equal(await kr("getApproved", [id]), bob);
  await ok(await kw("transferFrom", [alice, carol, id], bob));
  assert.equal(await kr("ownerOf", [id]), carol);
  assert.equal(await kr("getApproved", [id]), ZERO); // cleared on transfer
  await reverts(ks("transferFrom", [alice, bob, id], carol), "from");
  await reverts(ks("transferFrom", [carol, ZERO, id], carol), "zero");
  await ok(await kw("setApprovalForAll", [dave, true], carol));
  assert.equal(await kr("isApprovedForAll", [carol, dave]), true);
  await ok(await kw("transferFrom", [carol, alice, id], dave));
  assert.equal(await kr("ownerOf", [id]), alice);

  const d = await ok(await wal.deployContract({ abi: A.TestReceiver.abi, bytecode: A.TestReceiver.bytecode, account: alice, chain, gas: 6_000_000n }));
  const rcv = getAddress(d.contractAddress);
  const rc = await ok(await w(kit, K, "safeTransferFrom", [alice, rcv, id, "0xc0ffee"], alice));
  assert.equal(parseEventLogs({ abi: K, logs: rc.logs, eventName: "Transfer" })[0].args.to, rcv);
  assert.equal(await r(rcv, A.TestReceiver.abi, "lastFrom"), alice);
  assert.equal(await r(rcv, A.TestReceiver.abi, "lastOperator"), alice);
  assert.equal(await r(rcv, A.TestReceiver.abi, "lastId"), id);
  assert.equal(await r(rcv, A.TestReceiver.abi, "lastData"), "0xc0ffee");
  const back = encodeFunctionData({ abi: K, functionName: "transferFrom", args: [rcv, alice, id] });
  await ok(await w(rcv, A.TestReceiver.abi, "exec", [kit, back], alice));
  await ok(await w(rcv, A.TestReceiver.abi, "setAccept", [false], alice));
  await reverts(sim(kit, K, "safeTransferFrom", [alice, rcv, id], alice), "receiver");
  await ok(await w(kit, K, "safeTransferFrom", [alice, bob, id], alice)); // EOAs need no callback
  assert.equal(await kr("ownerOf", [id]), bob);
});

// ---- vault + shares (ERC-20) ----------------------------------------------------------------
test("fractionalize: owner locks directly (no approval), sets terms, gets the whole supply", async () => {
  const id = await mint(alice);
  await reverts(ks("fractionalize", [id, 10n, E18, 0n], bob), "from");
  await reverts(ks("fractionalize", [id, 0n, E18, 0n]), "units");
  await reverts(ks("fractionalize", [id, 10n ** 12n + 1n, E18, 0n]), "units");
  await reverts(ks("fractionalize", [id, 10n, 0n, 0n]), "amount");
  await reverts(ks("fractionalize", [id, 10n, 1n << 96n, 0n]), "amount");
  await reverts(ks("fractionalize", [id, 10n, E18, (await now()) - 1n]), "due date");
  const due = (await now()) + 30n * DAY;
  const rc = await ok(await kw("fractionalize", [id, 1000n, 5n * E18, due]));
  const token = getAddress(rc.logs.find((l) => l.address.toLowerCase() !== kit.toLowerCase()).address);
  const act = parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args;
  assert.deepEqual([act.id, act.actor, act.kind, act.a, act.b, act.c], [id, alice, 1n, 1000n, 5n * E18, due]);
  const ev = parseEventLogs({ abi: F, logs: rc.logs.filter((l) => getAddress(l.address) === token), eventName: "Transfer" })[0].args;
  assert.deepEqual([ev.from, ev.to, ev.value], [ZERO, alice, 1000n * E18]); // ERC-20 mint event from the token itself
  assert.equal(await kr("ownerOf", [id]), kit);
  assert.equal(await r(token, F, "name"), `PotKit Fraction #${id}`);
  assert.equal(await r(token, F, "symbol"), `KIT${id}`);
  assert.equal(await r(token, F, "decimals"), 18);
  assert.equal(await r(token, F, "totalSupply"), 1000n * E18);
  assert.equal(await r(token, F, "balanceOf", [alice]), 1000n * E18);
  await reverts(ks("fractionalize", [id, 5n, E18, 0n]), "from"); // already locked: the contract owns it
  await reverts(ks("transferFrom", [kit, bob, id]), "auth"); // nobody can move a locked receipt
  const [row] = await lens("rows", [kit, id, 1n]);
  assert.equal(row.fraction, token);
  assert.equal(row.depositor, alice);
  assert.equal(row.owner, kit);
  const [s] = await lens("settlements", [kit, id, 1n]);
  assert.deepEqual([s.token, s.faceValue, s.settled, s.supply], [NATIVE, 5n * E18, false, 1000n * E18]);
  const [st, dd] = await lens("statuses", [kit, id, 1n]);
  assert.deepEqual([st[0], dd[0]], [1, due]);
});

test("Share tokens are 82-byte forwarders with identical code; spoofed events are impossible", async () => {
  const t1 = await lock(await mint(alice), 1n);
  const t2 = await lock(await mint(alice), 2n);
  const c1 = await pub.getCode({ address: t1 });
  const c2 = await pub.getCode({ address: t2 });
  assert.equal((c1.length - 2) / 2, 82);
  assert.equal(keccak256(c1.replace(kit.slice(2).toLowerCase(), "")), keccak256(c2.replace(kit.slice(2).toLowerCase(), "")));
  assert.ok(c1.toLowerCase().includes(kit.slice(2).toLowerCase()));
  // 128 bytes from an outsider are forwarded to PotKit (not emitted) and rejected there
  const topic = keccak256(new TextEncoder().encode("Transfer(address,address,uint256)"));
  const data = topic + "00".repeat(32 * 3);
  await assert.rejects(pub.call({ account: bob, to: t1, data }));
  await assert.rejects(pub.call({ account: bob, to: t1, data: "0x12345678" }));
  await assert.rejects(pub.call({ account: bob, to: kit, data: "0x12345678" }));
});

test("ERC-20: transfer, approve, allowance, transferFrom (infinite allowance kept), contract callers", async () => {
  const id = await mint(alice);
  const token = await lock(id, 100n);
  const rc = await ok(await w(token, F, "transfer", [bob, 40n * E18], alice));
  const ev = parseEventLogs({ abi: F, logs: rc.logs, eventName: "Transfer" })[0];
  assert.equal(getAddress(ev.address), token);
  assert.deepEqual([ev.args.from, ev.args.to, ev.args.value], [alice, bob, 40n * E18]);
  assert.equal(await r(token, F, "balanceOf", [bob]), 40n * E18);
  await reverts(sim(token, F, "transfer", [carol, 41n * E18], bob), "balance");
  await reverts(sim(token, F, "transfer", [ZERO, 1n], bob), "zero");
  const ra = await ok(await w(token, F, "approve", [carol, 10n * E18], bob));
  const ap = parseEventLogs({ abi: F, logs: ra.logs, eventName: "Approval" })[0];
  assert.equal(getAddress(ap.address), token);
  assert.deepEqual([ap.args.owner, ap.args.spender, ap.args.value], [bob, carol, 10n * E18]);
  assert.equal(await r(token, F, "allowance", [bob, carol]), 10n * E18);
  await reverts(sim(token, F, "transferFrom", [bob, carol, 11n * E18], carol), "allowance");
  await ok(await w(token, F, "transferFrom", [bob, carol, 4n * E18], carol));
  assert.equal(await r(token, F, "allowance", [bob, carol]), 6n * E18);
  assert.equal(await r(token, F, "balanceOf", [carol]), 4n * E18);
  const max = (1n << 256n) - 1n;
  await ok(await w(token, F, "approve", [dave, max], bob));
  await ok(await w(token, F, "transferFrom", [bob, dave, 1n * E18], dave));
  assert.equal(await r(token, F, "allowance", [bob, dave]), max);
  // a contract holder: the forwarder appends the contract's own address as the sender
  const d = await ok(await wal.deployContract({ abi: A.TestReceiver.abi, bytecode: A.TestReceiver.bytecode, account: alice, chain, gas: 6_000_000n }));
  const c = getAddress(d.contractAddress);
  await ok(await w(token, F, "transfer", [c, 2n * E18], alice));
  const send = encodeFunctionData({ abi: F, functionName: "transfer", args: [dave, E18] });
  await ok(await w(c, A.TestReceiver.abi, "exec", [token, send], alice));
  assert.equal(await r(token, F, "balanceOf", [c]), E18);
  assert.equal(await r(token, F, "balanceOf", [dave]), 2n * E18);
});

test("Redeem needs every share, returns the NFT; re-lock reuses the token and resets allowances", async () => {
  const id = await mint(alice);
  const token = await lock(id, 10n);
  await ok(await w(token, F, "approve", [carol, 5n * E18], alice));
  await ok(await w(token, F, "transfer", [bob, 1n * E18], alice));
  await reverts(ks("redeem", [id]), "need all units");
  await ok(await w(token, F, "transfer", [alice, 1n * E18], bob));
  const rc = await ok(await kw("redeem", [id]));
  assert.equal(parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args.kind, 2n);
  assert.equal(await kr("ownerOf", [id]), alice);
  assert.equal(await r(token, F, "totalSupply"), 0n);
  assert.equal(await r(token, F, "balanceOf", [alice]), 0n);
  const [row] = await lens("rows", [kit, id, 1n]);
  assert.deepEqual([row.fraction, row.depositor, row.supply], [ZERO, ZERO, 0n]);
  assert.equal((await lens("statuses", [kit, id, 1n]))[0][0], 0); // Free
  await reverts(ks("redeem", [id]), "not locked");
  const again = await lock(id, 20n);
  assert.equal(again, token); // same ERC-20 address, no new contract
  assert.equal(await r(token, F, "totalSupply"), 20n * E18);
  assert.equal(await r(token, F, "allowance", [alice, carol]), 0n); // old approvals do not carry over
});

// ---- settlement (native tPOT) ------------------------------------------------------------------
test("settle in native tPOT by anyone; holders claim pro-rata; payouts sum exactly; then redeem", async () => {
  const id = await mint(alice);
  const face = 1_000_000_000n; // wei, odd split to exercise rounding
  const token = await lock(id, 3n, alice, face);
  await ok(await w(token, F, "transfer", [bob, 1n * E18], alice));
  await ok(await w(token, F, "transfer", [carol, 1n * E18], alice));
  await reverts(ks("claim", [id], bob), "not settled");
  await reverts(ks("settle", [id], dave, face - 1n), "underpaid");
  const k0 = await bal(kit);
  const rc = await ok(await kw("settle", [id], dave, face));
  assert.deepEqual(parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args.a, face);
  assert.equal((await bal(kit)) - k0, face);
  await reverts(ks("settle", [id], dave, face), "settled");
  assert.equal((await lens("statuses", [kit, id, 1n]))[0][0], 4);
  assert.deepEqual((await lens("claimables", [kit, bob, id, 1n]))[0], 333_333_333n);
  await reverts(ks("redeem", [id]), "claim first");
  const expect = [[bob, 333_333_333n], [alice, 333_333_333n], [carol, 333_333_334n]]; // last holder gets the dust
  for (const [who, amt] of expect) {
    const b0 = await bal(who);
    const { rc, fee } = await spent(await kw("claim", [id], who));
    const a = parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args;
    assert.deepEqual([a.kind, a.a, a.b], [5n, E18, amt]);
    assert.equal((await bal(who)) - b0 + fee, amt);
    assert.equal(await r(token, F, "balanceOf", [who]), 0n);
  }
  assert.equal(await bal(kit), k0); // pool emptied exactly
  assert.equal(await r(token, F, "totalSupply"), 0n);
  await reverts(ks("claim", [id], bob), "no shares");
  const [s] = await lens("settlements", [kit, id, 1n]);
  assert.deepEqual([s.settled, s.amount, s.paidOut], [true, face, face]);
  await reverts(ks("redeem", [id], bob), "not depositor");
  await ok(await kw("redeem", [id]));
  assert.equal(await kr("ownerOf", [id]), alice);
  assert.equal((await lens("statuses", [kit, id, 1n]))[0][0], 0);
  await lock(id, 2n); // and it can be tokenised again from scratch
  assert.equal((await lens("settlements", [kit, id, 1n]))[0].settled, false);
});

test("fix 2: settle takes exactly the face value (over- and underpayment revert); payouts to a contract holder work", async () => {
  const id = await mint(alice);
  const token = await lock(id, 2n, alice, 100n);
  const c = await receiver();
  await ok(await w(token, F, "transfer", [c, E18], alice));
  await reverts(ks("settle", [id], bob, 99n), "underpaid");
  await reverts(ks("settle", [id], bob, 101n), "overpaid");
  await reverts(ks("settle", [id], bob, 300n), "overpaid");
  await reverts(ks("settle", [id], bob, 0n), "underpaid");
  const k0 = await bal(kit);
  await ok(await kw("settle", [id], bob, 100n));
  assert.equal((await bal(kit)) - k0, 100n);
  const [s] = await lens("settlements", [kit, id, 1n]);
  assert.deepEqual([s.settled, s.amount, s.faceValue], [true, 100n, 100n]);
  const c0 = await bal(c);
  await ok(await w(c, A.TestReceiver.abi, "exec", [kit, encodeFunctionData({ abi: K, functionName: "claim", args: [id] })], alice));
  assert.equal((await bal(c)) - c0, 50n);
  const free = await mint(alice);
  await reverts(ks("settle", [free], bob, 1n), "not locked");
  await reverts(ks("settle", [9999n], bob, 1n), "not locked");
});

// ---- v2 fixes ---------------------------------------------------------------------------------------
test("v2.1 testnet build: the grace period is 10 minutes, and the bytecode differs from the 30-day build only there", async () => {
  const main = A.PotKit.bytecode.slice(2), test10 = A.PotKitGrace10m.bytecode.slice(2);
  assert.equal(test10.length, main.length);
  const diff = [];
  for (let i = 0; i < main.length; i += 2) if (main.slice(i, i + 2) !== test10.slice(i, i + 2)) diff.push(i / 2);
  assert.ok(diff.length > 0 && diff.every((i) => i >= main.length / 2 - 4), `only the last 4 bytes differ, got ${diff}`);
  assert.deepEqual([main.slice(-8), test10.slice(-8)], ["00278d00", "00000258"]); // 2,592,000 s and 600 s
  const d = await ok(await wal.deployContract({ abi: K, bytecode: A.PotKitGrace10m.bytecode, account: alice, chain, gas: 6_000_000n }));
  const k10 = getAddress(d.contractAddress);
  const mr = await ok(await w(k10, K, "mint", [alice, 0, "grace test"], alice));
  const id = parseEventLogs({ abi: K, logs: mr.logs, eventName: "Transfer" })[0].args.tokenId;
  const lr = await ok(await w(k10, K, "fractionalize", [id, 2n, 2n * E18, 0n], alice));
  const token = getAddress(lr.logs.find((l) => l.address.toLowerCase() !== k10.toLowerCase()).address);
  await ok(await w(token, F, "transfer", [bob, E18], alice));
  await ok(await w(k10, K, "settle", [id], dave, 2n * E18));
  await reverts(sim(k10, K, "claimFor", [id, bob], alice), "grace");
  await warp(540n);
  await reverts(sim(k10, K, "claimFor", [id, bob], alice), "grace"); // 9 minutes in
  await warp(120n);
  const b0 = await bal(bob);
  await ok(await w(k10, K, "claimFor", [id, bob], alice)); // 11 minutes in: the depositor may pay bob out
  assert.equal((await bal(bob)) - b0, E18);
});


test("fix 1: before settlement only the depositor can redeem, even against a holder of 100% of the shares", async () => {
  const id = await mint(alice);
  const face = 7n * E18;
  const token = await lock(id, 10n, alice, face);
  await ok(await w(token, F, "transfer", [bob, 10n * E18], alice));
  await reverts(ks("redeem", [id], bob), "not depositor"); // bob holds every share but did not lock the receipt
  await reverts(ks("redeem", [id], alice), "need all units");
  assert.equal(await kr("ownerOf", [id]), kit);
  assert.equal((await lens("settlements", [kit, id, 1n]))[0].faceValue, face); // the terms survive
  await ok(await kw("settle", [id], dave, face)); // so the debtor can still settle
  const b0 = await bal(bob);
  const { fee } = await spent(await kw("claim", [id], bob));
  assert.equal((await bal(bob)) - b0 + fee, face);
  await reverts(ks("redeem", [id], bob), "not depositor");
  await ok(await kw("redeem", [id])); // after settlement: unchanged, every share claimed, then the depositor
  assert.equal(await kr("ownerOf", [id]), alice);
  // a depositor holding every share still takes the receipt back before settlement
  const id2 = await mint(alice);
  const t2 = await lock(id2, 3n);
  await ok(await w(t2, F, "transfer", [bob, E18], alice));
  await reverts(ks("redeem", [id2]), "need all units");
  await ok(await w(t2, F, "transfer", [alice, E18], bob));
  await ok(await kw("redeem", [id2]));
  assert.equal(await kr("ownerOf", [id2]), alice);
});

test("v2.1: claimFor pays the holder; for someone else only the depositor can, once the 30-day grace period is over", async () => {
  const id = await mint(alice);
  const face = 3_000_000_001n;
  const token = await lock(id, 3n, alice, face);
  await ok(await w(token, F, "transfer", [bob, E18], alice));
  await ok(await w(token, F, "transfer", [carol, 2n * E18], alice));
  await reverts(ks("claimFor", [id, bob], alice), "not settled");
  const sr = await ok(await kw("settle", [id], dave, face));
  const settledAt = (await pub.getBlock({ blockNumber: sr.blockNumber })).timestamp;
  // the settlement time sits next to the amount in one slot; the amount and the claimables still read exactly
  const [s] = await lens("settlements", [kit, id, 1n]);
  assert.deepEqual([s.settled, s.amount, s.paidOut, s.settledAt], [true, face, 0n, settledAt]);
  assert.deepEqual(await lens("claimables", [kit, bob, id, 1n]), [1_000_000_000n]);
  await reverts(ks("claimFor", [id, dave], dave), "no shares");
  await reverts(ks("claimFor", [id, kit], alice), "escrow"); // escrowed shares are paid out by cancel(listing)
  await reverts(ks("claimFor", [id, bob], dave), "not depositor"); // a stranger never pays someone else out
  await reverts(ks("claimFor", [id, bob], alice), "grace"); // the depositor neither, during the grace period
  await reverts(ks("redeem", [id]), "claim first"); // bob and carol have not claimed
  // a holder can always claim for themselves (claim, or claimFor naming themselves)
  const b0 = await bal(bob);
  const { rc, fee } = await spent(await kw("claimFor", [id, bob], bob));
  assert.equal((await bal(bob)) - b0, 1_000_000_000n - fee);
  const a = parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args;
  assert.deepEqual([a.actor, a.kind, a.a, a.b, a.c], [bob, 5n, E18, 1_000_000_000n, BigInt(bob)]);
  const burn = parseEventLogs({ abi: F, logs: rc.logs.filter((l) => getAddress(l.address) === token), eventName: "Transfer" })[0].args;
  assert.deepEqual([burn.from, burn.to, burn.value], [bob, ZERO, E18]);
  await reverts(ks("claimFor", [id, bob], bob), "no shares");
  await warp(GRACE - 60n);
  await reverts(ks("claimFor", [id, carol], alice), "grace"); // a minute before the end
  await warp(120n);
  await reverts(ks("claimFor", [id, carol], dave), "not depositor"); // after the grace period: still only the depositor
  const c0 = await bal(carol);
  const cr = await ok(await kw("claimFor", [id, carol], alice)); // alice pays the gas, carol gets the tPOT
  assert.equal((await bal(carol)) - c0, 2_000_000_001n); // cumulative rounding: the last claim gets the dust
  const ca = parseEventLogs({ abi: K, logs: cr.logs, eventName: "Activity" })[0].args;
  assert.deepEqual([ca.actor, ca.kind, ca.c], [alice, 5n, BigInt(carol)]);
  await reverts(ks("claim", [id], carol), "no shares");
  assert.equal(await r(token, F, "totalSupply"), 0n);
  await ok(await kw("redeem", [id]));
  assert.equal((await lens("settlements", [kit, id, 1n]))[0].settledAt, 0n); // redeem clears it with the settlement
});

test("v2.1: after settlement the seller can close a listing at any time; someone else only as the depositor after the grace period", async () => {
  const id = await mint(alice);
  const face = E18;
  const token = await lock(id, 10n, alice, face);
  await ok(await w(token, F, "transfer", [bob, 4n * E18], alice));
  const lidOf = (rc) => parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args.a;
  const l1 = lidOf(await ok(await kw("list", [id, E18, 3n * E18], bob)));
  const l2 = lidOf(await ok(await kw("list", [id, E18, E18], bob)));
  await ok(await kw("buy", [l1, E18], carol, E18)); // l1: 2 shares stay in escrow, l2: 1
  await reverts(ks("cancel", [l1], dave), "not seller"); // before settlement only the seller cancels
  await ok(await kw("settle", [id], dave, face));
  await reverts(ks("cancel", [l1], dave), "not depositor");
  await reverts(ks("cancel", [l1], alice), "grace");
  // the seller closes l1 during the grace period and is paid for its escrowed shares
  const b0 = await bal(bob);
  const { rc: cr, fee } = await spent(await kw("cancel", [l1], bob));
  assert.equal((await bal(bob)) - b0, (2n * face) / 10n - fee);
  const acts = parseEventLogs({ abi: K, logs: cr.logs, eventName: "Activity" }).map((l) => l.args);
  assert.deepEqual(acts.map((x) => [x.actor, x.kind, x.a, x.b, x.c]), [[bob, 8n, l1, 2n * E18, 1n], [bob, 5n, 2n * E18, (2n * face) / 10n, BigInt(bob)]]);
  const burn = parseEventLogs({ abi: F, logs: cr.logs.filter((l) => getAddress(l.address) === token), eventName: "Transfer" })[0].args;
  assert.deepEqual([burn.from, burn.to, burn.value], [kit, ZERO, 2n * E18]);
  assert.equal((await lens("listings", [kit, l1, 1n]))[0].remaining, 0n);
  await reverts(ks("cancel", [l1], bob), "closed");
  for (const who of [alice, carol]) await ok(await kw("claim", [id], who));
  await reverts(ks("redeem", [id]), "claim first"); // only l2's escrowed share is left
  await warp(GRACE);
  await reverts(ks("cancel", [l2], dave), "not depositor");
  // after the grace period the depositor closes l2; the payout still goes to the seller
  const b1 = await bal(bob);
  const c2 = await ok(await kw("cancel", [l2], alice));
  assert.equal((await bal(bob)) - b1, face / 10n);
  const a2 = parseEventLogs({ abi: K, logs: c2.logs, eventName: "Activity" }).map((l) => l.args);
  assert.deepEqual(a2.map((x) => [x.actor, x.kind, x.c]), [[alice, 8n, 1n], [alice, 5n, BigInt(bob)]]);
  assert.equal(await r(token, F, "balanceOf", [kit]), 0n);
  assert.equal(await r(token, F, "totalSupply"), 0n);
  await ok(await kw("redeem", [id]));
  assert.equal(await kr("ownerOf", [id]), alice);
});

test("v2.1: the seller's own close clears both listing slots; a cleared listing reverts cleanly and still reads correctly", async () => {
  const id = await mint(alice);
  const face = E18;
  const token = await lock(id, 10n, alice, face);
  await ok(await w(token, F, "transfer", [bob, 6n * E18], alice));
  const lidOf = (rc) => parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args.a;
  // k(lid, 13) and k(lid, 13) + 1 hold the listing (PotKit.yul storage layout); a cleared slot refunds its deposit on Portaldot
  const slots = async (lid) => {
    const s = BigInt(keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [lid, 13n])));
    return Promise.all([s, s + 1n].map(async (x) => { const v = await pub.getStorageAt({ address: kit, slot: `0x${x.toString(16).padStart(64, "0")}` }); return v && v !== "0x" ? BigInt(v) : 0n; })); // ganache answers 0x for an empty slot
  };
  const n0 = await lens("listingCount", [kit]);
  const la = lidOf(await ok(await kw("list", [id, 2n * 10n ** 17n, 2n * E18], bob)));
  const lb = lidOf(await ok(await kw("list", [id, 3n * 10n ** 17n, 2n * E18], bob)));
  const lc = lidOf(await ok(await kw("list", [id, 4n * 10n ** 17n, E18], bob)));
  assert.notDeepEqual(await slots(la), [0n, 0n]);
  await ok(await kw("buy", [lb, E18], carol, 3n * 10n ** 17n)); // lb: 1 share left in escrow

  // 1. before settlement: the seller cancels la; both slots are cleared and the shares come back
  const b0 = await r(token, F, "balanceOf", [bob]);
  const cr = await ok(await kw("cancel", [la], bob));
  assert.equal((await r(token, F, "balanceOf", [bob])) - b0, 2n * E18);
  const ca = parseEventLogs({ abi: K, logs: cr.logs, eventName: "Activity" })[0].args;
  assert.deepEqual([ca.id, ca.actor, ca.kind, ca.a, ca.b, ca.c], [id, bob, 8n, la, 2n * E18, 0n]); // the event still names receipt, seller and amount
  assert.deepEqual(await slots(la), [0n, 0n]);
  // a cleared listing: buying from it, cancelling it again and closing it by anyone revert cleanly
  await reverts(ks("buy", [la, E18], carol, 2n * 10n ** 17n), "amount");
  await reverts(ks("buy", [la, 0n], carol, 0n), "amount");
  await reverts(ks("cancel", [la], bob), "closed");
  await reverts(ks("cancel", [la], alice), "closed");
  await reverts(ks("cancel", [la], dave), "closed");

  // 2. after settlement: the seller closes lb (during the grace period) and is paid; its slots are cleared too
  await ok(await kw("settle", [id], dave, face));
  const bb = await bal(bob);
  const { fee } = await spent(await kw("cancel", [lb], bob));
  assert.equal((await bal(bob)) - bb, face / 10n - fee);
  assert.deepEqual(await slots(lb), [0n, 0n]);
  await reverts(ks("buy", [lb, 1n], carol, 1n), "amount");
  await reverts(ks("cancel", [lb], bob), "closed");

  // 3. the depositor's close after the grace period keeps the listing (its deposit is not the depositor's to collect)
  for (const who of [alice, bob, carol]) await ok(await kw("claim", [id], who));
  await warp(GRACE);
  const [w0] = await slots(lc);
  const bc = await bal(bob);
  await ok(await kw("cancel", [lc], alice));
  assert.equal((await bal(bob)) - bc, face / 10n); // paid to the seller
  assert.deepEqual(await slots(lc), [w0, id]); // seller and price kept, remaining 0
  await reverts(ks("cancel", [lc], alice), "closed");
  await reverts(ks("cancel", [lc], bob), "closed");

  // Lens: the count is unchanged, cleared listings read as empty, the depositor-closed one keeps its seller, all in one window
  assert.equal(await lens("listingCount", [kit]), n0 + 3n);
  const ls = await lens("listings", [kit, la, 3n]);
  const blank = { seller: ZERO, fraction: ZERO, payToken: NATIVE, price: 0n, remaining: 0n, receiptId: 0n };
  assert.deepEqual(ls.map((l) => ({ ...l, seller: getAddress(l.seller), fraction: getAddress(l.fraction), payToken: getAddress(l.payToken) })), [
    blank, blank, { seller: bob, fraction: token, payToken: NATIVE, price: 4n * 10n ** 17n, remaining: 0n, receiptId: id }]); // the receipt is still locked here, so lc still names its share token
  // the app: open listings are the ones with shares left (none of these), and sellers come from the list events
  assert.equal(ls.filter((l) => l.remaining > 0n).length, 0);
  const evs = await pub.getContractEvents({ address: kit, abi: K, eventName: "Activity", fromBlock: 0n });
  const sellerByLid = new Map(evs.filter((e) => e.args.kind === 6n).map((e) => [e.args.a, getAddress(e.args.actor)]));
  assert.deepEqual([la, lb, lc].map((l) => sellerByLid.get(l)), [bob, bob, bob]);
  assert.equal(await r(token, F, "totalSupply"), 0n);
  await ok(await kw("redeem", [id]));
});

test("fix 3: a payout to a holder or seller that rejects tPOT is credited, never reverts; withdraw(to) pays it out", async () => {
  const bad = await receiver(true);
  const id = await mint(alice);
  const face = 9n * E18;
  const token = await lock(id, 9n, alice, face);
  await ok(await w(token, F, "transfer", [bad, 5n * E18], alice));
  const lr = await ok(await asC(bad, kit, K, "list", [id, E18, 3n * E18]));
  const lid = parseEventLogs({ abi: K, logs: lr.logs, eventName: "Activity" })[0].args.a;
  // the buyer's payment cannot reach the seller: it is credited and the purchase still goes through
  await ok(await kw("buy", [lid, 2n * E18], carol, 2n * E18));
  assert.equal(await r(token, F, "balanceOf", [carol]), 2n * E18);
  assert.equal(await credit(bad), 2n * E18);
  await ok(await kw("settle", [id], dave, face));
  await ok(await asC(bad, kit, K, "cancel", [lid])); // the seller closes it: 1 escrowed share, its payout is credited
  assert.equal(await credit(bad), 3n * E18);
  await reverts(ks("claimFor", [id, bad], alice), "grace");
  await warp(GRACE);
  await ok(await kw("claimFor", [id, bad], alice)); // the depositor, after the grace period: its 2 remaining shares, credited too
  assert.equal(await credit(bad), 5n * E18);
  assert.equal(await bal(bad), 0n);
  for (const who of [alice, carol]) await ok(await kw("claim", [id], who));
  await ok(await kw("redeem", [id])); // nothing blocks redeem, even before the credit is withdrawn
  await reverts(ks("withdraw", [ZERO], bad), "zero");
  await reverts(ks("withdraw", [bad], bad), "pay"); // it still refuses tPOT: the whole call reverts, the credit stays
  await reverts(ks("withdraw", [bob], bob), "no credit");
  assert.equal(await credit(bad), 5n * E18);
  const k0 = await bal(kit), e0 = await bal(erin);
  const wr = await ok(await asC(bad, kit, K, "withdraw", [erin]));
  assert.equal((await bal(erin)) - e0, 5n * E18);
  assert.equal(k0 - (await bal(kit)), 5n * E18);
  assert.equal(await credit(bad), 0n);
  const a = parseEventLogs({ abi: K, logs: wr.logs, eventName: "Activity" })[0].args;
  assert.deepEqual([a.id, a.actor, a.kind, a.a, a.b], [0n, bad, 9n, 5n * E18, BigInt(erin)]);
  await reverts(ks("withdraw", [erin], bad), "no credit");
});

test("fix 4: share transfers to the PotKit contract or to any share token are refused; list() still escrows", async () => {
  const id = await mint(alice);
  const token = await lock(id, 5n);
  const other = await lock(await mint(alice), 1n);
  for (const to of [kit, token, other]) await reverts(sim(token, F, "transfer", [to, E18], alice), "recipient");
  await ok(await w(token, F, "approve", [bob, 5n * E18], alice));
  for (const to of [kit, token, other]) await reverts(sim(token, F, "transferFrom", [alice, to, E18], bob), "recipient");
  await ok(await w(token, F, "transferFrom", [alice, carol, E18], bob)); // ordinary recipients still work
  await ok(await kw("list", [id, E18, 2n * E18]));
  assert.equal(await r(token, F, "balanceOf", [kit]), 2n * E18);
  assert.equal(await r(token, F, "balanceOf", [alice]), 2n * E18);
  assert.equal(await r(token, F, "balanceOf", [token]), 0n);
});

test("fix 4b: receipts cannot be transferred to the PotKit address; fractionalize still locks them there", async () => {
  const id = await mint(alice);
  await reverts(ks("transferFrom", [alice, kit, id]), "recipient");
  await reverts(ks("safeTransferFrom", [alice, kit, id]), "recipient");
  await reverts(ks("safeTransferFrom", [alice, kit, id, "0x1234"]), "recipient");
  await ok(await kw("approve", [bob, id])); // approved spenders and operators are refused the same way
  await reverts(ks("transferFrom", [alice, kit, id], bob), "recipient");
  await ok(await kw("setApprovalForAll", [carol, true]));
  await reverts(ks("transferFrom", [alice, kit, id], carol), "recipient");
  await ok(await kw("setApprovalForAll", [carol, false]));
  assert.equal(await kr("ownerOf", [id]), alice);
  const k0 = await kr("balanceOf", [kit]);
  await lock(id, 2n); // the internal lock moves it into PotKit
  assert.equal(await kr("ownerOf", [id]), kit);
  assert.equal(await kr("balanceOf", [kit]), k0 + 1n);
  await ok(await kw("redeem", [id])); // and redeem moves it back out
  assert.equal(await kr("ownerOf", [id]), alice);
  await ok(await kw("transferFrom", [alice, bob, id])); // ordinary transfers still work
  assert.equal(await kr("ownerOf", [id]), bob);
});

test("fix 5: setMinter emits MinterSet(minter, allowed) on every call", async () => {
  for (const [who, on] of [[carol, true], [carol, true], [carol, false], [dave, false]]) {
    const rc = await ok(await kw("setMinter", [who, on]));
    const ev = parseEventLogs({ abi: K, logs: rc.logs, eventName: "MinterSet" });
    assert.equal(ev.length, 1);
    assert.deepEqual([getAddress(ev[0].address), ev[0].args.minter, ev[0].args.allowed], [kit, who, on]);
    assert.deepEqual(await lens("meta", [kit, who]), [alice, on]);
  }
});

// ---- settlement property: every payout adds up, the pool empties, redeem always becomes possible ----
/** Seeded random numbers, so a failing case replays with the same seed (PROP_SEED=<text> npm test). */
function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const next32 = () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), h | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const big = (max) => { let x = 0n; for (let i = 0; i < 10; i++) x = (x << 32n) | BigInt(next32()); return x % max; }; // in [0, max)
  const int = (n) => Number(big(BigInt(n)));
  return { big, int, pick: (a) => a[int(a.length)], shuffle: (a) => { for (let i = a.length - 1; i > 0; i--) { const j = int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; } };
}

/** One life cycle of a receipt, checked against an exact ledger of every native tPOT movement. Alice locks `units`
    shares with `face`, hands out `give` ([holder, raw share units]), the holders open `lists` ([seller, raw, price,
    [[buyer, raw]...]]) before settlement, a random account settles exactly `face`, then every holder is paid out
    and every open listing is closed, all in random order: in half of the cases during the grace period (only the holder
    claims and only the seller closes; the depositor and a stranger are refused), in the other half after it (then the
    depositor, alice, may also pay holders out and close listings). Holders and sellers include a contract that accepts tPOT and one that rejects it (its payouts are credited
    and withdrawn at the end). Checks: each payout follows the cumulative rounding and stays within 1 wei of the exact
    share, the payouts add up to the face value, every account ends at exactly the balance the ledger predicts, the
    pool is back at its starting balance (it holds 0 for this receipt), every share is burned and the depositor can redeem. */
async function lifecycle(R, { units, face, give, lists = [] }, ctx, label) {
  const { okC, badC } = ctx;
  const contracts = new Set([okC, badC]);
  const id = await mint(alice);
  const token = await lock(id, units, alice, face);
  const supply = units * E18;
  const watched = [alice, bob, carol, dave, erin, frank, okC, badC, kit];
  const start = new Map();
  for (const a of watched) start.set(a, await bal(a));
  assert.equal(await credit(badC), 0n, `${label}: no credit left over from earlier cases`);
  const ledger = new Map(watched.map((a) => [a, 0n]));
  const add = (who, v) => ledger.set(who, ledger.get(who) + v);
  let owed = 0n; // credited to badC (stays in the pool until withdrawn)
  const deliver = (to, v) => { if (to === badC) owed += v; else { add(to, v); add(kit, -v); } };
  /** send a tx from `who` (a contract acts through exec, alice sends it); records the fee and the value sent */
  const tx = async (who, target, abi, fn, args, value = 0n) => {
    const sender = contracts.has(who) ? alice : who;
    const hash = contracts.has(who) ? await asC(who, target, abi, fn, args, value) : await w(target, abi, fn, args, who, value || undefined);
    const { rc, fee } = await spent(hash);
    add(sender, -fee - value);
    if (value) add(target === kit ? kit : target, value);
    return rc;
  };
  const acts = (rc) => parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" }).map((l) => l.args);

  const held = new Map([[alice, supply]]);
  const move = (f, t, v) => { held.set(f, held.get(f) - v); held.set(t, (held.get(t) ?? 0n) + v); };
  for (const [who, raw] of give) { await tx(alice, token, F, "transfer", [who, raw]); move(alice, who, raw); }

  const open = new Map(); // lid -> { seller, left }
  for (const [seller, raw, price, buys] of lists) {
    const lid = acts(await tx(seller, kit, K, "list", [id, price, raw]))[0].a;
    move(seller, kit, raw);
    const l = { seller, left: raw };
    open.set(lid, l);
    for (const [buyer, amt] of buys) {
      const cost = (price * amt + E18 - 1n) / E18;
      await tx(buyer, kit, K, "buy", [lid, amt], cost);
      deliver(seller, cost);
      l.left -= amt; held.set(kit, held.get(kit) - amt); held.set(buyer, (held.get(buyer) ?? 0n) + amt);
    }
  }
  assert.equal(await r(token, F, "balanceOf", [kit]), [...open.values()].reduce((s, l) => s + l.left, 0n), `${label}: escrow`);

  const payer = R.pick([alice, bob, carol, dave, erin, frank]);
  await reverts(ks("settle", [id], payer, face + 1n), "overpaid");
  await reverts(ks("settle", [id], payer, face - 1n), "underpaid");
  await tx(payer, kit, K, "settle", [id], face);

  // pay everybody out in random order
  const steps = R.shuffle([
    ...[...held].filter(([who, s]) => who !== kit && s > 0n).map(([who]) => ({ holder: who })),
    ...[...open].filter(([, l]) => l.left > 0n).map(([lid]) => ({ lid })),
  ]);
  const eoas = [alice, bob, carol, dave, erin, frank];
  const late = R.int(2) === 0;
  if (late) await warp(GRACE);
  else {
    const h = steps.find((s) => s.holder && s.holder !== alice)?.holder;
    if (h) {
      await reverts(ks("claimFor", [id, h], alice), "grace");
      await reverts(ks("claimFor", [id, h], R.pick(eoas.filter((x) => x !== alice && x !== h))), "not depositor");
    }
  }
  let burned = 0n, sum = 0n;
  for (const [i, step] of steps.entries()) {
    if (i === steps.length - 1) await reverts(ks("redeem", [id]), "claim first"); // one step left: still blocked
    let rc, shares, to;
    if (step.holder) {
      to = step.holder; shares = held.get(to);
      const self = !late || R.int(2) === 0;
      rc = self ? await tx(to, kit, K, "claim", [id]) : await tx(alice, kit, K, "claimFor", [id, to]);
      held.set(to, 0n);
    } else {
      const l = open.get(step.lid);
      to = l.seller; shares = l.left;
      rc = await tx(late && R.int(2) === 0 ? alice : l.seller, kit, K, "cancel", [step.lid]);
      l.left = 0n;
    }
    const a = acts(rc).find((x) => x.kind === 5n);
    const expected = (face * (burned + shares)) / supply - (face * burned) / supply;
    assert.deepEqual([a.a, a.b, a.c], [shares, expected, BigInt(to)], `${label}: payout ${i} to ${to}`);
    assert.ok(expected * supply > face * shares - supply && expected * supply < face * shares + supply, `${label}: within 1 wei of the exact share`);
    deliver(to, expected);
    burned += shares; sum += expected;
  }
  assert.equal(sum, face, `${label}: the payouts add up to the amount settled`);
  assert.equal(burned, supply, `${label}: every share was paid out`);
  assert.equal(await r(token, F, "totalSupply"), 0n, `${label}: every share is burned`);
  assert.equal(await credit(badC), owed, `${label}: credit of the contract that rejects tPOT`);
  if (owed) { await tx(badC, kit, K, "withdraw", [frank]); add(frank, owed); add(kit, -owed); }
  assert.equal(await credit(badC), 0n);
  await tx(alice, kit, K, "redeem", [id]);
  assert.equal(await kr("ownerOf", [id]), alice, `${label}: the depositor redeemed`);
  assert.equal(ledger.get(kit), 0n, `${label}: ledger of the pool`);
  for (const a of watched) assert.equal((await bal(a)) - start.get(a), ledger.get(a), `${label}: native balance of ${a}`);
}

test("property: for random holder splits, listings, buys and claim orders the payouts add up, the pool empties and redeem works", async () => {
  const ctx = { okC: await receiver(), badC: await receiver(true) };
  const { okC, badC } = ctx;
  const R0 = rng("edges");
  // fixed cases first: the ones that leave dust, paid out in random order
  const edges = [
    { label: "100 shares in 3 holders, amount not divisible", units: 100n, give: [[bob, 100n * E18 / 3n], [carol, 100n * E18 / 3n]], face: E18 + 7n },
    { label: "three holders of 1 wei each next to the issuer", units: 1n, give: [[bob, 1n], [okC, 1n], [badC, 1n]], face: 1_000_000_007n },
    { label: "1 wei of shares next to a huge holder, large payment", units: 3n, give: [[bob, 3n * E18 - 1n]], face: 10n ** 19n + 3n },
    { label: "1 wei paid, split three ways", units: 1n, give: [[bob, 333_333_333_333_333_333n], [carol, 333_333_333_333_333_333n]], face: 1n },
    { label: "a seller that rejects tPOT, partly sold and closed after settlement", units: 10n, give: [[badC, 6n * E18]], face: 10n ** 18n + 1n,
      lists: [[badC, 4n * E18, 10n ** 15n + 1n, [[carol, E18 / 3n]]], [alice, 1n, 1n, []]] },
  ];
  for (const e of edges) await lifecycle(R0, e, ctx, e.label);
  // then random combinations of holders, share sizes, listings, buys, payer, callers and order
  const SEED = process.env.PROP_SEED ?? "potkit-v2-1", CASES = Number(process.env.PROP_CASES ?? 24);
  const R = rng(SEED);
  const people = [bob, carol, dave, erin, frank, okC, badC];
  const eoas = [alice, bob, carol, dave, erin, frank];
  const mag = () => 10n ** BigInt(R.int(20)); // 1 wei up to 10^19 wei
  for (let i = 0; i < CASES; i++) {
    const units = R.pick([1n, 2n, 3n, 7n, 100n, 1000n, 10n ** 12n, 1n + R.big(1_000_000n)]);
    let left = units * E18;
    const held = new Map([[alice, left]]);
    const give = [];
    for (const who of R.shuffle([...people]).slice(0, 1 + R.int(people.length))) {
      if (left === 0n) break;
      const kind = R.int(4); // 1 wei · up to 1000 wei · a random part of what is left · whole shares
      let raw = kind === 0 ? 1n : kind === 1 ? 1n + R.big(1000n) : kind === 2 ? 1n + R.big(left) : E18 * (1n + R.big(units));
      if (raw > left) raw = left;
      give.push([who, raw]); left -= raw; held.set(who, raw); held.set(alice, left);
    }
    const lists = [];
    for (let n = R.int(4); n > 0; n--) {
      const sellers = [...held].filter(([, s]) => s > 0n);
      if (!sellers.length) break;
      const [seller, s] = R.pick(sellers);
      const raw = 1n + R.big(s);
      held.set(seller, s - raw);
      const price = 1n + R.big(10n ** 15n);
      let rest = raw;
      const buys = [];
      for (let b = R.int(3); b > 0 && rest > 0n; b--) {
        const cap = rest < 1000n * E18 ? rest : 1000n * E18; // keeps every purchase under ~1 tPOT
        const amt = 1n + R.big(cap);
        buys.push([R.pick(eoas.filter((x) => x !== seller)), amt]); rest -= amt;
      }
      lists.push([seller, raw, price, buys]);
    }
    const face = 1n + R.big(mag());
    await lifecycle(R, { units, face, give, lists }, ctx, `case ${i} (seed ${SEED})`);
  }
});

test("status from Lens: Free → Pending → Due soon → Overdue → Settled", async () => {
  const id = await mint(alice);
  const st = async () => (await lens("statuses", [kit, id, 1n]))[0][0];
  assert.equal(await st(), 0);
  await lock(id, 1n, alice, 10n, (await now()) + 10n * DAY);
  assert.equal(await st(), 1);
  await pub.request({ method: "evm_increaseTime", params: [Number(8n * DAY)] });
  await pub.request({ method: "evm_mine", params: [] });
  assert.equal(await st(), 2);
  await pub.request({ method: "evm_increaseTime", params: [Number(3n * DAY)] });
  await pub.request({ method: "evm_mine", params: [] });
  assert.equal(await st(), 3);
  await ok(await kw("settle", [id], bob, 10n));
  assert.equal(await st(), 4);
});

// ---- market (native tPOT) ------------------------------------------------------------------------
test("Market: list escrows, partial + full buy with exact tPOT, cost rounds up, seller paid, cancel returns rest", async () => {
  const id = await mint(alice);
  const token = await lock(id, 100n);
  const price = 3n * 10n ** 17n + 1n; // 0.3 tPOT + 1 wei per share
  await reverts(ks("list", [id, price, 0n]), "amount");
  await reverts(ks("list", [id, 0n, E18]), "price");
  await reverts(ks("list", [id, 1n << 96n, E18]), "price");
  await reverts(ks("list", [id, price, 101n * E18]), "balance");
  const rc = await ok(await kw("list", [id, price, 10n * E18]));
  const act = parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args;
  const lid = act.a;
  assert.deepEqual([act.kind, act.b, act.c], [6n, price, 10n * E18]);
  assert.equal(await r(token, F, "balanceOf", [kit]), 10n * E18);
  assert.equal(await r(token, F, "balanceOf", [alice]), 90n * E18);
  const [l] = await lens("listings", [kit, lid, 1n]);
  assert.deepEqual([l.seller, l.fraction, l.payToken, l.price, l.remaining, l.receiptId], [alice, token, NATIVE, price, 10n * E18, id]);

  const amt = E18 / 3n; // 0.333… shares → cost rounds up
  const cost = (price * amt + E18 - 1n) / E18;
  await reverts(ks("buy", [lid, amt], bob, cost - 1n), "value");
  await reverts(ks("buy", [lid, amt], bob, cost + 1n), "value");
  await reverts(ks("buy", [lid, amt], alice, cost), "own listing");
  await reverts(ks("buy", [lid, 11n * E18], bob, 0n), "amount");
  await reverts(ks("buy", [lid + 99n, amt], bob, cost), "no listing");
  const a0 = await bal(alice);
  const b = await ok(await kw("buy", [lid, amt], bob, cost));
  assert.deepEqual(parseEventLogs({ abi: K, logs: b.logs, eventName: "Activity" })[0].args.c, cost);
  assert.equal((await bal(alice)) - a0, cost); // seller is paid in the same tx
  assert.equal(await r(token, F, "balanceOf", [bob]), amt);
  const rest = 10n * E18 - amt;
  assert.equal((await lens("listings", [kit, lid, 1n]))[0].remaining, rest);
  await reverts(ks("cancel", [lid], bob), "not seller");
  await ok(await kw("cancel", [lid]));
  assert.equal(await r(token, F, "balanceOf", [alice]), 90n * E18 + rest);
  assert.equal(await r(token, F, "balanceOf", [kit]), 0n);
  await reverts(ks("cancel", [lid]), "closed");
  await reverts(ks("buy", [lid, 1n], bob, 1n), "amount");
  // full buy of a fresh listing
  const rc2 = await ok(await kw("list", [id, E18, 2n * E18]));
  const lid2 = parseEventLogs({ abi: K, logs: rc2.logs, eventName: "Activity" })[0].args.a;
  assert.equal(lid2, lid + 1n);
  await ok(await kw("buy", [lid2, 2n * E18], carol, 2n * E18));
  assert.equal((await lens("listings", [kit, lid2, 1n]))[0].remaining, 0n);
});

test("Market: no listing on unlocked receipts; no buying/listing after settlement; seller's cancel then pays out the escrow", async () => {
  const free = await mint(alice);
  await reverts(ks("list", [free, E18, E18]), "not locked");
  const id = await mint(alice);
  const face = 10n ** 16n;
  const token = await lock(id, 10n, alice, face);
  const rc = await ok(await kw("list", [id, E18, 5n * E18]));
  const lid = parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args.a;
  await reverts(ks("redeem", [id]), "need all units"); // escrowed shares block redeem
  await ok(await kw("settle", [id], dave, face));
  await reverts(ks("buy", [lid, E18], bob, E18), "settled");
  await reverts(ks("list", [id, E18, E18]), "settled");
  const a0 = await bal(alice);
  const { rc: cr, fee } = await spent(await kw("cancel", [lid]));
  assert.equal((await bal(alice)) - a0 + fee, face / 2n); // the 5 escrowed shares are paid out, not returned
  const acts = parseEventLogs({ abi: K, logs: cr.logs, eventName: "Activity" }).map((l) => l.args);
  assert.deepEqual(acts.map((a) => [a.kind, a.a, a.b, a.c]), [[8n, lid, 5n * E18, 1n], [5n, 5n * E18, face / 2n, BigInt(alice)]]);
  assert.equal(await r(token, F, "balanceOf", [alice]), 5n * E18);
  assert.equal(await r(token, F, "balanceOf", [kit]), 0n);
  await ok(await kw("claim", [id]));
  await ok(await kw("redeem", [id]));
});

test("Lens: rows / balances / claimables / listings windows are consistent", async () => {
  const total = await lens("count", [kit]);
  const rows = await lens("rows", [kit, 1n, 50n]);
  assert.equal(BigInt(rows.length), total > 50n ? 50n : total);
  assert.deepEqual(await lens("rows", [kit, total + 5n, 10n]), []);
  const id = await mint(alice);
  const token = await lock(id, 4n, alice, 4n * E18);
  await ok(await w(token, F, "transfer", [bob, E18], alice));
  const [b] = await lens("balances", [kit, bob, id, 1n]);
  assert.equal(b, E18);
  await ok(await kw("settle", [id], dave, 4n * E18));
  assert.equal((await lens("claimables", [kit, bob, id, 1n]))[0], E18);
  assert.equal((await lens("claimables", [kit, carol, id, 1n]))[0], 0n);
  const n = await lens("listingCount", [kit]);
  assert.equal((await lens("listings", [kit, 0n, 50n])).length, Number(n > 50n ? 50n : n));
  assert.deepEqual(await lens("listings", [kit, n + 1n, 5n]), []);
  // peek is just sload
  const [w0] = await kr("peek", [[0n]]);
  assert.equal(w0 >> 96n, BigInt(alice));
  assert.equal((w0 >> 48n) & 0xffffffffffffn, total + 1n);
});
