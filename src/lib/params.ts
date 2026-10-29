/** Query parameters that name a deployment (the judge link). Everything else in a URL (tab, id, sell, profile...) belongs to one
    screen of the app and must not follow a link to the landing page, or the landing opens as "potkit.pro/?tab=trade". */
export const DEPLOYMENT_PARAMS = ["kit", "vault", "receipt", "usd", "market"] as const;

/** "?kit=0x…" with only the deployment parameters kept, or "" when there are none. */
export function deploymentSearch(search: string): string {
  const from = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const keep = new URLSearchParams();
  for (const k of DEPLOYMENT_PARAMS) { const v = from.get(k); if (v !== null) keep.set(k, v); }
  const q = keep.toString();
  return q ? `?${q}` : "";
}
