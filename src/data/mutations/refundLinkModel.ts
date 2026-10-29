// 05.2-16 (DSU-16, D-06..D-10): pure refund numbers. Integer minor units; no React, no I/O.
import type { TransactionRow } from '@/db/rows';

/** purchase id -> sum of the live refunds linked to it. Any number of refunds may link to one purchase (D-08). */
export function refundTotals(rows: readonly TransactionRow[]): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const purchaseId = r.refund_of ?? null;
    if (purchaseId === null || r.deleted_at !== null || r.original_amount <= 0) continue;
    totals.set(purchaseId, (totals.get(purchaseId) ?? 0) + r.original_amount);
  }
  return totals;
}

export type RefundPreview =
  | { kind: 'full'; purchaseMonth: string; refundMonth: string }
  | { kind: 'partial'; stays: number; purchaseMonth: string }
  | { kind: 'several'; sum: number; price: number }
  | { kind: 'over'; extra: number; refundMonth: string };

const monthOfDate = (date: string): string => date.slice(0, 7);

/** The "What this does" tile: what the refund makes of the purchase once linked. */
export function refundPreview(input: {
  price: number;
  alreadyRefunded: number;
  refund: number;
  purchaseDate: string;
  refundDate: string;
}): RefundPreview {
  const sum = input.alreadyRefunded + input.refund;
  if (sum > input.price) return { kind: 'over', extra: sum - input.price, refundMonth: monthOfDate(input.refundDate) };
  if (sum === input.price) {
    return { kind: 'full', purchaseMonth: monthOfDate(input.purchaseDate), refundMonth: monthOfDate(input.refundDate) };
  }
  if (input.alreadyRefunded === 0) {
    return { kind: 'partial', stays: input.price - input.refund, purchaseMonth: monthOfDate(input.purchaseDate) };
  }
  return { kind: 'several', sum, price: input.price };
}
