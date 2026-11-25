// 10.1-13 (D-16, D-20): receipt items become category parts. Integer maths only; receipt-level discounts spread over the items
// in proportion (largest remainder), tax and tip become one 'Tax and tip' part.
import { minorUnits } from '../money/types';
import type { Part } from '../parts/types';
import { allocateWithZeros } from '../split/allocateWithZeros';

export interface ItemsToPartsInput {
  lineSign: 1 | -1;
  lineCategoryId: string | null;
  taxTipCategoryId?: string | null;
  items: readonly { price: number; discount: number; categoryId: string | null }[];
  tax: number;
  tip: number;
  discounts: number;
}

/** null when the result is a single part (the caller sets category_id instead). */
export function itemsToParts(i: ItemsToPartsInput): Part[] | null {
  const net = i.items.map((it) => it.price - it.discount);
  const shares = i.discounts > 0 && net.some((n) => n > 0) ? allocateWithZeros(minorUnits(i.discounts), net) : net.map(() => 0);
  const order: (string | null)[] = [];
  const sums = new Map<string | null, number>();
  i.items.forEach((it, k) => {
    if (!sums.has(it.categoryId)) {
      order.push(it.categoryId);
      sums.set(it.categoryId, 0);
    }
    sums.set(it.categoryId, (sums.get(it.categoryId) as number) + net[k]! - shares[k]!);
  });
  const parts: Part[] = [];
  for (const c of order) {
    const amount = sums.get(c) as number;
    if (amount !== 0) parts.push({ categoryId: c, amount: amount * i.lineSign });
  }
  if (i.tax + i.tip > 0) {
    parts.push({ categoryId: i.taxTipCategoryId ?? i.lineCategoryId, amount: (i.tax + i.tip) * i.lineSign, label: 'taxTip' });
  }
  return parts.length < 2 ? null : parts;
}
