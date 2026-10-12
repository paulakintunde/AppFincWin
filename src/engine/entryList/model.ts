/**
 * Entry-list model (REC-30): the pure rules behind the entry sheet's
 * "Add to list". No I/O, no React; money is integer minor units.
 */
import type { RecurringFreq } from '../recurring/schedule';

export type ListItemType = 'out' | 'in' | 'transfer';

export const LIST_CAP_PER_TYPE = 30;

export type ListRepeatEnd =
  | { kind: 'never' }
  | { kind: 'date'; date: string }
  | { kind: 'count'; count: number };

export type ListRepeat = { freq: 'never' } | { freq: RecurringFreq; end: ListRepeatEnd };

export interface ListItem {
  id: string; // local item id, not a row id
  type: ListItemType;
  amountMinor: number; // positive magnitude, integer minor units
  currency: string;
  accountId: string;
  localDate: string;
  name: string; // '' for a transfer
  categoryId: string | null;
  paymentType: string | null;
  status: 'paid' | 'pending';
  statusTouched: boolean;
  note: string;
  automatic: boolean;
  refund: boolean; // out only
  repeat: ListRepeat; // always { freq: 'never' } for a transfer
  toAccountId: string | null; // transfer only
  toCurrency: string | null; // transfer only
  amountInMinor: number | null; // cross-currency transfer only
}

export type ListSummary =
  | { kind: 'empty'; count: 0 }
  | { kind: 'count-only'; count: number }
  | { kind: 'single'; count: number; currency: string; direction: 'out' | 'in'; total: number }
  | { kind: 'split'; count: number; currency: string; outTotal: number; inTotal: number };

export function countByType(items: readonly ListItem[]): Record<ListItemType, number> {
  const counts: Record<ListItemType, number> = { out: 0, in: 0, transfer: 0 };
  for (const item of items) counts[item.type] += 1;
  return counts;
}

export function canAdd(items: readonly ListItem[], type: ListItemType): boolean {
  return countByType(items)[type] < LIST_CAP_PER_TYPE;
}

export function addItem(
  items: readonly ListItem[],
  item: ListItem,
): { ok: true; items: ListItem[] } | { ok: false; reason: 'cap' } {
  if (!canAdd(items, item.type)) return { ok: false, reason: 'cap' };
  return { ok: true, items: [item, ...items] };
}

export function removeItem(items: readonly ListItem[], id: string): ListItem[] {
  return items.filter((i) => i.id !== id);
}

export function takeItem(
  items: readonly ListItem[],
  id: string,
): { item: ListItem; rest: ListItem[] } | null {
  const item = items.find((i) => i.id === id);
  if (item === undefined) return null;
  return { item, rest: removeItem(items, id) };
}

/** Never adds across currencies and never totals transfers. */
export function summarise(items: readonly ListItem[]): ListSummary {
  if (items.length === 0) return { kind: 'empty', count: 0 };
  const count = items.length;
  const money = items.filter((i) => i.type !== 'transfer');
  const currencies = new Set(money.map((i) => i.currency));
  if (currencies.size !== 1) return { kind: 'count-only', count };
  const currency = money[0]!.currency;
  let outTotal = 0;
  let inTotal = 0;
  let hasOut = false;
  let hasIn = false;
  for (const i of money) {
    if (i.type === 'out' && !i.refund) {
      outTotal += i.amountMinor;
      hasOut = true;
    } else {
      inTotal += i.amountMinor;
      hasIn = true;
    }
  }
  if (hasOut && hasIn) return { kind: 'split', count, currency, outTotal, inTotal };
  return hasOut
    ? { kind: 'single', count, currency, direction: 'out', total: outTotal }
    : { kind: 'single', count, currency, direction: 'in', total: inTotal };
}

export function saveCount(items: readonly ListItem[], formHasAmount: boolean): number {
  return items.length + (formHasAmount ? 1 : 0);
}

export function repeatToSchedule(
  repeat: ListRepeat,
): { freq: RecurringFreq; endDate: string | null; occurrenceCount: number | null } | null {
  if (repeat.freq === 'never') return null;
  const { end } = repeat;
  return {
    freq: repeat.freq,
    endDate: end.kind === 'date' ? end.date : null,
    occurrenceCount: end.kind === 'count' ? end.count : null,
  };
}
