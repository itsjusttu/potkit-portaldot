import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Address } from "viem";
import { fmt, formatNative, KINDS, mappedAddress, short, units, type ChainEvent, type Row } from "../lib/chain";
import { Addr, Ico, toast } from "../AppUi";
import { FaucetButton } from "../Faucet";
import { profileShareUrl } from "../routes";
import type { Ctx } from "./ctx";

type LocalProfile = { name: string; bio: string; avatar: string };
const emptyProfile: LocalProfile = { name: "", bio: "", avatar: "" };
const profileKey = (address: string) => `potkit.profile.${address.toLowerCase()}`;
const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const savedProfile = (address: string): LocalProfile => {
  try { return { ...emptyProfile, ...JSON.parse(localStorage.getItem(profileKey(address)) ?? "{}") as Partial<LocalProfile> }; }
  catch { return emptyProfile; }
};

function avatarStyle(address: string, image: string): CSSProperties {
  const angle = Number.parseInt(address.slice(2, 8) || "0", 16) % 360;
  return image ? { backgroundImage: `url(${image})` } : { background: `conic-gradient(from ${angle}deg, var(--pk-accent), var(--pk-surface-2), var(--pk-muted), var(--pk-accent))` };
}

export function Profile({ c }: { c: Ctx }) {
  const me = c.account;
  const target = (c.param("profile") || me) as Address | "";
  const isOwner = same(target, me);
  const publicView = !isOwner;
  const [profile, setProfile] = useState<LocalProfile>(() => target ? savedProfile(target) : emptyProfile);
  const [editing, setEditing] = useState(false);
  const [roleTab, setRoleTab] = useState<"issuer" | "investor">("issuer");
  const [draft, setDraft] = useState<LocalProfile>(profile);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const next = target ? savedProfile(target) : emptyProfile;
    setProfile(next); setDraft(next); setEditing(false);
  }, [target]);

  const events = useMemo(() => c.events.filter((e) => e.actors.some((a) => same(a, target))), [c.events, target]);
  const issuerRows = c.rows.filter((r) => same(r.depositor, target));
  const issuerIds = new Set<number>([
    ...events.filter((e) => e.kind === "lock").map((e) => e.id),
    ...issuerRows.map((r) => r.id),
  ]);
  const terms = new Map<number, { dueDate: number; faceValue: bigint }>();
  for (const e of c.events) if (e.kind === "terms") terms.set(e.id, { dueDate: e.dueDate ?? 0, faceValue: e.value ?? 0n });
  for (const r of c.rows) if (!terms.has(r.id)) terms.set(r.id, { dueDate: r.dueDate, faceValue: r.settle.faceValue });
  const settlements = new Map<number, ChainEvent>();
  for (const e of [...c.events].reverse()) if (e.kind === "settle" && issuerIds.has(e.id)) settlements.set(e.id, e);
  const overdueNow = new Set(issuerRows.filter((r) => r.status === "Overdue").map((r) => r.id));
  const datedOutcomeIds = [...issuerIds].filter((id) => Boolean(terms.get(id)?.dueDate) && (Boolean(settlements.get(id)?.time) || overdueNow.has(id)));
  const onTimeIds = datedOutcomeIds.filter((id) => {
    const paid = settlements.get(id); const due = terms.get(id)?.dueDate ?? 0;
    return Boolean(paid?.time && due && paid.time <= due);
  });
  const lateIds = datedOutcomeIds.filter((id) => !onTimeIds.includes(id));
  const settledAmount = [...settlements.values()].reduce((sum, e) => sum + (e.value ?? 0n), 0n);
  const settledCount = new Set([...settlements.keys(), ...issuerRows.filter((r) => r.settle.settled).map((r) => r.id)]).size;
  const onTimeRate = datedOutcomeIds.length ? Math.round((onTimeIds.length / datedOutcomeIds.length) * 100) : null;
  const redeemedIds = new Set(events.filter((e) => e.kind === "redeem").map((e) => e.id));
  const buys = events.filter((e) => e.kind === "buy" && same(e.actors[0], target));
  const buyById = new Map<number, { shares: bigint; cost: bigint }>();
  for (const e of buys) {
    const prev = buyById.get(e.id) ?? { shares: 0n, cost: 0n };
    buyById.set(e.id, { shares: prev.shares + (e.amount ?? 0n), cost: prev.cost + (e.value ?? 0n) });
  }
  const roleIssuer = issuerIds.size > 0;
  const roleInvestor = buys.length > 0 || (isOwner && c.rows.some((r) => r.fraction && (c.held.get(r.id) ?? 0n) > 0n));
  const issued = [...issuerIds].sort((a, b) => b - a);
  const bought = [...buyById.entries()].sort((a, b) => b[0] - a[0]);
  const hashFor = (id: number, kind: ChainEvent["kind"]) => c.events.find((e) => e.id === id && e.kind === kind && e.actors.some((a) => same(a, target)));
  const badgeList = [
    { name: "First invoice", icon: "✦", earned: issuerIds.size > 0, tone: "neutral" },
    { name: "First settle", icon: "✓", earned: settledCount > 0, tone: "green" },
    { name: "Redeemed", icon: "↻", earned: redeemedIds.size > 0, tone: "gold" },
    { name: "On-time payer", icon: "◷", earned: events.some((e) => e.kind === "settle" && same(e.actors[0], target) && Boolean(e.time && terms.get(e.id)?.dueDate && e.time <= (terms.get(e.id)?.dueDate ?? 0))), tone: "blue" },
    { name: "First share buy", icon: "◇", earned: buys.length > 0, tone: "pink" },
  ];
  const copy = async (value: string, key: string): Promise<boolean> => {
    try { await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(""), 1400); return true; }
    catch { toast({ kind: "err", title: "Copy failed", detail: value }); return false; }
  };
  const share = async () => {
    if (!target) return;
    if (await copy(profileShareUrl(target, c.addrs?.vault), "share")) toast({ kind: "ok", title: "Profile link copied", detail: "The link shows this wallet's on-chain record." });
  };
  const save = () => {
    if (!target || !isOwner) return;
    try { localStorage.setItem(profileKey(target), JSON.stringify(draft)); setProfile(draft); setEditing(false); }
    catch { toast({ kind: "err", title: "Profile not saved", detail: "Browser storage is unavailable or full. Try a smaller avatar image." }); }
  };
  const pickAvatar = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast({ kind: "err", title: "Choose an image", detail: "Use PNG, JPEG, WebP or GIF." });
    if (file.size > 1_000_000) return toast({ kind: "err", title: "Image is too large", detail: "Choose an image under 1 MB." });
    const reader = new FileReader(); reader.onload = () => setDraft((v) => ({ ...v, avatar: String(reader.result ?? "") })); reader.readAsDataURL(file);
  };
  const statusFor = (id: number, row?: Row) => {
    if (redeemedIds.has(id)) return "Redeemed";
    if (settlements.has(id) || row?.settle.settled) return "Settled";
    if (c.listings.some((l) => l.receiptId === id && l.remaining > 0n)) return "Trading";
    if (row?.fraction || events.some((e) => e.kind === "lock" && e.id === id)) return "Locked";
    return "Minted";
  };
  if (!target) return <section className="card"><h2>Connect a wallet to view your profile</h2><button className="btn primary" onClick={c.connect}>Connect wallet</button></section>;

  return (
    <div className="profile profile-page">
      <section className="profile-identity">
        <div className="profile-avatar" style={avatarStyle(target, isOwner ? profile.avatar : "")} aria-label="Wallet avatar" />
        <div className="profile-id-main">
          <div className="profile-title-line"><h2>{publicView ? short(target) : profile.name || short(target)}</h2>{roleIssuer && <span className="profile-role issuer">Issuer</span>}{roleInvestor && <span className="profile-role investor">Investor</span>}</div>
          <div className="profile-addresses"><span>EVM <Addr a={target} /></span><span>Portaldot <b className="mono">{short(mappedAddress(target))}</b><button className="profile-copy" aria-label="Copy mapped Portaldot address" onClick={() => void copy(mappedAddress(target), "mapped")}>{copied === "mapped" ? "Copied" : "Copy"}</button></span><a className="profile-explorer" href="https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/accounts" target="_blank" rel="noreferrer">Open node console accounts ↗</a></div>
          {!publicView && profile.bio && <p className="profile-bio">{profile.bio}</p>}
          <small className="profile-note">{publicView ? "Public chain record · identity details are not published" : "Name, bio and avatar are saved in this browser only"}</small>
        </div>
        <div className="profile-head-actions">{isOwner && <button className="btn" onClick={() => { setDraft(profile); setEditing(!editing); }}><Ico n="user" /> {editing ? "Close editor" : "Edit profile"}</button>}<button className="btn primary" onClick={() => void share()}><Ico n="link" /> {copied === "share" ? "Copied" : "Share profile"}</button></div>
      </section>

      {editing && isOwner && <section className="profile-editor card">
        <div className="profile-editor-heading"><div><p className="kicker">Local profile</p><h3>Personalize your identity</h3></div><span>Only stored on this device</span></div>
        <div className="profile-editor-grid"><label className="profile-upload"><span className="profile-avatar small" style={avatarStyle(target, draft.avatar)} /><span>Change avatar<small>Image up to 1 MB</small></span><input type="file" accept="image/*" onChange={(e) => pickAvatar(e.target.files?.[0])} /></label>
          <label>Display name<input maxLength={40} value={draft.name} placeholder="Name shown beside your wallet" onChange={(e) => setDraft((v) => ({ ...v, name: e.target.value }))} /></label>
          <label className="profile-bio-input">Bio<textarea maxLength={240} rows={3} value={draft.bio} placeholder="A short description (240 characters max)" onChange={(e) => setDraft((v) => ({ ...v, bio: e.target.value }))} /><small>{draft.bio.length}/240</small></label></div>
        <footer><button className="btn" onClick={() => { setDraft(profile); setEditing(false); }}>Cancel</button><button className="btn primary" onClick={save}>Save profile</button></footer>
      </section>}

      <div className="profile-main-grid">
        <section className="profile-reputation">
          <header><div><p className="kicker">Issuer reputation</p><h3>Payment track record</h3></div><span className={`profile-chain-tag ${c.eventsOk && !c.eventsLoading ? "ok" : "partial"}`}>{c.eventsLoading ? "READING EVENTS" : c.eventsOk ? "SCANNED EVENTS" : "PARTIAL RPC SCAN"}</span></header>
          <div className="profile-reputation-body">{onTimeRate === null ? <div className="profile-rate-empty"><b>No rated invoices yet</b>{isOwner && <button className="btn primary sm" onClick={() => c.setTab("issue")}>Issue your first invoice</button>}</div> : <div className="profile-rate" style={{ "--rate": `${onTimeRate}%` } as CSSProperties}><b>{onTimeRate}%</b><small>ON-TIME<br />DATED INVOICES</small></div>}
            <div className="profile-trust-stats"><div><span>Invoices issued</span><b>{issuerIds.size}</b></div><div><span>Settled on time</span><b className="good">{onTimeIds.length}</b></div><div><span>Late / overdue</span><b className={lateIds.length ? "late" : ""}>{lateIds.length}</b></div><div><span>Settled volume</span><b>{fmt(settledAmount, 18)} <small>tPOT</small></b></div></div>
          </div>
          <p className="profile-data-note" title="Only invoices with an on-chain due date and a timestamped settlement or overdue status count toward the rate.">ⓘ Rate uses dated invoices with recorded outcomes.</p>
        </section>

        <section className="profile-activity">
            <header className="profile-activity-heading"><div><p className="kicker">Wallet history</p><h3>{publicView ? "Public record" : "Your record"}</h3></div></header>
            <div className="profile-record-tabs" role="tablist" aria-label="Wallet roles"><button className={roleTab === "issuer" ? "active" : ""} role="tab" aria-selected={roleTab === "issuer"} onClick={() => setRoleTab("issuer")}>Issuer <span>{issued.length}</span></button><button className={roleTab === "investor" ? "active" : ""} role="tab" aria-selected={roleTab === "investor"} onClick={() => setRoleTab("investor")}>Investor <span>{bought.length}</span></button></div>
            {roleTab === "issuer" ? <div className="profile-role-section"><h4><span className="profile-role issuer">Issuer</span><small>Receipts originated by this wallet</small></h4>
              {!issued.length ? <p className="profile-empty">No invoice issuance events in the readable range.</p> : <div className="profile-record-list">{issued.slice(0, 8).map((id) => { const r = c.rows.find((x) => x.id === id); return <button className="profile-record-row" key={id} onClick={() => c.setTab("verify", { id: String(id) })}><span className="profile-record-icon"><Ico n={statusFor(id, r) === "Settled" ? "check" : "terms"} size={15} /></span><span className="profile-record-title"><b>{r?.note || `${KINDS[r?.kind ?? 0] ?? "Invoice"} #${id}`}</b><small>INVOICE #{id} · {r?.settle.faceValue ? `${fmt(r.settle.faceValue, 18)} tPOT face value` : "Terms in event record"}</small></span><span className={`profile-record-status ${statusFor(id, r).toLowerCase()}`}>{statusFor(id, r)}</span><Ico n="arrow" size={14} /></button>; })}</div>}
            </div> : <div className="profile-role-section"><h4><span className="profile-role investor">Investor</span><small>Shares bought by this wallet in readable events</small></h4>
              {!bought.length ? <p className="profile-empty">No share purchases found in the readable event range.</p> : <div className="profile-record-list">{bought.slice(0, 8).map(([id, value]) => { const r = c.rows.find((x) => x.id === id); return <div className="profile-record-row investor-row" key={id}><span className="profile-record-icon investor-icon"><Ico n="swap" size={15} /></span><span className="profile-record-title"><b>{r?.note || `Invoice #${id}`}</b><small>INVOICE #{id} · {units(value.shares)} shares bought</small></span><span className="profile-record-status investor-cost">{fmt(value.cost, 18)} tPOT</span></div>; })}</div>}
            </div>}
            {c.eventsLoading && <p className="profile-scan-warning" role="status">Reading on-chain activity. Event-based counts may change.</p>}
            {!c.eventsLoading && !c.eventsOk && <p className="profile-scan-warning">The RPC could not read the full requested event range. Counts and history above may be incomplete.</p>}
        </section>

        <div className="profile-right-rail">
          <section className="profile-badges"><header><h3>Achievements</h3><span>{badgeList.filter((b) => b.earned).length}/{badgeList.length}</span></header><div className="profile-badge-list">{badgeList.map((b) => <div key={b.name} className={`profile-badge ${b.earned ? `earned ${b.tone}` : "locked"}`} title={b.earned ? "Earned from on-chain activity" : "Earn this through on-chain activity"}><i>{b.icon}</i><span>{b.name}</span></div>)}</div></section>
          {!publicView && <section className="profile-gas"><header><div><p className="kicker">Wallet readiness</p><h3>Gas &amp; network</h3></div><span className={`profile-network-dot ${c.chainOk ? "ok" : ""}`} /></header><div className="profile-gas-balance"><span>Available tPOTv3</span><b>{c.native !== null ? formatNative(c.native) : c.nativeLoading ? "Reading balance…" : c.nativeError ? "Balance unavailable" : "Connect wallet"}</b></div><div className="profile-network-row"><div><b>{c.chainOk ? "Portaldot V3 Testnet" : c.chainOk === false ? "Wrong network" : "Network not verified"}</b><small>Chain ID {420420777}</small></div>{c.chainOk !== true && <button className="btn sm" disabled={Boolean(c.busy)} onClick={c.switchNetwork}>{c.busy === "net" ? "Switching…" : "Switch network"}</button>}</div><div className="profile-faucet"><div className="profile-faucet-heading"><Ico n="info" /><b>Need gas?</b></div><p>Send test tPOTv3 to this mapped account to fund transaction fees.</p><div className="profile-faucet-account"><code>{mappedAddress(target)}</code><button className="profile-copy" aria-label="Copy mapped gas account" onClick={() => void copy(mappedAddress(target), "mapped")}>{copied === "mapped" ? "Copied" : "Copy"}</button></div><FaucetButton account={target} compact hideManualAddress onFunded={() => void c.refresh()} /></div></section>}
        </div>
      </div>
    </div>
  );
}
