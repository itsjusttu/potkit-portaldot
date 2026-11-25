// PotKit.yul is written with readable revert reasons: need(cond, "not locked").
// Every byte of code costs storage deposit on Portaldot, so before compiling each reason is replaced
// by a one-letter code (pushed as a 1-byte number; PotKit.yul reverts with Error("<letter>")). REASON_CODES maps the codes back to the
// readable reason; the dApp shows the readable text.
// Codes are stable across versions: the reasons of the first deployed contract (v1) keep their letters, and
// reasons added later get the next free letters, so the same app decodes the errors of every deployed version.
const V1 = ["allowance", "amount", "auth", "balance", "claim first", "clone", "closed", "due date", "from", "kind", "need all units",
  "no listing", "no shares", "no token", "not depositor", "not issuer", "not locked", "not minter", "not seller", "not settled",
  "note length", "own listing", "pay", "price", "receiver", "settled", "underpaid", "units", "value", "zero"];

export function yulPrep(src) {
  const used = [...new Set([...src.matchAll(/need\([^\n]*?, "([^"]+)"\)/g)].map((m) => m[1]))];
  const reasons = [...V1, ...used.filter((r) => !V1.includes(r)).sort()];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  if (reasons.length > alphabet.length) throw new Error("too many reasons");
  const codes = {};
  reasons.forEach((r, i) => { if (used.includes(r)) codes[r] = alphabet[i]; });
  const out = src.replace(/need\(([^\n]*?), "([^"]+)"\)/g, (_, c, r) => `need(${c}, 0x${Buffer.from(codes[r]).toString("hex")})`);
  if (/need\([^\n]*, "/.test(out)) throw new Error("unconverted need()");
  return { src: out, codes: Object.fromEntries(Object.entries(codes).map(([r, c]) => [c, r])) };
}
