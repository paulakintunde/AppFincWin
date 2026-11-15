/**
 * 05-07: PURE. JSON inputs in (no bigint stored), engine objects out (memory only, D-15). Barrel imports only.
 *
 * Validation, the quick-check carry (D-23) and the mapping from stored CheckInputs to the engine's PurchaseCheck.
 * Nothing here supplies a rate, a fee, a promotion or a loss of value: every credit term reaches the engine only when the
 * user typed it (D-07, D-30, D-32, D-42, 04 D-63).
 */
import { ITEM_TYPES, priceAfterLines, salesTaxOf, suggestItemType, type ItemType } from '@/engine/decide/v3';
import { minorUnits, type MinorUnits } from '@/engine/money';
import { ZERO_PERCENT, ceilDivide, percent, percentFromScaled, PERCENT_SCALE, type Percent } from '@/engine/payoff';
import { isValidLocalDate } from '@/engine/time';
import { MAX_INPUT_MINOR } from '@/features/record/forms/limits';
import { cheaperBounds } from './customValues';
import { PAY_METHODS } from './types';
import type {
  AdjustmentLine,
  CardNoteAnswer,
  CheckInputs,
  InputLine,
  InstalmentFreq,
  LossOfValueEntry,
  MethodKey,
  PromoInput,
  QuickInputs,
  RunningCostCategory,
  SetbackCode,
  SetbackLine,
} from './types';

/** The most a typed APR may be (999.99% a year), so a schedule over 600 months can never overflow a safe integer. */
export const MAX_APR: Percent = percentFromScaled((PERCENT_SCALE * 99_999n) / 100n);
// Kept as a re-export so the screens that import it from here need no edit; the one copy is features/record/forms/limits.ts (05.5-17, D-18).
export { MAX_INPUT_MINOR };
// Every typed money amount is at most MAX_INPUT_MINOR (10^12, features/record/forms/limits.ts), so engine sums stay inside safe integers.

/** The engine's ceiling for a typed projection rate, 100% a year (ME-01, the old constants.ts MAX_PROJECTION_RATE). */
const MAX_PROJECTION_RATE: Percent = percent('100');
/**
 * The step 2 setback defaults, never enabled (the old constants.ts DEFAULT_SETBACKS, prototype DSB setbacks): once, drop 20% x 2
 * months, none x 8 months, late 30 days. A null amount means one month's costs.
 */
const DEFAULT_SETBACKS = [
  { code: 'unexpected_expense' },
  { code: 'income_drop', percentDrop: 20, months: 2 },
  { code: 'job_loss', months: 8 },
  { code: 'late_invoice', daysLate: 30 },
] as const;

const MAX_LINES = 30;
const MAX_SETBACKS = 12;
const MAX_TERM = 600;
const INSTALMENT_FREQS = ['weekly', 'fortnightly', 'monthly', 'quarterly'] as const satisfies readonly InstalmentFreq[];

/** D-89: a stored 'next_month' (the retired name of 'next_period') is read as 'next_period'; the type no longer has it. */
function readFirstPayment(value: unknown): 'today' | 'next_period' {
  if (value === 'next_month') return 'next_period';
  return oneOf(value, ['today', 'next_period'] as const) ?? 'today';
}
const CUSTOM_NAME_MAX = 40;
const HUNDRED: Percent = percent('100');
const RATE_PATTERN = /^\d{1,4}(\.\d{1,10})?$/;
const CURRENCY_PATTERN = /^[A-Z0-9]{2,4}$/;

/** The engine's percent grammar: 1 to 4 digits, optionally up to 10 decimals; blank is not a rate. */
export function isValidRateText(s: string): boolean {
  return RATE_PATTERN.test(s);
}
/** A typed APR: the grammar and at most MAX_APR. */
export function isValidAprText(s: string): boolean {
  return isValidRateText(s) && percent(s) <= MAX_APR;
}
/**
 * IN-C01: whether rate text being typed (a trailing point allowed) is above `max`, compared as a percent and never
 * through Number(). Text that is not yet a rate is not above anything.
 */
export function typedRateAbove(text: string, max: string): boolean {
  const whole = text.endsWith('.') ? text.slice(0, -1) : text;
  return isValidRateText(whole) && percent(whole) > percent(max);
}
/** D-48: a projection rate is at most the engine's MAX_PROJECTION_RATE a year. */
export function isValidProjectionRateText(s: string): boolean {
  return isValidRateText(s) && percent(s) <= MAX_PROJECTION_RATE;
}
const isPercentTo100 = (s: string): boolean => isValidRateText(s) && percent(s) <= HUNDRED;

// ── safe readers for untrusted JSON ──
type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const minor = (v: unknown): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAX_INPUT_MINOR ? v : null;
const intIn = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi ? v : null;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => allowed.find((a) => a === v) ?? null;
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const idText = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v.slice(0, 80) : null);

function uniqueId(raw: unknown, prefix: string, index: number, seen: Set<string>): string {
  let id = idText(raw) ?? `${prefix}${index}`;
  let n = 0;
  while (seen.has(id)) {
    n += 1;
    id = `${prefix}${index}-${n}`;
  }
  seen.add(id);
  return id;
}

const CATEGORIES: readonly RunningCostCategory[] = ['insurance', 'fuel', 'maintenance', 'registration', 'loss_of_value'];
const SETBACK_CODES: readonly SetbackCode[] = ['unexpected_expense', 'income_drop', 'job_loss', 'late_invoice'];
const ALL_METHODS: readonly MethodKey[] = [...PAY_METHODS, 'lump', 'monthly'];

/** The step 2 setback lines as the engine's defaults (never enabled): one line per DEFAULT_SETBACKS entry. */
function defaultSetbackLines(): SetbackLine[] {
  return DEFAULT_SETBACKS.map((s, i) => defaultSetbackLine(s.code, `sb-${i + 1}`));
}
function defaultSetbackLine(code: SetbackCode, id: string): SetbackLine {
  const d = DEFAULT_SETBACKS.find((s) => s.code === code)!;
  return {
    id,
    code,
    enabled: false,
    amount: null,
    percentDrop: d.code === 'income_drop' ? d.percentDrop : 0,
    months: d.code === 'income_drop' || d.code === 'job_loss' ? d.months : 0,
    daysLate: d.code === 'late_invoice' ? d.daysLate : 0,
  };
}

export function emptyCheckInputs(kind: 'buy' | 'invest', _today: string): CheckInputs {
  return {
    v: 1,
    currency: null,
    kind,
    name: '',
    source: '',
    itemType: 'general',
    itemTypeTouched: false,
    advertised: null,
    needBy: null,
    why: '',
    adjustments: [],
    runningCosts: [],
    lossOfValue: null,
    replaces: [],
    method: null,
    loan: { deposit: 0, termMonths: 48, aprText: '', secured: false, securedTouched: false, aprFromQuick: false, promo: null, variable: false },
    instalment: { amount: null, count: null, lateFee: null, hasRate: false, aprText: '', firstPayment: 'today', freq: 'monthly' },
    card: { accountId: null, payoff: 'months', months: 12, promo: null, variable: false, fees: null },
    investTermMonths: null,
    setbacks: defaultSetbackLines(),
    projectionRates: [],
    investHorizonMonths: null,
    investHoldingFeeText: null,
    combine: true,
    coolingOff: false,
    incomeChange: null,
    cheaperPrice: null,
    customItemType: null,
    investReturnText: null,
    lumpHorizonMonths: null,
    wait: { monthlyAmount: null },
    outcome: null,
    goAccountId: null,
    investAccountId: null,
    scope: 'personal',
    split: null,
    cardNotes: { incomeStops: null, noNewSpending: null, jobLossCover: null },
  };
}

/** 04 DEC-11: a loan is secured exactly when the item is a vehicle, until the user touches the toggle. */
export function securedDefault(itemType: ItemType): boolean {
  return itemType === 'vehicle';
}

export function defaultQuickInputs(): QuickInputs {
  return { name: '', price: null, mode: 'cash', aprText: '0', termMonths: 12, taxText: '', fees: null };
}

// ── parse ──
function parsePromo(v: unknown): PromoInput | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = asObj(v);
  const aprText = typeof o.aprText === 'string' ? o.aprText : '';
  const months = o.months === null || o.months === undefined ? null : intIn(o.months, 1, MAX_TERM);
  if ((aprText !== '' && !isValidAprText(aprText)) || (months === null && o.months !== null && o.months !== undefined)) return null;
  return { aprText, months, deferredInterest: flag(o.deferredInterest, false) };
}

function parseLines(v: unknown, prefix: string): InputLine[] {
  const seen = new Set<string>();
  return list(v, MAX_LINES).map((raw, i) => {
    const o = asObj(raw);
    return {
      id: uniqueId(o.id, prefix, i, seen),
      name: text(o.name, 80),
      amount: minor(o.amount) ?? 0,
      note: text(o.note, 200),
      counted: flag(o.counted, true),
      seriesId: idText(o.seriesId),
      category: oneOf(o.category, CATEGORIES),
    };
  });
}

function parseAdjustments(v: unknown): AdjustmentLine[] {
  const seen = new Set<string>();
  return list(v, MAX_LINES).map((raw, i) => {
    const o = asObj(raw);
    const tax = typeof o.taxPercentText === 'string' && isPercentTo100(o.taxPercentText) ? o.taxPercentText : null;
    return {
      id: uniqueId(o.id, 'adj-', i, seen),
      name: text(o.name, 80),
      amount: minor(o.amount) ?? 0,
      note: text(o.note, 200),
      counted: flag(o.counted, true),
      effect: o.effect === 'takes_off' ? 'takes_off' : 'adds',
      onDay: flag(o.onDay, false),
      taxPercentText: tax,
    };
  });
}

function parseSetbacks(v: unknown): SetbackLine[] {
  if (!Array.isArray(v)) return defaultSetbackLines();
  const seen = new Set<string>();
  const out: SetbackLine[] = [];
  for (const [i, raw] of v.slice(0, MAX_SETBACKS).entries()) {
    const o = asObj(raw);
    const code = oneOf(o.code, SETBACK_CODES);
    if (code === null) continue;
    const d = defaultSetbackLine(code, uniqueId(o.id, 'sb-x', i, seen));
    out.push({
      ...d,
      enabled: flag(o.enabled, false),
      amount: minor(o.amount),
      percentDrop: intIn(o.percentDrop, 0, 100) ?? d.percentDrop,
      months: intIn(o.months, 0, MAX_TERM) ?? d.months,
      daysLate: intIn(o.daysLate, 0, 365) ?? d.daysLate,
    });
  }
  return out;
}

function parseLossOfValue(v: unknown): LossOfValueEntry | null {
  const o = asObj(v);
  if (o.kind === 'amount') {
    const monthly = minor(o.monthly);
    return monthly !== null && monthly > 0 ? { kind: 'amount', monthly } : null;
  }
  const t = o.percentText;
  if (o.kind === 'percent_per_year' && typeof t === 'string' && isPercentTo100(t) && percent(t) !== ZERO_PERCENT) {
    return { kind: 'percent_per_year', percentText: t };
  }
  return null;
}

function parseRates(o: Obj): string[] {
  const typed = list(o.projectionRates, 100).filter((r): r is string => typeof r === 'string' && isValidProjectionRateText(r));
  const unique = [...new Set(typed)].slice(0, 3);
  const legacy = o.projectionReturnText; // drafts saved before the one rate list (part 2)
  return unique.length === 0 && typeof legacy === 'string' && isValidProjectionRateText(legacy) ? [legacy] : unique;
}

/** D-83: the exact cheaper price; an old whole-percent ratio becomes ceil(advertised x percent / 100) so the figure is kept to the cent. */
function parseCheaperPrice(o: Obj, advertised: number | null): number | null {
  if (advertised === null || advertised <= 0) return null;
  const { min, max } = cheaperBounds(advertised);
  const exact = intIn(o.cheaperPrice, min, max);
  if (exact !== null) return exact;
  const pct = intIn(o.cheaperRatioPercent, 30, 100);
  return pct === null ? null : cheaperPriceForPercent(advertised, pct);
}

/** ceil(advertised x percent / 100): the exact cheaper price for a whole percent of the advertised price. */
export function cheaperPriceForPercent(advertised: number, percentOfAdvertised: number): number {
  return Number(ceilDivide(BigInt(advertised) * BigInt(percentOfAdvertised), 100n));
}

/** D-81 / R15.4: a custom item type is kept only with a 1-40 character name and a known (or no) rules type. */
function parseCustomItemType(v: unknown): CheckInputs['customItemType'] {
  const o = asObj(v);
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (name.length < 1 || name.length > CUSTOM_NAME_MAX) return null;
  if (o.treatLike === null || o.treatLike === undefined) return { name, treatLike: null };
  const treatLike = oneOf(o.treatLike, ITEM_TYPES);
  return treatLike === null ? null : { name, treatLike };
}

function parseIncomeChange(v: unknown): CheckInputs['incomeChange'] {
  const o = asObj(v);
  const direction = oneOf(o.direction, ['raises', 'lowers'] as const);
  const likelihood = oneOf(o.likelihood, ['likely', 'uncertain'] as const);
  if (direction === null || likelihood === null) return null;
  const amount = minor(o.amount);
  const startDate = typeof o.startDate === 'string' && isValidLocalDate(o.startDate) ? o.startDate : null;
  return { direction, amount: amount !== null && amount > 0 ? amount : null, startDate, likelihood };
}

function parseSplit(v: unknown): CheckInputs['split'] {
  const o = asObj(v);
  const kind = oneOf(o.kind, ['even', 'weight', 'amount', 'mine'] as const);
  if (kind === null) return null;
  const nums = (x: unknown): number[] => list(x, 50).filter((n): n is number => minor(n) !== null);
  return { kind, weights: nums(o.weights), amounts: nums(o.amounts) };
}

const note = (v: unknown): CardNoteAnswer => oneOf(v, ['yes', 'no', 'unsure'] as const);

/** Total: returns a valid CheckInputs for any JSON, clamping or resetting what is out of bounds. Never throws. */
export function parseCheckInputs(json: unknown, today: string): CheckInputs {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return emptyCheckInputs('buy', today);
  const o = json as Obj;
  const empty = emptyCheckInputs(o.kind === 'invest' ? 'invest' : 'buy', today);
  const customItemType = parseCustomItemType(o.customItemType);
  const itemType = customItemType === null ? (oneOf(o.itemType, ITEM_TYPES) ?? empty.itemType) : (customItemType.treatLike ?? 'general');
  const advertised = minor(o.advertised);
  const loan = asObj(o.loan);
  const inst = asObj(o.instalment);
  const card = asObj(o.card);
  const securedTouched = flag(loan.securedTouched, false);
  const loanApr = typeof loan.aprText === 'string' && isValidAprText(loan.aprText) ? loan.aprText : '';
  const fee = typeof o.investHoldingFeeText === 'string' && isPercentTo100(o.investHoldingFeeText) ? o.investHoldingFeeText : null;
  const cardNotes = asObj(o.cardNotes);
  return {
    ...empty,
    currency: typeof o.currency === 'string' && CURRENCY_PATTERN.test(o.currency) ? o.currency : null,
    name: text(o.name, 80),
    source: text(o.source, 80),
    itemType,
    itemTypeTouched: flag(o.itemTypeTouched, false),
    advertised,
    needBy: typeof o.needBy === 'string' && isValidLocalDate(o.needBy) ? o.needBy : null,
    why: text(o.why, 500),
    adjustments: parseAdjustments(o.adjustments),
    runningCosts: parseLines(o.runningCosts, 'rc-'),
    lossOfValue: parseLossOfValue(o.lossOfValue),
    replaces: parseLines(o.replaces, 'rp-'),
    method: oneOf(o.method, ALL_METHODS),
    loan: {
      deposit: minor(loan.deposit) ?? 0,
      termMonths: intIn(loan.termMonths, 1, MAX_TERM),
      aprText: loanApr,
      secured: securedTouched ? flag(loan.secured, false) : securedDefault(itemType),
      securedTouched,
      aprFromQuick: flag(loan.aprFromQuick, false),
      promo: parsePromo(loan.promo),
      variable: flag(loan.variable, false),
    },
    instalment: {
      amount: minor(inst.amount),
      count: intIn(inst.count, 1, MAX_TERM),
      lateFee: minor(inst.lateFee),
      hasRate: flag(inst.hasRate, false),
      aprText: typeof inst.aprText === 'string' && isValidAprText(inst.aprText) ? inst.aprText : '',
      // D-89: a stored 'next_month' reads as 'next_period'; an absent or unknown freq is 'monthly'. The count stays 1..600:
      // a stored count above the new input bound of 500 is kept and scored as stored (R16.16 M6).
      firstPayment: readFirstPayment(inst.firstPayment),
      freq: oneOf(inst.freq, INSTALMENT_FREQS) ?? 'monthly',
    },
    card: {
      accountId: idText(card.accountId),
      payoff: oneOf(card.payoff, ['full', 'months', 'minimum'] as const) ?? 'months',
      months: intIn(card.months, 1, MAX_TERM) ?? 12,
      promo: parsePromo(card.promo),
      variable: flag(card.variable, false),
      fees: minor(card.fees),
    },
    investTermMonths: intIn(o.investTermMonths, 1, MAX_TERM),
    setbacks: parseSetbacks(o.setbacks),
    projectionRates: parseRates(o),
    investHorizonMonths: intIn(o.investHorizonMonths, 1, MAX_TERM),
    investHoldingFeeText: fee,
    combine: flag(o.combine, true),
    coolingOff: flag(o.coolingOff, false),
    incomeChange: parseIncomeChange(o.incomeChange),
    cheaperPrice: parseCheaperPrice(o, advertised),
    customItemType,
    investReturnText: typeof o.investReturnText === 'string' && isValidProjectionRateText(o.investReturnText) ? o.investReturnText : null,
    lumpHorizonMonths: intIn(o.lumpHorizonMonths, 1, MAX_TERM),
    wait: { monthlyAmount: minor(asObj(o.wait).monthlyAmount) },
    outcome: oneOf(o.outcome, ['go', 'wait', 'pass'] as const),
    goAccountId: idText(o.goAccountId),
    investAccountId: idText(o.investAccountId),
    scope: o.scope === 'household' ? 'household' : 'personal',
    split: parseSplit(o.split),
    cardNotes: { incomeStops: note(cardNotes.incomeStops), noNewSpending: note(cardNotes.noNewSpending), jobLossCover: note(cardNotes.jobLossCover) },
  };
}

// ── quick carry (D-23) ──
/** "Run the full check": every quick field becomes a full-check field. Names are labelled by the screen, never stored. */
export function quickToCheckInputs(q: QuickInputs, today: string, currency: string | null = null): CheckInputs {
  const itemType = suggestItemType(q.name);
  const base = emptyCheckInputs('buy', today);
  const price = q.price !== null && Number.isSafeInteger(q.price) && q.price > 0 && q.price <= MAX_INPUT_MINOR ? minorUnits(q.price) : null;
  const adjustments: AdjustmentLine[] = [];
  if (price !== null && isPercentTo100(q.taxText)) {
    adjustments.push({
      id: 'adj-tax', name: '', amount: salesTaxOf(price, percent(q.taxText)), note: '', counted: true,
      effect: 'adds', onDay: true, taxPercentText: q.taxText,
    });
  }
  if (q.fees !== null && Number.isSafeInteger(q.fees) && q.fees > 0 && q.fees <= MAX_INPUT_MINOR) {
    adjustments.push({ id: 'adj-fees', name: '', amount: q.fees, note: 'fees', counted: true, effect: 'adds', onDay: true, taxPercentText: null });
  }
  return {
    ...base,
    // IN-B06: the currency the quick amounts were typed and judged in, and only a validated price.
    currency,
    name: q.name.slice(0, 80),
    itemType,
    itemTypeTouched: false,
    advertised: price,
    method: q.mode === 'cash' ? 'cash' : 'loan',
    adjustments,
    loan: {
      ...base.loan,
      deposit: 0,
      termMonths: q.termMonths,
      aprText: q.aprText === '' ? '0' : q.aprText,
      aprFromQuick: true,
      secured: securedDefault(itemType),
      securedTouched: false,
    },
  };
}

// ── final price ──
function taxPercentOf(line: AdjustmentLine): Percent | null {
  return line.taxPercentText !== null && isPercentTo100(line.taxPercentText) ? percent(line.taxPercentText) : null;
}

/** WR-B07: the price after tax, fees and trade-ins, in the currency the check was typed in; null with no price. */
export function finalPriceOf(inputs: Pick<CheckInputs, 'advertised' | 'adjustments'>): MinorUnits | null {
  if (inputs.advertised === null) return null;
  const adv = minorUnits(inputs.advertised);
  // a tax-% line recomputes from the advertised price at call time
  return priceAfterLines(
    adv,
    inputs.adjustments.map((l) => {
      const tax = taxPercentOf(l);
      return { amount: tax === null ? minorUnits(l.amount) : salesTaxOf(adv, tax), effect: l.effect, counted: l.counted };
    })
  );
}
