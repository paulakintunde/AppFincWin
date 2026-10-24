/**
 * The D-44 day-by-day 90-day cash path as pure functions.
 *
 * - The path WITHOUT the purchase starts from cashOnHand (never from cash after the D-24 deduction) and applies every
 *   confirmed series on its own dates: pay in (mine, never shared), bills out at my share (D-34). The 90-day bills are
 *   therefore counted once, on their dates, never also as a lump (D-24/D-44 amended).
 * - D-61: snapshot.scheduledOutflows sit on their own dates (dated on or before asOf on day 0, later than asOf + 90 days
 *   ignored) through scheduledOutflowsDue, at the amount given (already my share). Both paths carry them because the
 *   path with the purchase is applyOutflows(path without, purchase flows).
 * - D-59: undated spending and the minimum debt payments are spread evenly by day (spreadUndatedSpending, the replan's
 *   expansion default 1, accepted by the user), so the path never overstates cash. Saving and investing are not
 *   deducted: they are pausable (D-35). The dip measure (dipShortfall) and the cash_tight_before_payday fact are D-59's.
 * - Confirmed series only (D-25); this file imports schedule.ts, never `../recurring` or detect.ts. Leap days are
 *   ignored (DAYS_PER_YEAR, cited in constants.ts). No float maths and no clock.
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';
import { occurrenceDate, occurrencesBetween } from '../recurring/schedule';
import { isValidLocalDate } from '../time/localDate';
import { CASH_PATH_DAYS, DAYS_PER_YEAR, MONTHS_PER_YEAR } from './constants';
import { assertCurrency } from './currency';
import { shareForCategory } from './money';
import { myPart, type ResolvedShare } from './share';
import { addDays, assertValidBill, monthlyEquivalent, scheduledOutflowsDue } from './series';
import type {
  CashDip,
  CashDipInput,
  CashPathBase,
  CashPathPoint,
  CashPathReport,
  CashTightFact,
  DatedAmount,
  DecideSnapshot,
  MoneyBasis,
  Plan,
  RecurringIncome,
  SpendingShare,
} from './types';

const MS_PER_DAY = 86_400_000;

function utcDay(date: string): number {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, mo - 1, d) / MS_PER_DAY;
}

/** Whole days from asOf to date; RangeError outside [0, days]. */
function dayIndex(asOf: string, date: string, days: number, fn: string): number {
  if (!isValidLocalDate(date)) {
    throw new RangeError(`${fn}: "${date}" is not a valid local date`);
  }
  const idx = utcDay(date) - utcDay(asOf);
  if (idx < 0 || idx > days) {
    throw new RangeError(`${fn}: ${date} is outside the ${days}-day path from ${asOf}`);
  }
  return idx;
}

/**
 * Dates of a confirmed series inside the path window (the same window as 04-05's billsDueWithin, so D-24 and D-44 share
 * one meaning of "within 90 days"). A date after the last settled one that falls before asOf (unpaid, earlier in the
 * check's month) moves to day 0 ('day_zero', for bills) or is dropped ('drop', for pay never received).
 */
export function seriesDatesInPath(
  series: RecurringIncome,
  asOf: string,
  days: number,
  pastDue: 'day_zero' | 'drop'
): readonly string[] {
  assertValidBill(series, 'seriesDatesInPath');
  if (!series.confirmed) return [];
  const dates: string[] = [];
  const found = occurrencesBetween(
    {
      anchorDate: series.anchorDate,
      freq: series.freq,
      endDate: series.endDate,
      occurrenceCount: series.occurrenceCount,
    },
    `${asOf.slice(0, 7)}-01`,
    addDays(asOf, days)
  );
  for (const o of found) {
    if (series.lastPaidDate !== null && o.date <= series.lastPaidDate) continue;
    if (o.date < asOf) {
      if (pastDue === 'day_zero') dates.push(asOf);
    } else {
      dates.push(o.date);
    }
  }
  return dates;
}

/**
 * Cumulative undated spending through the end of day `day` (D-59, expansion default 1): half-up of
 * spreadMonthly x 12 x (day + 1) / 365. Cumulative rounding means the daily amounts never drift. The ONLY place the
 * spread arithmetic lives.
 */
export function spreadUndatedSpending(spreadMonthly: MinorUnits, day: number): MinorUnits {
  if (!Number.isSafeInteger(spreadMonthly) || spreadMonthly < 0) {
    throw new RangeError(`spreadUndatedSpending: spreadMonthly must be a non-negative integer, got ${spreadMonthly}`);
  }
  if (!Number.isSafeInteger(day) || day < 0) {
    throw new RangeError(`spreadUndatedSpending: day must be a non-negative integer, got ${day}`);
  }
  return minorFromBigInt(
    divideHalfUp(BigInt(spreadMonthly) * BigInt(MONTHS_PER_YEAR) * BigInt(day + 1), BigInt(DAYS_PER_YEAR)),
    'spreadUndatedSpending'
  );
}

/** balance[d] = opening + inflows(<= d) - outflows(<= d) - spreadUndatedSpending(spreadMonthly, d). */
export function buildCashPath(input: {
  readonly asOf: string;
  readonly days: number;
  readonly opening: MinorUnits;
  readonly inflows: readonly DatedAmount[];
  readonly outflows: readonly DatedAmount[];
  readonly spreadMonthly: MinorUnits;
}): CashPathBase {
  const { asOf, days, opening, inflows, outflows, spreadMonthly } = input;
  if (!isValidLocalDate(asOf)) {
    throw new RangeError(`buildCashPath: asOf "${asOf}" is not a valid local date`);
  }
  if (!Number.isSafeInteger(days) || days < 0) {
    throw new RangeError(`buildCashPath: days must be a non-negative integer, got ${days}`);
  }
  if (!Number.isSafeInteger(spreadMonthly) || spreadMonthly < 0) {
    throw new RangeError(`buildCashPath: spreadMonthly must be a non-negative integer, got ${spreadMonthly}`);
  }
  const delta: bigint[] = Array.from({ length: days + 1 }, () => 0n);
  for (const f of inflows) delta[dayIndex(asOf, f.date, days, 'buildCashPath')]! += BigInt(f.amount);
  for (const f of outflows) delta[dayIndex(asOf, f.date, days, 'buildCashPath')]! -= BigInt(f.amount);
  const balances: MinorUnits[] = [];
  let running = BigInt(opening);
  for (let d = 0; d <= days; d++) {
    running += delta[d]!;
    balances.push(minorFromBigInt(running - BigInt(spreadUndatedSpending(spreadMonthly, d)), 'buildCashPath'));
  }
  return { asOf, balances };
}

/**
 * The 90-day path without the purchase, or null when no confirmed income series exists (cash_path_unavailable, D-25,
 * D-44). Pay is mine; bills are shared per category (D-34). A confirmed series' monthly equivalent is moved out of the
 * spread (it is already inside spendingBasis through D-23 smoothing). D-61: scheduled outflows are appended unchanged.
 */
export function cashPathForSnapshot(input: {
  readonly snapshot: DecideSnapshot;
  readonly money: MoneyBasis;
  readonly spendingShare: SpendingShare;
  readonly debtPayments: MinorUnits;
  readonly protectedCash: MinorUnits; // D-101: the slice of cash held in pots; the path opens without it
}): CashPathBase | null {
  const { snapshot, money, spendingShare, debtPayments, protectedCash } = input;
  const fn = 'cashPathForSnapshot';
  const pays = snapshot.incomeSeries.filter((s) => s.confirmed);
  if (pays.length === 0) return null;
  const inflows: DatedAmount[] = [];
  for (const s of pays) {
    assertValidBill(s, fn);
    assertCurrency(snapshot.currency, s.currency, `income series ${s.seriesId}`, fn);
    for (const date of seriesDatesInPath(s, snapshot.asOf, CASH_PATH_DAYS, 'drop')) {
      inflows.push({ date, amount: s.latestAmount });
    }
  }
  const outflows: DatedAmount[] = [];
  let seriesMonthly = 0n;
  for (const b of snapshot.bills) {
    assertValidBill(b, fn);
    if (!b.confirmed) continue;
    assertCurrency(snapshot.currency, b.currency, `bill ${b.seriesId}`, fn);
    const share = shareForCategory(spendingShare, b.categoryId);
    for (const date of seriesDatesInPath(b, snapshot.asOf, CASH_PATH_DAYS, 'day_zero')) {
      outflows.push({ date, amount: myPart(b.latestAmount, share) });
    }
    seriesMonthly += BigInt(myPart(monthlyEquivalent(b.latestAmount, b.freq), share));
  }
  for (const o of snapshot.scheduledOutflows) {
    assertCurrency(snapshot.currency, o.currency, `scheduled outflow ${o.id}`, fn);
  }
  outflows.push(...scheduledOutflowsDue(snapshot.scheduledOutflows, snapshot.asOf, CASH_PATH_DAYS).dated);
  const undated = BigInt(money.spendingBasis) - seriesMonthly;
  const spreadMonthly = minorFromBigInt((undated > 0n ? undated : 0n) + BigInt(debtPayments), fn);
  return buildCashPath({
    asOf: snapshot.asOf,
    days: CASH_PATH_DAYS,
    opening: minorFromBigInt(BigInt(snapshot.cashOnHand) - BigInt(protectedCash), fn),
    inflows,
    outflows,
    spreadMonthly,
  });
}

/** The household payment due in month k after day one (0 when no step covers it). */
function stepAmount(plan: Plan, k: number): MinorUnits {
  const step = plan.paymentSteps.find((s) => s.fromMonth <= k && k <= s.toMonth);
  return step === undefined ? (0 as MinorUnits) : step.amount;
}

/**
 * The purchase as dated outflows at my share: the day-one cost on asOf, then each PaymentStep amount plus the running
 * costs on the monthly dates asOf + k months (schedule month-end clamping) inside the window (D-44, D-48 step amounts).
 */
export function purchaseFlows(input: {
  readonly plan: Plan;
  readonly runningNet: MinorUnits;
  readonly share: ResolvedShare;
  readonly asOf: string;
  readonly days: number;
}): readonly DatedAmount[] {
  const { plan, runningNet, share, asOf, days } = input;
  const flows: DatedAmount[] = [];
  const dayOne = myPart(plan.dayOne, share);
  if (dayOne !== 0) flows.push({ date: asOf, amount: dayOne });
  const windowEnd = addDays(asOf, days);
  const running = BigInt(myPart(runningNet, share));
  if (plan.freq !== undefined && plan.freq !== 'monthly') {
    // D-89: paymentSteps are indexed by payment period; payment k falls on occurrenceDate(asOf, freq, k). The monthly
    // running costs keep their monthly dates as separate flows.
    for (let k = 1; ; k++) {
      const date = occurrenceDate(asOf, plan.freq, k);
      if (date > windowEnd) break;
      const amount = myPart(stepAmount(plan, k), share);
      if (amount !== 0) flows.push({ date, amount });
    }
    if (running !== 0n) {
      for (let k = 1; ; k++) {
        const date = occurrenceDate(asOf, 'monthly', k);
        if (date > windowEnd) break;
        flows.push({ date, amount: minorFromBigInt(running, 'purchaseFlows') });
      }
    }
    return flows;
  }
  for (let k = 1; ; k++) {
    const date = occurrenceDate(asOf, 'monthly', k);
    if (date > windowEnd) break;
    const amount = minorFromBigInt(BigInt(myPart(stepAmount(plan, k), share)) + running, 'purchaseFlows');
    if (amount !== 0) flows.push({ date, amount });
  }
  return flows;
}

/** Subtracts each flow from its day onward; returns a new path and never mutates `base`. */
export function applyOutflows(base: CashPathBase, flows: readonly DatedAmount[]): CashPathBase {
  const days = base.balances.length - 1;
  const delta: bigint[] = Array.from({ length: days + 1 }, () => 0n);
  for (const f of flows) delta[dayIndex(base.asOf, f.date, days, 'applyOutflows')]! += BigInt(f.amount);
  let cumulative = 0n;
  const balances = base.balances.map((b, d) => {
    cumulative += delta[d]!;
    return minorFromBigInt(BigInt(b) - cumulative, 'applyOutflows');
  });
  return { asOf: base.asOf, balances };
}

/** The lowest day of a path; ties go to the earliest day. */
export function lowestPoint(path: CashPathBase): CashPathPoint {
  let day = 0;
  for (let d = 1; d < path.balances.length; d++) {
    if (path.balances[d]! < path.balances[day]!) day = d;
  }
  return { day, date: addDays(path.asOf, day), amount: path.balances[day]! };
}

function assertReserve(reserve: MinorUnits, fn: string): void {
  if (!Number.isSafeInteger(reserve) || reserve < 0) {
    throw new RangeError(`${fn}: reserve must be a non-negative integer, got ${reserve}`);
  }
}

/**
 * A dip that exists without the purchase is a fact, never a warning (D-59): the without-purchase low when it is
 * strictly below the reserve. It changes no state.
 */
export function cashTightFact(lowestWithout: CashPathPoint, reserve: MinorUnits): CashTightFact | null {
  assertReserve(reserve, 'cashTightFact');
  if (lowestWithout.amount >= reserve) return null;
  return { code: 'cash_tight_before_payday', date: lowestWithout.date, amount: lowestWithout.amount };
}

/** The Phase 5 report: both paths and their lowest days, or unavailable (D-44); carries the D-59 tight fact. */
export function cashPathReport(
  without: CashPathBase | null,
  withPurchase: CashPathBase | null,
  reserve: MinorUnits
): CashPathReport {
  if (without === null && withPurchase === null) {
    return { status: 'unavailable', code: 'cash_path_unavailable' };
  }
  if (without === null || withPurchase === null) {
    throw new RangeError('cashPathReport: both paths or neither');
  }
  const lowestWithout = lowestPoint(without);
  return {
    status: 'available',
    withoutPurchase: without.balances,
    withPurchase: withPurchase.balances,
    lowestWithout,
    lowestWith: lowestPoint(withPurchase),
    tightBeforePayday: cashTightFact(lowestWithout, reserve),
  };
}

/**
 * The two rooms behind the D-59 measure (bigint). roomX = how far the with-purchase low sits above line X, counting
 * only the purchase-caused part of the `cash` card (max(0, min(line, cashOnHand) - cashAfter)): a reserve gap that
 * exists before the purchase is never subtracted (W1).
 */
function rooms(input: CashDipInput, fn: string): { readonly reserve: bigint; readonly zero: bigint } {
  assertReserve(input.reserve, fn);
  for (const v of [input.lowestWith, input.lowestWithout, input.cashAfter, input.cashOnHand]) {
    if (!Number.isSafeInteger(v)) throw new RangeError(`${fn}: every figure must be a safe integer, got ${v}`);
  }
  const reserve = BigInt(input.reserve);
  const onHand = BigInt(input.cashOnHand);
  const after = BigInt(input.cashAfter);
  const lowWith = BigInt(input.lowestWith);
  const lowWithout = BigInt(input.lowestWithout);
  const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);
  const max0 = (a: bigint): bigint => (a > 0n ? a : 0n);
  return {
    reserve: lowWith - min(reserve, lowWithout) + max0(min(reserve, onHand) - after),
    zero: lowWith - min(0n, lowWithout) + max0(min(0n, onHand) - after),
  };
}

/**
 * The extra depth the purchase adds below the reserve (or below 0), less the part of the `cash` check gap the purchase
 * itself caused (D-59; one card per cause, D-24/D-44 amended). Fires only when the purchase causes or deepens the dip
 * (lowestWith below lowestWithout). The layer at zero exists so a purchase that takes the path below 0 can never be
 * absorbed by a cash-card gap measured at the reserve. Always >= 0.
 */
export function dipShortfall(input: CashDipInput): MinorUnits {
  const r = rooms(input, 'dipShortfall');
  const atReserve = r.reserve < 0n ? -r.reserve : 0n;
  const atZero = r.zero < 0n ? -r.zero : 0n;
  return minorFromBigInt(atReserve > atZero ? atReserve : atZero, 'dipShortfall');
}

/**
 * Signed cash-path margin for the D-43 `cash_path` line, on the same measure as dipShortfall: negative = failed by the
 * dip shortfall; >= 0 = how far the with-purchase low could fall, day-one cost unchanged, before cash_dip would fire
 * (0 when the low already sits on its line without the purchase, the cash_tight_before_payday case).
 */
export function cashPathMargin(input: CashDipInput): MinorUnits {
  const r = rooms(input, 'cashPathMargin');
  return minorFromBigInt(r.reserve < r.zero ? r.reserve : r.zero, 'cashPathMargin');
}

/**
 * cash_dip (D-44, D-59): hard when the with-purchase low is below 0 (state no), otherwise soft (below the reserve, at
 * least adjust). Null unless the purchase causes or deepens the dip beyond what the `cash` card already shows.
 */
export function classifyCashDip(input: CashDipInput): CashDip | null {
  const extra = dipShortfall(input);
  if (extra === 0) return null;
  return { severity: input.lowestWith < 0 ? 'hard' : 'soft', shortfall: extra };
}
