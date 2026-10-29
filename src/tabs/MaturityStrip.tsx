import { fmtDate, fmtDay } from "./shared";

export type Pin = { id: number; due: number; face: string; status: string };

const SPAN_MIN = 30 * 86400;
const LANES = 3;

/**
 * Open receipts placed on one time line, from the earliest due date (or today) to the latest.
 * Position is the due date, label is the face value, colour is the status word the pin also carries.
 * Every figure comes from the loaded receipts.
 */
export function MaturityStrip({ pins, now, onPick }: { pins: Pin[]; now: number; onPick: (id: number) => void }) {
  if (!pins.length) return <p className="db-none">No open receipt has a due date yet.</p>;
  const sorted = [...pins].sort((a, b) => a.due - b.due);
  const lo = Math.min(now, sorted[0]!.due);
  const hi = Math.max(now + SPAN_MIN, sorted[sorted.length - 1]!.due);
  const lanes = Math.min(LANES, sorted.length);
  const at = (t: number) => 6 + ((t - lo) / (hi - lo)) * 88;
  return (
    <div className="ms" role="group" aria-label="Open receipts by due date">
      <div className="ms-track" style={{ height: `${3.1 + lanes * 2.35}rem` }}>
        <i className="ms-rail" aria-hidden />
        <span className="ms-today" style={{ left: `${at(now)}%` }}><b>Today</b></span>
        {sorted.map((p, i) => (
          <button key={p.id} type="button" className="ms-pin" data-status={p.status} data-edge={at(p.due) < 22 ? "l" : at(p.due) > 78 ? "r" : undefined} style={{ left: `${at(p.due)}%`, "--lane": i % lanes } as React.CSSProperties}
            onClick={() => onPick(p.id)} title={`Receipt #${p.id}: ${p.status}, due ${fmtDate(new Date(p.due * 1000))}. Open its proof.`}>
            <i aria-hidden />
            <span><b className="num">{p.face}</b><small>#{p.id} · {p.status}</small></span>
          </button>
        ))}
      </div>
      <div className="ms-ends num"><span>{fmtDay(new Date(lo * 1000))}</span><span>{fmtDay(new Date(hi * 1000))}</span></div>
    </div>
  );
}
