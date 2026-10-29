import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "./theme-tokens.css";
import "./landing-pk.css";
import { L, app, ext, page } from "./docs/Chrome";

/* Shared chrome of the PotKit marketing system (.pl): the landing page and the doc pages (help, how it works, protocol,
   security) use the same top bar, header, footer and motion helpers, so the two always look like one site. */

export const REPO = "https://github.com/itsjusttu/potkit-portaldot";
const X = "https://x.com/potkitpro";
export type Item = { label: string; href: string; note?: string; internal?: boolean };
export const RESOURCES: Item[] = [
  { label: "Help Center", href: page("/help"), note: "Guides and contact", internal: true },
  { label: "Security model", href: page("/security"), note: "What is and is not enforced", internal: true },
  { label: "Portaldot whitepaper", href: L.whitepaper, note: "Network design" },
  { label: "Developer docs", href: L.docs, note: "Build on Portaldot" },
  { label: "V3 testnet guide", href: L.guide, note: "Map account, get gas" },
];
export const COMMUNITY: Item[] = [
  { label: "PotKit on X", href: X },
  { label: "PotKit on GitHub", href: REPO },
  { label: "Portaldot Discord", href: L.discord },
  { label: "Hacker House 2026 · DoraHacks", href: L.hackathon },
];

/* display, body and code faces of the marketing pages (the app keeps its own); the page stays readable with the fallbacks */
if (typeof document !== "undefined" && !document.getElementById("pl-fonts")) {
  const l = document.createElement("link");
  l.id = "pl-fonts"; l.rel = "stylesheet";
  // Newsreader without its optical-size axis: the full opsz file is 128 KB, this one 56 KB, and headings look almost the same
  l.href = "https://fonts.googleapis.com/css2?family=Newsreader:wght@300;400&family=Hanken+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap";
  document.head.appendChild(l);
}

/* ---------- hooks ---------- */
export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reveal-on-scroll (data-rv gains .is-in) and off-screen pausing (data-live gains .is-idle). Content is only hidden once
    .pl-js is set, and reduced motion shows everything at once. */
export function usePageMotion(root: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => { root.current?.classList.add("pl-js"); return () => root.current?.classList.remove("pl-js"); }, [root]);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const nodes = [...el.querySelectorAll<HTMLElement>("[data-rv]")];
    if (reducedMotion() || typeof IntersectionObserver === "undefined") { nodes.forEach((n) => n.classList.add("is-in")); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    nodes.forEach((n) => io.observe(n));
    const live = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("is-idle", !e.isIntersecting)), { rootMargin: "120px 0px" });
    el.querySelectorAll("[data-live]").forEach((n) => live.observe(n));
    return () => { io.disconnect(); live.disconnect(); };
  }, [root]);
}

export function useScrolled() {
  const [s, setS] = useState(false);
  useEffect(() => {
    let raf = 0;
    const run = () => { raf = 0; setS(scrollY > 16); };
    const on = () => { if (!raf) raf = requestAnimationFrame(run); };
    run(); addEventListener("scroll", on, { passive: true });
    return () => { removeEventListener("scroll", on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return s;
}

/* ---------- primitives ---------- */
export const Arr = () => <svg className="pl-arr" viewBox="0 0 16 16" aria-hidden><path d="M4 12 12 4M6 4h6v6" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
export const Rv = ({ as: Tag = "div", kind = "up", delay = 0, className = "", children }: { as?: "div" | "li" | "article"; kind?: "up" | "left" | "right" | "scale"; delay?: number; className?: string; children: ReactNode }) => {
  const T = Tag as "div";
  return <T data-rv={kind} className={className} style={{ "--d": `${delay}ms` } as React.CSSProperties}>{children}</T>;
};

function Menu({ label, items, current = false }: { label: string; items: Item[]; current?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); ref.current?.querySelector<HTMLElement>("button")?.focus(); } };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className={`pl-menu ${open ? "open" : ""} ${current ? "cur" : ""}`} ref={ref} onMouseEnter={() => matchMedia("(hover: hover)").matches && setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>{label}<svg className="pl-chev" viewBox="0 0 12 12" aria-hidden><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg></button>
      <div className="pl-pop">
        {items.map((i) => <a key={i.label} href={i.href} aria-current={i.internal && i.href.split("?")[0] === location.pathname ? "page" : undefined} {...(i.internal ? {} : ext)}><b>{i.label}</b>{i.note && <small>{i.note}</small>}<Arr /></a>)}
      </div>
    </div>
  );
}

/** Top bar that says this is a testnet demo. */
export function TestnetBar({ launch }: { launch: string }) {
  return <div className="pl-bar"><div className="pl-wrap"><span><i className="pl-pulse" aria-hidden />Portaldot V3 testnet demo · no real value</span><a href={launch}>Launch the demo <Arr /></a></div></div>;
}

/** `active` is the path of the current doc page; it marks the matching link (or the Resources menu that holds it). */
export function Header({ scrolled, launch, demo, active }: { scrolled: boolean; launch: string; demo: boolean; active?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc);
  }, [open]);
  const close = () => setOpen(false);
  const label = demo ? "Open demo" : "Launch App";
  const cur = (p: string) => (active === p ? "page" : undefined);
  const inResources = RESOURCES.some((r) => r.internal && r.href.split("?")[0] === active);
  return (
    <header className={`pl-head ${scrolled ? "scrolled" : ""} ${open ? "menu-open" : ""}`}>
      <div className="pl-wrap pl-head-in">
        <a className="pl-logo" href={page("/")} aria-label="PotKit home"><img src="/potkit-p-circle-white.svg" alt="" width={28} height={28} />PotKit</a>
        <nav id="pl-nav" className="pl-nav" aria-label="Main">
          <a href={page("/how-it-works")} aria-current={cur("/how-it-works")} onClick={close}>How it works</a>
          <a href={page("/protocol")} aria-current={cur("/protocol")} onClick={close}>Protocol</a>
          <Menu label="Resources" items={RESOURCES} current={inResources} />
          <Menu label="Community" items={COMMUNITY} />
          <a className="pl-btn primary pl-nav-cta" href={launch} onClick={close}>{label}</a>
        </nav>
        <a className="pl-btn primary pl-head-cta" href={launch}>{label} <Arr /></a>
        <button type="button" className="pl-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="pl-nav" onClick={() => setOpen(!open)}><i /><i /><i /></button>
      </div>
    </header>
  );
}

export function Footer({ launch }: { launch: string }) {
  return (
    <footer className="pl-foot">
      <div className="pl-wrap">
        <div className="pl-foot-cols">
          <nav aria-label="Product"><h4>Product</h4><a href={launch}>Launch app</a><a href={app("?tab=issue")}>Issue an invoice</a><a href={app("?tab=trade")}>Trade shares</a><a href={app("?tab=verify")}>Verify a receipt</a></nav>
          <nav aria-label="Learn"><h4>Learn</h4><a href={page("/how-it-works")}>How it works</a><a href={page("/protocol")}>Protocol reference</a><a href={page("/security")}>Security model</a><a href={page("/help")}>Help Center</a></nav>
          <nav aria-label="Resources"><h4>Resources</h4>{RESOURCES.filter((x) => !x.internal).map((x) => <a key={x.label} href={x.href} {...ext}>{x.label}</a>)}<a href={L.repo} {...ext}>Portaldot node repo</a></nav>
          <nav aria-label="Community"><h4>Community</h4>{COMMUNITY.map((x) => <a key={x.label} href={x.href} {...ext}>{x.label}</a>)}</nav>
        </div>
        <div className="pl-foot-base"><span className="pl-logo sm"><img src="/potkit-p-circle-white.svg" alt="" width={24} height={24} />PotKit</span><span>© 2026 PotKit · Not affiliated with Portaldot · Testnet only</span></div>
      </div>
    </footer>
  );
}
