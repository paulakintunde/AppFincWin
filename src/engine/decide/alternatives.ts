import { divideHalfUp } from '../money/rounding';
import { minorUnits, type MinorUnits } from '../money/types';
import { futureValue } from '../payoff/futureValue';
import { ceilDivide, minorFromBigInt } from '../payoff/types';
import { assessPlan } from './assess';
import {
  ALTERNATIVES_HORIZON_FALLBACK,
  ALTERNATIVES_HORIZON_MAX,
  ALTERNATIVES_HORIZON_MIN,
  DEFAULT_CHEAPER_RATIO_PERCENT,
} from './constants';
import { resolvePlanStrict, withPrice } from './plan';
import { myPart } from './share';
import type {
  AlternativeCode,
  AlternativeRow,
  Alternatives,
  AssessContext,
  Assessment,
  PurchaseCheck,
  RateFigure,
  Suppression,
} from './types';

const FN = 'buildAlternatives';

function mu(value: bigint): MinorUnits {
  return minorFromBigInt(value, FN);
}

function atLeast0(value: number): number {
  return Math.max(0, value);
}

/**
 * Cash that is genuinely spare: cash above the cushion after the bills due within 90 days (D-24, always deducted, with
 * or without a confirmed pay series). Shared with the wait plan (D-40) so the two never drift. Reads the
 * after-bills figure, never the raw cash balance or the cash-check figure.
 */
export function spareCashOf(context: AssessContext): MinorUnits {
  return minorUnits(atLeast0(context.cashAfterBills - context.limits.reserve));
}

/**
 * The step-4 alternatives table (DEC-14, D-19): as planned, a cheaper version, wait and save, and skip it, each with its
 * day-one, monthly and "money available to save" outcome.
 *
 * The ethical rule from BUILD-PROMPT section 4: a row whose money is not genuinely spare is suppressed and labelled with
 * a code, and carries no projected figure, so the app never implies someone could save a difference that does not exist.
 * The "money available to save" column is capped at what actually exists: spare cash above the cushion (spareCashOf) and
 * the monthly surplus before the purchase (leftBefore, which already excludes saving and investing, D-35).
 *
 * D-06: projections run at limits.projectionReturn, 0% unless the user entered one (the prototype assumed 6.5%).
 * D-51: every projected row also carries one figure per entered rate (byRate), 0% first.
 * D-05: the prototype's 25.00 too-thin floor is the user-editable limits.spareFloor, default 0.
 * D-34: every purchase-side figure is my part through context.purchaseShare.
 */
export function buildAlternatives(
  context: AssessContext,
  check: PurchaseCheck,
  assessment: Assessment,
  cheaperRatioPercent: number = DEFAULT_CHEAPER_RATIO_PERCENT
): Alternatives {
  if (!Number.isInteger(cheaperRatioPercent) || cheaperRatioPercent < 1 || cheaperRatioPercent > 100) {
    throw new RangeError(`${FN}: cheaper ratio ${cheaperRatioPercent} must be a whole number from 1 to 100`);
  }
  const share = context.purchaseShare;
  const { limits } = context;
  const ret = limits.projectionReturn;
  const rates = limits.projectionRates;
  const plan = resolvePlanStrict(check);

  const termMonths = plan.months > 0 ? plan.months : ALTERNATIVES_HORIZON_FALLBACK;
  const n = Math.min(ALTERNATIVES_HORIZON_MAX, Math.max(ALTERNATIVES_HORIZON_MIN, termMonths));

  const scale = (value: MinorUnits): MinorUnits => mu(divideHalfUp(BigInt(value) * BigInt(cheaperRatioPercent), 100n));
  const cheaperPrice = scale(plan.price);
  const priced = withPrice(check, cheaperPrice);
  const cheapCheck: PurchaseCheck =
    priced.kind === 'buy' && priced.payment.method === 'loan'
      ? { ...priced, payment: { ...priced.payment, deposit: scale(priced.payment.deposit) } }
      : priced;
  const cheapPlan = resolvePlanStrict(cheapCheck);
  const cheapLeft = assessPlan(context, cheapCheck, cheapPlan).left;

  const spareCash = spareCashOf(context);
  const spareMonthly = minorUnits(atLeast0(context.leftBefore));
  const { mineDayOne, mineMonthly, newMonthly } = assessment;

  const projectAt = (monthly: number, months: number, seed: number): readonly RateFigure[] =>
    rates.map((r) => {
      const contributed = mu(BigInt(seed) + BigInt(monthly) * BigInt(months));
      const projected = futureValue(minorUnits(monthly), r.rate, months, minorUnits(seed));
      return { rate: r.rate, contributed, projected, growth: minorUnits(atLeast0(projected - contributed)) };
    });

  const row = (
    code: AlternativeCode,
    dayOne: MinorUnits | null,
    monthly: MinorUnits | null,
    figures: { monthly: number; months: number; seed: number },
    suppression: Suppression | null
  ): AlternativeRow => {
    if (suppression !== null) {
      return { code, dayOne, monthly, contributed: null, projected: null, growth: null, byRate: null, suppression };
    }
    const contributed = mu(BigInt(figures.seed) + BigInt(figures.monthly) * BigInt(figures.months));
    const projected = futureValue(minorUnits(figures.monthly), ret, figures.months, minorUnits(figures.seed));
    return {
      code,
      dayOne,
      monthly,
      contributed,
      projected,
      growth: minorUnits(atLeast0(projected - contributed)),
      byRate: projectAt(figures.monthly, figures.months, figures.seed),
      suppression: null,
    };
  };

  // cheaper
  const cheapDayOne = myPart(cheapPlan.dayOne, share);
  const cheapMonthly = myPart(cheapPlan.monthly, share);
  const dayDiff = minorUnits(atLeast0(mineDayOne - cheapDayOne));
  const moDiff = minorUnits(atLeast0(mineMonthly - cheapMonthly));
  const seedB = Math.min(dayDiff, spareCash);
  const moB = Math.min(moDiff, cheapLeft >= limits.spareFloor ? atLeast0(cheapLeft) : 0);
  let cheaperSuppression: Suppression | null = null;
  if (cheapLeft < 0) {
    cheaperSuppression = { code: 'month_short', amount: minorUnits(-cheapLeft) };
  } else if (cheapLeft < limits.spareFloor && seedB <= 0) {
    cheaperSuppression = { code: 'too_thin', amount: cheapLeft };
  } else if (seedB + moB <= 0) {
    cheaperSuppression = { code: 'nothing_freed', amount: null };
  }

  // wait and save
  const myPrice = myPart(plan.price, share);
  const monthsToBuy =
    spareMonthly > 0
      ? Math.max(1, Number(ceilDivide(BigInt(atLeast0(myPrice - spareCash)), BigInt(spareMonthly))))
      : null;
  const waitMonths = monthsToBuy === null ? 0 : atLeast0(n - monthsToBuy);
  const investC = Math.min(atLeast0(newMonthly), spareMonthly);
  let waitSuppression: Suppression | null = null;
  if (monthsToBuy === null) {
    waitSuppression = { code: 'month_short', amount: minorUnits(atLeast0(-context.leftBefore)) };
  } else if (monthsToBuy > n) {
    waitSuppression = { code: 'past_horizon', amount: null };
  }
  const waitDayOne = monthsToBuy !== null && monthsToBuy <= n ? minorUnits(Math.min(spareCash, myPrice)) : null;
  const waitMonthly = monthsToBuy === null ? null : monthsToBuy > n ? spareMonthly : minorUnits(investC);

  // skip
  const seedD = Math.min(atLeast0(mineDayOne), spareCash);
  const moD = Math.min(atLeast0(newMonthly), spareMonthly);
  let skipSuppression: Suppression | null = null;
  if (context.leftBefore < 0) {
    skipSuppression = { code: 'month_short', amount: minorUnits(-context.leftBefore) };
  } else if (seedD + moD <= 0) {
    skipSuppression = { code: 'nothing_spare', amount: null };
  }

  return {
    horizonMonths: n,
    projectionReturn: ret,
    cheaperPrice,
    rates,
    cheaper: {
      ratioPercent: cheaperRatioPercent,
      notSpent: minorUnits(plan.price - cheaperPrice),
      dayDiff,
      monthlyDiff: moDiff,
      keptOnDay: minorUnits(seedB),
      keptMonthly: minorUnits(moB),
      leftAfter: cheapLeft,
      monthlyPayment: cheapMonthly,
    },
    spareCash,
    spareMonthly,
    monthsToBuy,
    waitMonths,
    rows: [
      {
        code: 'as_planned',
        dayOne: mineDayOne,
        monthly: mineMonthly,
        contributed: null,
        projected: null,
        growth: null,
        byRate: null,
        suppression: null,
      },
      row('cheaper', cheapDayOne, cheapMonthly, { monthly: moB, months: n, seed: seedB }, cheaperSuppression),
      row('wait_and_save', waitDayOne, waitMonthly, { monthly: investC, months: waitMonths, seed: 0 }, waitSuppression),
      row('skip', null, minorUnits(moD), { monthly: moD, months: n, seed: seedD }, skipSuppression),
    ],
  };
}
