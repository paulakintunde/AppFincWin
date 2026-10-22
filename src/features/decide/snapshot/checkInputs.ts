/**
 * 05-07: PURE. JSON inputs in (no bigint stored), engine objects out (memory only, D-15). Barrel imports only.
 *
 * Validation, the quick-check carry (D-23) and the mapping from stored CheckInputs to the engine's PurchaseCheck.
 * Nothing here supplies a rate, a fee, a promotion or a loss of value: every credit term reaches the engine only when the
 * user typed it (D-07, D-30, D-32, D-42, 04 D-63).
 */
import {
  DEFAULT_SETBACKS,
  ITEM_TYPES,
  MAX_PROJECTION_RATE,
  ZERO_PERCENT,
  lossOfValueMonthly,
  netRunningCosts,
  percent,
  resolvePriceInputs,
  salesTaxAmount,
  suggestItemType,
  withPrice,
} from '@/engine/decide';
import type {
  BuyCheck,
  BuyPayment,
  CostLine,
  CurrencyCode,
  InvestCheck,
  ItemType,
  LossOfValueInput,
  MinorUnits,
  Percent,
  PriceAdjustment,
  PromoTerms,
  PurchaseCheck,
  ResolvedPrice,
  RunningCostCategory,
  RunningCosts,
  SetbackCode,
} from '@/engine/decide';
import { divideHalfUp, minorUnits } from '@/engine/money';
import { ONE_HUNDRED_PERCENT, PERCENT_SCALE, percentFromScaled } from '@/engine/payoff';
import { isValidLocalDate } from '@/engine/time';
import { PAY_METHODS } from './types';
import type {
  AdjustmentLine,
  CardChoice,
  CardNoteAnswer,
  CheckInputs,
  InputLine,
  LossOfValueEntry,
  MethodKey,
  PayMethod,
  PromoInput,
  QuickInputs,
  SetbackLine,
} from './types';

/** The most a typed APR may be (999.99% a year), so a schedule over 600 months can never overflow a safe integer. */
export const MAX_APR: Percent = percentFromScaled((PERCENT_SCALE * 99_999n) / 100n);
/** Every typed money amount is at most this many minor units (10^12), so engine sums stay inside safe integers. */
export const MAX_INPUT_MINOR = 1_000_000_000_000;

const MAX_LINES = 30;
const MAX_SETBACKS = 12;
const MAX_TERM = 600;
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
    instalment: { amount: null, count: null, lateFee: null },
    card: { accountId: null, payoff: 'months', months: 12, promo: null, variable: false, fees: null },
    investTermMonths: null,
    setbacks: defaultSetbackLines(),
    projectionRates: [],
    investHorizonMonths: null,
    investHoldingFeeText: null,
    combine: true,
    coolingOff: false,
    incomeChange: null,
    cheaperRatioPercent: null,
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

/** Step 1 and the name pre-fill: change the item type; an untouched secured toggle follows it. */
export function withItemType(inputs: CheckInputs, itemType: ItemType, touched: boolean): Partial<CheckInputs> {
  return {
    itemType,
    itemTypeTouched: touched || inputs.itemTypeTouched,
    loan: inputs.loan.securedTouched ? inputs.loan : { ...inputs.loan, secured: securedDefault(itemType) },
  };
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
  const itemType = oneOf(o.itemType, ITEM_TYPES) ?? empty.itemType;
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
    advertised: minor(o.advertised),
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
    instalment: { amount: minor(inst.amount), count: intIn(inst.count, 1, MAX_TERM), lateFee: minor(inst.lateFee) },
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
    cheaperRatioPercent: intIn(o.cheaperRatioPercent, 30, 100),
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
      id: 'adj-tax', name: '', amount: salesTaxAmount(price, percent(q.taxText)), note: '', counted: true,
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

// ── engine mapping ──
export interface EngineCtx {
  readonly currency: CurrencyCode;
  readonly cards: readonly CardChoice[];
  readonly dealerCap: MinorUnits | null;
}
export type EngineCheckResult =
  | { readonly ok: true; readonly check: PurchaseCheck; readonly resolvedPrice: ResolvedPrice; readonly running: RunningCosts }
  | { readonly ok: false; readonly missing: 'price' | 'method' };

/** The payment method a check is judged by: a buy needs one of the four; an invest is a lump unless monthly. */
export function effectiveMethod(inputs: CheckInputs): MethodKey | null {
  if (inputs.kind === 'invest') return inputs.method === 'monthly' ? 'monthly' : 'lump';
  return PAY_METHODS.find((m) => m === inputs.method) ?? null;
}

function taxPercentOf(line: AdjustmentLine): Percent | null {
  return line.taxPercentText !== null && isPercentTo100(line.taxPercentText) ? percent(line.taxPercentText) : null;
}

/** Each line as the engine's PriceAdjustment; a tax-% line recomputes from the given advertised price at call time. */
function priceAdjustments(lines: readonly AdjustmentLine[], advertised: MinorUnits): PriceAdjustment[] {
  return lines.map((l) => {
    const tax = taxPercentOf(l);
    return { id: l.id, amount: tax === null ? minorUnits(l.amount) : salesTaxAmount(advertised, tax), effect: l.effect, onDay: l.onDay, counted: l.counted };
  });
}

function costLine(l: InputLine): CostLine {
  const counted = l.counted && !(l.category !== null && l.amount === 0);
  return l.category === null
    ? { id: l.id, amount: minorUnits(l.amount), counted }
    : { id: l.id, amount: minorUnits(l.amount), counted, category: l.category };
}

/** WR-B07: the price after tax, fees and trade-ins, in the currency the check was typed in; null with no price. */
export function finalPriceOf(inputs: Pick<CheckInputs, 'advertised' | 'adjustments'>): MinorUnits | null {
  if (inputs.advertised === null) return null;
  const adv = minorUnits(inputs.advertised);
  return resolvePriceInputs({ advertised: adv, adjustments: priceAdjustments(inputs.adjustments, adv) }).price;
}

/**
 * CR-C02: one recurring bill is replaced at most once. A later counted line naming a series an earlier counted line already
 * replaces is dropped, so the saving is never subtracted twice. Lines with no series, and uncounted lines, are kept.
 */
export function uniqueReplaces(lines: readonly InputLine[]): InputLine[] {
  const taken = new Set<string>();
  return lines.filter((l) => {
    if (l.seriesId === null || !l.counted) return true;
    if (taken.has(l.seriesId)) return false;
    taken.add(l.seriesId);
    return true;
  });
}

function lossLine(entry: LossOfValueInput, inputs: { readonly advertised: MinorUnits }): CostLine {
  return { id: 'loss_of_value', amount: lossOfValueMonthly(entry, inputs.advertised), counted: true, category: 'loss_of_value' };
}

function lossInput(entry: LossOfValueEntry): LossOfValueInput | null {
  if (entry.kind === 'amount') return { kind: 'amount', monthly: minorUnits(entry.monthly) };
  return isPercentTo100(entry.percentText) ? { kind: 'percent_per_year', percentPerYear: percent(entry.percentText) } : null;
}

function promoTerms(promo: PromoInput | null): PromoTerms | undefined {
  if (promo === null || promo.months === null || !isValidAprText(promo.aprText)) return undefined;
  const apr = percent(promo.aprText);
  // D-42: the toggle is honoured only at a 0% promotion and never inferred
  return { apr, months: promo.months, deferredInterest: promo.deferredInterest === true && apr === ZERO_PERCENT };
}

function payment(inputs: CheckInputs, method: PayMethod, ctx: EngineCtx, price: MinorUnits): BuyPayment {
  switch (method) {
    case 'cash':
      return { method: 'cash' };
    case 'loan': {
      const promo = promoTerms(inputs.loan.promo);
      return {
        method: 'loan',
        deposit: minorUnits(Math.min(inputs.loan.deposit, price)),
        termMonths: inputs.loan.termMonths,
        apr: isValidAprText(inputs.loan.aprText) ? percent(inputs.loan.aprText) : null,
        ...(promo === undefined ? {} : { promo }),
        ...(inputs.loan.variable ? { variable: true } : {}),
      };
    }
    case 'instalment':
      return {
        method: 'instalment',
        instalmentAmount: inputs.instalment.amount === null ? null : minorUnits(inputs.instalment.amount),
        instalmentCount: inputs.instalment.count,
        ...(inputs.instalment.lateFee !== null && inputs.instalment.lateFee > 0 ? { lateFee: minorUnits(inputs.instalment.lateFee) } : {}),
      };
    case 'card': {
      const c = inputs.card;
      const promo = promoTerms(c.promo);
      const choice = c.accountId === null ? undefined : ctx.cards.find((x) => x.accountId === c.accountId);
      return {
        method: 'card',
        card: choice?.record ?? null,
        payoff: c.payoff === 'months' ? { kind: 'months', months: c.months } : { kind: c.payoff },
        dealerCap: ctx.dealerCap,
        ...(promo === undefined ? {} : { promo }),
        ...(c.variable ? { variable: true } : {}),
        ...(c.fees !== null && c.fees > 0 ? { cardFees: minorUnits(c.fees) } : {}),
      };
    }
  }
}

/** Stored inputs → the engine's check, the resolved price and the running costs. Pure; the caller supplies the context. */
export function toEngineCheck(inputs: CheckInputs, ctx: EngineCtx): EngineCheckResult {
  const advertised = inputs.advertised;
  if (advertised === null || !Number.isSafeInteger(advertised) || advertised <= 0 || advertised > MAX_INPUT_MINOR) return { ok: false, missing: 'price' };
  const method = effectiveMethod(inputs);
  if (method === null) return { ok: false, missing: 'method' };
  const adv = minorUnits(advertised);

  if (inputs.kind === 'invest') {
    const check: InvestCheck = {
      kind: 'invest',
      currency: ctx.currency,
      amount: adv,
      payment: method === 'monthly' ? { method: 'monthly', termMonths: inputs.investTermMonths } : { method: 'lump' },
    };
    return { ok: true, check, resolvedPrice: resolvePriceInputs({ advertised: adv, adjustments: [] }), running: netRunningCosts([], []) };
  }

  const resolvedPrice = resolvePriceInputs({ advertised: adv, adjustments: priceAdjustments(inputs.adjustments, adv) });
  const costs = inputs.runningCosts.filter((l) => l.category !== 'loss_of_value').map(costLine);
  const loss = inputs.lossOfValue === null ? null : lossInput(inputs.lossOfValue);
  if (loss !== null) costs.push(lossLine(loss, { advertised: adv }));
  const replaced = uniqueReplaces(inputs.replaces).filter((l) => l.category !== 'loss_of_value').map(costLine);
  const running = netRunningCosts(costs, replaced);
  const check: BuyCheck = {
    kind: 'buy',
    currency: ctx.currency,
    price: resolvedPrice.price,
    dayFees: resolvedPrice.dayFees,
    itemType: inputs.itemType,
    runningCostsNet: running.net,
    payment: payment(inputs, method as PayMethod, ctx, resolvedPrice.price),
    ...incomeChangeOf(inputs),
  };
  return { ok: true, check, resolvedPrice, running };
}

function incomeChangeOf(inputs: CheckInputs): Pick<BuyCheck, 'incomeChange'> | Record<string, never> {
  const c = inputs.incomeChange;
  if (c === null || c.amount === null || c.amount <= 0 || c.startDate === null) return {};
  return { incomeChange: { monthlyAmount: minorUnits(c.direction === 'lowers' ? -c.amount : c.amount), startDate: c.startDate, likelihood: c.likelihood } };
}

// ── re-price (D-49) ──
/**
 * The one place a re-price ("Use this price", "Use the cheaper price") is turned back into inputs. The advertised price is
 * solved so the resolved final price is the largest one at or under `finalPrice`, counting the tax-% lines that follow the
 * advertised price. Null when no positive advertised price fits.
 */
export function repriceInputs(
  inputs: CheckInputs,
  check: BuyCheck,
  _resolvedPrice: ResolvedPrice,
  finalPrice: MinorUnits,
  opts: { cheaperRatioPercent?: number } = {}
): Partial<CheckInputs> | null {
  let taxScaled = 0n;
  let fixed = 0n;
  for (const l of inputs.adjustments.filter((x) => x.counted)) {
    const sign = l.effect === 'adds' ? 1n : -1n;
    const tax = taxPercentOf(l);
    if (tax === null) fixed += sign * BigInt(l.amount);
    else taxScaled += sign * tax;
  }
  const denominator = ONE_HUNDRED_PERCENT + taxScaled;
  if (denominator <= 0n) return null;
  const numerator = (BigInt(finalPrice) - fixed) * ONE_HUNDRED_PERCENT;
  const start = Number(numerator / denominator);
  let advertised: MinorUnits | null = null;
  let reached = 0;
  for (let a = start + 2; a >= start - 2 && advertised === null; a -= 1) {
    if (a < 1) continue;
    const price = resolvePriceInputs({ advertised: minorUnits(a), adjustments: priceAdjustments(inputs.adjustments, minorUnits(a)) }).price;
    if (price <= finalPrice) {
      advertised = minorUnits(a);
      reached = price;
    }
  }
  if (advertised === null) return null;
  const patch: Partial<CheckInputs> = { advertised };
  const advertisedNow = advertised;
  if (inputs.adjustments.some((l) => taxPercentOf(l) !== null)) {
    patch.adjustments = inputs.adjustments.map((l) => {
      const tax = taxPercentOf(l);
      return tax === null ? l : { ...l, amount: salesTaxAmount(advertisedNow, tax) };
    });
  }
  const pay = check.payment;
  if (pay.method === 'instalment') {
    // the engine's own scaling, so the re-priced check is exactly the one the engine judged
    const scaled = withPrice(check, minorUnits(reached)) as BuyCheck;
    patch.instalment = { ...inputs.instalment, amount: (scaled.payment as { instalmentAmount: MinorUnits | null }).instalmentAmount };
  }
  if (pay.method === 'loan' && opts.cheaperRatioPercent !== undefined) {
    patch.loan = { ...inputs.loan, deposit: Number(divideHalfUp(BigInt(pay.deposit) * BigInt(opts.cheaperRatioPercent), 100n)) };
  }
  return patch;
}
