/**
 * Variable and seasonal income, month side (05.1-CONTEXT D-33 to D-37, D-39, D-48). Pure: the caller passes asOf.
 *
 * D-33: a variable or seasonal earner's month uses up to 12 months of history; a steady earner keeps 6.
 * D-34: income that swings (CV >= INCOME_SWING_CV_PERCENT over at least INCOME_SWING_MIN_MONTHS full months) makes the
 *       engine treat an unstated or unconfirmed-steady user as variable and ask; the stated pattern is never relabelled.
 * D-35: expected income for the month comes from a confirmed figure as given, else (only with 12 full months of
 *       records) the same month last year (seasonal) or the second-lowest month (variable).
 * D-36: lean months are the window months whose income is below the window's average; the lean leftover is the
 *       lowest leftover among them.
 * D-37: helpers for the months a purchase depends on, and the run of lean months it must outlast.
 * D-39: with 12 months of records, this month's everyday is judged against the same month last year.
 * D-48: volatile = variable or seasonal and the window income CV is at or above INCOME_VOLATILE_CV_PERCENT.
 *
 * The CV test is exact in bigint with no square root: CV >= p% exactly when (n * sum(x^2) - S^2) * 100^2 >= p^2 * S^2.
 */
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import {
  INCOME_SWING_CV_PERCENT,
  INCOME_SWING_MIN_MONTHS,
  INCOME_VOLATILE_CV_PERCENT,
  LOW_MONTH_RANK,
  RECONFIRM_MIN_MONTHS,
  SEASON_CYCLE_MONTHS,
  V3_HISTORY_MONTHS,
  V3_VARIABLE_HISTORY_MONTHS,
} from '../constants';
import { addMonthsClamped, addYearMonths, yearMonthOf } from '../dates';
import { paymentsInRange } from '../plan/schedule';
import type {
  CustomOptions,
  ExpectedMonthIncome,
  IncomeMonth,
  IncomePattern,
  IncomePicture,
  IncomeProfile,
  Schedule,
  V3Month,
  V3Series,
} from '../types';
import { eligibility, planOf } from './incomeProfile';
import { seriesIndex } from './series';
import type { EverydayMonth } from './typical';

const FN = 'incomePattern';

/** What the rules below read from a picture (the picture itself is built from them). */
export type PictureView = Pick<IncomePicture, 'treated' | 'fullMonths' | 'months'>;

export interface RecordedIncomeInput {
  readonly asOf: string;
  readonly history: readonly V3Month[];
  readonly series: readonly V3Series[];
  readonly profile: IncomeProfile | null;
  readonly custom: CustomOptions;
}

/** Recorded income per full history month before the current month: the sum of paid income lines that count. */
export function recordedIncomeByMonth(input: RecordedIncomeInput): ReadonlyMap<string, bigint> {
  const current = yearMonthOf(input.asOf);
  const plan = planOf(input.profile);
  const idx = seriesIndex(input.series);
  const out = new Map<string, bigint>();
  for (const m of input.history) {
    if (!m.full || m.month >= current) continue;
    let sum = 0n;
    for (const l of m.lines) {
      if (l.status !== 'paid') continue;
      if (eligibility(l, idx, plan, input.custom).ok) sum += BigInt(l.amount);
    }
    out.set(m.month, sum);
  }
  return out;
}

/** The newest `n` months' incomes of a recorded map, oldest first. */
export function newestIncomes(byMonth: ReadonlyMap<string, bigint>, n: number): bigint[] {
  return [...byMonth.keys()]
    .sort()
    .slice(-n)
    .map((k) => byMonth.get(k) as bigint);
}

/** D-34 / D-48: coefficient of variation of the incomes is at least `percent`. Needs INCOME_SWING_MIN_MONTHS months and a positive total. */
export function incomeCvAtLeast(incomes: readonly bigint[], percent: number): boolean {
  const n = BigInt(incomes.length);
  if (incomes.length < INCOME_SWING_MIN_MONTHS) return false;
  let s = 0n;
  let sq = 0n;
  for (const x of incomes) {
    s += x;
    sq += x * x;
  }
  if (s <= 0n) return false;
  const p = BigInt(percent);
  return (n * sq - s * s) * 100n * 100n >= p * p * s * s;
}

/** D-34: the income swings. */
export function incomeSwings(incomes: readonly bigint[]): boolean {
  return incomeCvAtLeast(incomes, INCOME_SWING_CV_PERCENT);
}

/** D-34: the stated pattern is never relabelled; swings set only `treated` and `confirmNeeded`. */
export function resolvePattern(
  profile: Pick<IncomeProfile, 'pattern' | 'patternConfirmed'> | null,
  swings: boolean
): { readonly stated: IncomePattern | null; readonly treated: IncomePattern; readonly confirmNeeded: boolean } {
  const stated = profile?.pattern ?? null;
  if (stated === 'variable' || stated === 'seasonal') return { stated, treated: stated, confirmNeeded: false };
  const confirmedSteady = profile !== null && stated === 'steady' && profile.patternConfirmed === true;
  if (swings && !confirmedSteady) {
    return { stated, treated: 'variable', confirmNeeded: true };
  }
  return { stated, treated: 'steady', confirmNeeded: false };
}

/** D-33: months of history the typical month looks at. */
export function windowMonthsOf(treated: IncomePattern): number {
  return treated === 'steady' ? V3_HISTORY_MONTHS : V3_VARIABLE_HISTORY_MONTHS;
}

/** D-36: the window, oldest first. A month is lean when its income is below the window's average (income * n < sum). */
export function buildIncomeMonths(
  used: readonly EverydayMonth[],
  incomeByMonth: ReadonlyMap<string, bigint>,
  recurringBills: bigint,
  setAside: bigint
): IncomeMonth[] {
  const sorted = used.slice().sort((a, b) => (a.month < b.month ? -1 : 1)); // month keys are unique
  const incomes = sorted.map((m) => incomeByMonth.get(m.month) ?? 0n);
  const total = incomes.reduce((a, b) => a + b, 0n);
  const n = BigInt(sorted.length);
  return sorted.map((m, i) => {
    const income = incomes[i] as bigint;
    return {
      month: m.month,
      income: minorFromBigInt(income, FN),
      everyday: m.everyday,
      left: minorFromBigInt(income - recurringBills - BigInt(m.everyday) - setAside, FN),
      lean: income * n < total,
    };
  });
}

/** D-36: the lowest leftover among lean months, so a payment is covered in every lean month; null when none is lean. */
export function leanLeftOf(months: readonly IncomeMonth[]): MinorUnits | null {
  let lowest: MinorUnits | null = null;
  for (const m of months) {
    if (m.lean && (lowest === null || m.left < lowest)) lowest = m.left;
  }
  return lowest;
}

/** The most recent window month with the same calendar month as `ym`, other than `ym` itself. */
export function sameCalendarMonth(months: readonly IncomeMonth[], ym: string): IncomeMonth | null {
  const calendar = ym.slice(5);
  let found: IncomeMonth | null = null;
  for (const m of months) {
    if (m.month !== ym && m.month.slice(5) === calendar && (found === null || m.month > found.month)) found = m;
  }
  return found;
}

const validExpected = (e: ExpectedMonthIncome): boolean => Number.isSafeInteger(e.amount) && e.amount >= 0; // T-05.1-97

/** D-35: expected money in for `ym`, or null when nothing may be assumed. */
export function expectedFor(
  picture: PictureView,
  confirmed: readonly ExpectedMonthIncome[],
  ym: string
): { readonly amount: MinorUnits; readonly source: 'confirmed' | 'records' } | null {
  let given: ExpectedMonthIncome | null = null;
  for (const e of confirmed) {
    if (e.month === ym && validExpected(e) && (given === null || e.at >= given.at)) given = e;
  }
  if (given !== null) return { amount: given.amount, source: 'confirmed' };
  if (picture.treated === 'steady' || picture.fullMonths < RECONFIRM_MIN_MONTHS) return null;
  if (picture.treated === 'seasonal') {
    const same = sameCalendarMonth(picture.months, ym);
    return same === null ? null : { amount: same.income, source: 'records' };
  }
  const sorted = picture.months.map((m) => m.income).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return { amount: sorted[sorted.length >= 3 ? LOW_MONTH_RANK - 1 : 0] as MinorUnits, source: 'records' };
}

/** D-39: with 12 months of records, the everyday of the same month last year; else null. */
export function seasonEveryday(picture: PictureView, ym: string): MinorUnits | null {
  if (picture.treated === 'steady' || picture.fullMonths < RECONFIRM_MIN_MONTHS) return null;
  return sameCalendarMonth(picture.months, ym)?.everyday ?? null;
}

/** D-37: is `ym` a lean month, judged by the same calendar month in the window? */
export function isLeanMonth(picture: Pick<IncomePicture, 'months'>, ym: string): boolean {
  return sameCalendarMonth(picture.months, ym)?.lean ?? false;
}

/** D-35, D-37: the months a purchase depends on, unique and sorted. */
export function dependsOnMonths(asOf: string, schedule: Schedule | null, runningMonthly: MinorUnits): readonly string[] {
  const current = yearMonthOf(asOf);
  const out = new Set<string>([current]);
  if (schedule !== null) {
    for (const p of paymentsInRange(schedule, asOf, addMonthsClamped(asOf, SEASON_CYCLE_MONTHS))) {
      out.add(yearMonthOf(p.date));
    }
  }
  if (runningMonthly > 0) {
    for (let i = 1; i < SEASON_CYCLE_MONTHS; i++) out.add(addYearMonths(current, i));
  }
  return [...out].sort();
}

/** D-37 (seasonal): skip leading months that are not lean, then count the consecutive lean months. */
export function leanRun(picture: Pick<IncomePicture, 'months'>, months: readonly string[]): number {
  let i = 0;
  while (i < months.length && !isLeanMonth(picture, months[i] as string)) i++;
  let run = 0;
  while (i < months.length && isLeanMonth(picture, months[i] as string)) {
    run++;
    i++;
  }
  return run;
}

/** D-48: variable or seasonal and the window income CV is at or above the volatile limit. */
export function isVolatile(treated: IncomePattern, months: readonly IncomeMonth[]): boolean {
  return (
    treated !== 'steady' &&
    incomeCvAtLeast(
      months.map((m) => BigInt(m.income)),
      INCOME_VOLATILE_CV_PERCENT
    )
  );
}
