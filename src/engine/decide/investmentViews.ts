import { minorUnits, type MinorUnits } from '../money/types';
import { MAX_TERM_MONTHS } from '../payoff/constants';
import { futureValueNetExact, futureValuePathExact } from '../payoff/futureValuePath';
import { amortiseSchedule, simulateMinimumSchedule } from '../payoff/rateSchedule';
import { ONE_HUNDRED_PERCENT, ZERO_PERCENT, minorOrNull, type Percent } from '../payoff/types';
import { DEFAULT_PROJECTION_HORIZON_MONTHS } from './constants';
import { monthlyStepsOf, rateScheduleFor } from './plan';
import { myPart } from './share';
import type {
  Assessment,
  AssessContext,
  BuyCheck,
  HorizonSource,
  InvestmentHeadline,
  InvestmentViews,
  InvestmentViewsInput,
  NetWorthPath,
  Plan,
  ProjectionRate,
  RateFigure,
} from './types';

const FN = 'investmentViews';

/** What is still owed after each month 1.. (held at the last value after the schedule ends); `start` is month 0. */
interface DebtSchedule {
  readonly start: MinorUnits;
  readonly after: readonly MinorUnits[];
}

/**
 * The plan's own remaining balance by month (D-52 (d)): the loan and card schedules from engine/payoff, the instalments
 * still to pay, and nothing for cash or a card paid in full at the next statement (that is day-one cash).
 */
function debtScheduleOf(check: BuyCheck, plan: Plan): DebtSchedule {
  const payment = check.payment;
  switch (payment.method) {
    case 'cash':
      return { start: minorUnits(0), after: [] };
    case 'loan':
      return {
        start: plan.financed,
        // the term entered (plan.months is the months actually paid, 04-REVIEW ME-03)
        after: amortiseSchedule(plan.financed, rateScheduleFor(payment.apr!, payment.promo), payment.termMonths!)
          .balancesByMonth,
      };
    case 'instalment': {
      const owing = Math.max(0, plan.months - 1);
      return {
        start: minorUnits(owing * plan.monthly),
        after: Array.from({ length: owing }, (_, i) => minorUnits((owing - 1 - i) * plan.monthly)),
      };
    }
    case 'card': {
      const detail = plan.card!;
      const card = payment.card!;
      const schedule = (): ReturnType<typeof rateScheduleFor> => rateScheduleFor(card.apr!, payment.promo);
      switch (payment.payoff.kind) {
        case 'months':
          return {
            start: detail.onCard,
            after: amortiseSchedule(detail.onCard, schedule(), payment.payoff.months).balancesByMonth,
          };
        case 'minimum':
          return {
            start: detail.onCard,
            after: simulateMinimumSchedule(detail.onCard, schedule(), card.minimumTerms!).balancesByMonth,
          };
        default:
          return { start: minorUnits(0), after: [] };
      }
    }
  }
}

/** 04-REVIEW ME-01: an exact projection past the safe range is null with 'exceeds_range', never thrown. */
function figure(rate: Percent, contributed: number, exact: bigint | null): RateFigure {
  const projected = exact === null ? null : minorOrNull(exact);
  return projected === null
    ? { rate, contributed: minorUnits(contributed), projected: null, growth: null, rangeCode: 'exceeds_range' }
    : {
        rate,
        contributed: minorUnits(contributed),
        projected,
        growth: minorUnits(projected - contributed),
        rangeCode: null,
      };
}

/**
 * D-104: what the money this check takes would be worth at the typed rate: the amount on the day grown from month 0
 * (one rounding, D-20) plus the payments-and-running figure already computed for that rate, added exactly. Null when
 * nothing is contributed; a sum past the safe range keeps the contribution and carries 'exceeds_range'.
 */
function headlineOf(
  rate: Percent,
  payments: RateFigure,
  dayOne: MinorUnits,
  horizon: number,
  fee: Percent
): InvestmentHeadline | null {
  const contributed = minorUnits(dayOne + payments.contributed);
  if (contributed === 0) return null;
  const lump = futureValueNetExact(minorUnits(0), rate, horizon, dayOne, fee);
  const projected = payments.projected === null ? null : minorOrNull(lump + BigInt(payments.projected));
  return { rate, contributed, projected, rangeCode: projected === null ? 'exceeds_range' : null };
}

/**
 * The investment views (D-51, D-52): what the money would do if it went into investing instead. These are projections
 * of the user's own figures at rates the user typed, never a forecast and never advice (D-21).
 *
 * D-51: every figure is returned at 0% and at each rate in context.limits.projectionRates, the one list every Decide
 * projection shares (resolved once by prepareContext). The engine supplies no non-zero rate; the labels are codes
 * Phase 5 words as "a projection at the rate you entered, not a forecast" (DCU-09). D-06 stays as the 0% default.
 *
 * D-52: horizon = input, else the plan's term, else DEFAULT_PROJECTION_HORIZON_MONTHS. (a) the price as a lump;
 * (b) my payments over the payment months plus my running costs every month, grown to the horizon (excluding the
 * day-one cost, which is (a); negative running costs contribute 0); (c) the investing D-35 pauses, held for the whole
 * horizon; (d) the monthly net worth (cash + investments - debt) without and with the purchase, starting from
 * context.cashAfterBills. Without the purchase cash grows by leftBefore + monthlySaving (saving stays cash, investing
 * goes to investments); the existing debts are held constant on both paths; the item is not an asset (D-55: its loss
 * of value is non-cash and enters no view).
 *
 * D-63: an optional holding fee per year, typed by the user (null = none, never a supplied fee), reduces every view
 * here: growth is at net = rate - fee, which may go below 0. It does not touch the byRate of alternatives or
 * do_without (money kept as cash or savings, not held in an investment). One half-up rounding per figure (D-20).
 */
export function investmentViews(
  context: AssessContext,
  check: BuyCheck,
  assessment: Assessment,
  input: InvestmentViewsInput
): InvestmentViews {
  const { plan } = assessment;
  const share = context.purchaseShare;
  const rates: readonly ProjectionRate[] = context.limits.projectionRates;
  const fee: Percent = input.holdingFee ?? ZERO_PERCENT;
  if (fee < 0n || fee > ONE_HUNDRED_PERCENT) {
    throw new RangeError(`${FN}: holdingFee must be between 0% and 100%`);
  }

  let horizon: number;
  let horizonSource: HorizonSource;
  if (input.horizonMonths !== null) {
    horizon = input.horizonMonths;
    horizonSource = 'user';
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > MAX_TERM_MONTHS) {
      throw new RangeError(`${FN}: horizonMonths ${horizon} must be an integer between 1 and ${MAX_TERM_MONTHS}`);
    }
  } else if (plan.months > 0) {
    horizon = plan.months;
    horizonSource = 'plan_term';
  } else {
    horizon = DEFAULT_PROJECTION_HORIZON_MONTHS;
    horizonSource = 'cash_default';
  }

  const snapshot = context.snapshot;
  const zero = minorUnits(0);

  // My payment in each month 1..horizon, from the plan's own steps (household amounts, my part each).
  const steps = monthlyStepsOf(plan).map((s) => ({ ...s, mine: myPart(s.amount, share) }));
  const paymentAt = new Array<number>(horizon + 1).fill(0);
  for (const s of steps) {
    for (let k = s.fromMonth; k <= Math.min(s.toMonth, horizon); k += 1) {
      paymentAt[k] = s.mine;
    }
  }

  // (a)
  const lump = myPart(plan.price, share);
  const priceInvested = {
    lump,
    byRate: rates.map((r) => figure(r.rate, lump, futureValueNetExact(zero, r.rate, horizon, lump, fee))),
  };

  // (b)
  const running = Math.max(0, assessment.mineRunning);
  const paymentsInvested = {
    firstMonthPayment: steps.length > 0 ? steps[0]!.mine : zero,
    paymentMonths: steps.reduce((total, s) => total + (s.toMonth - s.fromMonth + 1), 0),
    monthlyRunning: minorUnits(running),
    byRate: rates.map((r) => {
      let contributed = running * horizon;
      let projected: bigint | null = futureValueNetExact(minorUnits(running), r.rate, horizon, zero, fee);
      for (const s of steps) {
        if (s.fromMonth > horizon) continue;
        const to = Math.min(s.toMonth, horizon);
        const length = to - s.fromMonth + 1;
        contributed += s.mine * length;
        // each run's value at its end, one rounding (D-20), then grown to the horizon; out of range at any step -> null
        const atEnd = minorOrNull(futureValueNetExact(s.mine, r.rate, length, zero, fee));
        projected =
          projected === null || atEnd === null ? null : projected + futureValueNetExact(zero, r.rate, horizon - to, atEnd, fee);
      }
      return figure(r.rate, contributed, projected);
    }),
  };

  // D-104: the invested-instead headline, for the first non-zero typed rate only (never a defaulted one, D-06/D-07)
  const headlineAt = rates.findIndex((r) => r.rate !== ZERO_PERCENT);
  const headline = headlineAt < 0 ? null : headlineOf(rates[headlineAt]!.rate, paymentsInvested.byRate[headlineAt]!, assessment.mineDayOne, horizon, fee);

  // (c)
  const paused = assessment.investingAtRisk;
  const pauseImpact =
    paused > 0
      ? {
          pausedMonthly: paused,
          byRate: rates.map((r) =>
            figure(r.rate, paused * horizon, futureValueNetExact(paused, r.rate, horizon, zero, fee))
          ),
        }
      : null;

  // (d)
  const debt = debtScheduleOf(check, plan);
  const owedAfter = (m: number): number => (m === 0 ? debt.start : (debt.after[Math.min(m, debt.after.length) - 1] ?? 0));
  const monthlySurplus = context.leftBefore + snapshot.monthlySaving + context.setAside; // D-101: pot money stays cash
  // 04-REVIEW ME-01: the invested part is exact (bigint); a point past the safe range is null and the path carries
  // 'exceeds_range' instead of throwing.
  const netWorth: NetWorthPath[] = rates.map((r) => {
    const investedWithout = futureValuePathExact(snapshot.monthlyInvesting, r.rate, horizon, snapshot.investmentBalance, fee);
    const investedWith = futureValuePathExact(assessment.investingAfter, r.rate, horizon, snapshot.investmentBalance, fee);
    const withoutPurchase: (MinorUnits | null)[] = [];
    const withPurchase: (MinorUnits | null)[] = [];
    // D-101: cashAfterBills starts below the pots' slice, but that money is still mine, so net worth adds it back
    let cashWithout: number = context.cashAfterBills + context.protectedCash;
    let cashWith: number = context.cashAfterBills + context.protectedCash - assessment.mineDayOne;
    for (let m = 0; m <= horizon; m += 1) {
      if (m > 0) {
        cashWithout += monthlySurplus;
        cashWith += monthlySurplus + assessment.investingAtRisk - paymentAt[m]! - assessment.mineRunning;
      }
      withoutPurchase.push(minorOrNull(BigInt(cashWithout) + investedWithout[m]! - BigInt(context.debtBalance)));
      withPurchase.push(
        minorOrNull(BigInt(cashWith) + investedWith[m]! - BigInt(context.debtBalance) - BigInt(owedAfter(m)))
      );
    }
    const outOfRange = withoutPurchase.includes(null) || withPurchase.includes(null);
    return { rate: r.rate, withoutPurchase, withPurchase, rangeCode: outOfRange ? 'exceeds_range' : null };
  });

  return {
    horizonMonths: horizon,
    horizonSource,
    rates,
    holdingFee: fee,
    netRates: rates.map((r) => ({ rate: r.rate, netRateScaled: r.rate - fee })),
    priceInvested,
    paymentsInvested,
    headline,
    pauseImpact,
    netWorth,
  };
}
