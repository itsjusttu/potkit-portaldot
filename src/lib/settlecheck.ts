// Pure helpers (no viem / no DOM) so the settle drawer's amount rules can be unit-tested directly.
export type PayCheck =
  | { status: "invalid"; extra: 0n }
  | { status: "under"; extra: 0n }
  | { status: "ok"; extra: bigint; raw: bigint };

/** Exact decimal string -> raw units; null for anything that is not a positive amount with <= `decimals` fraction digits. */
export function parseAmount(text: string, decimals: number): bigint | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m || (m[2] ?? "").length > decimals) return null;
  const raw = BigInt(m[1] + (m[2] ?? "").padEnd(decimals, "0"));
  return raw > 0n ? raw : null;
}

/** settle() takes any msg.value >= faceValue and puts all of it in the pool; `extra` is the part above the face value. */
export function checkPayment(text: string, face: bigint, decimals: number): PayCheck {
  const raw = parseAmount(text, decimals);
  if (raw === null) return { status: "invalid", extra: 0n };
  if (raw < face) return { status: "under", extra: 0n };
  return { status: "ok", extra: raw - face, raw };
}

/** Pay stays locked until the user has confirmed this exact overpayment; any amount change voids the confirmation. */
export function needsAck(check: PayCheck, acked: bigint | null): boolean {
  return check.status === "ok" && check.extra > 0n && acked !== check.extra;
}

/** viem's parseUnits rounds (half up) instead of throwing, so reject surplus fraction digits before calling it. */
export const exceedsDecimals = (text: string, decimals: number): boolean => (text.trim().split(".")[1] ?? "").length > decimals;
