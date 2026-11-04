/* Daily series for the landing charts, built only from events read off the chain. Pure (no viem, no React) so it can be tested. */

export type EvLite = { hash: string; time: number; kind: string; value?: bigint };
/** One value per bucket of `step` days starting at `start` (unix s, UTC midnight); every array is cumulative. */
export type Series = { start: number; step: number; tx: number[]; vol: number[]; settled: number[] };

const DAY = 86_400;

/** Events with an unknown time (0) are left out. `now` is unix seconds; at most `maxPoints` buckets are returned. */
export function buildSeries(events: EvLite[], now: number, maxPoints = 36): Series | null {
  const ev = events.filter((e) => e.time > 0).sort((a, b) => a.time - b.time);
  if (!ev.length) return null;
  const start = Math.floor(ev[0]!.time / DAY) * DAY;
  const span = Math.max(1, Math.floor((Math.max(now, ev[ev.length - 1]!.time) - start) / DAY) + 1);
  const step = Math.max(1, Math.ceil(span / maxPoints));
  const n = Math.ceil(span / step);
  const tx = new Array<number>(n).fill(0), vol = new Array<number>(n).fill(0), settled = new Array<number>(n).fill(0);
  const seen = new Set<string>();
  for (const e of ev) {
    const i = Math.min(n - 1, Math.floor((e.time - start) / (DAY * step)));
    if (!seen.has(e.hash)) { seen.add(e.hash); tx[i]! += 1; }
    const v = Number(e.value ?? 0n) / 1e18;
    if (e.kind === "buy") vol[i]! += v;
    else if (e.kind === "settle") settled[i]! += v;
  }
  for (const a of [tx, vol, settled]) for (let i = 1; i < n; i++) a[i]! += a[i - 1]!;
  return { start, step, tx, vol, settled };
}
