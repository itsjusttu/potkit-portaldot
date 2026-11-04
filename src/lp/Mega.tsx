import { useEffect, useRef, useState, type CSSProperties } from "react";

/* Navigation with drop-down panels: grouped links with a small icon, a one-line description, and a preview tile cut from
   the hero photo. Opens on hover or focus and with a click or Enter; Escape and clicking away close it. Below 860px the
   same links are listed inside the burger menu. Every link is a real page or an external project link. */

const ICONS = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", plus: "M12 5v14M5 12h14", swap: "M7 7h12l-3-3M17 17H5l3 3",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4", case: "M4 8h16v11H4zM9 8V5h6v3", shield: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z",
  book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10", code: "M9 8l-4 4 4 4M15 8l4 4-4 4", lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  help: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.01",
  globe: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM4 12h16M12 4c2.5 2.3 2.5 13.7 0 16M12 4c-2.5 2.3-2.5 13.7 0 16",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  git: "M7 4v10M7 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM17 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM17 10c0 4-10 2-10 4", flag: "M6 21V4M6 5h11l-2 4 2 4H6",
  file: "M7 3h7l4 4v14H7zM14 3v4h4", user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0",
} as const;
export type IconName = keyof typeof ICONS;

export type MegaItem = { title: string; desc: string; href: string; icon: IconName; ext?: boolean };
export type MegaMenu = {
  id: string; label: string; groups: { label?: string; items: MegaItem[] }[];
  preview: { pos: string; caption: string; cta: [string, string] };
};

const Icon = ({ n }: { n: IconName }) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICONS[n]} /></svg>;
const Chev = () => <svg className="lp-chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const extAttrs = { target: "_blank", rel: "noreferrer noopener" } as const;

export function MegaNav({ menus, launch, photo, onNavigate }: { menus: MegaMenu[]; launch: string; photo: string; onNavigate: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [shown, setShown] = useState(0); // the content stays while the panel fades out
  const timer = useRef<number>(0);
  const hovered = useRef(0); // when the pointer last arrived on a trigger, so the click that follows a hover does not close the panel
  const nav = useRef<HTMLElement>(null);
  const openAt = (i: number) => { window.clearTimeout(timer.current); setShown(i); setOpen(i); };
  const closeSoon = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(null), 180); };
  const cancel = () => window.clearTimeout(timer.current);
  const close = () => { window.clearTimeout(timer.current); setOpen(null); };

  useEffect(() => {
    const away = (e: MouseEvent) => { if (open !== null && nav.current && !nav.current.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); window.clearTimeout(timer.current); };
  }, [open]);

  const m = menus[shown]!;
  return (
    <nav id="lp-nav" className="lp-nav" aria-label="Main" ref={nav} onMouseEnter={cancel} onMouseLeave={closeSoon}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) close(); }}>
      {menus.map((x, i) => (
        <button key={x.id} type="button" className={`lp-nt ${open === i ? "on" : ""}`} aria-expanded={open === i} aria-controls="lp-mega" aria-haspopup="true"
          onMouseEnter={() => { hovered.current = Date.now(); openAt(i); }} onFocus={() => openAt(i)} onClick={() => (open === i && Date.now() - hovered.current > 500 ? close() : openAt(i))}>{x.label}<Chev /></button>
      ))}
      <a className="lp-btn solid lp-nav-cta" href={launch}>Launch App</a>

      <div id="lp-mega" className={`lp-mega ${open !== null ? "open" : ""}`} role="region" aria-label={`${m.label} menu`} aria-hidden={open === null}>
        <div className="lp-mega-in" key={m.id}>
          <div className="lp-mega-groups">
            {m.groups.map((g, gi) => (
              <div key={gi} className="lp-mg">
                {g.label && <p className="lp-mg-l">{g.label}</p>}
                {g.items.map((it, k) => (
                  <a key={it.title} className="lp-mi" href={it.href} tabIndex={open === null ? -1 : 0} onClick={() => { close(); onNavigate(); }} style={{ "--i": gi * 3 + k } as CSSProperties} {...(it.ext ? extAttrs : {})}>
                    <span className="ico"><Icon n={it.icon} /></span>
                    <span className="tx"><b>{it.title}{it.ext && <i aria-hidden> ↗</i>}</b><small>{it.desc}</small></span>
                  </a>
                ))}
              </div>
            ))}
          </div>
          <a className="lp-mprev" href={m.preview.cta[1]} tabIndex={open === null ? -1 : 0} onClick={() => { close(); onNavigate(); }}>
            <img src={photo} alt="" loading="lazy" decoding="async" style={{ objectPosition: m.preview.pos, transformOrigin: m.preview.pos }} />
            <span className="cap">{m.preview.caption}<i aria-hidden>→</i></span>
          </a>
        </div>
      </div>

      {/* phones: the same links, listed in the burger menu */}
      <div className="lp-mob">
        {menus.map((x) => (
          <div key={x.id} className="lp-mob-g">
            <h4>{x.label}</h4>
            {x.groups.flatMap((g) => g.items).map((it) => <a key={it.title} href={it.href} onClick={onNavigate} {...(it.ext ? extAttrs : {})}>{it.title}{it.ext ? " ↗" : ""}</a>)}
          </div>
        ))}
      </div>
    </nav>
  );
}
