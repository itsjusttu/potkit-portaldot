// PotKit v2 testnet helper. Reads use the app's own code (src/lib/chain.ts, Lens); writes go through the wallet the
// user picks (EIP-6963), signed there. No private key is ever read or stored. Test tooling only: not part of the app.
import { concat, createPublicClient, createWalletClient, custom, decodeErrorResult, encodeFunctionData, formatEther, getAddress, http, isAddress, pad, type Address, type Hex } from "viem";
import { gasPlan, loadCredit, loadListings, loadRows, portaldot, revertReason, RPC_URLS, type Row } from "../../src/lib/chain";
import { switchToPortaldotWith } from "../../src/lib/netswitch";
import { listWallets, onWalletsChanged, startDiscovery, type Eip1193 } from "../../src/lib/wallets";
import { Fraction, PotKit, REASON_CODES } from "../../src/generated/artifacts";
import tiny from "./tiny-receiver.json";
import built from "../../src/generated/artifacts.json"; // PotKitGrace10m: the 10-minute testnet build (not in the app bundle)

const DEFAULTS = {
  kit: "0xaa7d235a0f88deb64e86128738e6acbd279e7f77",
  addrB: "0x4De2308D558E01B0Aa1b5371A4d0b26D2e2988d1",
  addrC: "0xb4d6a1e35da961172154b3fa3411edbb43d33913",
  rcv: "",
};
const FAIL_GAS = 50_000_000_000_000n; // gas limit for "Send anyway": ≈0.5 tPOT at 10,180 wei; only the used gas is charged
const pc = createPublicClient({ chain: portaldot, transport: http(RPC_URLS[0], { retryCount: 3, timeout: 20_000 }) });

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const KEY = "potkit.v2helper";
const saved: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } })();
for (const k of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
  const el = $(k);
  el.value = saved[k] ?? DEFAULTS[k];
  el.addEventListener("change", () => { saved[k] = el.value.trim(); localStorage.setItem(KEY, JSON.stringify(saved)); });
}
const setSaved = (k: keyof typeof DEFAULTS, v: string) => { $(k).value = v; saved[k] = v; localStorage.setItem(KEY, JSON.stringify(saved)); };
const addrOf = (id: string, label: string): Address => { const v = $(id).value.trim(); if (!isAddress(v)) throw new Error(`${label} is not a valid 0x address.`); return getAddress(v); };
const kit = () => addrOf("kit", "PotKit address");
const rid = () => { const n = Number($("rid").value.trim()); if (!Number.isSafeInteger(n) || n < 1) throw new Error("Receipt id must be a whole number from 1."); return n; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const tpot = (v: bigint) => `<span title="${v} wei">${formatEther(v)}</span>`;
const shares = (v: bigint) => `<span title="${v} units">${formatEther(v)}</span>`;

// ---------------- log ----------------
const log = (html: string) => {
  const box = $("log");
  if (box.textContent === "Nothing yet.") box.innerHTML = "";
  const d = document.createElement("div");
  d.innerHTML = `<span class="muted">${new Date().toLocaleTimeString()}</span> ${html}`;
  box.prepend(d);
  return d;
};
/** PotKit reverts with a short code (Error(string) of one or two letters, see scripts/yulprep.mjs); REASON_CODES maps
 *  it back. eth_call errors from viem carry the revert data on a nested cause, so walk the chain for it first; the app's
 *  revertReason is the fallback (its text match misses viem's capitalised "Execution reverted"). */
const ERROR_ABI = [{ type: "error", name: "Error", inputs: [{ name: "reason", type: "string" }] }] as const;
const CODES = REASON_CODES as Record<string, string>;
function reasonOf(e: unknown): { code: string; text: string } | null {
  let cur = e as { data?: unknown; cause?: unknown } | undefined;
  for (let i = 0; cur && i < 10; i++) {
    const d = typeof cur.data === "string" ? cur.data : (cur.data as { data?: unknown } | undefined)?.data;
    if (typeof d === "string" && d.startsWith("0x08c379a0")) {
      try { const code = decodeErrorResult({ abi: ERROR_ABI, data: d as Hex }).args[0]; return { code, text: CODES[code] ?? code }; } catch { /* keep walking */ }
    }
    cur = cur.cause as typeof cur;
  }
  const r = revertReason(e);
  if (!r) return null;
  const code = Object.keys(CODES).find((k) => CODES[k] === r) ?? r;
  return { code, text: r };
}
const by = (from?: Address | null) => (from ? ` as <code>${from}</code>${roleOf(from) ? ` (${roleOf(from)})` : ""}` : "");
const fail = (label: string, e: unknown, from: Address | null = account) => {
  const r = reasonOf(e);
  const msg = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? String(e);
  log(`<b>${esc(label)}</b>${by(from)} <span class="chip bad">${r ? "reverts" : "failed"}</span> ${r ? `reason <code>"${esc(r.code)}"</code> = <b>${esc(r.text)}</b>` : esc(msg.slice(0, 300))}`);
};

// ---------------- wallet ----------------
let provider: Eip1193 | null = null;
let account: Address | null = null;
const roleOf = (a: string) => ([["A, kit deployer", "0xd1affc3b88e23bcbff209b36267744f8e2035bfb"], ["B", $("addrB").value], ["C", $("addrC").value], ["TinyReceiver", $("rcv").value]] as const)
  .find(([, x]) => x.trim().toLowerCase() === a.toLowerCase())?.[0] ?? "";
const renderWallets = () => {
  const box = $("wallets");
  box.innerHTML = "";
  const found = listWallets().filter((w) => w.provider);
  if (!found.length) { box.textContent = "No browser wallet detected."; return; }
  for (const w of found) {
    const b = document.createElement("button");
    b.textContent = `Connect ${w.name}`;
    b.onclick = () => void connect(w.provider!, w.name);
    box.append(b);
  }
};
async function connect(p: Eip1193, name: string) {
  try {
    const accs = (await p.request({ method: "eth_requestAccounts" })) as string[];
    provider = p; account = getAddress(accs[0]);
    p.on?.("accountsChanged", (a: string[]) => { account = a[0] ? getAddress(a[0]) : null; void who(name); });
    p.on?.("chainChanged", () => void who(name));
    await who(name);
  } catch (e) { fail("Connect", e); }
}
async function who(name = "wallet") {
  if (!provider || !account) { $("who").textContent = "Not connected."; return; }
  const chain = Number(await provider.request({ method: "eth_chainId" }));
  const bal = await pc.getBalance({ address: account }).catch(() => null);
  const role = roleOf(account) || "other";
  $("who").innerHTML = `${esc(name)} · <code>${account}</code> (${role}) · chain ${chain} ${chain === portaldot.id ? '<span class="chip ok">Portaldot V3</span>' : '<span class="chip bad">wrong network</span> <button id="sw">Switch</button>'} · balance ${bal === null ? "—" : tpot(bal)} tPOT`;
  const sw = document.getElementById("sw");
  if (sw) sw.onclick = () => void switchToPortaldotWith(provider).then(() => who(name), (e) => fail("Switch network", e));
}
const ready = async () => {
  if (!provider || !account) throw new Error("Connect a wallet first.");
  if (Number(await provider.request({ method: "eth_chainId" })) !== portaldot.id) await switchToPortaldotWith(provider);
  return { p: provider, from: account };
};

// ---------------- simulate / send ----------------
type Call = { to?: Address; data: Hex; value?: bigint };
/** `as`: run the eth_call from that address instead of the connected wallet (a stranger such as C; nothing is signed) */
async function simulate(label: string, c: Call, as?: Address) {
  let from: Address | null = as ?? account;
  try {
    from = as ?? (await ready()).from;
    const block = await pc.getBlockNumber();
    try {
      const r = await pc.call({ account: from, to: c.to, data: c.data, value: c.value, blockNumber: block });
      const out = r.data && r.data.length >= 66 ? BigInt(r.data.slice(0, 66)) : null;
      log(`<b>${esc(label)}</b> simulate${by(from)} at block ${block}: <span class="chip ok">would succeed</span>${out !== null ? ` returns ${tpot(out)} (as tPOT)` : ""}`);
    } catch (e) { fail(`${label} (simulate at block ${block})`, e, from); }
  } catch (e) { fail(`${label} (simulate)`, e, from); }
}
/** expectFail: skip the gas estimate (it would revert) and send with FAIL_GAS, to record a failed transaction on chain */
async function send(label: string, c: Call, expectFail = false): Promise<{ status: string; contractAddress?: Address | null } | null> {
  try {
    const { p, from } = await ready();
    const price = await pc.getGasPrice();
    const bal = await pc.getBalance({ address: from });
    let gas: bigint;
    if (expectFail) gas = FAIL_GAS;
    else {
      const est = await pc.estimateGas({ account: from, to: c.to, data: c.data, value: c.value });
      gas = gasPlan(est, price, bal, c.value ?? 0n); // same +20% buffer and balance cap as the app
    }
    const wc = createWalletClient({ chain: portaldot, transport: custom(p) });
    const hash = await wc.sendTransaction({ account: from, to: c.to ?? null, data: c.data, value: c.value ?? 0n, gas, gasPrice: price, type: "legacy", chain: portaldot } as never);
    const line = log(`<b>${esc(label)}</b> sent${by(from)} <code>${hash}</code> <button>Copy hash</button> · waiting…`);
    line.querySelector("button")!.onclick = () => void navigator.clipboard.writeText(hash);
    const r = await pc.waitForTransactionReceipt({ hash, timeout: 180_000 });
    const fee = r.gasUsed * r.effectiveGasPrice;
    line.innerHTML += ` <span class="chip ${r.status === "success" ? "ok" : "bad"}">${r.status}</span> block ${r.blockNumber}, fee ${tpot(fee)} tPOT${r.contractAddress ? `, contract <code>${r.contractAddress}</code>` : ""}`;
    if (r.status !== "success") {
      // a receipt carries no revert reason: replay the same call at the parent block to read it
      try { await pc.call({ account: from, to: c.to, data: c.data, value: c.value, blockNumber: r.blockNumber - 1n }); line.innerHTML += " · replay at the parent block succeeds (out of gas?)"; }
      catch (e) { const why = reasonOf(e); line.innerHTML += ` · replay at block ${r.blockNumber - 1n}: ${why ? `reason <code>"${esc(why.code)}"</code> = <b>${esc(why.text)}</b>` : "no reason"}`; }
    }
    void who();
    return r;
  } catch (e) { fail(label, e); return null; }
}

// ---------------- state ----------------
const row = async (): Promise<Row> => {
  const id = rid();
  const rows = await loadRows(kit(), 0, Math.max(20, id + 1));
  const r = rows.find((x) => x.id === id);
  if (!r) throw new Error(`Receipt #${id} not found on this kit.`);
  return r;
};
async function refresh() {
  const box = $("state");
  box.innerHTML = "Reading…";
  try {
    const k = kit(), r = await row();
    const names: [string, string][] = [["A (connected)", account ?? ""], ["B", $("addrB").value.trim()], ["C", $("addrC").value.trim()], ["TinyReceiver", $("rcv").value.trim()], ["PotKit escrow", k]];
    const who = names.filter(([, a]) => isAddress(a)).map(([n, a]) => [n, getAddress(a)] as const);
    const lines = await Promise.all(who.map(async ([n, a]) => {
      const [bal, sh, cr] = await Promise.all([
        pc.getBalance({ address: a }),
        r.fraction ? pc.readContract({ address: r.fraction as Address, abi: Fraction.abi, functionName: "balanceOf", args: [a] }) as Promise<bigint> : Promise.resolve(0n),
        loadCredit(k, a).catch(() => null),
      ]);
      return `<tr><td>${esc(n)}</td><td class="mono">${a}</td><td>${tpot(bal)}</td><td>${shares(sh)}</td><td>${cr === null ? "—" : tpot(cr)}</td></tr>`;
    }));
    const ls = (await loadListings(k)).filter((l) => l.receiptId === r.id);
    const s = r.settle;
    box.innerHTML = `
      <p>Receipt #${r.id} · <span class="chip ${s.settled ? "ok" : "open"}">${s.settled ? "Settled" : r.fraction ? "Open" : "Not locked"}</span> · owner <code>${r.owner}</code> · depositor <code>${r.depositor || "—"}</code><br>
      face value ${tpot(s.faceValue)} tPOT · pool ${tpot(s.amount)} tPOT · shares outstanding ${shares(r.supply)} · share token <code>${r.fraction || "—"}</code></p>
      <table><tr><th>Who</th><th>Address</th><th>tPOT</th><th>KIT${r.id} shares</th><th>Credit (held payout)</th></tr>${lines.join("")}</table>
      <p style="margin-top:10px">Listings: ${ls.length ? ls.map((l) => `#${l.lid} seller <code>${l.seller.slice(0, 8)}…</code> price ${tpot(l.price)} tPOT/share, remaining ${shares(l.remaining)}`).join(" · ") : "none"}</p>`;
  } catch (e) { box.innerHTML = `<span class="warn">${esc((e as Error).message ?? String(e))}</span>`; }
}

// ---------------- actions ----------------
const enc = (functionName: string, args: readonly unknown[]) => encodeFunctionData({ abi: PotKit.abi, functionName, args } as never);
const wrongSettle = async (): Promise<Call> => {
  const r = await row();
  if (!(r.settle.faceValue > 0n)) throw new Error("This receipt has no face value (not locked).");
  const value = $<HTMLSelectElement>("mode").value === "under" ? r.settle.faceValue - 1n : r.settle.faceValue + 1n;
  return { to: kit(), data: enc("settle", [BigInt(r.id)]), value };
};
const rcvWithdraw = (): Call => {
  const to = $("wto").value.trim() ? addrOf("wto", "To") : account;
  if (!to) throw new Error("Connect a wallet or enter a To address.");
  return { to: addrOf("rcv", "TinyReceiver address"), data: concat([pad(kit(), { size: 32 }), enc("withdraw", [to])]) };
};
const ownWithdraw = (): Call => {
  const to = $("oto").value.trim() ? addrOf("oto", "To") : account;
  if (!to) throw new Error("Connect a wallet or enter a To address.");
  return { to: kit(), data: enc("withdraw", [to]) };
};
const guard = (label: string, f: () => Promise<unknown>) => () => void f().catch((e) => fail(label, e));

$("refresh").onclick = () => void refresh();
$("deployKit").onclick = guard("Deploy PotKit v2.1 (10 min)", async () => {
  const b = built as unknown as { PotKitGrace10m: { bytecode: Hex; runtime: Hex } };
  const r = await send("Deploy PotKit v2.1, testnet build (10-minute grace)", { data: b.PotKitGrace10m.bytecode });
  if (r?.status === "success" && r.contractAddress) {
    const k = getAddress(r.contractAddress);
    const code = await pc.getCode({ address: k });
    const same = code?.toLowerCase() === b.PotKitGrace10m.runtime.toLowerCase();
    setSaved("kit", k);
    const grace = code ? Number.parseInt(code.slice(-8), 16) : 0;
    log(`PotKit v2.1 code: ${((code?.length ?? 2) - 2) / 2} bytes, grace ${grace} s, ${same ? '<span class="chip ok">matches the 10-minute build</span>' : '<span class="chip bad">does not match</span>'} · open the app on it: <a href="http://localhost:8080/app?kit=${k}" target="_blank" rel="noopener">localhost:8080/app?kit=${k.slice(0, 8)}…</a>`);
  }
});
$("deploy").onclick = guard("Deploy TinyReceiver", async () => {
  const r = await send("Deploy TinyReceiver", { data: tiny.initcode as Hex });
  if (r?.status === "success" && r.contractAddress) {
    const code = await pc.getCode({ address: r.contractAddress });
    const same = code?.toLowerCase() === tiny.runtime.toLowerCase();
    setSaved("rcv", getAddress(r.contractAddress));
    log(`TinyReceiver code: ${((code?.length ?? 2) - 2) / 2} bytes, ${same ? '<span class="chip ok">matches the compiled runtime</span>' : '<span class="chip bad">does not match</span>'}`);
  }
});
$("settleSim").onclick = guard("Settle (wrong amount)", async () => { const c = await wrongSettle(); await simulate(`Settle #${rid()} with ${formatEther(c.value!)} tPOT`, c); });
$("settleSend").onclick = guard("Settle (wrong amount)", async () => { const c = await wrongSettle(); await send(`Settle #${rid()} with ${formatEther(c.value!)} tPOT (expected to fail)`, c, true); });
$("redeemSim").onclick = guard("Redeem", async () => simulate(`Redeem #${rid()}`, { to: kit(), data: enc("redeem", [BigInt(rid())]) }));
$("redeemSend").onclick = guard("Redeem", async () => send(`Redeem #${rid()} (expected to fail)`, { to: kit(), data: enc("redeem", [BigInt(rid())]) }, true));
$("rwSim").onclick = guard("Receiver withdraw", async () => simulate("TinyReceiver → withdraw", rcvWithdraw()));
$("rwSend").onclick = guard("Receiver withdraw", async () => { await send("TinyReceiver → withdraw", rcvWithdraw()); void refresh(); });
$("owSim").onclick = guard("Withdraw own credit", async () => simulate("Withdraw own credit", ownWithdraw()));
$("owSend").onclick = guard("Withdraw own credit", async () => { await send("Withdraw own credit", ownWithdraw()); void refresh(); });

const closeCall = (): Call => {
  const n = Number($("lid").value.trim());
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Listing id must be a whole number from 0.");
  return { to: kit(), data: enc("cancel", [BigInt(n)]) };
};
$("closeSim").onclick = guard("Close listing", async () => simulate(`Close listing #${$("lid").value.trim()}`, closeCall()));
$("closeSend").onclick = guard("Close listing", async () => { await send(`Close listing #${$("lid").value.trim()}`, closeCall()); void refresh(); });
$("closeSimC").onclick = guard("Close listing", async () => simulate(`Close listing #${$("lid").value.trim()}`, closeCall(), addrOf("addrC", "Address C")));
const cfCall = (): Call => ({ to: kit(), data: enc("claimFor", [BigInt(rid()), addrOf("cfHolder", "Holder")]) });
const cfLabel = () => `claimFor(#${rid()}, ${$("cfHolder").value.trim().slice(0, 10)}…)`;
$("cfSim").onclick = guard("claimFor", async () => simulate(cfLabel(), cfCall()));
$("cfSimC").onclick = guard("claimFor", async () => simulate(cfLabel(), cfCall(), addrOf("addrC", "Address C")));
$("cfSend").onclick = guard("claimFor", async () => { await send(`${cfLabel()} (expected to fail)`, cfCall(), true); void refresh(); });

startDiscovery();
renderWallets();
onWalletsChanged(renderWallets);
