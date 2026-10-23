import { useEffect, useRef, useState, type FormEvent } from "react";
import { Ico } from "./AppUi";
import { L } from "./docs/Chrome";
import "./support.css";

const COUNTRIES = ["Australia", "Canada", "France", "Germany", "India", "Indonesia", "Japan", "Netherlands", "Singapore", "Thailand", "United Kingdom", "United States", "Vietnam", "Other"];

export function Support({ open, onClose, account }: { open: boolean; onClose: () => void; account?: string }) {
  const dialog = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [inquiry, setInquiry] = useState("");
  const [shareWallet, setShareWallet] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [open]);

  if (!open) return null;
  const request = ["PotKit support request", `Email: ${email}`, country ? `Country: ${country}` : "", "", inquiry, shareWallet && account ? `\nWallet: ${account}` : ""].filter(Boolean).join("\n");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setCopied(false); setCopyFailed(false);
    // The project has no ticket/email API. Copy the request and open its published community support channel.
    window.open(L.discord, "_blank", "noopener,noreferrer");
    try { await navigator.clipboard.writeText(request); setCopied(true); }
    catch { setCopyFailed(true); }
  };

  return (
    <div className="support-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="support-dialog" role="dialog" aria-modal="true" aria-labelledby="support-title" ref={dialog}>
        <header className="support-head"><h2 id="support-title">Support</h2><button type="button" className="t-x" aria-label="Close support" onClick={onClose}><Ico n="x" /></button></header>
        <p className="support-note">Describe your issue below, or contact the builder directly on <a href="https://t.me/itsjusttu" target="_blank" rel="noreferrer">Telegram</a> or by <a href="mailto:levantu170605@gmail.com">email</a>. You can also join the <a href={L.discord} target="_blank" rel="noreferrer">Discord community</a>.</p>
        <form onSubmit={submit}>
          <label className="support-label" htmlFor="support-email">Email</label>
          <input id="support-email" type="email" autoComplete="email" placeholder="you@email.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="support-country"><label className="support-label" htmlFor="support-country">Country <span>(optional)</span></label>
            <select id="support-country" value={country} onChange={(e) => setCountry(e.target.value)}><option value="">Select your country</option>{COUNTRIES.map((name) => <option key={name}>{name}</option>)}</select>
          </div>
          <label className="support-label" htmlFor="support-inquiry">Inquiry</label>
          <textarea id="support-inquiry" placeholder="Describe the issue" required value={inquiry} onChange={(e) => setInquiry(e.target.value)} />
          <label className={`support-wallet ${!account ? "unavailable" : ""}`}><input type="checkbox" checked={shareWallet} disabled={!account} onChange={(e) => setShareWallet(e.target.checked)} /><span>Share my wallet address with the support team to help resolve this issue{!account && <small>Connect a wallet to include its address.</small>}</span></label>
          <button className="support-submit" type="submit">{copied ? "Request copied · open Discord to send" : "Copy request & open Discord"}</button>
          {copied && <p className="support-feedback" role="status">Your request is copied. Paste it in the PotKit support channel to send it.</p>}
          {copyFailed && <div className="support-feedback" role="alert"><p>Clipboard access was blocked. Copy this text and paste it in Discord:</p><textarea readOnly aria-label="Support request to copy manually" value={request} onFocus={(e) => e.currentTarget.select()} /></div>}
          <p className="support-privacy">Your details are not sent automatically. You choose what to post in Discord.</p>
        </form>
      </section>
    </div>
  );
}
