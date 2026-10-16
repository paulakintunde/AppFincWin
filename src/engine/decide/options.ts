import { divideHalfUp } from '../money/rounding';
import { minorUnits, type MinorUnits } from '../money/types';
import { MAX_TERM_MONTHS } from '../payoff/constants';
import { futureValue } from '../payoff/futureValue';
import { ONE_HUNDRED_PERCENT, ceilDivide, minorFromBigInt, percentFromScaled } from '../payoff/types';
import { assessPlan } from './assess';
import { affordablePrice } from './bisect';
import {
  CUT_LINE_COUNT,
  CUT_LINE_FRACTION_PERCENT,
  DO_WITHOUT_FALLBACK_HORIZON_MONTHS,
  LONGER_TERM_STEP_MONTHS,
} from './constants';
import { resolvePlanStrict } from './plan';
import type { AssessContext, Assessment, DecideOption, PurchaseCheck, RateFigure } from './types';

const FN = 'buildOptions';

function big(value: number): bigint {
  return BigInt(value);
}

function mu(value: bigint): MinorUnits {
  return minorFromBigInt(value, FN);
}

/**
 * The ordered "what could change this" list (the prototype's `adv` array), as codes and numbers only (D-19, D-21).
 * Order follows BUILD-PROMPT §4 (DEC-13): affordable price, longer term, cut a named expense line, earn more,
 * save first, do without. The list is empty when the verdict is `fits`.
 *
 * D-41: pass the combined verdict's context (Assessment.context) so options are built against the combined
 * position. The copy ("Buy at ... instead", deep links into Activity) lives in Phase 5; the engine never words
 * or rounds anything for display.
 *
 * D-05: the prototype's currency thresholds are gone (a $200 minimum price, rounding down to $100, a $10 minimum
 * cut, $5 cut rounding, a $50 spare floor). Phase 5 may round a displayed price; the engine never does.
 *
 * D-35: the month gap used by cut_line and earn_more is the full pre-pause shortfall (-left), i.e. what closes
 * the month without pausing saving or investing, so an `adjust` caused only by the pause still gets options.
 *
 * D-34: purchase figures use the purchase share and existing-spending figures are already my share.
 * D-24: save_first measures cash after bills due within 90 days (the cash-after-bills figure), never the raw
 * cash balance, whether or not a cash path exists.
 */
export function buildOptions(
  context: AssessContext,
  check: PurchaseCheck,
  assessment: Assessment
): readonly DecideOption[] {
  if (assessment.state === 'fits') {
    return [];
  }
  const out: DecideOption[] = [];
  const { plan } = assessment;
  const gap = assessment.left < 0 ? minorUnits(-assessment.left) : minorUnits(0);

  // 1. affordable price (buy only; omitted when nothing, or only 0, fits)
  if (check.kind === 'buy') {
    const found = affordablePrice(context, check);
    if (found.kind === 'found' && found.price > 0) {
      out.push({ code: 'affordable_price', price: found.price, reduction: mu(big(check.price) - big(found.price)) });
    }
  }

  // 2. longer term (loan only, until the 600-month cap). From the term the user entered, not plan.months, which is the
  // months actually paid and can be shorter (04-REVIEW ME-03). A resolved loan always has a term.
  const loanTerm = check.kind === 'buy' && check.payment.method === 'loan' ? check.payment.termMonths! : null;
  if (check.kind === 'buy' && check.payment.method === 'loan' && loanTerm! < MAX_TERM_MONTHS) {
    const termMonths = Math.min(MAX_TERM_MONTHS, loanTerm! + LONGER_TERM_STEP_MONTHS);
    const longerCheck: PurchaseCheck = { ...check, payment: { ...check.payment, termMonths } };
    const longerPlan = resolvePlanStrict(longerCheck);
    const la = assessPlan(context, longerCheck, longerPlan);
    out.push({
      code: 'longer_term',
      termMonths,
      monthlyPayment: longerPlan.monthly,
      leftAfter: la.left,
      monthCloses: la.left >= 0,
      leftChange: mu(big(la.left) - big(assessment.left)),
      // loan plans always carry finite interest (only a card minimum that never clears has null)
      extraInterest: mu(big(longerPlan.interest!) - big(plan.interest!)),
    });
  }

  // 3. cut a named line: the biggest cuttable lines, a fifth of each (shown with or without a gap, as the prototype did)
  const lines = context.snapshot.expenseLines
    .filter((l) => l.cuttable && l.averageMonthly > 0)
    .slice()
    .sort((a, b) => b.averageMonthly - a.averageMonthly || (Number(a.lineId > b.lineId) - Number(a.lineId < b.lineId)))
    .slice(0, CUT_LINE_COUNT);
  for (const l of lines) {
    const cut = mu(divideHalfUp(big(l.averageMonthly) * big(CUT_LINE_FRACTION_PERCENT), 100n));
    out.push({
      code: 'cut_line',
      lineId: l.lineId,
      lineAverage: l.averageMonthly,
      cut,
      gap,
      closesGap: gap > 0 && cut >= gap,
    });
  }

  // 4. earn more (only when the month has a gap)
  if (gap > 0) {
    const incomeBasis = context.money.incomeBasis;
    out.push({
      code: 'earn_more',
      gap,
      incomeBasis,
      basis: context.money.basis,
      percentOfIncome:
        incomeBasis > 0
          ? percentFromScaled(divideHalfUp(big(gap) * ONE_HUNDRED_PERCENT, big(incomeBasis)))
          : null,
    });
  }

  // 5. save first: cash short of the cushion, or of the day-one cost over the cash above the cushion
  const reserve = big(context.limits.reserve);
  const cushionGap = reserve - big(assessment.cashAfterBillsAndPurchase);
  const aboveCushion = big(context.cashAfterBills) - reserve;
  const dayOneGap = big(assessment.mineDayOne) - (aboveCushion > 0n ? aboveCushion : 0n);
  const need = [0n, cushionGap, dayOneGap].reduce((m, v) => (v > m ? v : m));
  if (need > 0n) {
    const monthlySpare = context.leftBefore > 0 ? context.leftBefore : minorUnits(0);
    out.push({
      code: 'save_first',
      need: mu(need),
      monthlySpare,
      months: monthlySpare > 0 ? Number(ceilDivide(need, big(monthlySpare))) : null,
    });
  }

  // 6. do without: keep the monthly and project it (D-06: 0% unless the user entered a return; D-51: every rate)
  const keptMonthly = assessment.newMonthly > 0 ? assessment.newMonthly : minorUnits(0);
  const horizonMonths = plan.months > 0 ? plan.months : DO_WITHOUT_FALLBACK_HORIZON_MONTHS;
  const contributed = mu(big(keptMonthly) * big(horizonMonths));
  const byRate: RateFigure[] = context.limits.projectionRates.map((r) => {
    const projected = futureValue(keptMonthly, r.rate, horizonMonths, minorUnits(0));
    return { rate: r.rate, contributed, projected, growth: mu(big(projected) - big(contributed)) };
  });
  out.push({
    code: 'do_without',
    keptMonthly,
    horizonMonths,
    projected: futureValue(keptMonthly, context.limits.projectionReturn, horizonMonths, minorUnits(0)),
    projectionReturn: context.limits.projectionReturn,
    byRate,
  });
  return out;
}
