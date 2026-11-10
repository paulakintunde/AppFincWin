/**
 * Total parser and JSON-safe form for CheckV2 (05.1-20). I42, T-05.1-38.
 * parseCheckV2 never throws: it clamps and resets. Percent (a scaled bigint) is stored as exact decimal text.
 */
import { minorUnits, type CurrencyCode, type MinorUnits } from '../../../money/types';
import { RATE_SCALE } from '../../../money/rates';
import { PERCENT_SCALE, type Percent } from '../../../payoff/types';
import { isValidLocalDate } from '../dates';
import { layerOfAnswerKey } from '../judge/bands';
import { V3_ITEM_TYPES } from '../judge/presetQuestions';
import type { Cadence, CheckV2, FirstPayment, ItemTypeRef, LocalDate, PayV2, PresetPurpose, Purpose, QuickLine, ReasonCode, Replaces, RunningCostLine, Sale, StoppedCost, V3PresetItemType } from '../types';
import type { ShareScope, SplitRule } from '../../share';
import { intIn, isRecord, MAX_MINOR, minorOf, percentOf, upgradeInputs } from './legacy';

const PURPOSES: readonly PresetPurpose[] = ['invest_in_me', 'for_work', 'necessity', 'nice_to_have', 'treat', 'luxury'];
const CURRENCY = /^[A-Z0-9]{2,4}$/;
const MAX_ID = 80;
const MAX_EXTRAS = 50;
const ZERO = minorUnits(0);
const MAX_PERCENT_TEXT = 9999.9999999999;
// 06.1-02 (T-06.1-02-01): caps on the Variant C lists and the D-21 quick lines
const MAX_RUNNING_COSTS = 12;
const MAX_STOPS = 8;
const MAX_QUICK_LINES = 8;
const MAX_NAME = 80;
const MAX_PAYMENTS = 600;

function money(x: unknown): MinorUnits {
  return minorOf(x) ?? ZERO;
}

function idOf(x: unknown): string | null {
  return typeof x === 'string' && x.length > 0 && x.length <= MAX_ID ? x : null;
}

function itemTypeOf(x: unknown): ItemTypeRef {
  if (isRecord(x)) {
    if (x.kind === 'custom') {
      const id = idOf(x.id);
      if (id !== null) return { kind: 'custom', id };
    } else if (x.kind === 'preset' && (V3_ITEM_TYPES as readonly unknown[]).includes(x.value)) {
      return { kind: 'preset', value: x.value as V3PresetItemType };
    }
  }
  return { kind: 'preset', value: 'general' };
}

function purposeOf(x: unknown): Purpose | null {
  if (!isRecord(x)) return null;
  if (x.kind === 'custom') {
    const id = idOf(x.id);
    return id === null ? null : { kind: 'custom', id };
  }
  if (x.kind === 'preset' && (PURPOSES as readonly unknown[]).includes(x.value)) return { kind: 'preset', value: x.value as PresetPurpose };
  return null;
}

function cadenceOf(x: unknown): Cadence {
  if (isRecord(x)) {
    const every = intIn(x.every, 1, 12);
    if ((x.unit === 'week' || x.unit === 'month') && every !== null) return { unit: x.unit, every };
  }
  return { unit: 'month', every: 1 };
}

function firstPaymentOf(x: unknown): FirstPayment | null {
  if (!isRecord(x)) return null;
  if (x.kind === 'today') return { kind: 'today' };
  if (x.kind === 'one_period') return { kind: 'one_period' };
  if (x.kind === 'deferred' && typeof x.firstDate === 'string' && isValidLocalDate(x.firstDate)) {
    return { kind: 'deferred', firstDate: x.firstDate, interestDuringPause: typeof x.interestDuringPause === 'boolean' ? x.interestDuringPause : null };
  }
  return null;
}

/** L-02: keep only keys that carry a layer prefix, so a stray stored key never crashes a reader. */
function layerAnswersOf(x: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(x)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    try {
      layerOfAnswerKey(k);
    } catch {
      continue; // layerOfAnswerKey throws only RangeError, for a key with no layer prefix
    }
    out[k] = v;
  }
  return out;
}

function payOf(x: unknown): PayV2 {
  if (!isRecord(x) || x.mode !== 'plan') return { mode: 'once' };
  const f = isRecord(x.fees) ? x.fees : {};
  return {
    mode: 'plan', cadence: cadenceOf(x.cadence), count: intIn(x.count, 0, 600), termMonths: intIn(x.termMonths, 0, 600),
    apr: percentOf(x.apr, MAX_PERCENT_TEXT), fees: { setup: money(f.setup), perPeriod: money(f.perPeriod), end: money(f.end) },
    deposit: money(x.deposit), tradeIn: money(x.tradeIn), quotedPayment: minorOf(x.quotedPayment),
    firstPayment: firstPaymentOf(x.firstPayment), deferredInterestTerm: x.deferredInterestTerm === true,
    // 05.4 D-39c / D-143: a home loan; only true is kept (absent = not a home loan, so an unmarked plan reads exactly as before)
    ...(x.housing === true ? { housing: true } : {}),
  };
}

function ruleOf(x: unknown): SplitRule | null {
  if (!isRecord(x)) return null;
  if (x.kind === 'mine') return { kind: 'mine' };
  if (x.kind === 'even') return { kind: 'even' };
  if (x.kind === 'weight' && Array.isArray(x.weights)) {
    const w = x.weights.map((v) => intIn(v, 0, 1_000_000));
    return w.some((v) => v === null) ? null : { kind: 'weight', weights: w as number[] };
  }
  if (x.kind === 'amount' && Array.isArray(x.amounts)) {
    const a = x.amounts.map(minorOf);
    return a.some((v) => v === null) ? null : { kind: 'amount', amounts: a as MinorUnits[] };
  }
  return null;
}

function shareOf(x: unknown): ShareScope {
  if (!isRecord(x) || x.kind !== 'household') return { kind: 'personal' };
  const memberCount = intIn(x.memberCount, 2, 20);
  const rule = ruleOf(x.rule);
  const myIndex = memberCount === null ? null : intIn(x.myIndex, 0, memberCount - 1);
  if (memberCount === null || myIndex === null || rule === null) return { kind: 'personal' };
  return { kind: 'household', memberCount, myIndex, rule };
}

/** Strict money: a whole number of minor units in 0..MAX_MINOR, else null (a list line with a bad amount is dropped, not clamped). */
function exactMinorOf(x: unknown): MinorUnits | null {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= MAX_MINOR ? minorUnits(x) : null;
}

function localDateOf(x: unknown): LocalDate | null {
  return typeof x === 'string' && isValidLocalDate(x) ? x : null;
}

function everyOf(x: unknown): 1 | 3 | 12 | null {
  return x === 1 || x === 3 || x === 12 ? x : null;
}

function nameOf(x: unknown): string {
  return typeof x === 'string' ? x.trim().slice(0, MAX_NAME).trim() : '';
}

/** First `max` entries of a stored list, each read by `read`; entries it rejects are dropped. */
function listOf<T>(x: readonly unknown[], max: number, read: (r: Record<string, unknown>) => T | null): T[] {
  const out: T[] = [];
  for (const r of x.slice(0, max)) {
    const v = isRecord(r) ? read(r) : null;
    if (v !== null) out.push(v);
  }
  return out;
}

function runningCostOf(x: Record<string, unknown>): RunningCostLine | null {
  const id = idOf(x.id);
  const amount = exactMinorOf(x.amount);
  const everyMonths = everyOf(x.everyMonths);
  const start = localDateOf(x.start);
  if (id === null || amount === null || everyMonths === null || start === null) return null;
  const end = localDateOf(x.end);
  return { id, amount, everyMonths, start, end: end !== null && end >= start ? end : null, on: x.on !== false };
}

function stopSourceOf(x: unknown): StoppedCost['source'] | null {
  if (!isRecord(x)) return null;
  if (x.kind === 'everyday') return { kind: 'everyday', categoryId: idOf(x.categoryId) };
  const seriesId = x.kind === 'bill' ? idOf(x.seriesId) : null;
  return seriesId === null ? null : { kind: 'bill', seriesId };
}

function stoppedCostOf(x: Record<string, unknown>): StoppedCost | null {
  const id = idOf(x.id);
  const amount = exactMinorOf(x.amount);
  const everyMonths = everyOf(x.everyMonths);
  const stopDate = localDateOf(x.stopDate);
  const source = stopSourceOf(x.source);
  if (id === null || amount === null || everyMonths === null || stopDate === null || source === null) return null;
  return { id, amount, everyMonths, stopDate, source };
}

function saleOf(x: unknown): Sale | null {
  if (!isRecord(x)) return null;
  const amount = exactMinorOf(x.amount);
  const arrives = localDateOf(x.arrives);
  return amount === null || arrives === null ? null : { amount, arrives, paysDebtId: idOf(x.paysDebtId) };
}

function replacesOf(x: unknown): Replaces | null {
  if (!isRecord(x)) return null;
  return { stops: Array.isArray(x.stops) ? listOf(x.stops, MAX_STOPS, stoppedCostOf) : [], sale: saleOf(x.sale) };
}

/** 06.1 D-21: one quick-estimate line; an unknown kind or a line missing what its kind needs is dropped. */
function quickLineOf(x: Record<string, unknown>): QuickLine | null {
  const id = idOf(x.id);
  if (id === null) return null;
  const name = nameOf(x.name);
  const date = localDateOf(x.date);
  if (x.kind === 'loan') {
    const monthly = exactMinorOf(x.monthly);
    const payments = intIn(x.payments, 1, MAX_PAYMENTS);
    return monthly === null || monthly === 0 || payments === null ? null : { id, kind: 'loan', name, monthly, payments, firstDate: localDateOf(x.firstDate) };
  }
  const amount = exactMinorOf(x.amount);
  if (amount === null) return null;
  if (x.kind === 'savings') return { id, kind: 'savings', name, amount, usable: x.usable === true };
  if (x.kind === 'income') {
    return (x.everyMonths === 0 || x.everyMonths === 1) && date !== null ? { id, kind: 'income', name, amount, everyMonths: x.everyMonths, date } : null;
  }
  if (x.kind !== 'expense') return null;
  if (x.everyMonths === 0) return date === null ? null : { id, kind: 'expense', name, amount, everyMonths: 0, date };
  const everyMonths = everyOf(x.everyMonths);
  return everyMonths === null ? null : { id, kind: 'expense', name, amount, everyMonths, date };
}

/** null when `v !== 2` (the caller then upgrades as v1). Otherwise total: bad fields reset to their defaults. */
export function parseCheckV2(json: unknown): CheckV2 | null {
  if (!isRecord(json) || json.v !== 2) return null;
  const extras: Record<string, MinorUnits> = {};
  if (isRecord(json.extras)) {
    for (const k of Object.keys(json.extras).slice(0, MAX_EXTRAS)) {
      const v = minorOf(json.extras[k]);
      if (k.length > 0 && k.length <= MAX_ID && v !== null) extras[k] = v;
    }
  }
  const val = isRecord(json.value) ? json.value : {};
  const fr = isRecord(json.foreign) ? json.foreign : null;
  const foreign = fr !== null && typeof fr.currency === 'string' && CURRENCY.test(fr.currency)
    ? { currency: fr.currency as CurrencyCode, atTodaysRate: true as const }
    : null;
  return {
    v: 2,
    legacyKind: json.legacyKind === 'invest' ? 'invest' : 'buy',
    price: minorOf(json.price),
    taxPercent: percentOf(json.taxPercent, MAX_PERCENT_TEXT),
    oneOffFees: money(json.oneOffFees),
    itemType: itemTypeOf(json.itemType),
    categoryId: idOf(json.categoryId),
    purpose: purposeOf(json.purpose),
    emergency: json.emergency === true,
    envelopeId: idOf(json.envelopeId),
    pay: payOf(json.pay),
    extras,
    value: {
      earnsMonthly: minorOf(val.earnsMonthly), savesMonthly: minorOf(val.savesMonthly),
      useYears: typeof val.useYears === 'number' && Number.isFinite(val.useYears) ? Math.min(200, Math.max(0, val.useYears)) : null,
      cheaperPrice: minorOf(val.cheaperPrice),
    },
    share: shareOf(json.share),
    foreign,
    layerAnswers: layerAnswersOf(json.layerAnswers),
    volatileCover: typeof json.volatileCover === 'boolean' ? json.volatileCover : null,
    taxIncluded: typeof json.taxIncluded === 'boolean' ? json.taxIncluded : null, // 05.4 FIN-27 (D-19)
    // 06.1-02 (Pitfall 1): the Variant C tail and D-21 quick lines. A key absent in storage stays absent, so a check saved
    // without them reads back deep-equal; a non-list where a list belongs reads as absent (both mean none).
    ...(Array.isArray(json.runningCosts) ? { runningCosts: listOf(json.runningCosts, MAX_RUNNING_COSTS, runningCostOf) } : {}),
    ...('closingPercent' in json ? { closingPercent: percentOf(json.closingPercent, MAX_PERCENT_TEXT) } : {}),
    ...('purchaseDate' in json ? { purchaseDate: localDateOf(json.purchaseDate) } : {}),
    ...('replaces' in json ? { replaces: replacesOf(json.replaces) } : {}),
    ...(Array.isArray(json.quickLines) ? { quickLines: listOf(json.quickLines, MAX_QUICK_LINES, quickLineOf) } : {}),
  };
}

/** Exact decimal text of a scaled Percent, trailing zeros trimmed ("22.9", "0"). */
export function percentText(p: Percent): string {
  const whole = p / PERCENT_SCALE;
  const frac = (p % PERCENT_SCALE).toString().padStart(RATE_SCALE, '0').replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole}.${frac}`;
}

/** JSON-safe form: Percent becomes decimal text, everything else is already plain data. */
export function toStoredV2(c: CheckV2): unknown {
  const pay = c.pay.mode === 'plan' ? { ...c.pay, apr: c.pay.apr === null ? null : percentText(c.pay.apr) } : c.pay;
  const closing = c.closingPercent === undefined ? {} : { closingPercent: c.closingPercent === null ? null : percentText(c.closingPercent) };
  return { ...c, taxPercent: c.taxPercent === null ? null : percentText(c.taxPercent), pay, ...closing };
}

/** v2 as stored, else a v1 (or anything) upgraded. Total. */
export function readStoredCheck(json: unknown): { readonly check: CheckV2; readonly reasons: readonly ReasonCode[] } {
  const v2 = parseCheckV2(json);
  return v2 !== null ? { check: v2, reasons: [] } : upgradeInputs(json);
}

