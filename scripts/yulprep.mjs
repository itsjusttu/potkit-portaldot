// PotKit.yul is written with readable revert reasons: need(cond, "not locked").
// Every byte of code costs storage deposit on Portaldot, so before compiling each reason is replaced
// by a one-letter code (pushed as a 1-byte number; PotKit.yul reverts with Error("<letter>")). REASON_CODES maps the codes back to the
// readable reason; the dApp shows the readable text.
// Codes are stable across versions: every reason in FIXED keeps its letter for good (its position in the list), and
// a reason not in it gets a letter after all of them, so the same app decodes the errors of every supported version.
// When a contract with new reasons is deployed, append them to FIXED in the order they were given letters; never
// insert, sort or remove (an unused reason keeps its letter reserved).
// History: v1 = the first 30. v2 added escrow, no credit, overpaid, recipient, then sorted (e f g h); v2.1 added grace and
// sorted again, which shifted v2's last three letters. The v2.1 order (e…i) is fixed below; the v2 test kit
// (0xaa7d…7f77, testnet only) is no longer decoded correctly, see DEVLOG.md "v2.1 on the testnet".
const V1 = ["allowance", "amount", "auth", "balance", "claim first", "clone", "closed", "due date", "from", "kind", "need all units",
  "no listing", "no shares", "no token", "not depositor", "not issuer", "not locked", "not minter", "not seller", "not settled",
  "note length", "own listing", "pay", "price", "receiver", "settled", "underpaid", "units", "value", "zero"];
const V2_1 = ["escrow", "grace", "no credit", "overpaid", "recipient"]; // letters e f g h i, as deployed on 27 Nov
export const FIXED = [...V1, ...V2_1];

export function yulPrep(src) {
  const used = [...new Set([...src.matchAll(/need\([^\n]*?, "([^"]+)"\)/g)].map((m) => m[1]))];
  const reasons = [...FIXED, ...used.filter((r) => !FIXED.includes(r)).sort()];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  if (reasons.length > alphabet.length) throw new Error("too many reasons");
  const codes = {};
  reasons.forEach((r, i) => { if (used.includes(r)) codes[r] = alphabet[i]; });
  const out = src.replace(/need\(([^\n]*?), "([^"]+)"\)/g, (_, c, r) => `need(${c}, 0x${Buffer.from(codes[r]).toString("hex")})`);
  if (/need\([^\n]*, "/.test(out)) throw new Error("unconverted need()");
  return { src: out, codes: Object.fromEntries(Object.entries(codes).map(([r, c]) => [c, r])) };
}
