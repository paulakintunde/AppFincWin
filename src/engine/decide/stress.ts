import { percentFromScaled, type Percent } from '../payoff';
import { assessPlan } from './assess';
import { STRESS_OFFSETS } from './constants';
import { resolvePlan, resolvePlanStrict } from './plan';
import type { AssessContext, BuyCheck, BuyPayment, PurchaseCheck, StressOutcome } from './types';

/**
 * Variable-rate stress (D-49, DEC-06): what the plan would cost, and what the verdict would be, if the rate rose.
 *
 * For a loan or a card months/minimum plan the user flagged `variable`, the check is re-run at its standard APR plus
 * each of STRESS_OFFSETS (percentage points: the OSFI +2 point qualifying buffer is the analogue, +4 a deliberate
 * severe case; there is no rate floor, because a floor would be an invented rate, D-07). The offsets are `Percent`
 * values, so adding them is bigint addition of scaled values and 9.4% + 2 points is 11.4%.
 *
 * A promotional segment is not stressed: the promo terms pass through untouched and only the rate after the promo,
 * which is the check's own APR, moves (04-REPLAN-NOTES 2026-10-15 expansion, default 4).
 *
 * The result sits beside the verdict and never changes it: the verdict stays on the entered rate. Stress is [] when
 * the plan is not flagged variable, is missing, has no APR, or is a card cleared in full (nothing is charged).
 * Callers pass the combined context (D-41), so stress is judged on the same position as the verdict.
 */
type LoanPayment = Extract<BuyPayment, { method: 'loan' }>;
type CardPayment = Extract<BuyPayment, { method: 'card' }>;

function loanAt(check: BuyCheck, payment: LoanPayment, apr: Percent): BuyCheck {
  return { ...check, payment: { ...payment, apr } };
}

function cardAt(check: BuyCheck, payment: CardPayment, apr: Percent): BuyCheck {
  return { ...check, payment: { ...payment, card: { ...payment.card!, apr } } };
}

export function stressTest(context: AssessContext, check: PurchaseCheck): readonly StressOutcome[] {
  if (check.kind !== 'buy') return [];
  const { payment } = check;
  if (payment.method !== 'loan' && payment.method !== 'card') return [];
  if (payment.variable !== true) return [];
  // A missing plan (no APR, no term, no card) has nothing to stress; a full card payoff charges nothing.
  if (resolvePlan(check).status === 'missing') return [];
  if (payment.method === 'card' && payment.payoff.kind === 'full') return [];

  return STRESS_OFFSETS.map((offset) => {
    const apr = percentFromScaled((payment.method === 'loan' ? payment.apr! : payment.card!.apr!) + offset);
    const stressed = payment.method === 'loan' ? loanAt(check, payment, apr) : cardAt(check, payment, apr);
    const plan = resolvePlanStrict(stressed);
    const a = assessPlan(context, stressed, plan);
    return {
      offset,
      apr,
      monthly: plan.monthly,
      mineMonthly: a.mineMonthly,
      left: a.left,
      state: a.state,
      monthCloses: a.checks.month,
      dsrWithinLine: a.checks.dsr,
    };
  });
}
