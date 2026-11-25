// Pure helpers (no viem / no DOM) so the payment rules can be unit-tested directly.

/** settle() takes exactly the face value (any other msg.value reverts "underpaid" / "overpaid"), so the app never lets
    the payer choose an amount: this is the value to send, or null when there is nothing to pay (no terms, or paid). */
export function settleValue(face: bigint, settled: boolean): bigint | null {
  return !settled && face > 0n ? face : null;
}

/** viem's parseUnits rounds (half up) instead of throwing, so reject surplus fraction digits before calling it. */
export const exceedsDecimals = (text: string, decimals: number): boolean => (text.trim().split(".")[1] ?? "").length > decimals;
