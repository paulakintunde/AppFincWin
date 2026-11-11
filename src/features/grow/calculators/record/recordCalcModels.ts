// 06-19: the three record calculators (D-17 goal, D-18 debt extra payment, D-19 growth illustration) as pure functions.
// No React, no I/O, no English. Every figure comes from engine/grow or engine/payoff; the only arithmetic here is adding and
// subtracting whole minor units and one half-up percentage (divideHalfUp). Money is integer minor units. Any input that gives
// no sensible answer returns null ("Fill in the numbers above" / nothing to show).
import { depositDate, goalPlanByDate, goalPlanByMonthly } from '@/engine/grow';
import { MAX_ABS_AMOUNT_MINOR, divideHalfUp, type MinorUnits } from '@/engine/money';
import { compoundSteps, fixedPayoff } from '@/engine/payoff';
import { MAX_YEARS, parseRateText } from '../typed/calcModels';

const minor = (n: number): MinorUnits => n as MinorUnits;

function inRange(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_ABS_AMOUNT_MINOR;
}

/** Runs a calculation whose engine call may throw on a figure too large for safe integers; the answer is then "no result". */
function guarded<T>(run: () => T | null): T | null {
  try {
    return run();
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

// ---- D-17 goal ----

export interface GoalCalcContext {
  /** Saved so far, home-currency minor units. */
  saved: number;
  target: number | null;
  /** The date of the first deposit, YYYY-MM-DD. */
  anchor: string;
  /** The goal's monthly amount now (0 when none). */
  currentMonthly: number;
  /** Everything going into goals each month now (this goal's current amount included). */
  intoGoals: number;
  /** What is left in a usual month now; null when there is no month to read. */
  leftInUsualMonth: number | null;
  /** The user's saving line (a monthly minimum); null when none. */
  savingLine: number | null;
}

/** Either "save this much each month" or "reach it by this month (YYYY-MM)". */
export type GoalCalcChoice = { monthly: number } | { byDate: string };

export interface GoalCalcResult {
  monthly: number;
  deposits: number;
  /** The date of the last deposit, YYYY-MM-DD. */
  reachesOn: string;
  /** What goes into goals each month at this amount. */
  intoGoals: number;
  /** What is left in a usual month at this amount; null when unknown. */
  left: number | null;
  /** The amber note applies: a line is set and the new into-goals figure is under it. */
  belowSavingLine: boolean;
  /** The monthly equals what the goal is set to now. */
  isCurrentPlan: boolean;
}

export function goalCalcModel(ctx: GoalCalcContext, choice: GoalCalcChoice): GoalCalcResult | null {
  if (ctx.target === null || !inRange(ctx.target) || !inRange(ctx.saved) || ctx.saved >= ctx.target) return null;
  return guarded(() => {
    let monthly: number;
    let deposits: number;
    if ('monthly' in choice) {
      if (!inRange(choice.monthly) || choice.monthly <= 0) return null;
      const r = goalPlanByMonthly({ have: minor(ctx.saved), target: minor(ctx.target as number), add: minor(choice.monthly), anchor: ctx.anchor });
      if (r.deposits === null || r.deposits < 1) return null;
      monthly = choice.monthly;
      deposits = r.deposits;
    } else {
      if (choice.byDate.slice(0, 7) < ctx.anchor.slice(0, 7)) return null;
      const r = goalPlanByDate({ have: minor(ctx.saved), target: minor(ctx.target as number), anchor: ctx.anchor, byDate: choice.byDate });
      monthly = r.neededEachMonth;
      deposits = r.deposits;
    }
    const intoGoals = ctx.intoGoals - ctx.currentMonthly + monthly;
    return {
      monthly,
      deposits,
      reachesOn: depositDate(ctx.anchor, deposits),
      intoGoals,
      left: ctx.leftInUsualMonth === null ? null : ctx.leftInUsualMonth + ctx.currentMonthly - monthly,
      belowSavingLine: ctx.savingLine !== null && ctx.savingLine > 0 && intoGoals < ctx.savingLine,
      isCurrentPlan: monthly === ctx.currentMonthly,
    };
  });
}

// ---- D-18 debt extra payment ----

export interface DebtExtraContext {
  balance: number;
  /** Yearly rate as text, e.g. '6.9'. */
  apr: string;
  /** The monthly payment now. */
  payment: number;
  /** The date of the first payment, YYYY-MM-DD. */
  firstDate: string;
  /** Usual pay a month, for the share-of-pay row; null when unknown. */
  usualPay: number | null;
}

export interface DebtExtraResult {
  months: number;
  /** The date of the last payment, YYYY-MM-DD. */
  endDate: string;
  /** Payment plus extra. */
  eachMonth: number;
  /** Interest from now. */
  interest: number;
  /** Interest saved against no extra (0 for no extra); null when the payment alone never clears the debt (P3-WR-14). */
  interestSaved: number | null;
  lastPayment: number;
  /** Months sooner than with no extra; null when the payment alone never clears the debt. */
  soonerMonths: number | null;
  /** Whole percent of usual pay (half up); null without usual pay. */
  sharePercent: number | null;
  /** The extra clears it with the first payment. */
  paidInOnePayment: boolean;
}

export function debtExtraModel(ctx: DebtExtraContext, extra: number): DebtExtraResult | null {
  const parsed = parseRateText(ctx.apr);
  if (parsed === null || !inRange(ctx.balance) || ctx.balance === 0 || !inRange(ctx.payment) || !inRange(extra)) return null;
  return guarded(() => {
    const base = fixedPayoff(minor(ctx.balance), parsed.rate, minor(ctx.payment));
    const withExtra = fixedPayoff(minor(ctx.balance), parsed.rate, minor(ctx.payment), { extra: minor(extra) });
    // P3-WR-14: an extra that clears a debt the payment alone never clears still has an answer; only the comparison is missing.
    if (withExtra.outcome !== 'cleared' || withExtra.totalInterest === null) return null;
    const baseClears = base.outcome === 'cleared' && base.totalInterest !== null;
    if (withExtra.months < 1) return null;
    const eachMonth = ctx.payment + extra;
    const share = ctx.usualPay !== null && ctx.usualPay > 0 ? Number(divideHalfUp(BigInt(eachMonth) * 100n, BigInt(ctx.usualPay))) : null;
    return {
      months: withExtra.months,
      endDate: depositDate(ctx.firstDate, withExtra.months),
      eachMonth,
      interest: withExtra.totalInterest,
      interestSaved: baseClears ? (base.totalInterest as number) - withExtra.totalInterest : null,
      lastPayment: withExtra.lastPayment,
      soonerMonths: baseClears ? base.months - withExtra.months : null,
      sharePercent: share,
      paidInOnePayment: withExtra.months === 1,
    };
  });
}

// ---- D-19 growth illustration ----

export interface GrowthIllustrationInput {
  start: number;
  monthly: number;
  /** Yearly rate as typed text. */
  rate: string;
  years: number;
}

export interface GrowthIllustrationResult {
  value: number;
  putIn: number;
  growth: number;
  /** What the monthly amount alone would reach from nothing. */
  alone: number;
  years: { value: number; putIn: number; growth: number }[];
  /** The rate as shown ('4', '4.5'). */
  rateText: string;
}

export function growthIllustrationModel(input: GrowthIllustrationInput): GrowthIllustrationResult | null {
  const parsed = parseRateText(input.rate);
  if (parsed === null || !inRange(input.start) || !inRange(input.monthly)) return null;
  if (!Number.isInteger(input.years) || input.years < 1 || input.years > MAX_YEARS) return null;
  return guarded(() => {
    const months = input.years * 12;
    const c = compoundSteps(minor(input.start), minor(input.monthly), parsed.rate, months);
    const alone = compoundSteps(minor(0), minor(input.monthly), parsed.rate, months);
    return {
      value: c.value,
      putIn: c.putIn,
      growth: c.growth,
      alone: alone.value,
      years: c.years.map((y) => ({ value: y.value, putIn: y.putIn, growth: y.value - y.putIn })),
      rateText: parsed.display,
    };
  });
}
