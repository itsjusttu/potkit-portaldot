import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, defineChain, encodeFunctionData, getAddress, keccak256, parseEventLogs } from "viem";

const A = JSON.parse(readFileSync(new URL("../src/generated/artifacts.json", import.meta.url), "utf8"));
const chain = defineChain({ id: 1337, name: "local", nativeCurrency: { name: "E", symbol: "E", decimals: 18 }, rpcUrls: { default: { http: [] } } });
const E18 = 10n ** 18n;
const ZERO = "0x0000000000000000000000000000000000000000";
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const K = A.PotKit.abi;
const F = A.Fraction.abi;
let pub, wal, alice, bob, carol, dave, kit;

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
async function now() {
  return (await pub.getBlock()).timestamp;
}
async function lock(id, units, who = alice, face = 1000n * E18, due = 0n) {
  const rc = await ok(await kw("fractionalize", [id, units, face, due], who));
  const act = parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args;
  assert.equal(act.kind, 1n);
  return getAddress(rc.logs.find((l) => l.address.toLowerCase() !== kit.toLowerCase()).address);
}
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
  [alice, bob, carol, dave] = await wal.getAddresses();
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

test("overpayment stays in the pool; payouts to a contract holder work; settle on unlocked reverts", async () => {
  const id = await mint(alice);
  const token = await lock(id, 2n, alice, 100n);
  const d = await ok(await wal.deployContract({ abi: A.TestReceiver.abi, bytecode: A.TestReceiver.bytecode, account: alice, chain, gas: 6_000_000n }));
  const c = getAddress(d.contractAddress);
  await ok(await w(token, F, "transfer", [c, E18], alice));
  await ok(await kw("settle", [id], bob, 300n));
  const c0 = await bal(c);
  await ok(await w(c, A.TestReceiver.abi, "exec", [kit, encodeFunctionData({ abi: K, functionName: "claim", args: [id] })], alice));
  assert.equal((await bal(c)) - c0, 150n);
  const free = await mint(alice);
  await reverts(ks("settle", [free], bob, 1n), "not locked");
  await reverts(ks("settle", [9999n], bob, 1n), "not locked");
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

test("Market: no listing on unlocked receipts; no buying/listing after settlement; seller can cancel and claim", async () => {
  const free = await mint(alice);
  await reverts(ks("list", [free, E18, E18]), "not locked");
  const id = await mint(alice);
  const token = await lock(id, 10n, alice, 10n ** 16n);
  const rc = await ok(await kw("list", [id, E18, 5n * E18]));
  const lid = parseEventLogs({ abi: K, logs: rc.logs, eventName: "Activity" })[0].args.a;
  await reverts(ks("redeem", [id]), "need all units"); // escrowed shares block redeem
  await ok(await kw("settle", [id], dave, 10n ** 16n));
  await reverts(ks("buy", [lid, E18], bob, E18), "settled");
  await reverts(ks("list", [id, E18, E18]), "settled");
  await ok(await kw("cancel", [lid]));
  assert.equal(await r(token, F, "balanceOf", [alice]), 10n * E18);
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
