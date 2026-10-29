import { useCallback, useEffect, useState, type ReactNode } from "react";
import { mappedAddress, portaldot } from "./lib/chain";
import { Ico } from "./AppUi";
import { L } from "./docs/Chrome";

/** Response shapes of /api/faucet (see api/_faucet-core.ts). */
type Status = { ok: boolean; enabled: boolean; address?: string; balance?: string; amount?: string; empty?: boolean; reason?: string; error?: string; message?: string;
  recipient?: { address: string; balance: string; eligible: boolean } };
type Sent = { ok: boolean; hash?: string; amount?: string; error?: string; message?: string };
type Phase = { s: "idle" } | { s: "pending" } | { s: "ok"; hash: string; amount: string } | { s: "err"; msg: string; code?: string };

const API = "/api/faucet";

/** GET /api/faucet — null means "no API here" (local vite preview, static host, 404, non-JSON). */
async function getStatus(address: string): Promise<Status | null> {
  try {
    const r = await fetch(`${API}?address=${address}`, { headers: { accept: "application/json" } });
    if (!(r.headers.get("content-type") ?? "").includes("json")) return null;
    return (await r.json()) as Status;
  } catch { return null; }
}

/**
 * "Request test gas" — calls the PotKit faucet for the connected address.
 * Falls back to manual-funding instructions (mapped 5… account + Copy) when the API is
 * unavailable or not configured. Disabled when the wallet already has enough gas.
 */
export function FaucetButton({ account, onFunded, compact = false, hideManualAddress = false }: { account: string; onFunded?: () => void; compact?: boolean; hideManualAddress?: boolean }) {
  const [st, setSt] = useState<Status | null | undefined>(undefined); // undefined = loading
  const [ph, setPh] = useState<Phase>({ s: "idle" });
  const [copied, setCopied] = useState(false);
  let mapped = "";
  try { mapped = mappedAddress(account); } catch { /* not an address */ }

  const load = useCallback(async () => setSt(await getStatus(account)), [account]);
  useEffect(() => { setPh({ s: "idle" }); setSt(undefined); void load(); }, [load]);

  const request = async () => {
    setPh({ s: "pending" });
    try {
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: account, chainId: portaldot.id }) });
      const j = (await r.json().catch(() => ({ ok: false, message: `Faucet returned HTTP ${r.status}` }))) as Sent;
      if (j.ok && j.hash) { setPh({ s: "ok", hash: j.hash, amount: j.amount ?? "" }); setTimeout(() => { void load(); onFunded?.(); }, 6000); }
      else setPh({ s: "err", msg: j.message ?? "The faucet could not send gas.", code: j.error });
    } catch { setPh({ s: "err", msg: "Could not reach the faucet. Check your connection and try again." }); }
  };

  const copy = () => void navigator.clipboard?.writeText(mapped).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1300); });
  const closed = <>The PotKit faucet is not active on this deployment. Test tPOT is handed out by the Portaldot team to hackathon participants: ask on the <a href={L.discord} target="_blank" rel="noreferrer">Portaldot Discord</a> and give them your mapped Portaldot account (the address starting with 5).</>;
  const manual = (why: ReactNode) => (
    <div className={`faucet off ${compact ? "compact" : ""}`}>
      {why ? <p className="muted small">{why}</p> : null}
      {!hideManualAddress && <p className="muted small">Mapped Portaldot account for manual gas funding:</p>}
      {mapped && !hideManualAddress && <p className="tl-hash"><span className="mono">{mapped}</span>
        <button className="wp-copy" aria-label="Copy mapped gas account" onClick={copy}><Ico n={copied ? "check" : "copy"} size={14} />{copied ? "Copied" : "Copy"}</button></p>}
    </div>
  );

  if (st === undefined) return <div className={`faucet ${compact ? "compact" : ""}`}><button className="btn sm" disabled><span className="spin" aria-hidden /> Checking faucet…</button></div>;
  if (st === null) return manual(closed);
  if (!st.enabled) return manual(closed);
  if (!st.ok) return manual(st.message ?? "The gas faucet can't be reached right now. You can still fund the mapped account manually.");

  const enough = st.recipient ? !st.recipient.eligible : false;
  const disabled = ph.s === "pending" || ph.s === "ok" || enough || Boolean(st.empty);
  const label = ph.s === "pending" ? "Sending…" : ph.s === "ok" ? "Sent" : `Request test gas${st.amount ? ` (${st.amount} tPOTv3)` : ""}`;
  return (
    <div className={`faucet ${compact ? "compact" : ""}`} aria-live="polite">
      <div className="faucet-row">
        <button className="btn primary sm" disabled={disabled} onClick={() => void request()}>
          {ph.s === "pending" ? <span className="spin" aria-hidden /> : <Ico n={ph.s === "ok" ? "check" : "bolt"} size={14} />} {label}
        </button>
        <span className="muted small">Faucet balance: <b className="mono">{st.balance ?? "?"} tPOTv3</b></span>
      </div>
      {enough && ph.s === "idle" && <p className="muted small">You already have {st.recipient!.balance} tPOTv3 — enough gas for now.</p>}
      {st.empty && <p className="small warn-t">The faucet is empty. Fund manually: <span className="mono">{mapped}</span></p>}
      {ph.s === "ok" && <p className="small ok-t">Sent {ph.amount} tPOTv3. Tx <span className="mono" title={ph.hash}>{ph.hash.slice(0, 10)}…{ph.hash.slice(-6)}</span> — balance updates in a few seconds.</p>}
      {ph.s === "err" && <p className="small err-t">{ph.msg}</p>}
      {ph.s === "err" && ph.code === "faucet_empty" && manual("")}
    </div>
  );
}
