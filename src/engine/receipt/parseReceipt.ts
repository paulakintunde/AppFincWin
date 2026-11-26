// 10.1-15 (SCN-02, SCN-03, D-11, D-18): OCR lines in, a ParsedReceipt with honest 'Check this' flags out.
// The trust rule: a wrong total is never silent. Anything guessed or repaired is marked unsure.
import { currencyExponent } from '../money/currencyExponents';
import { rowPrice, type RowPrice } from './amounts';
import { findDate, type DateOrder } from './dates';
import { classifyRow } from './keywords';
import { groupRows, type OcrRow } from './rows';
import type { Field, ParsedReceipt, ReceiptExtra, ReceiptItem, ReceiptOcr } from './types';

export interface ParseOptions { currency: string; dateOrder: DateOrder; today: string }
export type ParseOutcome = { readable: true; receipt: ParsedReceipt } | { readable: false; receipt: ParsedReceipt };

const NAME_MAX = 120;
const QTY = /^(\d{1,3}) ?[xX×@] (.+)$/;
const LETTERS = /\p{L}/u;
const PHONE = /\b(?:tel|phone|ph|fax)\b|\[phone\]|\d{3}\D{0,3}\d{3}\D{0,3}\d{4}/i;
const ADDRESS = /^\d+ \S/;
const TENDERED = /\b(?:cash|tendered)\b/i;

interface Row { text: string; frame: OcrRow['frame']; price: RowPrice | null; name: string }

function cap(name: string): string {
  return name.slice(0, NAME_MAX);
}

function toRow(r: OcrRow, exponent: number): Row {
  const text = r.text.replace(/\s+/g, ' ');
  const price = rowPrice(text, exponent);
  const name = price ? text.slice(0, text.lastIndexOf(price.token)).trim() : text;
  return { text, frame: r.frame, price, name };
}

function isQty(row: Row | undefined): boolean {
  return row !== undefined && QTY.test(row.text);
}

function priceOnly(row: Row | undefined): boolean {
  return row !== undefined && row.price !== null && !LETTERS.test(row.name);
}

/** The store: first row near the top with letters, no price, and not a date, phone, address or keyword row. */
function findStore(rows: Row[]): Field<string | null> {
  const framed = rows.every((r) => r.frame !== null);
  let limit = 3;
  if (framed) {
    const tops = rows.map((r) => r.frame?.top as number);
    const bottoms = rows.map((r) => (r.frame?.top as number) + (r.frame?.height as number));
    const minTop = Math.min(...tops);
    const cut = minTop + (Math.max(...bottoms) - minTop) / 5;
    limit = rows.filter((r) => (r.frame?.top as number) <= cut).length;
  }
  const idx = rows.findIndex(
    (r, i) =>
      i < limit &&
      r.price === null &&
      LETTERS.test(r.text) &&
      !PHONE.test(r.text) &&
      !ADDRESS.test(r.text) &&
      classifyRow(r.text) === 'item' &&
      findDate([r.text], 'MDY').value === null,
  );
  if (idx < 0) return { value: null, unsure: true };
  return { value: cap((rows[idx] as Row).text), unsure: idx !== 0 };
}

function shell(currency: string): ParsedReceipt {
  return { store: { value: null, unsure: true }, date: { value: null, unsure: true }, total: { value: null, unsure: true }, items: [], extras: [], currency };
}

export function parseReceipt(ocr: ReceiptOcr, opts: ParseOptions): ParseOutcome {
  const exponent = currencyExponent(opts.currency);
  const rows = groupRows(ocr).map((r) => toRow(r, exponent));
  const items: ReceiptItem[] = [];
  const extras: ReceiptExtra[] = [];
  const total: Field<number | null> = { value: null, unsure: true };
  let subtotal: number | null = null;
  let afterTotal = false;
  let tipAfterTotal = false;
  let lastItem: ReceiptItem | null = null;
  let pending: string | null = null;

  const addItem = (name: string, price: number, unsure: boolean, frame: Row['frame']): void => {
    lastItem = { key: `i${items.length}`, name: cap(name), price, discount: 0, unsure: unsure || name === '', frame };
    items.push(lastItem);
    pending = null;
  };
  const addExtra = (kind: ReceiptExtra['kind'], row: Row, p: RowPrice): void => {
    extras.push({ key: `x${extras.length}`, kind, name: cap(row.name), amount: p.amount, unsure: p.ambiguous, frame: row.frame });
    lastItem = null;
    pending = null;
  };

  rows.forEach((row, i) => {
    const kind = classifyRow(row.text);
    const p = row.price;
    if (afterTotal) {
      // After the total only a tip (restaurant bills), the total with tip, and a card amount standing in for an
      // unreadable total are read.
      if (kind === 'tip' && p && !tipAfterTotal && total.value !== null) {
        addExtra('tip', row, p);
        tipAfterTotal = true;
        total.value += p.amount;
        total.unsure = true;
      } else if (kind === 'total' && p && tipAfterTotal) {
        total.unsure = p.ambiguous || total.value !== p.amount;
        total.value = p.amount;
      } else if (kind === 'payment' && p && total.value === null && !TENDERED.test(row.text)) {
        total.value = p.amount;
        total.unsure = true;
      }
      return;
    }
    if (kind === 'total') {
      afterTotal = true;
      if (p) {
        total.value = p.amount;
        total.unsure = p.ambiguous;
      }
      return;
    }
    if (p === null) {
      if (kind !== 'item' || !LETTERS.test(row.text)) {
        lastItem = null;
        pending = null;
      } else if (lastItem !== null && !isQty(rows[i + 1]) && !priceOnly(rows[i + 1])) {
        const item: ReceiptItem = lastItem;
        item.name = cap(`${item.name} ${row.text}`);
      } else {
        lastItem = null;
        pending = row.text;
      }
      return;
    }
    if (kind === 'payment' || kind === 'change') {
      lastItem = null;
      pending = null;
      return;
    }
    if (kind === 'subtotal') {
      subtotal = p.amount;
      lastItem = null;
      pending = null;
      return;
    }
    if (kind === 'tax' || kind === 'tip') {
      addExtra(kind, row, p);
      return;
    }
    if (p.negative && lastItem !== null) {
      const item: ReceiptItem = lastItem;
      item.discount += p.amount;
      item.unsure = item.unsure || p.ambiguous || item.discount > item.price;
      return;
    }
    if (kind === 'discount' || p.negative) {
      addExtra('discount', row, p);
      return;
    }
    const qty = QTY.exec(row.text);
    if (qty) {
      const n = parseInt(qty[1] as string, 10);
      const rest = qty[2] as string;
      const last = p;
      const before = rest.slice(0, rest.lastIndexOf(last.token)).trim();
      const unitP = rowPrice(before, exponent);
      const unit = unitP ?? last;
      const lineTotal = unitP ? last.amount : n * last.amount;
      const unsure = unit.ambiguous || last.ambiguous || n * unit.amount !== lineTotal;
      if (pending !== null) addItem(pending, lineTotal, unsure, row.frame);
      else if (lastItem !== null && (lastItem as ReceiptItem).price === lineTotal) pending = null;
      else addItem(row.text, lineTotal, true, row.frame);
      return;
    }
    const name = LETTERS.test(row.name) ? row.name : (pending ?? '');
    addItem(name, p.amount, p.ambiguous || !LETTERS.test(row.name), row.frame);
  });

  if (subtotal !== null) {
    const net = items.reduce((s, it) => s + it.price - it.discount, 0);
    if (net !== subtotal) {
      const shaky = items.filter((it) => it.unsure);
      if (shaky.length === 0) total.unsure = true;
    }
  }

  if (items.length === 0 && total.value === null) return { readable: false, receipt: shell(opts.currency) };
  const date = findDate(rows.map((r) => r.text), opts.dateOrder);
  return {
    readable: true,
    receipt: {
      store: findStore(rows),
      date: date.value === null ? { value: opts.today, unsure: true } : date,
      total,
      items,
      extras,
      currency: opts.currency,
    },
  };
}
