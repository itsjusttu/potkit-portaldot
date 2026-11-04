import { useEffect, useRef, useState } from "react";
import { Ico } from "./AppUi";
import { listWallets, onWalletsChanged, rememberedId, startDiscovery, type WalletOption } from "./lib/wallets";

export function WalletIcon({ w, size = 28 }: { w: Pick<WalletOption, "icon" | "badge" | "name">; size?: number }) {
  if (w.icon) return <img className="w-ico" src={w.icon} alt="" width={size} height={size} />;
  const l = w.badge.letter;
  return (
    <svg className="w-ico" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill={w.badge.bg} />
      <text x="16" y="16" dy=".36em" textAnchor="middle" fontFamily="ui-monospace,monospace" fontWeight="700" fontSize={l.length > 2 ? 9 : 15} fill={w.badge.fg}>{l}</text>
    </svg>
  );
}

export function useWallets() {
  const [list, setList] = useState<WalletOption[]>(() => (typeof window === "undefined" ? [] : listWallets()));
  useEffect(() => {
    startDiscovery();
    const up = () => setList(listWallets());
    up();
    const t = setTimeout(up, 400); // late injectors
    const off = onWalletsChanged(up);
    return () => { clearTimeout(t); off(); };
  }, []);
  return list;
}

export function WalletModal({ open, wallets, busyId, onPick, onClose }: { open: boolean; wallets: WalletOption[]; busyId: string; onPick: (w: WalletOption) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  // focus management: first detected wallet gets focus, Tab is trapped inside, focus returns to the opener on close
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const items = () => [...(box.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") ?? [])];
    (box.current?.querySelector<HTMLElement>(".wm2-row:not(.off)") ?? items()[0])?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const f = items(); if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); opener?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  const last = rememberedId();
  // detected wallets first, the one used last at the top; wallets that are not installed fold into "Other wallets"
  const found = wallets.filter((w) => w.provider).sort((x, y) => Number(y.id === last) - Number(x.id === last));
  const rest = wallets.filter((w) => !w.provider);
  return (
    <div className="wm-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wm wm2" role="dialog" aria-modal="true" aria-labelledby="wm-t" ref={box}>
        <button className="wm2-x" onClick={onClose} aria-label="Close wallet picker"><Ico n="x" /></button>
        <div className="wm2-head">
          <img className="wm2-logo" src="/potkit-p-circle-black.svg" alt="" width={44} height={44} />
          <h3 id="wm-t">Connect a wallet</h3>
          <p>Choose the wallet you use on Portaldot V3.</p>
        </div>
        {found.length === 0 && <p className="wm2-note">No wallet is available in this tab. Install one below, enable it for this site, then reload.</p>}
        {found.length > 0 && <ul className="wm2-list">
          {found.map((w) => (
            <li key={w.id}><button className={`wm2-row ${busyId === w.id ? "busy" : ""}`} disabled={Boolean(busyId)} onClick={() => onPick(w)}>
              <span className="wm2-ico"><WalletIcon w={w} size={30} /><i className="dot" aria-hidden /></span>
              <span className="wm2-name">{w.name}<span className="sr-only"> (installed)</span></span>
              {busyId === w.id ? <span className="wm2-busy"><i className="spin" aria-hidden />Confirm in {w.name}</span>
                : w.id === last ? <span className="wm2-pill">Last used</span> : null}
            </button></li>
          ))}
        </ul>}
        {rest.length > 0 && <details className="wm2-more" open={found.length === 0}>
          <summary><span className="wm2-ico gen"><Ico n="wallet" /></span><span className="wm2-name">Other wallets</span><span className="wm2-chev" aria-hidden /></summary>
          <ul className="wm2-list">
            {rest.map((w) => (
              <li key={w.id}><a className="wm2-row off" href={w.install} target="_blank" rel="noreferrer">
                <span className="wm2-ico"><WalletIcon w={w} size={30} /></span><span className="wm2-name">{w.name}</span>
                <span className="wm2-pill ghost">Install <Ico n="ext" size={12} /></span><span className="sr-only"> (opens the official site in a new tab)</span>
              </a></li>
            ))}
          </ul>
        </details>}
        <p className="wm2-foot">PotKit only asks for your address and the Portaldot V3 network (chain 420420777). It never asks for a recovery phrase.</p>
      </div>
    </div>
  );
}

/** Chamfered HUD wallet button: "Connect wallet" when disconnected, short address when connected. */
export function WalletButton({ account, label, net, onConnect, onProfile, onCopy, onExplore, onDisconnect, onSwitchNet }: {
  account: string; label: string; net: "ok" | "wrong" | "unknown";
  onConnect: () => void; onProfile: () => void; onCopy: () => Promise<void> | void; onExplore: () => void; onDisconnect: () => void; onSwitchNet: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const c = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", c); window.addEventListener("keydown", k);
    ref.current?.querySelector<HTMLElement>(".wd-menu [role=menuitem]")?.focus();
    return () => { document.removeEventListener("mousedown", c); window.removeEventListener("keydown", k); };
  }, [open]);
  if (!account) return <button className="cw-btn" onClick={onConnect}><span className="cw-in">Connect wallet</span></button>;
  const act = (f: () => void) => () => { setOpen(false); f(); };
  const keys = (e: React.KeyboardEvent) => {
    const f = [...(ref.current?.querySelectorAll<HTMLElement>(".wd-menu [role=menuitem]") ?? [])]; const i = f.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); f[(i + (e.key === "ArrowDown" ? 1 : -1) + f.length) % f.length]?.focus(); }
    if (e.key === "Home") { e.preventDefault(); f[0]?.focus(); } if (e.key === "End") { e.preventDefault(); f[f.length - 1]?.focus(); }
    if (e.key === "Tab") setOpen(false);
  };
  return (
    <div className="wmenu" ref={ref}>
      <button ref={btn} className={`cw-btn on ${net}`} aria-haspopup="menu" aria-expanded={open} title={account} onClick={() => setOpen((o) => !o)}>
        <span className="cw-in"><i className="cw-dot" aria-hidden /><span className="mono">{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6" /></svg></span>
      </button>
      {open && (
        <div className="wd-menu" role="menu" aria-label="Wallet" onKeyDown={keys}>
          {net === "wrong" && <div className="wd-net" role="none"><span><i />Wrong network</span><button className="btn sm" role="menuitem" onClick={act(onSwitchNet)}>Switch</button></div>}
          <button role="menuitem" onClick={act(onProfile)}><Ico n="user" /> My Profile</button>
          <button role="menuitem" onClick={() => void Promise.resolve(onCopy()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })}><Ico n={copied ? "check" : "copy"} /> {copied ? "Copied!" : "Copy Address"}</button>
          <button role="menuitem" onClick={act(onExplore)}><Ico n="search" /> View in Explore</button>
          <button role="menuitem" className="danger" onClick={act(onDisconnect)}><Ico n="power" /> Disconnect</button>
        </div>
      )}
    </div>
  );
}
