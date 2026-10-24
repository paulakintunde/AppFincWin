/**
 * Versioned entry-list draft format. A stored draft is untrusted input.
 * v2 (03 D-25/D-33) adds an optional raw form snapshot; v1 drafts still parse.
 * A bad form is dropped alone, a bad item still drops the draft (D-17).
 */
import { RECURRING_FREQS } from '../recurring/schedule';
import { isValidLocalDate } from '../time/localDate';
import { LIST_CAP_PER_TYPE, type ListItem, type ListRepeat, type ListRepeatEnd } from './model';

export const ENTRY_DRAFT_VERSION = 2;
export const DRAFT_TEXT_MAX = 500;
export const DRAFT_AMOUNT_TEXT_MAX = 32;
const DRAFT_CURRENCY_MAX = 12;
const DRAFT_ID_MAX = 64;
const DRAFT_PAYMENT_TYPE_MAX = 32;

const MAX_AMOUNT_MINOR = 10_000_000_000_000;
const MAX_COUNT = 1000;

/** Raw entry-form snapshot: text and opaque ids, resolved by the feature layer before use. */
export interface DraftForm {
  direction: 'out' | 'in' | 'transfer';
  amountText: string;
  name: string;
  categoryId: string | null;
  accountId: string | null;
  currency: string;
  localDate: string;
  status: 'paid' | 'pending' | 'skipped';
  statusTouched: boolean;
  paymentType: string | null;
  note: string;
  toAccountId: string | null;
  toCurrency: string | null;
  amountInText: string;
  automatic: boolean;
  refund: boolean;
  /** H1: the Repeats choice for a new recurring entry. Optional so v2 drafts written before it still parse. */
  repeats?: ListRepeat;
  /** WR-D01: "One-off, won't recur". Optional so drafts written before it still parse; a transfer is never one. */
  oneOff?: boolean;
}

export interface EntryDraft {
  items: ListItem[];
  form: DraftForm | null;
}

export function serialiseDraft(
  items: readonly ListItem[],
  savedAt: string,
  form: DraftForm | null = null,
): string {
  return JSON.stringify({ v: ENTRY_DRAFT_VERSION, savedAt, items, form });
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

function isBoundedStr(x: unknown, max: number): x is string {
  return typeof x === 'string' && x.length <= max;
}
function isBoundedNullable(x: unknown, max: number): x is string | null {
  return x === null || isBoundedStr(x, max);
}

/** The raw form snapshot. Untrusted: any bad field drops the whole form (never the items). */
function parseForm(x: unknown): DraftForm | null {
  if (!isRec(x)) return null;
  const {
    direction, amountText, name, categoryId, accountId, currency, localDate, status,
    statusTouched, paymentType, note, toAccountId, toCurrency, amountInText, automatic, refund,
  } = x;
  if (direction !== 'out' && direction !== 'in' && direction !== 'transfer') return null;
  if (status !== 'paid' && status !== 'pending' && status !== 'skipped') return null;
  if (!isBoundedStr(amountText, DRAFT_AMOUNT_TEXT_MAX) || !isBoundedStr(amountInText, DRAFT_AMOUNT_TEXT_MAX)) {
    return null;
  }
  if (!isBoundedStr(name, DRAFT_TEXT_MAX) || !isBoundedStr(note, DRAFT_TEXT_MAX)) return null;
  if (!isBoundedStr(currency, DRAFT_CURRENCY_MAX) || currency.length === 0) return null;
  if (!isStr(localDate) || !isValidLocalDate(localDate)) return null;
  if (typeof statusTouched !== 'boolean' || typeof automatic !== 'boolean' || typeof refund !== 'boolean') {
    return null;
  }
  if (
    !isBoundedNullable(categoryId, DRAFT_ID_MAX) ||
    !isBoundedNullable(accountId, DRAFT_ID_MAX) ||
    !isBoundedNullable(toAccountId, DRAFT_ID_MAX) ||
    !isBoundedNullable(toCurrency, DRAFT_CURRENCY_MAX) ||
    !isBoundedNullable(paymentType, DRAFT_PAYMENT_TYPE_MAX)
  ) {
    return null;
  }
  let repeats: ListRepeat | undefined;
  if (x.repeats !== undefined) {
    const r = parseRepeat(x.repeats, localDate);
    repeats = r === null || (direction === 'transfer' && r.freq !== 'never') ? { freq: 'never' } : r;
  }
  // WR-D01: only an explicit true on a non-transfer form is kept; anything else reads as not one-off.
  const oneOff = x.oneOff === true && direction !== 'transfer';
  return {
    direction, amountText, name, categoryId, accountId, currency, localDate,
    status: status === 'skipped' ? 'paid' : status, // H4: a new entry only offers paid or pending
    statusTouched, paymentType, note, toAccountId, toCurrency, amountInText, automatic, refund,
    ...(repeats === undefined ? {} : { repeats }),
    ...(oneOff ? { oneOff: true } : {}),
  };
}

const EMPTY_DRAFT = (): EntryDraft => ({ items: [], form: null });

export function parseEntryDraft(raw: string | null): EntryDraft {
  if (raw === null) return EMPTY_DRAFT();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_DRAFT();
  }
  if (!isRec(data) || (data.v !== 1 && data.v !== 2) || !Array.isArray(data.items)) return EMPTY_DRAFT();
  const items: ListItem[] = [];
  const counts = { out: 0, in: 0, transfer: 0 };
  for (const entry of data.items as unknown[]) {
    const item = parseItem(entry);
    if (item === null) return EMPTY_DRAFT();
    counts[item.type] += 1;
    if (counts[item.type] > LIST_CAP_PER_TYPE) return EMPTY_DRAFT();
    items.push(item);
  }
  return { items, form: data.v === 2 ? parseForm(data.form) : null };
}

export function parseDraft(raw: string | null): ListItem[] {
  return parseEntryDraft(raw).items;
}

/** Unsaved entries a resume prompt should count: list items plus the half-typed form (1). */
export function draftEntryCount(d: EntryDraft): number {
  return d.items.length + (d.form === null ? 0 : 1);
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
