/* Display formatting for share amounts (ERC-20 shares have 18 decimals and can be bought in fractions, so the
   exact value is long: 487.888888888888888889). Pure bigint maths, no viem or React, so it can be unit tested.
   Only for showing numbers: anything that is sent in a transaction, typed into an input or exported keeps the exact value. */

/** Shares for display: 2 decimals from 1 share up, 4 below it, thousands grouped, trailing zeros dropped.
    A non-zero amount that would round to 0 shows as "<0.0001". The exact value stays available to callers (tooltips, copy). */
export function fmtShares(raw: bigint, decimals = 18): string {
  if (raw === 0n) return "0";
  const neg = raw < 0n, a = neg ? -raw : raw, sign = neg ? "-" : "";
  const dp = Math.min(decimals, a >= 10n ** BigInt(decimals) ? 2 : 4);
  const scale = 10n ** BigInt(decimals - dp);
  const q = (a + scale / 2n) / scale; // rounded to dp places, in units of 10^-dp
  if (q === 0n) return `${sign}<${dp ? `0.${"0".repeat(dp - 1)}1` : "1"}`;
  const base = 10n ** BigInt(dp);
  const whole = (q / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = dp ? (q % base).toString().padStart(dp, "0").replace(/0+$/, "") : "";
  return `${sign}${whole}${frac ? `.${frac}` : ""}`;
}

type EventLike = { kind: string; id: number; amount?: bigint; text: string };

/** One-line text of an on-chain event. Listings and buys are rebuilt here so the share amount is rounded for display;
    every other kind keeps the text produced when the event was read. */
export function eventText(e: EventLike): string {
  if ((e.kind === "list" || e.kind === "buy") && e.amount !== undefined) return `${fmtShares(e.amount)} ${shareUnit(e.amount)} of #${e.id} ${e.kind === "list" ? "listed" : "bought"}`;
  return e.text;
}

/** "share" for exactly one share, "shares" otherwise (zero and fractions read as plural: 0.5 shares). */
export const shareUnit = (raw: bigint, decimals = 18): "share" | "shares" => (raw === 10n ** BigInt(decimals) ? "share" : "shares");
