import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const src = transformSync(readFileSync(new URL("../api/_faucet-core.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const F = await import("data:text/javascript," + encodeURIComponent(src));
const E = 10n ** 18n;
const FAUCET = "0x1111111111111111111111111111111111111111";
const ALICE = "0x2222222222222222222222222222222222222222";
const BOB = "0x3333333333333333333333333333333333333333";

function mockChain({ balances = {}, faucet = 100n * E, fee = 10n ** 15n, sendErr = null, rpcDown = false } = {}) {
  const sent = [];
  return {
    sent, faucetAddress: FAUCET,
    async getBalance(a) { if (rpcDown) throw new Error("fetch failed"); return a === FAUCET ? faucet : balances[a.toLowerCase()] ?? 0n; },
    async feeBuffer() { if (rpcDown) throw new Error("fetch failed"); return fee; },
    async send(to, value) { if (sendErr) throw new Error(sendErr); sent.push({ to, value }); return "0x" + "ab".repeat(32); },
  };
}
const cfg = (over = {}) => ({ ...F.readConfig({ FAUCET_PRIVATE_KEY: "0x" + "1".repeat(64), FAUCET_AMOUNT: "0.5" }), ...over });

test("faucet config: amount parsing (18-dp), threshold default, disabled without key", () => {
  assert.equal(F.parseAmount("0.5", "1"), 5n * 10n ** 17n);
  assert.equal(F.parseAmount("", "2"), 2n * E);
  assert.throws(() => F.parseAmount("1e3", "1"));
  const c = F.readConfig({ FAUCET_PRIVATE_KEY: "0x" + "a".repeat(64), FAUCET_AMOUNT: "0.25" });
  assert.equal(c.enabled, true); assert.equal(c.threshold, c.amount); assert.equal(c.perHour, 30);
  assert.equal(F.readConfig({}).enabled, false);
  assert.equal(F.readConfig({ FAUCET_PRIVATE_KEY: "nope" }).reason, "FAUCET_PRIVATE_KEY is malformed");
  assert.equal(F.fmtWei(15n * 10n ** 17n), "1.5");
});

test("faucet: validates address and chain; disabled → 503", async () => {
  const ch = mockChain(), st = F.memoryStore();
  assert.equal((await F.request(cfg(), ch, st, { body: { address: "0x123" }, ip: "1" })).body.error, "bad_address");
  assert.equal((await F.request(cfg(), ch, st, { body: null, ip: "1" })).body.error, "bad_address");
  assert.equal((await F.request(cfg(), ch, st, { body: { address: ALICE, chainId: 1 }, ip: "1" })).body.error, "wrong_chain");
  const off = await F.request(F.readConfig({}), null, st, { body: { address: ALICE }, ip: "1" });
  assert.equal(off.status, 503); assert.equal(off.body.error, "faucet_disabled");
  assert.equal(ch.sent.length, 0);
});

test("faucet: sends amount, then rate-limits same address and same IP for 24h", async () => {
  let now = 1_000_000_000_000;
  const ch = mockChain(), st = F.memoryStore(() => now);
  const ok = await F.request(cfg(), ch, st, { body: { address: ALICE, chainId: 420420777 }, ip: "9.9.9.9", now });
  assert.equal(ok.status, 200); assert.match(ok.body.hash, /^0x[0-9a-f]{64}$/);
  assert.deepEqual(ch.sent, [{ to: ALICE, value: 5n * 10n ** 17n }]);
  const again = await F.request(cfg(), ch, st, { body: { address: ALICE }, ip: "8.8.8.8", now });
  assert.equal(again.status, 429); assert.equal(again.body.scope, "address");
  const sameIp = await F.request(cfg(), ch, st, { body: { address: BOB }, ip: "9.9.9.9", now });
  assert.equal(sameIp.status, 429); assert.equal(sameIp.body.scope, "ip");
  now += 86_401_000; // a day later both are free again
  assert.equal((await F.request(cfg(), ch, st, { body: { address: BOB }, ip: "9.9.9.9", now })).status, 200);
});

test("faucet: skips funded recipients, refuses when empty, global hourly cap", async () => {
  const st = F.memoryStore();
  const rich = await F.request(cfg(), mockChain({ balances: { [ALICE.toLowerCase()]: E } }), st, { body: { address: ALICE }, ip: "1" });
  assert.equal(rich.status, 409); assert.equal(rich.body.error, "already_funded");
  const empty = await F.request(cfg(), mockChain({ faucet: 10n ** 17n }), st, { body: { address: ALICE }, ip: "1" });
  assert.equal(empty.body.error, "faucet_empty");
  // neither attempt consumed the address limit
  const ch = mockChain(), st2 = F.memoryStore();
  const c1 = cfg({ perHour: 1 });
  assert.equal((await F.request(c1, ch, st2, { body: { address: ALICE }, ip: "1", now: 0 })).status, 200);
  const capped = await F.request(c1, ch, st2, { body: { address: BOB }, ip: "2", now: 0 });
  assert.equal(capped.status, 429); assert.equal(capped.body.scope, "global");
});

test("faucet: failed send releases limits; RPC down → 502; GET status", async () => {
  const st = F.memoryStore();
  const bad = await F.request(cfg(), mockChain({ sendErr: "nonce too low" }), st, { body: { address: ALICE }, ip: "1" });
  assert.equal(bad.body.error, "send_failed");
  assert.equal((await F.request(cfg(), mockChain(), st, { body: { address: ALICE }, ip: "1" })).status, 200, "retry allowed after failure");
  assert.equal((await F.request(cfg(), mockChain({ rpcDown: true }), F.memoryStore(), { body: { address: BOB }, ip: "3" })).body.error, "rpc_unavailable");
  const s = await F.status(cfg(), mockChain({ balances: { [ALICE.toLowerCase()]: 10n ** 17n } }), ALICE);
  assert.equal(s.body.enabled, true); assert.equal(s.body.address, FAUCET); assert.equal(s.body.balance, "100"); assert.equal(s.body.recipient.eligible, true);
  assert.equal((await F.status(F.readConfig({}), null)).body.enabled, false);
});

test("faucet: KV store speaks Upstash REST (SET NX EX / INCR+EXPIRE / DEL)", async () => {
  const calls = []; const db = new Map();
  const fakeFetch = async (_u, init) => {
    const a = JSON.parse(init.body); calls.push(a[0]);
    let result = null;
    if (a[0] === "SET") result = db.has(a[1]) ? null : (db.set(a[1], a[2]), "OK");
    if (a[0] === "DEL") result = Number(db.delete(a[1]));
    if (a[0] === "INCR") { const v = Number(db.get(a[1]) ?? 0) + 1; db.set(a[1], v); result = v; }
    if (a[0] === "EXPIRE") result = 1;
    return { ok: true, json: async () => ({ result }) };
  };
  const kv = F.kvStore("https://kv.example", "t", fakeFetch);
  assert.equal(await kv.claim("k", 10), true); assert.equal(await kv.claim("k", 10), false);
  await kv.release("k"); assert.equal(await kv.claim("k", 10), true);
  assert.equal(await kv.incr("h", 3600), 1); assert.equal(await kv.incr("h", 3600), 2);
  assert.deepEqual(calls, ["SET", "SET", "DEL", "SET", "INCR", "EXPIRE", "INCR"]);
});
