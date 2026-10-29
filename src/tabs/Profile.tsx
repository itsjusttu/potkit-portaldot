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
    <div className="profile profile-page pr">
      <section className="pr-card pr-id" aria-label="Wallet identity">
        <div className="profile-avatar" style={avatarStyle(target, isOwner ? profile.avatar : "")} aria-label="Wallet avatar" />
        <div className="pr-id-main">
          <div className="pr-title"><h1>{publicView ? short(target) : profile.name || short(target)}</h1>{roleIssuer && <span className="pr-role">Issuer</span>}{roleInvestor && <span className="pr-role">Investor</span>}</div>
          <div className="pr-addr"><span>EVM <Addr a={target} /></span>{publicView && <span>Portaldot <b className="mono">{short(mappedAddress(target))}</b><button type="button" className="profile-copy" aria-label="Copy mapped Portaldot address" onClick={() => void copy(mappedAddress(target), "mapped")}>{copied === "mapped" ? "Copied" : "Copy"}</button></span>}</div>
          {!publicView && profile.bio && <p className="pr-bio">{profile.bio}</p>}
          <small className="pr-note">{publicView ? "Public chain record. Identity details are not published." : "Name, bio and avatar are saved in this browser only."}</small>
        </div>
        <div className="pr-actions">{isOwner && <button className="btn" onClick={() => { setDraft(profile); setEditing(!editing); }}><Ico n="user" /> {editing ? "Close editor" : "Edit"}</button>}<button className={editing ? "btn" : "btn primary"} onClick={() => void share()}><Ico n="link" /> {copied === "share" ? "Copied" : "Share"}</button></div>
      </section>

      {editing && isOwner && <section className="profile-editor card">
        <div className="profile-editor-heading"><div><h3>Personalize your identity</h3></div><span>Only stored on this device</span></div>
        <div className="profile-editor-grid"><label className="profile-upload"><span className="profile-avatar small" style={avatarStyle(target, draft.avatar)} /><span>Change avatar<small>Image up to 1 MB</small></span><input type="file" accept="image/*" onChange={(e) => pickAvatar(e.target.files?.[0])} /></label>
          <label>Display name<input maxLength={40} value={draft.name} placeholder="Name shown beside your wallet" onChange={(e) => setDraft((v) => ({ ...v, name: e.target.value }))} /></label>
          <label className="profile-bio-input">Bio<textarea maxLength={240} rows={3} value={draft.bio} placeholder="A short description (240 characters max)" onChange={(e) => setDraft((v) => ({ ...v, bio: e.target.value }))} /><small>{draft.bio.length}/240</small></label></div>
        <footer><button className="btn" onClick={() => { setDraft(profile); setEditing(false); }}>Cancel</button><button className="btn primary" onClick={save}>Save profile</button></footer>
      </section>}

      <div className="pr-grid">
        <div className="pr-col">
          <section className="pr-card" aria-labelledby="pr-rec">
            <header><h2 id="pr-rec">Payment record</h2><span className={`pr-scan ${c.eventsOk && !c.eventsLoading ? "ok" : ""}`} title="Only invoices with an on-chain due date and a timestamped settlement or overdue status count toward the rate.">{c.eventsLoading ? "Reading events…" : c.eventsOk ? "Scanned events" : "Partial scan"}</span></header>
            <div className="pr-rec-body">
              {onTimeRate === null
                ? <div className="pr-rec-empty"><b>No rated invoices yet</b><small>An invoice counts once it has a due date and is paid or overdue.</small>{isOwner && <button type="button" className="btn sm" onClick={() => c.setTab("issue")}>Issue invoice</button>}</div>
                : <div className="profile-rate" style={{ "--rate": `${onTimeRate}%` } as CSSProperties}><b>{onTimeRate}%</b><small>on time</small></div>}
              <dl className="pr-stats">
                <div><dt>Issued</dt><dd className="num">{issuerIds.size}</dd></div>
                <div><dt>On time</dt><dd className="num good">{onTimeIds.length}</dd></div>
                <div><dt>Late</dt><dd className={`num ${lateIds.length ? "late" : ""}`}>{lateIds.length}</dd></div>
                <div><dt>Settled</dt><dd className="num">{settledCount}</dd></div>
                <div className="wide"><dt>Settled volume</dt><dd className="num">{fmt(settledAmount, 18)} tPOT</dd></div>
              </dl>
            </div>
          </section>

          <section className="pr-card" aria-labelledby="pr-act">
            <header><h2 id="pr-act">{publicView ? "Public record" : "Activity"}</h2>{!publicView && <button type="button" className="pr-link" onClick={() => c.setTab("history")}>Full history <Ico n="arrow" size={14} /></button>}</header>
            <div className="seg-tabs" role="tablist" aria-label="Wallet roles"><button type="button" role="tab" aria-selected={roleTab === "issuer"} aria-pressed={roleTab === "issuer"} onClick={() => setRoleTab("issuer")}>Issued<span>{issued.length}</span></button><button type="button" role="tab" aria-selected={roleTab === "investor"} aria-pressed={roleTab === "investor"} onClick={() => setRoleTab("investor")}>Bought<span>{bought.length}</span></button></div>
            {roleTab === "issuer"
              ? (!issued.length ? <p className="pr-empty">No invoice issuance events in the readable range.</p> : <ul className="pr-list">{issued.slice(0, 8).map((id) => { const r = c.rows.find((x) => x.id === id); const st = statusFor(id, r); return (
                <li key={id}><button type="button" onClick={() => c.setTab("verify", { id: String(id) })}><span className="pr-ico"><Ico n={st === "Settled" ? "check" : "terms"} size={15} /></span><span className="pr-li-t"><b>{r?.note || `${KINDS[r?.kind ?? 0] ?? "Invoice"} #${id}`}</b><small>#{id} · {r?.settle.faceValue ? `${fmt(r.settle.faceValue, 18)} tPOT face value` : "Terms in event record"}</small></span><span className={`pr-st st-${st.toLowerCase()}`}>{st}</span></button></li>); })}</ul>)
              : (!bought.length ? <p className="pr-empty">No share purchases found in the readable event range.</p> : <ul className="pr-list">{bought.slice(0, 8).map(([id, value]) => { const r = c.rows.find((x) => x.id === id); return (
                <li key={id}><div><span className="pr-ico"><Ico n="swap" size={15} /></span><span className="pr-li-t"><b>{r?.note || `Invoice #${id}`}</b><small>#{id} · <span className="num">{units(value.shares)}</span> shares bought</small></span><span className="pr-cost num">{fmt(value.cost, 18)} tPOT</span></div></li>); })}</ul>)}
            {c.eventsLoading && <p className="pr-warn" role="status">Reading on-chain activity. Counts may change.</p>}
            {!c.eventsLoading && !c.eventsOk && <p className="pr-warn">The RPC could not read the full event range, so this list may be incomplete.</p>}
          </section>
        </div>

        <div className="pr-col">
          {!publicView && <section className="pr-card" aria-labelledby="pr-gas">
            <header><h2 id="pr-gas">Gas &amp; network</h2><span className={`pr-net ${c.chainOk ? "ok" : c.chainOk === false ? "bad" : ""}`}><i />{c.chainOk ? "Portaldot V3" : c.chainOk === false ? "Wrong network" : "Not verified"}</span></header>
            <div className="pr-gas-bal"><span>Available tPOTv3</span><b className="num">{c.native !== null ? formatNative(c.native) : c.nativeLoading ? "Reading balance…" : c.nativeError ? "Balance unavailable" : "Connect wallet"}</b></div>
            {c.chainOk !== true && <div className="pr-gas-net"><small>Switch to chain {420420777} to transact.</small><button type="button" className="btn sm" disabled={Boolean(c.busy)} onClick={c.switchNetwork}>{c.busy === "net" ? "Switching…" : "Switch network"}</button></div>}
            <div className="pr-faucet"><small>Fund gas to this mapped account</small><div className="profile-faucet-account"><code>{mappedAddress(target)}</code><button type="button" className="profile-copy" aria-label="Copy mapped gas account" onClick={() => void copy(mappedAddress(target), "mapped")}>{copied === "mapped" ? "Copied" : "Copy"}</button></div><FaucetButton account={target} compact hideManualAddress onFunded={() => void c.refresh()} /><a className="pr-link" href="https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/accounts" target="_blank" rel="noreferrer">Node console accounts <Ico n="ext" size={13} /></a></div>
          </section>}

          <section className="pr-card" aria-labelledby="pr-badges">
            <header><h2 id="pr-badges">Achievements</h2><span className="pr-count num">{badgeList.filter((b) => b.earned).length}/{badgeList.length}</span></header>
            <div className="profile-badge-list">{badgeList.map((b) => <div key={b.name} className={`profile-badge ${b.earned ? `earned ${b.tone}` : "locked"}`} title={b.earned ? "Earned from on-chain activity" : "Earn this through on-chain activity"}><i>{b.icon}</i><span>{b.name}</span></div>)}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
