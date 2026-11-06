/**
 * 05.4 BO-05 (05.4-27, Variant C): cash and installments judged from one typed input. Pure; no clock.
 *
 * judgeBoth(prepared, check) runs two judgeCheck calls on one Prepared: the cash side is the same check paid once (a plan's deposit and
 * plan fees drop out with the plan, exactly as the engine's own borrowing check reads the cash route, prepare.ts borrowingOf); the plan
 * side is the check itself, and exists only when the check is a plan. Each equals a separate check of its own (I72): one shared input
 * never changes either answer.
 */
import { judgeCheck, type Evaluation, type Prepared } from '../prepare';
import type { CheckV2 } from '../types';

export interface BothResults {
  readonly cash: Evaluation;
  readonly plan: Evaluation | null;
}

/** The cash reading of a check: the same purchase, paid once. A one-off check is returned as it is. */
export function cashOf(check: CheckV2): CheckV2 {
  return check.pay.mode === 'once' ? check : { ...check, pay: { mode: 'once' } };
}

export function judgeBoth(prepared: Prepared, check: CheckV2): BothResults {
  const cash = judgeCheck(prepared, cashOf(check));
  const plan = check.pay.mode === 'plan' ? judgeCheck(prepared, check) : null;
  return { cash, plan };
}
