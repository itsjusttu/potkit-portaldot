import type { ChainEvent } from "../lib/chain";

export type ReceiptHistory = {
  lock?: ChainEvent;
  terms?: ChainEvent;
  settle?: ChainEvent;
  redeem?: ChainEvent;
  redeemed: boolean;
  settled: boolean;
};

const isLater = (a: ChainEvent, b?: ChainEvent) => !b || a.block > b.block || (a.block === b.block && a.logIndex > b.logIndex);

/** Restore lifecycle fields removed from the live contract row after redeem, using real chain events. */
export function readReceiptHistory(events: ChainEvent[]) {
  const history = new Map<number, ReceiptHistory>();
  const get = (id: number) => {
    let item = history.get(id);
    if (!item) { item = { redeemed: false, settled: false }; history.set(id, item); }
    return item;
  };
  for (const event of events) {
    const item = get(event.id);
    if (event.kind === "lock" && isLater(event, item.lock)) item.lock = event;
    if (event.kind === "terms" && isLater(event, item.terms)) item.terms = event;
    if (event.kind === "settle" && isLater(event, item.settle)) item.settle = event;
    if (event.kind === "redeem" && isLater(event, item.redeem)) item.redeem = event;
  }
  for (const item of history.values()) {
    item.redeemed = Boolean(item.redeem && (!item.lock || isLater(item.redeem, item.lock)));
    item.settled = Boolean(item.settle && item.lock && isLater(item.settle, item.lock) && (!item.redeem || isLater(item.redeem, item.settle)));
  }
  return history;
}

/** Rows whose current lock cycle has not been redeemed (a re-lock after redeem makes the receipt active again). */
export function withoutRedeemed<T extends { id: number }>(rows: T[], events: ChainEvent[]): T[] {
  const history = readReceiptHistory(events);
  return rows.filter((r) => !(history.get(r.id)?.redeemed ?? false));
}

/**
 * Who paid the current cycle of a receipt, and whether that is the wallet that issued (locked) it.
 * It is a hint from public events, not a fraud check: an issuer can pay from a second wallet.
 */
export function settlementPayer(history: ReceiptHistory | undefined, depositor?: string): { payer: string; byIssuer: boolean } | null {
  const ev = history?.settle;
  if (!history?.settled || !ev?.actors?.length) return null;
  const payer = ev.actors[0]!;
  const issuer = (history.lock?.actors?.[0] ?? depositor ?? "").toLowerCase();
  return { payer, byIssuer: Boolean(issuer) && payer.toLowerCase() === issuer };
}
