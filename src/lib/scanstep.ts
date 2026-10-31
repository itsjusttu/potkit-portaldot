/**
 * Adaptive window for eth_getLogs scans, kept free of any chain or browser dependency so it can be tested.
 *
 * The public V3 RPC accepted every window up to the whole history, but other RPCs cap the range and the gateway
 * sometimes answers 503 (a browser shows that as a failed, CORS-less fetch). Two different problems:
 *  - a refused window (a range limit) is halved, and the scan never grows back past the size that worked;
 *  - a transient failure (5xx, 429, timeout, dropped connection) is retried on the same window after a backoff
 *    and does not shrink anything.
 * The size that worked is remembered for the browser session, so a reload does not repeat the search.
 */
export const SCAN_MAX = 100_000n;
export const SCAN_MIN = 500n;
export const TRANSIENT_RETRIES = 2;

export type ScanState = { step: bigint; ceiling: bigint };

const clamp = (v: bigint) => (v < SCAN_MIN ? SCAN_MIN : v > SCAN_MAX ? SCAN_MAX : v);

/** First window: the remembered working size if there is one, else the maximum. */
export function startScan(remembered: bigint | null): ScanState {
  const c = remembered !== null && remembered >= SCAN_MIN && remembered <= SCAN_MAX ? remembered : SCAN_MAX;
  return { step: c, ceiling: c };
}

/** A window was read: grow back toward the ceiling, never past it. */
export const onScanOk = (s: ScanState): ScanState => ({ ...s, step: s.step * 2n > s.ceiling ? s.ceiling : s.step * 2n });

/** The RPC refused a window of `s.step` blocks: halve it and make that the new ceiling for this scan. */
export const onScanRefused = (s: ScanState): ScanState => {
  const half = clamp(s.step / 2n);
  return { step: half, ceiling: half };
};

/** Pause before retry number `attempt` (0, 1, ...) of a window that failed transiently: 600 ms, 1.2 s, 2.4 s, capped at 4 s. */
export const backoffMs = (attempt: number) => Math.min(4000, 600 * 2 ** attempt);

const RANGE_WORDS = /range|limit|exceed|too many|too large|too big|max|oversize/i;
const NETWORK_WORDS = /HTTP request failed|Failed to fetch|fetch failed|NetworkError|Load failed|timed out|timeout|took too long to respond|ECONNRESET|ECONNREFUSED|socket hang up|network/i;

/** True for failures worth retrying on the same window: gateway 5xx and 429, timeouts, dropped connections. */
export function isTransient(e: unknown): boolean {
  const err = (e ?? {}) as { name?: unknown; status?: unknown; shortMessage?: unknown; message?: unknown; details?: unknown };
  if (err.name === "TimeoutError") return true;
  if (typeof err.status === "number") return [408, 425, 429, 500, 502, 503, 504].includes(err.status);
  const msg = [err.shortMessage, err.message, err.details].filter((x) => typeof x === "string").join(" ");
  return NETWORK_WORDS.test(msg) && !RANGE_WORDS.test(msg.replace(/HTTP request failed|Failed to fetch/gi, ""));
}

type Store = Pick<Storage, "getItem" | "setItem">;
const sessionStore = (): Store | null => { try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; } };

/** The window size that worked earlier in this browser session for this RPC, or null. */
export function loadStep(key: string, store: Store | null = sessionStore()): bigint | null {
  try {
    const raw = store?.getItem(key);
    if (!raw || !/^\d+$/.test(raw)) return null;
    const v = BigInt(raw);
    return v >= SCAN_MIN && v <= SCAN_MAX ? v : null;
  } catch { return null; }
}

export function saveStep(key: string, step: bigint, store: Store | null = sessionStore()): void {
  try { store?.setItem(key, step.toString()); } catch { /* storage blocked: the next scan searches again */ }
}
