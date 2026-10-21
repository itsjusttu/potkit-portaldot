// Pure helpers (no viem / no DOM) so they can be unit-tested directly.
/** EIP-1193 code 4001 / viem UserRejectedRequestError / common wallet wording — the user said no, nothing failed. */
export function isUserRejected(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let e: unknown = error; e && typeof e === "object" && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e);
    const x = e as { code?: number; name?: string; shortMessage?: string; message?: string };
    if (x.code === 4001 || x.name === "UserRejectedRequestError") return true;
    if (/user rejected|user denied|rejected the request|request rejected/i.test(`${x.shortMessage ?? ""} ${x.message ?? ""}`)) return true;
  }
  return false;
}
