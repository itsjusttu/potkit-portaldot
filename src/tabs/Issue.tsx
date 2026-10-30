import { useEffect, useState } from "react";
import { parseUnits } from "viem";
import { deployKit, fmt, fractionalize, KINDS, mint, PAY_SYMBOL, short, units } from "../lib/chain";
import { Addr, Empty, Ico } from "../AppUi";
import { type Ctx } from "./ctx";
import { day, fmtDate, SettleBadge, Term } from "./shared";
import { readReceiptHistory } from "./receipt-history";

const WKEY = "potkit.v17.wizard";

export function Issue({ c }: { c: Ctx }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(WKEY) ?? "{}"); } catch { return {}; } })();
  const [kind, setKind] = useState<number>(saved.kind ?? 0);
  const [note, setNote] = useState<string>(saved.note ?? "Invoice 042: content delivery");
  const [face, setFace] = useState<string>(saved.face ?? "1");
  const [due, setDue] = useState<string>(saved.due ?? new Date(Date.now() + 60 * 86400e3).toISOString().slice(0, 10));
  const [supply, setSupply] = useState<string>(saved.supply ?? "100");
  const [wizId, setWizId] = useState<number>(saved.wizId ?? 0);
  const [reviewed, setReviewed] = useState(false); // terms confirmed; the lock step is next
  useEffect(() => { localStorage.setItem(WKEY, JSON.stringify({ kind, note, face, due, supply, wizId })); }, [kind, note, face, due, supply, wizId]);

  const requestedId = c.param("id");
  useEffect(() => {
    if (!/^\d+$/.test(requestedId) || !c.account || c.loading) return;
    const id = Number(requestedId);
    const selected = c.rows.find((r) => r.id === id && !r.fraction && (r.owner.toLowerCase() === c.account.toLowerCase() || r.depositor.toLowerCase() === c.account.toLowerCase()));
    if (selected) { setWizId(id); setKind(selected.kind); setNote(selected.note); }
  }, [requestedId, c.account, c.loading, c.rows]);
  const row = c.rows.find((r) => r.id === wizId);
  // the wizard follows the receipt's real on-chain state once minted
  const chainStep = !wizId || !row ? null : !row.fraction ? 2 : 3;
  const cur = chainStep ?? 0;
  const stepIdx = cur >= 3 ? 3 : cur === 2 ? (reviewed ? 2 : 1) : 0; // Receipt → Terms → Lock
  const mine = c.account ? c.rows.filter((r) => r.depositor.toLowerCase() === c.account.toLowerCase() || r.owner.toLowerCase() === c.account.toLowerCase()) : [];
  // Redemption clears live terms in storage; restore them from the shared event-history reader.
  const receiptHistory = readReceiptHistory(c.events);
  const redeemed = (id: number) => receiptHistory.get(id)?.redeemed ?? false;
  const faceValue = (r: (typeof c.rows)[number]) => r.settle.faceValue > 0n ? r.settle.faceValue : redeemed(r.id) ? receiptHistory.get(r.id)?.terms?.value ?? 0n : 0n;
  const originalSupply = (r: (typeof c.rows)[number]) => r.supply > 0n ? r.supply : (receiptHistory.get(r.id)?.lock?.amount ?? 0n) * 10n ** 18n;
  const needSetup = !c.addrs;
  const noteOk = note.trim().length > 0 && note.length <= 140;
  const faceOk = (() => { try { return /^\d+(\.\d+)?$/.test(face.trim()) && parseUnits(face.trim(), 18) > 0n; } catch { return false; } })();
  const supplyOk = /^\d+$/.test(supply.trim()) && Number.isSafeInteger(Number(supply)) && Number(supply) >= 1 && Number(supply) <= 1_000_000_000_000;
  const dueOk = !due || new Date(`${due}T23:59:59`).getTime() > Date.now();
  const termsOk = faceOk && supplyOk && dueOk;
  const connectReason = !c.account ? "Connect your wallet to continue." : c.gated ? "Switch to Portaldot V3 before submitting." : c.busy ? "Wait for the current transaction to finish." : "";
  const termsError = !supplyOk ? "Enter a whole number of shares from 1 to 1,000,000,000,000." : !faceOk ? "Enter a positive face value in tPOT." : !dueOk ? "Choose a future due date." : "";

  const restart = () => { setWizId(0); setReviewed(false); };
  const resume = (id: number) => { setWizId(id); const r = c.rows.find((x) => x.id === id); if (r) { setKind(r.kind); setNote(r.note); } document.getElementById("wizard")?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <div className="issue">
      <section className="issue-intro"><div><p className="kicker">Stage 01 · Create</p><h1>Issue an invoice</h1><p>Create the receipt, then lock it and issue shares in three guided steps.</p></div><span className="issue-chain-pill"><i /> Portaldot V3 · ERC-721</span></section>
      {needSetup && (
        <section className="card setup-card">
          <h2>Set up the contract</h2>
          <p className="muted">PotKit is one contract: receipts, vault, settlement pool and market. One click, one transaction, once per deployment. Payments use native tPOT, so there is no token to deploy.</p>
          <ol className="setup-steps">
            <li className={c.addrs ? "done" : ""}><span className="box">{c.addrs ? <Ico n="check" /> : 1}</span><span>PotKit</span>
              {c.addrs ? <Addr a={c.addrs.vault} label="PotKit" /> : <button className="btn sm primary" disabled={Boolean(c.busy)} onClick={() => { if (!c.account) { c.connect(); return; } if (c.gated) { c.switchNetwork(); return; } void c.run("deploy", async () => {
                const d = await deployKit(c.ready(), c.saveStep); c.note("Contract deployed", `PotKit ${short(d.kit)}`, d.hash);
              }); }}>{c.busy === "deploy" ? "Confirm in wallet…" : !c.account ? "Connect wallet" : c.gated ? "Switch network" : "Deploy"}</button>}</li>
          </ol>
        </section>
      )}

      <ol className="issue-steps" aria-label="Issue steps">{([["Receipt", "Kind and public note · 1 transaction"], ["Terms", "Face value, due date, shares · no signing"], ["Lock", "Lock and issue shares · 1 transaction"]] as const).map(([t, d], i) => <li key={t} className={i === stepIdx ? "active" : i < stepIdx ? "done" : ""} aria-current={i === stepIdx ? "step" : undefined}><span className="issue-step-n">{i < stepIdx ? <Ico n="check" size={14} /> : i + 1}</span><span><b>{t}</b><small>{d}</small></span></li>)}</ol>
      <section className="wizard wizard-2" id="wizard">
        <div className="card wiz-main">
          {cur === 0 && (
            <div className="wiz-pane">
              <h2>1 · Receipt</h2>
              <p className="muted">Kind and note are written on-chain when you mint the receipt. Face value and due date come next.</p>
              <p className="issue-privacy"><b>Public on-chain record.</b> Anyone can read these details. Do not include names, account numbers, invoice files or other sensitive personal data. PotKit records issuer-provided information; it does not independently authenticate the underlying invoice.</p>
              <div className="row fields">
                <div><label htmlFor="w-kind">Kind</label><select id="w-kind" value={kind} onChange={(e) => setKind(Number(e.target.value))}>{KINDS.map((k, i) => <option key={k} value={i}>{k}</option>)}</select></div>
                <div className="field-grow"><label htmlFor="w-note">Note (1–140 chars)</label><input id="w-note" maxLength={140} value={note} aria-invalid={!noteOk} aria-describedby={!noteOk ? "w-note-error" : undefined} onChange={(e) => setNote(e.target.value)} />{!noteOk && <small id="w-note-error" className="field-error" role="alert">Enter a short public note (1–140 characters).</small>}</div>
              </div>
              <div className="wiz-nav"><span className={c.addrs && c.canMint ? "issue-ready-mint" : "muted"}>{!c.addrs ? "Set up a PotKit deployment first." : c.canMint ? <><i />Ready to mint</> : c.account ? "This wallet cannot mint: only the issuer or an approved minter can." : "Connect the issuer wallet to mint."}</span>
                <button className="btn primary" disabled={!noteOk || Boolean(c.busy) || (Boolean(c.account) && (!c.addrs || !c.canMint))} title={!noteOk ? "Enter a public note." : c.account ? (!c.addrs ? "Deploy PotKit first." : !c.canMint ? "Only the issuer or an approved minter can mint." : undefined) : undefined} onClick={() => { if (!c.account) { c.connect(); return; } if (c.gated) { c.switchNetwork(); return; } void c.run("mint", async () => {
                  const m = await mint(c.ready(), c.addrs!.receipt, kind, note.trim());
                  setWizId(m.id); c.note("Receipt minted", `#${m.id} · ${KINDS[kind]}`, m.hash);
                }); }}>{c.busy === "mint" ? "Waiting for wallet…" : !c.account ? "Connect wallet" : c.gated ? "Switch network" : "Mint receipt"}</button></div>
            </div>
          )}
          {cur === 2 && row && !reviewed && (
            <div className="wiz-pane">
              <h2>2 · Terms</h2>
              <p className="muted">Receipt #{row.id} is minted. Set its payment terms: face value in {PAY_SYMBOL}, an optional due date and the number of ERC-20 shares to issue. Nothing is signed in this step.</p>
              <div className="row fields">
                <div><span className="lbl"><label htmlFor="w-face">Face value ({PAY_SYMBOL})</label><Term k="face" /></span><input id="w-face" inputMode="decimal" value={face} aria-invalid={!faceOk} aria-describedby={!faceOk ? "w-face-error" : undefined} onChange={(e) => setFace(e.target.value)} />{!faceOk && <small id="w-face-error" className="field-error" role="alert">Enter a positive face value in tPOT, with at most 18 decimal places.</small>}</div>
                <div><label htmlFor="w-due">Due date</label><input id="w-due" type="date" value={due} aria-invalid={!dueOk} aria-describedby={!dueOk ? "w-due-error" : undefined} onChange={(e) => setDue(e.target.value)} />{!dueOk && <small id="w-due-error" className="field-error" role="alert">Choose a future due date, or leave it blank.</small>}</div>
                <div><span className="lbl"><label htmlFor="w-sup">Shares to issue</label><Term k="share" /></span><input id="w-sup" inputMode="numeric" value={supply} aria-invalid={!supplyOk} aria-describedby={!supplyOk ? "w-sup-error" : undefined} onChange={(e) => setSupply(e.target.value)} />{!supplyOk && <small id="w-sup-error" className="field-error" role="alert">Use a whole number from 1 to 1,000,000,000,000.</small>}</div>
              </div>
              <dl className="issue-summary"><div><dt>Face value</dt><dd>{faceOk ? `${face} ${PAY_SYMBOL}` : "—"}</dd></div><div><dt>Shares</dt><dd>{supplyOk ? supply : "—"}</dd></div><div><dt>Due</dt><dd>{dueOk && due ? fmtDate(new Date(`${due}T12:00:00`)) : "—"}</dd></div></dl>
              <div className="wiz-nav"><button className="btn" onClick={restart}>Start over</button>
                <span className={termsOk ? "issue-ready-mint" : "field-error"} role="status">{termsOk ? <><i />Terms look good</> : termsError}</span>
                <button className="btn primary" disabled={!termsOk} title={!termsOk ? termsError : undefined} onClick={() => setReviewed(true)}>Continue <Ico n="arrow" /></button></div>
            </div>
          )}
          {cur === 2 && row && reviewed && (
            <div className="wiz-pane">
              <h2>3 · Lock &amp; issue shares</h2>
              <p className="muted">Receipt #{row.id} moves into PotKit, its payment terms are fixed (face value in {PAY_SYMBOL}, optional due date) and {supply || "N"} ERC-20 shares (KIT{row.id}) are minted to you. One transaction, no approval needed. With terms set, anyone can settle by paying at least the face value.</p>
              <p className="irreversible" role="note"><b>Check before you lock.</b> After this transaction the face value, due date and share count cannot be changed. To take the receipt back out of PotKit you must hold every share and redeem.</p>
              <dl className="issue-summary"><div><dt>Face value</dt><dd>{faceOk ? `${face} ${PAY_SYMBOL}` : "—"}</dd></div><div><dt>Shares</dt><dd>{supplyOk ? supply : "—"}</dd></div><div><dt>Due</dt><dd>{dueOk && due ? fmtDate(new Date(`${due}T12:00:00`)) : "—"}</dd></div></dl>
              <div className="wiz-nav"><button className="btn" onClick={() => setReviewed(false)}>Back</button>
                <span className={termsOk ? "issue-ready-mint" : "field-error"} role="status">{termsOk ? <><i />Ready to issue</> : termsError}</span>
                <button className="btn primary" disabled={Boolean(c.busy) || !termsOk} title={!termsOk ? termsError : c.account ? (c.gated ? connectReason : undefined) : undefined} onClick={() => { if (!c.account) { c.connect(); return; } if (c.gated) { c.switchNetwork(); return; } void c.run("frac", async () => {
                  const s = supply.trim(); if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s)) || Number(s) < 1 || Number(s) > 1_000_000_000_000) throw new Error("Shares must be a whole number from 1 to 1,000,000,000,000.");
                  const v = face.trim(); if (!/^\d+(\.\d+)?$/.test(v) || Number(v) <= 0) throw new Error("Enter a positive face value.");
                  const d = due ? new Date(`${due}T23:59:59`) : undefined; if (d && d.getTime() <= Date.now()) throw new Error("Due date must be in the future.");
                  const f = await fractionalize(c.ready(), c.addrs!, row.id, s, v, d);
                  c.note("Fractionalized", `#${row.id} → ${s} KIT${row.id} · ${v} ${PAY_SYMBOL}${d ? ` due ${fmtDate(d)}` : ""}${f.token ? ` · ${short(f.token)}` : ""}`, f.hash);
                }); }}>{c.busy === "frac" ? "Confirm in wallet…" : !c.account ? "Connect wallet" : c.gated ? "Switch network" : "Lock & issue shares"}</button></div>
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
        <aside className={`wiz-preview wiz-stage-${cur >= 3 ? "live" : cur >= 2 ? "minted" : "draft"}`} aria-label="Receipt preview" aria-live="polite">
          <header className="wiz-preview-head"><div><p className="kicker">Live preview · receipt artwork</p><b>{cur >= 3 ? "Receipt is live on Portaldot" : cur >= 2 ? "Receipt minted to your wallet" : "Your invoice, as an NFT"}</b></div><span className="wiz-preview-state"><i />{cur >= 3 ? "ON-CHAIN" : cur >= 2 ? "MINTED" : "DRAFT"}</span></header>
          <div className="issue-receipt" aria-label="Live invoice receipt preview">
            <div className="ir-corner ir-tl" /><div className="ir-corner ir-tr" /><div className="ir-corner ir-bl" /><div className="ir-corner ir-br" />
            <div className="ir-meta"><span>POTKIT RECEIPT · {KINDS[row?.kind ?? kind].toUpperCase()}</span><span>ERC-721 {row ? `· #${row.id}` : "· PREVIEW"}</span></div>
            <h2 className="h-sub">{row?.note || note || "Your invoice title"}</h2>
            <p className="ir-sub">Issuer-provided invoice record · Portaldot V3</p>
            <div className="ir-face"><strong>{row?.settle.faceValue ? fmt(row.settle.faceValue, row.settle.decimals) : face || "—"}<i> tPOT</i></strong><small>FACE VALUE</small></div>
            <dl className="ir-facts"><div><dt>DUE DATE</dt><dd>{row?.dueDate ? day(row.dueDate) : due ? fmtDate(new Date(due + "T12:00:00")) : "—"}</dd></div><div><dt>SHARES</dt><dd>{row?.supply ? units(row.supply) : supply || "—"}</dd></div></dl>
            <div className="ir-foot"><span>{row?.depositor || row?.owner || c.account ? short(row?.depositor || row?.owner || c.account) : "ISSUER WALLET NOT CONNECTED"}</span><span className="ir-state"><i />{row?.settle.settled ? "SETTLED" : cur >= 3 ? "LIVE · TERMS ON-CHAIN" : cur >= 2 ? "MINTED" : c.account ? "READY TO MINT" : "DRAFT"}</span></div>
          </div>
          {cur >= 2 && <p className="wiz-minted-note"><Ico n="check" /> Mint confirmed. The receipt can now be locked and split into shares.</p>}
          <p className="muted small">The NFT stays inside PotKit while shares are outstanding.</p>
        </aside>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2>My issued invoices <span className="muted">{mine.length}</span></h2><button className="btn sm" disabled={c.loading} onClick={() => void c.refresh()}>{c.loading ? "Refreshing…" : "Refresh"}</button></div>
        {!c.account ? <Empty icon="▤" title="Connect to see your invoices" body="Connect a wallet to view the receipts you issued or own." /> : c.loading && !mine.length ? <p className="muted" role="status">Loading your invoices…</p> : !mine.length ? <Empty icon="▤" title="No invoices yet" body="Use the wizard above to mint your first invoice receipt." /> : (
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
                      {next === "done" && ((c.claims.get(r.id) ?? 0n) > 0n ? <button className="btn sm" onClick={() => c.setTab("portfolio")}>Claim {fmt(c.claims.get(r.id) ?? 0n, 18)} tPOT</button> : <span className="issue-claimed">{c.events.some((e) => e.kind === "claim" && e.id === r.id && e.actors.some((x) => x.toLowerCase() === c.account.toLowerCase())) ? "Claimed" : r.supply === 0n ? "All claimed" : "Nothing to claim"}</span>)}
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

