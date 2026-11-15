// PURE. 05.5-12 (ARC-03, ENG-21): the small readers behind buildInputs. Stored answers in, engine objects out. No React, no I/O.
// Beside the old builder (buildV3Inputs.ts) until 05.5-16 switches the callers and 05.5-19 deletes the old file, so nothing here
// imports it or the old engine. Allowed imports: the v3 engine barrel, money, payoff, recurring and the grow connection points.
import {
  homeThresholds,
  validateCustomOptions,
  V3_ITEM_TYPES,
  MAX_OWN_LINES,
  MAX_CUSTOM_OPTIONS,
  type AccountUse,
  type CountsAs,
  type Cadence,
  type CustomOptions,
  type ExpectedMonthIncome,
  type HeldBridge,
  type IncomeKind,
  type IncomePattern,
  type IncomeProfile,
  type LimitLine,
  type LineSpec,
  type Limits,
  type PayArrival,
  type ReadinessWaiver,
  type SkippedOccurrence,
  type UnexplainedAnswer,
  type UnexplainedUse,
  type UsdRate,
  type V3PresetItemType,
  type VariableMethod,
} from '@/engine/decide/v3';
import { MAX_ABS_AMOUNT_MINOR, currencyExponent, minorUnits } from '@/engine/money';
import { percent, type CardMinimumTerms } from '@/engine/payoff';
import { occurrenceDate, type RecurringFreq } from '@/engine/recurring';
import type { SnapshotSource } from '../buildSnapshot';
import { convertFloored } from '../conversion';
import { engineIncomeTypes } from './settingsSource';
import { waiverOfAnswer } from './waiverKeys';
import type { V3SettingsSource } from './types';

type Obj = Record<string, unknown>;
type Row = SnapshotSource['rows'][number];

/** A transaction row as the new builder reads it: today's row plus the settlement flag (D-06; Phase 8 08-30 fills it). */
export type InputsRow = Row & { isSettlement?: boolean };

/**
 * The source the new builder reads: today's SnapshotSource, with the rows allowed to carry isSettlement, and the category caps
 * (categories.monthly_cap, OFO-4) as one record of category id to cap in the home currency's minor units.
 */
export interface InputsSource extends Omit<SnapshotSource, 'rows' | 'upcomingRows'> {
  rows: readonly InputsRow[];
  upcomingRows: readonly InputsRow[];
  categoryCaps?: Readonly<Record<string, number | null>>;
}

/** The newest months a usual month is averaged over (D-09); equal to the old engine's AVERAGING_WINDOW_MONTHS (pinned by a parity test). */
export const WINDOW_MONTHS = 6;

const EMPTY_LISTS = { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] } as const satisfies CustomOptions;
const EMPTY_CUSTOM: CustomOptions = { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] };
const PATTERNS: readonly string[] = ['steady', 'variable', 'seasonal'];
const UNEXPLAINED_USES: readonly string[] = ['spare', 'envelope_or_goal', 'set_aside_for_bill', 'someone_elses'];
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const VARIABLE_METHODS: readonly string[] = ['match', 'spread', 'steady', 'balance'];
const PRESET_INCOME_KINDS: readonly string[] = ['salary', 'commission', 'side_business', 'dividends', 'interest', 'rent', 'family', 'other'];
const OWN_CADENCES: readonly string[] = ['monthly', 'yearly', 'one_off'];
const DSR_PATTERN = /^\d{1,3}(\.\d{1,4})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LINE_PERCENT = 100;
const MAX_UNSECURED_MULTIPLE = 120;
const LEGACY_LINE_IDS: readonly string[] = ['debt_share', 'housing_share', 'unsecured_multiple'];
const USD_PROBE_MINOR = 1_000_000; // US$10,000 in minor units: the rate probe for a currency the band table lacks
const USD_PROBE_EXPONENT = 4; // 10,000 US$ = 10^4 major units
/** The overdraft_rate column check (20261103000200), the same shape percent() reads. */
const RATE_PATTERN = /^\d{1,4}(\.\d{1,10})?$/;
/** profiles.region_subdivision, as updateRegionSubdivision writes it (D-19). */
export const SUBDIVISION_PATTERN = /^[A-Z0-9]{1,3}$/;

export const isRec = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
export const str = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);
export const moneyOf = (x: unknown): number | null => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= MAX_ABS_AMOUNT_MINOR ? x : null);
/** M-07: the unspent figure is signed (overdrawn, card owed). Only the bounds apply. */
export const signedMoneyOf = (x: unknown): number | null => (typeof x === 'number' && Number.isSafeInteger(x) && Math.abs(x) <= MAX_ABS_AMOUNT_MINOR ? x : null);
export const dateOf = (x: unknown): string | null => (typeof x === 'string' && DATE_PATTERN.test(x) ? x : null);
const pctOf = (x: unknown) => (typeof x === 'string' && DSR_PATTERN.test(x) && Number(x) <= MAX_LINE_PERCENT ? percent(x) : null);
export const inList = (xs: readonly string[], x: unknown): x is string => typeof x === 'string' && xs.includes(x);
/** ARC-25: a stored rate as typed, or null; never a default. */
export const rateOf = (x: unknown) => (typeof x === 'string' && RATE_PATTERN.test(x) ? percent(x) : null);
/** D-127: a whole count of writes waiting to send; anything else reads as none. */
export const unsavedOf = (n: number | undefined): number => (n !== undefined && Number.isSafeInteger(n) && n > 0 ? n : 0);
/** 06.1-22 FIN-07: the keep-at-least line as minor units; anything unreadable or negative is none. */
export const tightLineOf = (x: unknown) => { const n = moneyOf(x); return n === null ? null : minorUnits(n); };
/** 06.1 FIN-20 (D-26): the typed share as whole basis points inside the column's 0 .. 6000; anything else reads as none. */
export const taxSetAsideBpOf = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 6000 ? x : null);

function lineSpecOf(s: unknown): LineSpec | null {
  if (!isRec(s)) return null;
  const categoryId = str(s.categoryId);
  const cap = moneyOf(s.cap);
  switch (s.kind) {
    case 'housing_share':
    case 'debt_share': {
      const pct = pctOf(s.pct);
      return pct === null ? null : { kind: s.kind, pct };
    }
    case 'unsecured_multiple': {
      const t = s.times;
      return typeof t === 'number' && Number.isInteger(t) && t >= 0 && t <= MAX_UNSECURED_MULTIPLE ? { kind: 'unsecured_multiple', times: t } : null;
    }
    case 'single_purchase_cap':
      return cap === null ? null : { kind: 'single_purchase_cap', cap: minorUnits(cap) };
    case 'category_income_share': {
      const pct = pctOf(s.pct);
      return categoryId === null || pct === null ? null : { kind: 'category_income_share', categoryId, pct };
    }
    case 'unspent_floor': {
      const floor = moneyOf(s.floor);
      return floor === null ? null : { kind: 'unspent_floor', floor: minorUnits(floor) };
    }
    default:
      return null; // includes category_monthly_cap: the rules document's category caps are not read (D-11); categories.monthly_cap is
  }
}

/**
 * D-13 / D-11: the legacy lines first, then the user's own lines (at most 5, unique ids, none a category cap), then one
 * category_monthly_cap line per category whose monthly_cap is set (OFO-4: always checked, always on). Invalid entries are dropped.
 */
export function limitsOf(v3: V3SettingsSource | null, legacy: Limits, caps: Readonly<Record<string, number | null>>): Limits {
  const taken = new Set<string>(LEGACY_LINE_IDS);
  const own: LimitLine[] = [];
  for (const raw of v3 === null ? [] : v3.own_lines) {
    const id = isRec(raw) ? str(raw.id) : null;
    const spec = isRec(raw) ? lineSpecOf(raw.spec) : null;
    if (id === null || spec === null || taken.has(id) || own.length >= MAX_OWN_LINES) continue;
    taken.add(id);
    own.push({ id, on: (raw as Obj).on === true, source: 'own', spec });
  }
  const capLines: LimitLine[] = [];
  for (const categoryId of Object.keys(caps).sort()) {
    const cap = moneyOf(caps[categoryId]);
    if (cap !== null) capLines.push({ id: `cap_${categoryId}`, on: true, source: 'own', spec: { kind: 'category_monthly_cap', categoryId, cap: minorUnits(cap) } });
  }
  return { lines: [...legacy.lines, ...own, ...capLines] };
}

function cadenceOf(x: unknown): Cadence | null {
  if (!isRec(x)) return null;
  const every = x.every;
  const unit = x.unit;
  return (unit === 'week' || unit === 'month') && typeof every === 'number' && Number.isInteger(every) ? { unit, every } : null;
}

/** M-09: keep an entry only when the list so far plus the entry validates; one bad entry drops itself, a duplicate id drops the later one, each list stops at MAX_CUSTOM_OPTIONS. */
function keepValid<T>(candidates: readonly T[], wrap: (xs: readonly T[]) => CustomOptions): T[] {
  const kept: T[] = [];
  for (const c of candidates) {
    if (kept.length >= MAX_CUSTOM_OPTIONS) break;
    if (validateCustomOptions(wrap([...kept, c])).length === 0) kept.push(c);
  }
  return kept;
}

export function customOf(x: unknown): CustomOptions {
  if (!isRec(x)) return EMPTY_CUSTOM;
  const itemTypes: CustomOptions['itemTypes'][number][] = list(x.itemTypes).flatMap((t) => {
    if (!isRec(t)) return [];
    const id = str(t.id);
    if (id === null || !inList(V3_ITEM_TYPES, t.base)) return [];
    const ownQuestions = list(t.ownQuestions).flatMap((q) => {
      const qid = isRec(q) ? str(q.id) : null;
      const label = isRec(q) && typeof q.label === 'string' ? q.label : null;
      if (qid === null || label === null || !isRec(q) || !inList(OWN_CADENCES, q.cadence) || typeof q.cash !== 'boolean') return [];
      return [{ id: qid, label, cadence: q.cadence as 'monthly' | 'yearly' | 'one_off', cash: q.cash }];
    });
    return [{ id, base: t.base as V3PresetItemType, questionIds: list(t.questionIds).filter((q): q is string => typeof q === 'string'), ownQuestions }];
  });
  const purposes = list(x.purposes).flatMap((p) => (isRec(p) && str(p.id) !== null ? [{ id: p.id as string }] : []));
  const cadences = list(x.cadences).flatMap((c) => {
    const cad = cadenceOf(c);
    return cad === null ? [] : [cad];
  });
  const incomeKinds = list(x.incomeKinds).flatMap((k) => {
    if (!isRec(k) || str(k.id) === null) return [];
    const countsAs: CountsAs = k.countsAs === 'available' || k.countsAs === 'kept' ? k.countsAs : null;
    return [{ id: k.id as string, countsAs }];
  });
  return {
    itemTypes: keepValid(itemTypes, (xs) => ({ ...EMPTY_LISTS, itemTypes: xs })),
    purposes: keepValid(purposes, (xs) => ({ ...EMPTY_LISTS, purposes: xs })),
    cadences: keepValid(cadences, (xs) => ({ ...EMPTY_LISTS, cadences: xs })),
    incomeKinds: keepValid(incomeKinds, (xs) => ({ ...EMPTY_LISTS, incomeKinds: xs })),
  };
}

/**
 * CR-03: the decide_settings money columns hold home-currency minor units. A row stamped in another currency (or one that
 * no longer matches after a home change) is not read as home money. Null currency = a row written before the stamp, read as home.
 */
export function settingsMoneyUsable(st: SnapshotSource['settings'], home: string): boolean {
  return st === null || st.currency === null || st.currency === home;
}

/** The v3 settings with every money figure removed; non-money answers are kept. */
export function withoutMoney(v3: V3SettingsSource | null): V3SettingsSource | null {
  if (v3 === null) return null;
  return { ...v3, steady_amount: null, everyday_override: null, unspent_anchor: null, rough_saving: null, rough_debt: null, rough_invest: null, unexplained_amount: null };
}

export function profileOf(v3: V3SettingsSource | null): IncomeProfile | null {
  if (v3 === null || v3.income_types === null) return null;
  const steady = moneyOf(v3.steady_amount);
  const hold = v3.hold_months;
  return {
    types: engineIncomeTypes(v3.income_types), // D-17: the six setup answers onto the engine's types
    variable: inList(VARIABLE_METHODS, v3.variable_method) ? (v3.variable_method as VariableMethod) : null,
    steady: steady === null ? null : minorUnits(steady),
    billsHorizonMonths: hold === 1 || hold === 2 || hold === 3 ? hold : null,
    pattern: inList(PATTERNS, v3.income_pattern) ? (v3.income_pattern as IncomePattern) : null, // D-34
    patternConfirmed: v3.income_pattern_confirmed === true, // D-34
  };
}

export function incomeKindOf(raw: string | null): IncomeKind | null {
  if (raw === null) return null;
  return PRESET_INCOME_KINDS.includes(raw)
    ? { kind: 'preset', value: raw as Extract<IncomeKind, { kind: 'preset' }>['value'] }
    : { kind: 'custom', id: raw };
}

/** The last day a series runs: its end date, or the date of its final counted occurrence when it has an occurrence count. */
export function endOf(anchor: string, freq: RecurringFreq, endDate: string | null, count: number | null): string | null {
  if (count === null) return endDate;
  const last = occurrenceDate(anchor, freq, Math.max(0, count - 1));
  return endDate === null || last < endDate ? last : endDate;
}

/** Home major units per US$1 as a rational, from stored rates only (D-26). Null when the table has the currency or no rate converts. */
export function usdRateOf(source: InputsSource, home: string): UsdRate | null {
  if (homeThresholds(home, null).source === 'table') return null;
  const r = convertFloored(USD_PROBE_MINOR, 'USD', home, source.rates, source.customCurrencies, source.today);
  return r === null ? null : { num: BigInt(r.amount), den: 10n ** BigInt(currencyExponent(home) + USD_PROBE_EXPONENT) };
}

type UseColumns = { use?: string | null; use_purpose?: string | null; use_envelope_id?: string | null; use_extra_set_aside?: number | null };

/** D-03, D-54: the stored account columns as an AccountUse. */
export function accountUseFromColumns(a: UseColumns): AccountUse | null {
  switch (a.use) {
    case 'everyday':
      return { kind: 'everyday' };
    case 'untouched':
      return { kind: 'untouched' };
    case 'mixed': {
      const extra = moneyOf(a.use_extra_set_aside);
      return { kind: 'mixed', extraSetAside: extra === null ? null : minorUnits(extra) };
    }
    case 'dedicated':
      if (a.use_purpose === 'emergency') return { kind: 'dedicated', purpose: { kind: 'emergency' } };
      if (a.use_purpose === 'envelope' && typeof a.use_envelope_id === 'string') return { kind: 'dedicated', purpose: { kind: 'envelope', envelopeId: a.use_envelope_id } };
      return null;
    default:
      return null;
  }
}

type AnswerLite = NonNullable<V3SettingsSource['answers']>[number];

/** D-58: pay_arrival answers; the key is `<series id>:<YYYY-MM-DD>`. */
export function payArrivalsOf(answers: readonly AnswerLite[]): PayArrival[] {
  return answers.flatMap((a): PayArrival[] => {
    if (a.kind !== 'pay_arrival' || a.bool_value === null) return [];
    const cut = a.key.lastIndexOf(':');
    const date = dateOf(a.key.slice(cut + 1));
    return cut <= 0 || date === null ? [] : [{ seriesId: a.key.slice(0, cut), date, arrived: a.bool_value }];
  });
}

/** D-35: expected_income answers; the key is the month, the amount and the answer date are required. */
export function expectedIncomeOf(answers: readonly AnswerLite[]): ExpectedMonthIncome[] {
  return answers.flatMap((a): ExpectedMonthIncome[] => {
    const amount = moneyOf(a.amount);
    const at = dateOf(a.on_date);
    return a.kind === 'expected_income' && MONTH_PATTERN.test(a.key) && amount !== null && at !== null ? [{ month: a.key, amount: minorUnits(amount), at }] : [];
  });
}

/** 06.1-43 (G-1, C-2; 05.3 D-28): readiness answers, in stored order. A malformed stored row is skipped, never thrown. */
export function waiversOf(answers: readonly AnswerLite[]): ReadinessWaiver[] {
  return answers.flatMap((a): ReadinessWaiver[] => {
    const w = waiverOfAnswer(a);
    return w === null ? [] : [w];
  });
}

/**
 * 06.1-43 (G-1, C-2): a skipped occurrence of a series settles its due silently (a record, not an answer). One per series and
 * date, sorted by series id then date (plain string order). The skipped rows still never become month lines.
 */
export function skippedOf(rows: InputsSource['rows']): SkippedOccurrence[] {
  const sep = String.fromCharCode(1); // below every id and date character, so a shorter id sorts first
  const seen = new Map<string, SkippedOccurrence>();
  for (const r of rows) {
    if (r.deleted_at !== null || r.status !== 'skipped' || r.recurring_series_id === null) continue;
    seen.set(`${r.recurring_series_id}${sep}${r.local_date}`, { seriesId: r.recurring_series_id, date: r.local_date });
  }
  return [...seen.keys()].sort().map((k) => seen.get(k) as SkippedOccurrence);
}

/** D-38, Pitfall 9: a held-back bridge counts only while its check is in the live set. */
export function heldBridgesOf(answers: readonly AnswerLite[], live: ReadonlySet<string>): HeldBridge[] {
  return answers.flatMap((a): HeldBridge[] => {
    const amount = moneyOf(a.amount);
    return a.kind === 'held_bridge' && a.check_id !== null && live.has(a.check_id) && amount !== null ? [{ id: a.check_id, amount: minorUnits(amount) }] : [];
  });
}

/** D-50: all three parts, or no answer. */
export function unexplainedOf(v3: V3SettingsSource | null): UnexplainedAnswer | null {
  const amount = moneyOf(v3?.unexplained_amount);
  const at = dateOf(v3?.unexplained_at);
  const use = v3?.unexplained_use;
  return amount === null || at === null || !inList(UNEXPLAINED_USES, use) ? null : { amount: minorUnits(amount), use: use as UnexplainedUse, at };
}

/**
 * The card-minimum terms of the markets the app knows, for a card with no stored terms. Data, not behaviour: the same four figures
 * as the old engine's MARKET_DEFAULTS (US, CA, UK; a parity test pins them), kept here so the old engine file can go (05.5-19).
 * CA-QC is not listed: the region preference never names a province.
 */
const MARKET_CARD_TERMS: Readonly<Record<string, { currency: string; percent: string; interestAdded: boolean; floor: number }>> = {
  US: { currency: 'USD', percent: '1', interestAdded: true, floor: 2_500 },
  CA: { currency: 'CAD', percent: '2', interestAdded: false, floor: 1_000 },
  UK: { currency: 'GBP', percent: '1', interestAdded: true, floor: 500 },
};
const REGION_MARKET: Readonly<Record<string, string>> = { US: 'US', CA: 'CA', GB: 'UK' };

/** The market row for the region preference (country level only), or null. */
export function marketCardTerms(region: string | null): { currency: string; terms: Omit<CardMinimumTerms, 'floor'>; floor: number } | null {
  const key = region === null ? undefined : REGION_MARKET[region];
  const row = key === undefined ? undefined : MARKET_CARD_TERMS[key];
  return row === undefined ? null : { currency: row.currency, terms: { minimumPercent: percent(row.percent), interestAdded: row.interestAdded }, floor: row.floor };
}
