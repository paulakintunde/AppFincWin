// 10.1-15 (D-12): do the items, tax and tip, less discounts, add up to the printed total, and by how much?
import type { ParsedReceipt, Reconcile } from './types';

export function reconcile(r: Pick<ParsedReceipt, 'items' | 'extras' | 'total'>): Reconcile {
  const itemsTotal = r.items.reduce((s, i) => s + i.price - i.discount, 0);
  const extrasNet = r.extras.reduce((s, x) => s + (x.kind === 'discount' ? -x.amount : x.amount), 0);
  const computed = itemsTotal + extrasNet;
  const total = r.total.value;
  if (total === null) return { itemsTotal, extrasNet, computed, total: null, diff: null, state: 'noTotal' };
  const diff = computed - total;
  return { itemsTotal, extrasNet, computed, total, diff, state: diff === 0 ? 'match' : diff > 0 ? 'over' : 'short' };
}
