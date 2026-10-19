// PotKit.yul is written with readable revert reasons: need(cond, "not locked").
// Every byte of code costs storage deposit on Portaldot, so before compiling each reason is replaced
// by a one-letter code (pushed as a 1-byte number; PotKit.yul reverts with Error("<letter>")). REASON_CODES maps the codes back to the
// readable reason; the dApp shows the readable text.
export function yulPrep(src) {
  const reasons = [...new Set([...src.matchAll(/need\([^\n]*?, "([^"]+)"\)/g)].map((m) => m[1]))].sort();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  if (reasons.length > alphabet.length) throw new Error("too many reasons");
  const codes = {};
  reasons.forEach((r, i) => (codes[r] = alphabet[i]));
  const out = src.replace(/need\(([^\n]*?), "([^"]+)"\)/g, (_, c, r) => `need(${c}, 0x${Buffer.from(codes[r]).toString("hex")})`);
  if (/need\([^\n]*, "/.test(out)) throw new Error("unconverted need()");
  return { src: out, codes: Object.fromEntries(Object.entries(codes).map(([r, c]) => [c, r])) };
}
