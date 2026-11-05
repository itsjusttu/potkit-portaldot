import { useEffect, useRef, useState, type ReactNode } from "react";
import { L, app, ext, page } from "../docs/Chrome";
import { MegaNav, type MegaMenu } from "./Mega";
import { KIT } from "./useLive";
import "../styles/brand.css";
import "./lp.css";
import hero1600 from "../assets/hero/hero-1600.webp";

/* Chrome shared by the landing page and the help page: announcement bar, navigation with drop-down panels, footer, the
   scroll reveal and the pill that the navigation turns into after the first scroll. */

export const REPO = "https://github.com/itsjusttu/potkit-portaldot";
export const RPC = "https://test-evm-rpc-v3.portaldot.dev";
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Links that keep a judge's `?kit=` parameters; `tab("verify", "&id=1")` is a deep link into the app. */
export function useLinks() {
  const judge = new URLSearchParams(location.search);
  const hasJudge = ["kit", "vault", "receipt"].some((k) => judge.has(k));
  // always name the contract: a build without VITE_KIT (a local clone) would otherwise open an app with no market
  const launch = app(hasJudge ? location.search : `?kit=${KIT}`);
  const tab = (t: string, extra = "") => app(`?${hasJudge ? `${location.search.slice(1)}&` : `kit=${KIT}&`}tab=${t}${extra}`);
  return { hasJudge, launch, tab };
}

function buildMenus(launch: string, tab: (t: string, extra?: string) => string): MegaMenu[] {
  return [
    { id: "products", label: "Products", groups: [
        { label: "Issue and trade", items: [
          { title: "Issue", desc: "Turn an unpaid invoice into tradeable shares.", href: tab("issue"), icon: "plus" },
          { title: "Trade", desc: "Buy discounted shares or sell yours for tPOT.", href: tab("trade"), icon: "swap" },
          { title: "Portfolio", desc: "Your shares, value at settlement and payouts.", href: tab("portfolio"), icon: "case" } ] },
        { label: "Look and check", items: [
          { title: "Dashboard", desc: "Receipts, market activity and quick actions.", href: tab("dashboard"), icon: "grid" },
          { title: "Explore", desc: "Every receipt and listing on this contract.", href: tab("explore"), icon: "search" },
          { title: "Verify", desc: "Read a receipt straight from the chain. No wallet.", href: tab("verify"), icon: "shield" } ] } ],
      preview: { pos: "14% 50%", caption: "Open the app", cta: ["Launch App", launch] } },
    { id: "resources", label: "Resources", groups: [ { items: [
        { title: "How it works", desc: "The lifecycle from mint to claim.", href: page("/how-it-works"), icon: "book" },
        { title: "Protocol", desc: "Contract reference, storage and events.", href: page("/protocol"), icon: "code" },
        { title: "Security", desc: "What is and is not enforced on-chain.", href: page("/security"), icon: "lock" },
        { title: "Help", desc: "Guides, FAQ and how to reach the builder.", href: page("/help"), icon: "help" } ] } ],
      preview: { pos: "58% 40%", caption: "Read the docs", cta: ["How it works", page("/how-it-works")] } },
    { id: "ecosystem", label: "Ecosystem", groups: [
        { label: "Portaldot", items: [
          { title: "Portaldot", desc: "The network PotKit runs on.", href: L.website, icon: "globe", ext: true },
          { title: "V3 testnet guide", desc: "Map your account and get gas.", href: L.guide, icon: "link", ext: true },
          { title: "Developer docs", desc: "Build on Portaldot.", href: L.docs, icon: "code", ext: true } ] },
        { label: "Community", items: [
          { title: "Whitepaper", desc: "Network design.", href: L.whitepaper, icon: "file", ext: true },
          { title: "Portaldot Discord", desc: "Ask questions, meet builders.", href: L.discord, icon: "user", ext: true },
          { title: "Hacker House 2026", desc: "The hackathon PotKit was built for.", href: L.hackathon, icon: "flag", ext: true } ] } ],
      preview: { pos: "86% 36%", caption: "Built on Portaldot V3", cta: ["Portaldot", L.website] } },
    { id: "about", label: "About", groups: [ { items: [
        { title: "GitHub", desc: "Source code, MIT licence.", href: REPO, icon: "git", ext: true },
        { title: "Testnet evidence", desc: "Transaction hashes you can look up.", href: REPO + "#testnet-evidence", icon: "file", ext: true },
        { title: "DoraHacks page", desc: "The hackathon submission.", href: L.hackathon, icon: "flag", ext: true },
        { title: "The builder", desc: "One person: itsjusttu on GitHub.", href: "https://github.com/itsjusttu", icon: "user", ext: true } ] } ],
      preview: { pos: "40% 70%", caption: "Open source", cta: ["View the repository", REPO] } },
  ];
}

const Mark = ({ size }: { size: number }) => <img src="/potkit-p-mark-white.svg" alt="" width={size} height={size} />;

/** `plain` is for pages without a photo behind the navigation: dark text on ivory until the first scroll. */
export function LpShell({ children, plain = false }: { children: ReactNode; plain?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const { launch, tab } = useLinks();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on(); addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);

  // reveal: fade and 12px rise once; lines of large type slide up from a mask. Without JavaScript or with reduced motion everything stays visible.
  useEffect(() => {
    const el = root.current; if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>(".lp-rv, .lp-line")];
    if (typeof IntersectionObserver === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) { items.forEach((i) => i.classList.add("in")); return; }
    el.classList.add("lp-js");
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, []);

  const closeMenu = () => setMenu(false);
  return (
    <div className={`lp ${plain ? "lp-plain" : ""} ${scrolled ? "scrolled" : ""} ${menu ? "menu-open" : ""}`} ref={root}>
      <a className="lp-skip" href="#lp-main">Skip to content</a>
      <div className="lp-top">
        <header className="lp-head"><div className="lp-wrap lp-head-in">
          <a className="lp-logo" href="/" aria-label="PotKit home"><Mark size={28} /><span>PotKit</span></a>
          <MegaNav menus={buildMenus(launch, tab)} launch={launch} photo={hero1600} onNavigate={closeMenu} />
          <a className="lp-btn solid lp-head-cta" href={launch}>Launch App</a>
          <button type="button" className="lp-burger" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} aria-controls="lp-nav" onClick={() => setMenu(!menu)}><i /><i /></button>
        </div></header>
      </div>

      <main id="lp-main">{children}</main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-cols">
            <div className="lp-foot-brand"><a className="lp-logo" href="/" aria-label="PotKit home"><Mark size={24} /><span>PotKit</span></a><p>Invoice financing on Portaldot V3. Testnet demo built by one person.</p></div>
            <nav aria-label="Product"><h4>Product</h4><a href={launch}>Launch App</a><a href={tab("verify")}>Verify a receipt</a><a href={tab("trade")}>Trade</a></nav>
            <nav aria-label="Learn"><h4>Docs</h4><a href={page("/how-it-works")}>How it works</a><a href={page("/protocol")}>Protocol</a><a href={page("/security")}>Security</a><a href={page("/help")}>Help</a></nav>
            <nav aria-label="Project"><h4>Project</h4><a href={REPO} {...ext}>GitHub</a><a href={L.hackathon} {...ext}>DoraHacks page</a><a href={L.discord} {...ext}>Portaldot Discord</a></nav>
          </div>
          <div className="lp-foot-base">
            <span>Chain 420420777 · RPC {RPC.replace("https://", "")} · Contract <span className="num">{shortAddr(KIT)}</span></span>
            <span>Video: <a href="https://www.pexels.com/video/15170398/" {...ext}>Pexels</a> (Ho Chi Minh City). Photo: Dragon Bridge, Da Nang, own work. © 2026 PotKit, MIT licence.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
