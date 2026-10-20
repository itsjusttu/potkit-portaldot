import { useEffect, useState } from "react";
import { deployKit, fmt, fractionalize, KINDS, mint, PAY_SYMBOL, short, units } from "../lib/chain";
import { Addr, Empty, Ico } from "../AppUi";
import { type Ctx } from "./ctx";
import { day, SettleBadge } from "./shared";
import { readReceiptHistory } from "./receipt-history";

const WKEY = "potkit.v17.wizard";
const STEPS = ["Invoice details", "Mint receipt", "Lock, set terms & issue shares"];

export function Issue({ c }: { c: Ctx }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(WKEY) ?? "{}"); } catch { return {}; } })();
  const [kind, setKind] = useState<number>(saved.kind ?? 0);
  const [note, setNote] = useState<string>(saved.note ?? "Invoice 042 — content delivery");
  const [face, setFace] = useState<string>(saved.face ?? "1");
  const [due, setDue] = useState<string>(saved.due ?? new Date(Date.now() + 60 * 86400e3).toISOString().slice(0, 10));
  const [supply, setSupply] = useState<string>(saved.supply ?? "100");
  const [wizId, setWizId] = useState<number>(saved.wizId ?? 0);
  const [step, setStep] = useState(0);
  useEffect(() => { localStorage.setItem(WKEY, JSON.stringify({ kind, note, face, due, supply, wizId })); }, [kind, note, face, due, supply, wizId]);

  const row = c.rows.find((r) => r.id === wizId);
  // the wizard follows the receipt's real on-chain state once minted
  const chainStep = !wizId || !row ? null : !row.fraction ? 2 : 3;
  const cur = chainStep ?? step;
  const mine = c.rows.filter((r) => r.depositor === c.account || r.owner === c.account);
  // Redemption clears live terms in storage; restore them from the shared event-history reader.
  const receiptHistory = readReceiptHistory(c.events);
  const redeemed = (id: number) => receiptHistory.get(id)?.redeemed ?? false;
  const faceValue = (r: (typeof c.rows)[number]) => r.settle.faceValue > 0n ? r.settle.faceValue : redeemed(r.id) ? receiptHistory.get(r.id)?.terms?.value ?? 0n : 0n;
  const originalSupply = (r: (typeof c.rows)[number]) => r.supply > 0n ? r.supply : (receiptHistory.get(r.id)?.lock?.amount ?? 0n) * 10n ** 18n;
  const needSetup = !c.addrs;
  const dis = Boolean(c.busy) || c.gated;

  const restart = () => { setWizId(0); setStep(0); };
  const resume = (id: number) => { setWizId(id); const r = c.rows.find((x) => x.id === id); if (r) { setKind(r.kind); setNote(r.note); } document.getElementById("wizard")?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <div className="issue">
      <section className="issue-intro"><div><p className="kicker">Stage 01 · Create</p><h2>ISSUE AN INVOICE</h2><p>Create the receipt, then lock it and issue shares in three guided steps.</p></div><span className="issue-chain-pill"><i /> Portaldot V3 · ERC-721</span></section>
      {needSetup && (
        <section className="card setup-card">
          <h2>Set up the contract</h2>
          <p className="muted">PotKit is one contract: receipts, vault, settlement pool and market. One click, one transaction, once per deployment. Payments use native tPOT, so there is no token to deploy.</p>
          <ol className="setup-steps">
            <li className={c.addrs ? "done" : ""}><span className="box">{c.addrs ? <Ico n="check" /> : 1}</span><span>PotKit</span>
              {c.addrs ? <Addr a={c.addrs.vault} label="PotKit" /> : <button className="btn sm primary" disabled={dis || !c.account} onClick={() => void c.run("deploy", async () => {
                const d = await deployKit(c.ready(), c.saveStep); c.note("Contract deployed", `PotKit ${short(d.kit)}`, d.hash);
              })}>{c.busy === "deploy" ? "Confirm in wallet…" : "Deploy"}</button>}</li>
          </ol>
        </section>
      )}

      <section className="wizard" id="wizard">
        <div className="card wiz-main">
          <ol className="wiz-steps" aria-label="Issue steps">
            {STEPS.map((s, i) => <li key={s} className={i < cur ? "done" : i === cur ? "on" : ""} aria-current={i === cur ? "step" : undefined}><span className="box">{i < cur ? <Ico n="check" /> : i + 1}</span>{s}</li>)}
          </ol>

          {cur === 0 && (
            <div className="wiz-pane">
              <h2>1 · Invoice details</h2>
              <p className="muted">Describe the real-world claim. Kind and note are written on-chain; face value (in tPOT) and due date become the terms when you lock it in step 3.</p>
              <p className="issue-privacy"><b>Public on-chain record.</b> Anyone can read these details. Do not include names, account numbers, invoice files or other sensitive personal data. PotKit records issuer-provided information; it does not independently authenticate the underlying invoice.</p>
              <div className="row fields">
                <div><label htmlFor="w-kind">Kind</label><select id="w-kind" value={kind} onChange={(e) => setKind(Number(e.target.value))}>{KINDS.map((k, i) => <option key={k} value={i}>{k}</option>)}</select></div>
                <div style={{ flex: 2 }}><label htmlFor="w-note">Note (1–140 chars)</label><input id="w-note" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} /></div>
              </div>
              <div className="row fields">
                <div><label htmlFor="w-face">Face value ({PAY_SYMBOL})</label><input id="w-face" inputMode="decimal" value={face} onChange={(e) => setFace(e.target.value)} /></div>
                <div><label htmlFor="w-due">Due date</label><input id="w-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
                <div><label htmlFor="w-sup">Shares to issue</label><input id="w-sup" inputMode="numeric" value={supply} onChange={(e) => setSupply(e.target.value)} /></div>
              </div>
              <div className="wiz-nav"><span className={c.canMint ? "issue-ready-mint" : "muted"}>{c.canMint ? <><i />Ready to mint</> : "Only the issuer or approved minters can mint."}</span>
                <button className="btn primary" disabled={!note.trim() || !/^\d+(\.\d+)?$/.test(face) || !/^\d+$/.test(supply)} onClick={() => setStep(1)}>Continue <Ico n="arrow" /></button></div>
            </div>
          )}
          {cur === 1 && (
            <div className="wiz-pane">
              <h2>2 · Mint the receipt</h2>
              <p className="muted">Creates an ERC-721 receipt in your wallet. One transaction.</p>
              <dl className="facts"><div><dt>Kind</dt><dd>{KINDS[kind]}</dd></div><div><dt>Note</dt><dd>{note}</dd></div></dl>
              <div className="wiz-nav"><button className="btn" onClick={() => setStep(0)}>Back</button>
                <button className="btn primary" disabled={dis || !c.addrs || !c.canMint} onClick={() => void c.run("mint", async () => {
                  const m = await mint(c.ready(), c.addrs!.receipt, kind, note.trim());
                  setWizId(m.id); c.note("Receipt minted", `#${m.id} · ${KINDS[kind]}`, m.hash);
                })}>{c.busy === "mint" ? "Waiting for wallet…" : "Mint receipt"}</button></div>
            </div>
          )}
          {cur === 2 && row && (
            <div className="wiz-pane">
              <h2>3 · Lock, set terms &amp; issue shares</h2>
              <p className="muted">Receipt #{row.id} moves into PotKit, its payment terms are fixed (face value in {PAY_SYMBOL}, optional due date) and {supply || "N"} ERC-20 shares (KIT{row.id}) are minted to you. One transaction, no approval needed. With terms set, anyone can settle by paying at least the face value.</p>
              <div className="row fields">
                <div><label htmlFor="w-sup2">Shares to issue</label><input id="w-sup2" inputMode="numeric" value={supply} onChange={(e) => setSupply(e.target.value)} /></div>
                <div><label htmlFor="w-face2">Face value ({PAY_SYMBOL})</label><input id="w-face2" inputMode="decimal" value={face} onChange={(e) => setFace(e.target.value)} /></div>
                <div><label htmlFor="w-due2">Due date</label><input id="w-due2" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
              </div>
              <div className="wiz-nav"><button className="btn" onClick={restart}>Start over</button>
                <button className="btn primary" disabled={dis} onClick={() => void c.run("frac", async () => {
                  const s = supply.trim(); if (!/^\d+$/.test(s) || Number(s) < 1) throw new Error("Shares must be a whole number ≥ 1.");
                  const v = face.trim(); if (!/^\d+(\.\d+)?$/.test(v) || Number(v) <= 0) throw new Error("Enter a positive face value.");
                  const d = due ? new Date(`${due}T23:59:59`) : undefined; if (d && d.getTime() <= Date.now()) throw new Error("Due date must be in the future.");
                  const f = await fractionalize(c.ready(), c.addrs!, row.id, s, v, d);
                  c.note("Fractionalized", `#${row.id} → ${s} KIT${row.id} · ${v} ${PAY_SYMBOL}${d ? ` due ${d.toLocaleDateString()}` : ""}${f.token ? ` · ${short(f.token)}` : ""}`, f.hash);
                })}>{c.busy === "frac" ? "Confirm in wallet…" : "Lock & issue shares"}</button></div>
            </div>
          )}
          {cur === 3 && row && (
            <div className="wiz-pane wiz-done">
              <span className="done-ico"><Ico n="check" size={22} /></span>
              <h2>Invoice #{row.id} is live</h2>
              <p className="muted">{units(row.supply)} shares, {fmt(row.settle.faceValue, row.settle.decimals)} {row.settle.symbol} due{row.dueDate ? ` ${day(row.dueDate)}` : ""}. Sell shares for cash today, or share the verification link.</p>
              <div className="row">
                <button className="btn primary" onClick={() => c.setTab("trade", { sell: String(row.id) })}>List these shares on Trade <Ico n="arrow" /></button>
                <button className="btn" onClick={() => c.setTab("verify", { id: String(row.id) })}><Ico n="shield" /> Verify</button>
                <button className="btn" onClick={restart}><Ico n="mint" /> Issue another</button>
              </div>
            </div>
          )}
        </div>
        <aside className={`wiz-preview wiz-stage-${cur >= 3 ? "live" : cur >= 2 ? "minted" : cur === 1 ? "ready" : "draft"}`} aria-label="Receipt preview" aria-live="polite">
          <header className="wiz-preview-head"><div><p className="kicker">Live preview · receipt artwork</p><b>{cur >= 3 ? "Receipt is live on Portaldot" : cur >= 2 ? "Receipt minted to your wallet" : cur === 1 ? "Ready to mint" : "Your invoice, as an NFT"}</b></div><span className="wiz-preview-state"><i />{cur >= 3 ? "ON-CHAIN" : cur >= 2 ? "MINTED" : cur === 1 ? "READY" : "DRAFT"}</span></header>
          <div className="issue-receipt" aria-label="Live invoice receipt preview">
            <div className="ir-corner ir-tl" /><div className="ir-corner ir-tr" /><div className="ir-corner ir-bl" /><div className="ir-corner ir-br" />
            <div className="ir-meta"><span>POTKIT RECEIPT · {KINDS[row?.kind ?? kind].toUpperCase()}</span><span>ERC-721 {row ? `· #${row.id}` : "· PREVIEW"}</span></div>
            <h3>{row?.note || note || "Your invoice title"}</h3>
            <p className="ir-sub">Issuer-provided invoice record · Portaldot V3</p>
            <div className="ir-face"><strong>{row?.settle.faceValue ? fmt(row.settle.faceValue, row.settle.decimals) : face || "—"}<i> tPOT</i></strong><small>FACE VALUE</small></div>
            <dl className="ir-facts"><div><dt>DUE DATE</dt><dd>{row?.dueDate ? day(row.dueDate) : due ? new Date(due + "T12:00:00").toLocaleDateString() : "—"}</dd></div><div><dt>SHARES</dt><dd>{row?.supply ? units(row.supply) : supply || "—"}</dd></div></dl>
            <div className="ir-foot"><span>{row?.depositor || row?.owner || c.account ? short(row?.depositor || row?.owner || c.account) : "ISSUER WALLET NOT CONNECTED"}</span><span className="ir-state"><i />{row?.settle.settled ? "SETTLED" : cur >= 3 ? "LIVE · TERMS ON-CHAIN" : cur >= 2 ? "MINTED" : "READY TO MINT"}</span></div>
          </div>
          {cur >= 2 && <p className="wiz-minted-note"><Ico n="check" /> Mint confirmed. The receipt can now be locked and split into shares.</p>}
          <p className="muted small">This preview follows the invoice details above. The NFT stays inside PotKit while shares are outstanding.</p>
        </aside>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2>My issued invoices</h2><button className="btn sm" onClick={() => void c.refresh()}>Refresh</button></div>
        {!mine.length ? <Empty icon="▤" title="No invoices yet" body="Use the wizard above to mint your first invoice receipt." /> : (
          <table className="rtable">
            <thead><tr><th scope="col">Invoice</th><th scope="col">Status</th><th scope="col" className="num">Face value</th><th scope="col" className="num">Sold</th><th scope="col">Next</th></tr></thead>
            <tbody>
              {mine.map((r) => {
                const bal = c.held.get(r.id) ?? 0n;
                const isRedeemed = redeemed(r.id);
                const totalShares = originalSupply(r);
                const sold = isRedeemed ? 100 : totalShares > 0n ? Number(((totalShares - bal) * 1000n) / totalShares) / 10 : 0;
                const next = isRedeemed ? "view" : !r.fraction ? "lock" : r.settle.settled ? "done" : "live";
                const face = faceValue(r);
                return (
                  <tr key={r.id}>
                    <td data-label="Invoice"><b>#{r.id} · {KINDS[r.kind]}</b><span className="muted r-note">{r.note}</span></td>
                    <td data-label="Status"><div className="tags">{isRedeemed ? <span className="tag issue-redeemed-tag">REDEEMED</span> : <SettleBadge r={r} terms={false} />}</div></td>
                    <td data-label="Face value" className="num">{face > 0n ? `${fmt(face, r.settle.decimals)} ${r.settle.symbol}` : <span className="muted">—</span>}</td>
                    <td data-label="Sold" className="num">{isRedeemed && totalShares > 0n ? <b>{units(totalShares)}/{units(totalShares)}</b> : r.fraction && totalShares > 0n ? <><b>{sold}%</b><span className="muted"> of {units(totalShares)}</span></> : <span className="muted">—</span>}</td>
                    <td data-label="Next" className="acts"><div className="row">
                      {next === "view" && <button className="btn sm" onClick={() => c.setTab("verify", { id: String(r.id) })}>View <Ico n="arrow" /></button>}
                      {next === "lock" && <button className="btn sm primary" onClick={() => resume(r.id)}>Lock &amp; issue <Ico n="arrow" /></button>}
                      {next === "live" && bal > 0n && <button className="btn sm" onClick={() => c.setTab("trade", { sell: String(r.id) })}>Sell</button>}
                      {next === "live" && <button className="btn sm" onClick={() => c.openPay(r.id)}>Settle</button>}
                      {next === "done" && <button className="btn sm" onClick={() => c.setTab("portfolio")}>Claim in Portfolio</button>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

