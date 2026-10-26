/**
 * v1 -> v2 stored-input upgrade and legacy limit lines (05.1-20). C6, C7, D-04, D-13, D-23, I42.
 * Total: never throws. The v1 shape is declared structurally because engine/ cannot import features/; 05.1-30 adds a
 * typecheck proving CheckInputs is assignable. Real stored v1 JSON can lack `v` and most fields, so every read is guarded.
 */
import { ITEM_TYPES, type ItemType } from '../../cardRule';
import { DEFAULT_DSR_LINE, DEFAULT_HOUSING_LINE, DEFAULT_UNSECURED_INCOME_MULTIPLE } from '../../lineDefaults';
import { minorUnits, type MinorUnits } from '../../../money/types';
import { percent, ZERO_PERCENT, type Percent } from '../../../payoff/types';
import { LEGACY_STATE_OF_CODE } from '../constants';
import type { Cadence, CheckV2, Code, FirstPayment, ItemTypeRef, LegacyState, LimitLine, Limits, PayV2, ReasonCode } from '../types';
import type { ShareScope, SplitRule } from '../../share';

export interface LegacyCheckInputsV1 {
  readonly v?: unknown; readonly kind?: unknown; readonly itemType?: unknown; readonly advertised?: unknown; readonly adjustments?: unknown;
  readonly runningCosts?: unknown; readonly method?: unknown; readonly loan?: unknown; readonly instalment?: unknown; readonly scope?: unknown;
  readonly split?: unknown; readonly customItemType?: unknown; readonly cheaperPrice?: unknown; readonly currency?: unknown;
}

// Cite: features/decide/snapshot/checkInputs.ts MAX_INPUT_MINOR (10^12): kept equal by hand, engine cannot import features/.
export const MAX_MINOR = 1_000_000_000_000;
const MAX_PERIODS = 600;
const MAX_LIST = 30;
const RATE_PATTERN = /^\d{1,4}(\.\d{1,10})?$/;
const MAX_APR_TEXT = 999.99;

export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Clamp any number to 0..1e12 minor units; non-numbers become null. */
export function minorOf(x: unknown): MinorUnits | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  return minorUnits(Math.min(MAX_MINOR, Math.max(0, Math.trunc(x))));
}

export function percentOf(x: unknown, max = MAX_APR_TEXT): Percent | null {
  if (typeof x !== 'string') return null;
  const t = x.trim();
  if (!RATE_PATTERN.test(t) || Number(t) > max) return null;
  return percent(t);
}

export function intIn(x: unknown, lo: number, hi: number): number | null {
  return typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi ? x : null;
}

function list(x: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(x) ? x.slice(0, MAX_LIST).filter(isRecord) : [];
}

const FREQ_CADENCE: Readonly<Record<string, Cadence>> = {
  weekly: { unit: 'week', every: 1 },
  fortnightly: { unit: 'week', every: 2 },
  monthly: { unit: 'month', every: 1 },
  quarterly: { unit: 'month', every: 3 },
};

function firstPaymentOf(x: unknown): FirstPayment | null {
  if (x === 'today') return { kind: 'today' };
  if (x === 'next_period' || x === 'next_month') return { kind: 'one_period' }; // D-04, D-89 alias
  return null; // absent: the user is asked (D-04)
}

function shareOf(scope: unknown, split: unknown): ShareScope {
  if (scope !== 'household' || !isRecord(split)) return { kind: 'personal' };
  const weights = Array.isArray(split.weights) ? split.weights : [];
  const amounts = Array.isArray(split.amounts) ? split.amounts : [];
  const n = split.kind === 'weight' ? weights.length : split.kind === 'amount' ? amounts.length : 2;
  if (n < 2 || n > 20) return { kind: 'personal' };
  let rule: SplitRule;
  if (split.kind === 'mine') rule = { kind: 'mine' };
  else if (split.kind === 'even') rule = { kind: 'even' };
  else if (split.kind === 'weight') {
    const w = weights.map((v) => intIn(v, 0, 1_000_000));
    if (w.some((v) => v === null) || w.every((v) => v === 0)) return { kind: 'personal' };
    rule = { kind: 'weight', weights: w as number[] };
  } else if (split.kind === 'amount') {
    const a = amounts.map(minorOf);
    if (a.some((v) => v === null) || a.every((v) => v === 0)) return { kind: 'personal' };
    rule = { kind: 'amount', amounts: a as MinorUnits[] };
  } else return { kind: 'personal' };
  return { kind: 'household', memberCount: n, myIndex: 0, rule };
}

const ZERO = minorUnits(0);

export function upgradeInputs(json: unknown): { readonly check: CheckV2; readonly reasons: readonly ReasonCode[] } {
  const o: Record<string, unknown> = isRecord(json) ? json : {};
  const reasons: ReasonCode[] = ['legacy_upgraded'];
  const method = o.method;
  const invest = o.kind === 'invest' || method === 'lump' || method === 'monthly';

  // price: advertised plus counted on-the-day adjustments (adds - takes_off); tax lines become taxPercent
  const advertised = minorOf(o.advertised);
  let taxPercent: Percent | null = null;
  let delta = 0;
  for (const a of list(o.adjustments)) {
    if (a.counted === false) continue;
    const tax = percentOf(a.taxPercentText, 100);
    if (tax !== null) {
      taxPercent ??= tax;
      continue;
    }
    if (a.onDay !== true) continue;
    const amt = minorOf(a.amount) ?? 0;
    delta += a.effect === 'takes_off' ? -amt : amt;
  }
  const price = advertised === null ? null : minorUnits(Math.min(MAX_MINOR, Math.max(0, advertised + delta)));

  let pay: PayV2 = { mode: 'once' };
  const fees = { setup: ZERO, perPeriod: ZERO, end: ZERO };
  if (method === 'loan') {
    const l = isRecord(o.loan) ? o.loan : {};
    const term = intIn(l.termMonths, 1, MAX_PERIODS);
    pay = {
      mode: 'plan', cadence: { unit: 'month', every: 1 }, count: term, termMonths: term, apr: percentOf(l.aprText), fees,
      deposit: minorOf(l.deposit) ?? ZERO, tradeIn: ZERO, quotedPayment: null, firstPayment: null, deferredInterestTerm: false,
    };
  } else if (method === 'instalment') {
    const i = isRecord(o.instalment) ? o.instalment : {};
    const cadence = (typeof i.freq === 'string' ? FREQ_CADENCE[i.freq] : undefined) ?? FREQ_CADENCE.monthly!;
    pay = {
      mode: 'plan', cadence, count: intIn(i.count, 1, MAX_PERIODS), termMonths: null,
      apr: i.hasRate === true ? percentOf(i.aprText) : ZERO_PERCENT, fees,
      deposit: ZERO, tradeIn: ZERO, quotedPayment: minorOf(i.amount), firstPayment: firstPaymentOf(i.firstPayment), deferredInterestTerm: false,
    };
  }
  if (method === 'card' || invest) reasons.push('legacy_method_mapped');

  const extras: Record<string, MinorUnits> = {};
  for (const r of list(o.runningCosts)) {
    if (r.counted === false) continue;
    const amt = minorOf(r.amount);
    if (amt === null || amt === 0) continue;
    const key = `legacy:${typeof r.category === 'string' && r.category !== '' ? r.category.slice(0, 40) : 'other'}`;
    extras[key] = minorUnits(Math.min(MAX_MINOR, (extras[key] ?? 0) + amt));
  }

  let itemType: ItemTypeRef = { kind: 'preset', value: 'general' };
  if (isRecord(o.customItemType)) {
    const t = o.customItemType.treatLike;
    itemType = { kind: 'preset', value: (ITEM_TYPES as readonly unknown[]).includes(t) ? (t as ItemType) : 'general' };
  } else if ((ITEM_TYPES as readonly unknown[]).includes(o.itemType)) {
    itemType = { kind: 'preset', value: o.itemType as ItemType };
  }

  const check: CheckV2 = {
    v: 2, legacyKind: invest ? 'invest' : 'buy', price, taxPercent, oneOffFees: ZERO, itemType, categoryId: null, purpose: null,
    emergency: false, envelopeId: null, pay, extras,
    value: { earnsMonthly: null, savesMonthly: null, useYears: null, cheaperPrice: minorOf(o.cheaperPrice) },
    share: shareOf(o.scope, o.split), foreign: null, layerAnswers: {},
  };
  return { check, reasons };
}

export interface LegacyLineSettings { readonly dsr_line: string | null; readonly housing_line: string | null; readonly unsecured_multiple: number | null }

// Cite: features/decide/snapshot/buildSnapshot.ts DSR_PATTERN / MAX_LINE_PERCENT / MAX_UNSECURED_MULTIPLE, kept equal by hand.
const DSR_PATTERN = /^\d{1,3}(\.\d{1,4})?$/;
const MAX_LINE_PERCENT = 100;
const MAX_UNSECURED_MULTIPLE = 120;

function linePercent(text: unknown): Percent | null {
  return typeof text === 'string' && DSR_PATTERN.test(text) && Number(text) <= MAX_LINE_PERCENT ? percent(text) : null;
}

/** D-13: a non-null stored line becomes an 'on' legacy line; null or invalid stays off with the default offered. */
export function legacyLimits(s: LegacyLineSettings | null): Limits {
  const dsr = linePercent(s?.dsr_line);
  const housing = linePercent(s?.housing_line);
  const m = s?.unsecured_multiple;
  const times = typeof m === 'number' && Number.isInteger(m) && m >= 0 && m <= MAX_UNSECURED_MULTIPLE ? m : null;
  const lines: LimitLine[] = [
    { id: 'debt_share', on: dsr !== null, source: dsr !== null ? 'legacy' : 'builtin', spec: { kind: 'debt_share', pct: dsr ?? DEFAULT_DSR_LINE } },
    { id: 'housing_share', on: housing !== null, source: housing !== null ? 'legacy' : 'builtin', spec: { kind: 'housing_share', pct: housing ?? DEFAULT_HOUSING_LINE } },
    { id: 'unsecured_multiple', on: times !== null, source: times !== null ? 'legacy' : 'builtin', spec: { kind: 'unsecured_multiple', times: times ?? DEFAULT_UNSECURED_INCOME_MULTIPLE } },
  ];
  return { lines };
}

/** D-23. */
export function legacyStateOf(code: Code): LegacyState {
  return LEGACY_STATE_OF_CODE[code];
}
