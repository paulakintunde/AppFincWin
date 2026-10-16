import { minorUnits, type MinorUnits } from '../money/types';
import { MAX_TERM_MONTHS } from '../payoff/constants';
import { futureValueNet, futureValuePath } from '../payoff/futureValuePath';
import { amortiseSchedule, simulateMinimumSchedule } from '../payoff/rateSchedule';
import { ONE_HUNDRED_PERCENT, ZERO_PERCENT, type Percent } from '../payoff/types';
import { DEFAULT_PROJECTION_HORIZON_MONTHS } from './constants';
import { rateScheduleFor } from './plan';
import { myPart } from './share';
import type {
  Assessment,
  AssessContext,
  BuyCheck,
  HorizonSource,
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
        after: amortiseSchedule(plan.financed, rateScheduleFor(payment.apr!, payment.promo), plan.months).balancesByMonth,
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

function figure(rate: Percent, contributed: number, projected: MinorUnits): RateFigure {
  return {
    rate,
    contributed: minorUnits(contributed),
    projected,
    growth: minorUnits(projected - contributed),
  };
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
  const steps = plan.paymentSteps.map((s) => ({ ...s, mine: myPart(s.amount, share) }));
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
    byRate: rates.map((r) => figure(r.rate, lump, futureValueNet(zero, r.rate, horizon, lump, fee))),
  };

  // (b)
  const running = Math.max(0, assessment.mineRunning);
  const paymentsInvested = {
    firstMonthPayment: steps.length > 0 ? steps[0]!.mine : zero,
    paymentMonths: steps.reduce((total, s) => total + (s.toMonth - s.fromMonth + 1), 0),
    monthlyRunning: minorUnits(running),
    byRate: rates.map((r) => {
      let contributed = running * horizon;
      let projected: number = futureValueNet(minorUnits(running), r.rate, horizon, zero, fee);
      for (const s of steps) {
        if (s.fromMonth > horizon) continue;
        const to = Math.min(s.toMonth, horizon);
        const length = to - s.fromMonth + 1;
        contributed += s.mine * length;
        const atEnd = futureValueNet(s.mine, r.rate, length, zero, fee);
        projected += futureValueNet(zero, r.rate, horizon - to, atEnd, fee);
      }
      return figure(r.rate, contributed, minorUnits(projected));
    }),
  };

  // (c)
  const paused = assessment.investingAtRisk;
  const pauseImpact =
    paused > 0
      ? {
          pausedMonthly: paused,
          byRate: rates.map((r) => figure(r.rate, paused * horizon, futureValueNet(paused, r.rate, horizon, zero, fee))),
        }
      : null;

  // (d)
  const debt = debtScheduleOf(check, plan);
  const owedAfter = (m: number): number => (m === 0 ? debt.start : (debt.after[Math.min(m, debt.after.length) - 1] ?? 0));
  const monthlySurplus = context.leftBefore + snapshot.monthlySaving;
  const netWorth: NetWorthPath[] = rates.map((r) => {
    const investedWithout = futureValuePath(snapshot.monthlyInvesting, r.rate, horizon, snapshot.investmentBalance, fee);
    const investedWith = futureValuePath(assessment.investingAfter, r.rate, horizon, snapshot.investmentBalance, fee);
    const withoutPurchase: MinorUnits[] = [];
    const withPurchase: MinorUnits[] = [];
    let cashWithout: number = context.cashAfterBills;
    let cashWith: number = context.cashAfterBills - assessment.mineDayOne;
    for (let m = 0; m <= horizon; m += 1) {
      if (m > 0) {
        cashWithout += monthlySurplus;
        cashWith += monthlySurplus + assessment.investingAtRisk - paymentAt[m]! - assessment.mineRunning;
      }
      withoutPurchase.push(minorUnits(cashWithout + investedWithout[m]! - context.debtBalance));
      withPurchase.push(minorUnits(cashWith + investedWith[m]! - context.debtBalance - owedAfter(m)));
    }
    return { rate: r.rate, withoutPurchase, withPurchase };
  });

  return {
    horizonMonths: horizon,
    horizonSource,
    rates,
    holdingFee: fee,
    netRates: rates.map((r) => ({ rate: r.rate, netRateScaled: r.rate - fee })),
    priceInvested,
    paymentsInvested,
    pauseImpact,
    netWorth,
  };
}
