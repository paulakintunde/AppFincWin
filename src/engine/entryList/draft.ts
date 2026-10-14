/**
 * Versioned entry-list draft format. Anything that fails strict validation
 * discards the whole draft (D-17): a stored draft is untrusted input.
 */
import { RECURRING_FREQS } from '../recurring/schedule';
import { isValidLocalDate } from '../time/localDate';
import { LIST_CAP_PER_TYPE, type ListItem, type ListRepeat, type ListRepeatEnd } from './model';

export const ENTRY_DRAFT_VERSION = 1;

const MAX_AMOUNT_MINOR = 10_000_000_000_000;
const MAX_COUNT = 1000;

export function serialiseDraft(items: readonly ListItem[], savedAt: string): string {
  return JSON.stringify({ v: ENTRY_DRAFT_VERSION, savedAt, items });
}

type Rec = Record<string, unknown>;

function isRec(x: unknown): x is Rec {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
function isAmount(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x > 0 && x <= MAX_AMOUNT_MINOR;
}
function isStr(x: unknown): x is string {
  return typeof x === 'string';
}
function isNullableStr(x: unknown): x is string | null {
  return x === null || typeof x === 'string';
}

function parseEnd(x: unknown, itemDate: string): ListRepeatEnd | null {
  if (!isRec(x)) return null;
  if (x.kind === 'never') return { kind: 'never' };
  if (x.kind === 'date') {
    const d = x.date;
    if (!isStr(d) || !isValidLocalDate(d) || d < itemDate) return null;
    return { kind: 'date', date: d };
  }
  if (x.kind === 'count') {
    const c = x.count;
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 1 || c > MAX_COUNT) return null;
    return { kind: 'count', count: c };
  }
  return null;
}

function parseRepeat(x: unknown, itemDate: string): ListRepeat | null {
  if (!isRec(x)) return null;
  if (x.freq === 'never') return { freq: 'never' };
  const freq = RECURRING_FREQS.find((f) => f === x.freq);
  if (freq === undefined) return null;
  const end = parseEnd(x.end, itemDate);
  return end === null ? null : { freq, end };
}

function parseItem(x: unknown): ListItem | null {
  if (!isRec(x)) return null;
  const { type, status } = x;
  if (type !== 'out' && type !== 'in' && type !== 'transfer') return null;
  if (status !== 'paid' && status !== 'pending') return null;
  const {
    id, amountMinor, currency, accountId, localDate, name, categoryId, paymentType,
    statusTouched, note, automatic, refund, toAccountId, toCurrency, amountInMinor,
  } = x;
  if (!isStr(id) || !isStr(currency) || !isStr(accountId) || !isStr(name) || !isStr(note)) return null;
  if (!isAmount(amountMinor)) return null;
  if (!isStr(localDate) || !isValidLocalDate(localDate)) return null;
  if (!isNullableStr(categoryId) || !isNullableStr(paymentType)) return null;
  if (typeof statusTouched !== 'boolean' || typeof automatic !== 'boolean' || typeof refund !== 'boolean') {
    return null;
  }
  if (!isNullableStr(toAccountId) || !isNullableStr(toCurrency)) return null;
  if (amountInMinor !== null && !isAmount(amountInMinor)) return null;
  if (type === 'transfer' ? toAccountId === null : toAccountId !== null) return null;
  if (type === 'transfer') {
    // A transfer needs a destination currency, and a received amount exactly when it crosses currencies.
    if (toCurrency === null) return null;
    if ((toCurrency !== currency) !== (amountInMinor !== null)) return null;
  }
  const repeat = parseRepeat(x.repeat, localDate);
  if (repeat === null) return null;
  if (type === 'transfer' && repeat.freq !== 'never') return null;
  return {
    id, type, amountMinor, currency, accountId, localDate, name, categoryId, paymentType,
    status, statusTouched, note, automatic, refund, repeat, toAccountId, toCurrency,
    amountInMinor: amountInMinor as number | null,
  };
}

export function parseDraft(raw: string | null): ListItem[] {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isRec(data) || data.v !== ENTRY_DRAFT_VERSION || !Array.isArray(data.items)) return [];
  const items: ListItem[] = [];
  const counts = { out: 0, in: 0, transfer: 0 };
  for (const entry of data.items as unknown[]) {
    const item = parseItem(entry);
    if (item === null) return [];
    counts[item.type] += 1;
    if (counts[item.type] > LIST_CAP_PER_TYPE) return [];
    items.push(item);
  }
  return items;
}

export function dropUnavailable(
  items: readonly ListItem[],
  availableAccountIds: ReadonlySet<string>,
): { items: ListItem[]; dropped: number } {
  const kept = items.filter(
    (i) =>
      availableAccountIds.has(i.accountId) &&
      (i.toAccountId === null || availableAccountIds.has(i.toAccountId)),
  );
  return { items: kept, dropped: items.length - kept.length };
}
