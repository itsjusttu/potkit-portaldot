// Path routing. '/' = landing, '/app' = dApp. On an `app.` subdomain the dApp is served at '/'.
import { deploymentSearch } from "./lib/params";
export const isAppHost = () => window.location.hostname.startsWith("app.");
/** Landing doc pages (SPA routes, served by the vercel.json catch-all rewrite). */
export const DOC_ROUTES = ["/help", "/how-it-works", "/protocol", "/security"];
export const docRoute = () => { const p = window.location.pathname.replace(/\/+$/, ""); return !isAppHost() && DOC_ROUTES.includes(p) ? p : null; };
export const isAppRoute = () => isAppHost() || /^\/app(\/|$)/.test(window.location.pathname);
/** URL of the dApp, keeping the query string (judge link params). */
/** Optional dedicated dApp origin, e.g. https://app.potkit.pro (set VITE_APP_URL on Vercel). */
export const APP_ORIGIN = ((import.meta.env.VITE_APP_URL as string | undefined) || "").replace(/\/+$/, "");
const isLocal = () => /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(window.location.hostname) || window.location.hostname.endsWith(".vercel.app");
export const appUrl = (search = window.location.search) => {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const qs = params.toString();
  const query = qs ? `?${qs}` : "";
  if (isAppHost()) return `/${query}`;
  if (APP_ORIGIN && !isLocal()) return `${APP_ORIGIN}/${query}`;
  return `/app${query}`;
};
/** Absolute dApp link for sharing (judge link). */
export const appShareUrl = (search: string) => APP_ORIGIN ? `${APP_ORIGIN}/${search}` : `${((import.meta.env.VITE_SITE_URL as string | undefined) || window.location.origin).replace(/\/$/, "")}/app${search}`;
/** Shareable public issuer profile. Public pages show chain-derived data; local profile edits stay in the owner's browser. */
export const profileShareUrl = (address: string, kit?: string) => APP_ORIGIN
  ? `${APP_ORIGIN}/profile/${address}${kit ? `?kit=${encodeURIComponent(kit)}` : ""}`
  : isAppHost()
    ? `${window.location.origin}/profile/${address}${kit ? `?kit=${encodeURIComponent(kit)}` : ""}`
    : `${window.location.origin}/app?profile=${encodeURIComponent(address)}${kit ? `&kit=${encodeURIComponent(kit)}` : ""}`;
/** URL of the landing page. On app.<domain> it points to the bare domain. */
export const homeUrl = () => {
  const { hostname, protocol, port, search } = window.location;
  const keep = deploymentSearch(search); // the judge link survives, the current tab (?tab=trade...) does not
  if (!isAppHost()) return `/${keep}`;
  return `${protocol}//${hostname.slice(4)}${port ? `:${port}` : ""}/${keep}`;
};
/** Backward compat: old '#/app' links → '/app?…' (query preserved). Returns true if it redirected in-place. */
export function migrateHashRoute() {
  if (window.location.hash.startsWith("#/app")) {
    history.replaceState(null, "", appUrl());
    return true;
  }
  if (window.location.hash === "#/") history.replaceState(null, "", window.location.pathname + window.location.search);
  return false;
}
