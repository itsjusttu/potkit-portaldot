import { useEffect, useRef, useState, type ReactNode } from "react";
import { appUrl } from "../routes";

// All external links live here, grouped once (header dropdowns + footer columns read from these).
// Every URL was already present in earlier versions; nothing new is invented.
export const L = {
  x: "https://x.com/PortaldotL0",
  discord: "https://discord.gg/G33tVtCsNW",
  website: "https://portaldot.world/",
  github: "https://github.com/portaldotVolunteer",
  repo: "https://github.com/portaldotVolunteer/Portaldot",
  whitepaper: "https://portaldot-network.gitbook.io/portaldot-network-docs",
  docs: "https://portaldot-dev.readthedocs.io/en/latest/",
  guide: "https://github.com/ItsCogumellum/portaldot-v3-testnet-guide",
  hackathon: "https://dorahacks.io/hackathon/portaldot-hacker-house-2026/detail",
};
export const ext = { target: "_blank", rel: "noreferrer noopener" } as const;
export const app = (q = "") => appUrl(q);
/** Internal doc-page URL, keeping the judge query string. */
export const page = (p: string) => `${p}${location.search}`;

type Link = { label: string; href: string; note?: string; internal?: boolean };
const RESOURCES: Link[] = [
  { label: "Portaldot whitepaper", href: L.whitepaper, note: "Network design" },
  { label: "Developer docs", href: L.docs, note: "Build on Portaldot" },
  { label: "V3 testnet guide", href: L.guide, note: "Map account, get gas" },
  { label: "Portaldot on GitHub", href: L.github, note: "Source & tooling" },
];
const COMMUNITY: Link[] = [
  { label: "Portaldot on X", href: L.x },
  { label: "Portaldot Discord", href: L.discord },
  { label: "Portaldot website", href: L.website },
  { label: "Hacker House 2026 · DoraHacks", href: L.hackathon },
];
const footer = (): [string, Link[]][] => [
  ["Product", [
    { label: "Launch app", href: app(), internal: true },
    { label: "Issue an invoice", href: app("?tab=issue"), internal: true },
    { label: "Trade shares", href: app("?tab=trade"), internal: true },
    { label: "Verify a receipt", href: app("?tab=verify"), internal: true },
  ]],
  ["Learn", [
    { label: "How it works", href: page("/how-it-works"), internal: true },
    { label: "Protocol reference", href: page("/protocol"), internal: true },
    { label: "Security model", href: page("/security"), internal: true },
  ]],
  ["Resources", [...RESOURCES, { label: "Portaldot node repo", href: L.repo }]],
  ["Community", COMMUNITY],
];

export const IcoX = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zM16.7 19.2h1.7L7.4 4.7H5.6z" fill="currentColor" /></svg>;
export const IcoDiscord = () => <svg viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M19.6 5.3A17 17 0 0 0 15.4 4l-.5 1a15.6 15.6 0 0 0-5.8 0l-.5-1a17 17 0 0 0-4.2 1.3C1.7 9.3 1 13.2 1.3 17a17 17 0 0 0 5.2 2.6l1.1-1.8a11 11 0 0 1-1.7-.8l.4-.3a12.2 12.2 0 0 0 11.4 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.8a17 17 0 0 0 5.2-2.6c.4-4.4-.7-8.3-3.1-11.7zM8.7 14.7c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1zm6.6 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1z" /></svg>;
export const Arrow = () => <svg viewBox="0 0 16 16" aria-hidden className="lx-arr"><path d="M4 12 12 4M6 4h6v6" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;

function Menu({ label, items }: { label: string; items: Link[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className={`lx-menu ${open ? "open" : ""}`} ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>{label}<span className="lx-chev" aria-hidden>⌄</span></button>
      <div className="lx-pop" role="menu">
        {items.map((i) => <a key={i.label} role="menuitem" href={i.href} {...(i.internal ? {} : ext)}><b>{i.label}</b>{i.note && <small>{i.note}</small>}<Arrow /></a>)}
      </div>
    </div>
  );
}

/** Soft scroll-in reveal: adds .in once the element enters the viewport. */
export function Reveal({ children, className = "", delay = 0, as: Tag = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "section" | "article" }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); } }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <Tag ref={ref as never} className={`lx-rv ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</Tag>;
}

/** Lenis smooth scroll + "scrolled" header flag. Anchor links scroll smoothly via lenis. */
export function useLenis() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const light = matchMedia("(max-width: 600px)").matches;
    let lenis: { raf: (t: number) => void; destroy: () => void; on: (event: "scroll", cb: () => void) => void } | undefined;
    let raf = 0, stopped = false;
    const update = () => setScrolled(scrollY > 12);
    if (reduced || light) {
      addEventListener("scroll", update, { passive: true }); update();
    } else {
      void import("lenis").then(({ default: Lenis }) => {
        if (stopped) return;
        lenis = new Lenis({ lerp: 0.1, anchors: { offset: -80 } });
        const loop = (t: number) => { lenis?.raf(t); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
        lenis.on("scroll", update);
      });
    }
    return () => { stopped = true; cancelAnimationFrame(raf); removeEventListener("scroll", update); lenis?.destroy(); };
  }, []);
  return scrolled;
}

export function Header({ scrolled, active }: { scrolled: boolean; active?: string }) {
  const [mnav, setMnav] = useState(false);
  const judgeParams = new URLSearchParams(location.search);
  const hasJudge = ["kit", "vault", "receipt"].some((key) => judgeParams.has(key));
  const nav = [["/help", "Help"], ["/how-it-works", "How it works"], ["/protocol", "Protocol"], ["/security", "Security"]];
  return (
    <header className={`lx-head ${scrolled ? "scrolled" : ""}`}>
      <a className="lx-logo" href={page("/")} aria-label="PotKit home"><img src="/potkit-p-circle-black.svg" alt="" width={22} height={22} style={{marginRight:8,verticalAlign:"middle"}} />PotKit</a>
      <nav className={`lx-nav ${mnav ? "open" : ""}`} aria-label="Main">
        {nav.map(([h, t]) => <a key={h} href={page(h)} aria-current={active === h ? "page" : undefined}>{t}</a>)}
        <Menu label="Resources" items={RESOURCES} />
        <Menu label="Community" items={COMMUNITY} />
      </nav>
      <div className="lx-right">
        <a className="lx-ico" href={L.x} {...ext} aria-label="Portaldot on X" title="Portaldot on X"><IcoX /></a>
        <a className="lx-ico" href={L.discord} {...ext} aria-label="Portaldot Discord" title="Portaldot Discord"><IcoDiscord /></a>
        <a className="lx-btn primary" href={app(hasJudge ? location.search : "")}>{hasJudge ? "Open demo" : "Launch App"}</a>
        <button className="lx-burger" aria-label="Menu" aria-expanded={mnav} onClick={() => setMnav(!mnav)}><i /><i /></button>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="lx-foot">
      <div className="lx-foot-cols">
        {footer().map(([h, items]) => (
          <nav key={h} aria-label={h}><h4>{h}</h4>{items.map((i) => <a key={i.label} href={i.href} {...(i.internal ? {} : ext)}>{i.label}{!i.internal && <Arrow />}</a>)}</nav>
        ))}
      </div>
      <div className="lx-foot-base">
        <span className="lx-logo sm"><img src="/potkit-p-circle-black.svg" alt="" width={22} height={22} style={{marginRight:8,verticalAlign:"middle"}} />PotKit</span>
        <span>© 2026 PotKit · Not affiliated with Portaldot · Testnet only</span>
        <span className="lx-foot-soc"><a href={L.x} {...ext} aria-label="Portaldot on X"><IcoX /></a><a href={L.discord} {...ext} aria-label="Portaldot Discord"><IcoDiscord /></a></span>
      </div>
      <div className="lx-word" aria-hidden>POTKIT</div>
    </footer>
  );
}
