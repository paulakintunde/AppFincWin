// 10.1-13 (D-14, D-15): who owes what on an itemised receipt. Each item is shared by its people; tax, tip and receipt-level
// discounts follow each person's items (largest remainder), so the shares add up exactly. Mirrored in SQL by 10.1-14.
import { minorUnits } from '../money/types';
import { allocateWithZeros } from '../split/allocateWithZeros';

export interface ItemSharesInput {
  members: readonly string[];
  items: readonly { price: number; discount: number; people: readonly string[] }[];
  tax: number;
  tip: number;
  discounts: number;
}
export interface PersonShare { memberId: string; items: number; extras: number; total: number; itemCount: number }
export type ItemSharesResult = { ok: true; shares: PersonShare[] } | { ok: false; reason: 'no_items' | 'empty_item' | 'unknown_member' };

export function itemShares(i: ItemSharesInput): ItemSharesResult {
  const index = new Map(i.members.map((m, k) => [m, k] as const));
  const itemTotals = i.members.map(() => 0);
  const counts = i.members.map(() => 0);
  for (const it of i.items) {
    if (it.people.length === 0) return { ok: false, reason: 'empty_item' };
    if (it.people.some((p) => !index.has(p))) return { ok: false, reason: 'unknown_member' };
    const split = allocateWithZeros(minorUnits(it.price - it.discount), it.people.map(() => 1));
    it.people.forEach((p, k) => {
      const at = index.get(p) as number;
      itemTotals[at] = itemTotals[at]! + split[k]!;
      counts[at] = counts[at]! + 1;
    });
  }
  const extra = i.tax + i.tip - i.discounts;
  if (extra !== 0 && itemTotals.every((t) => t === 0)) return { ok: false, reason: 'no_items' };
  const extras = extra === 0 ? itemTotals.map(() => 0) : allocateWithZeros(minorUnits(extra), itemTotals);
  return {
    ok: true,
    shares: i.members.map((memberId, k) => ({ memberId, items: itemTotals[k]!, extras: extras[k]!, total: itemTotals[k]! + extras[k]!, itemCount: counts[k]! })),
  };
}
