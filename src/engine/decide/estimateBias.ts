/**
 * Estimate bias over past decisions (D-56, DEC-30/31).
 *
 * For each of day-one cost, monthly payment and running costs, the signed average gap between actual and estimate in
 * integer basis points (half-up): positive means actuals came in higher. Computed over the decisions that have an
 * actual and a non-zero estimate, and null below ESTIMATE_BIAS_MIN_DECISIONS such decisions. Phase 5 words the result
 * (for example "about 20% higher") and never as advice (DCU-09); the engine returns numbers only (D-21).
 *
 * Choices: the bias is an average of per-decision ratios, not a ratio of sums, so one large purchase does not
 * dominate (04-RESEARCH addendum, assumption A9). A zero estimate has no ratio and is left out. A negative estimate
 * (running costs that replace a larger expense) is measured against its magnitude.
 *
 * D-62: estimates and actuals arrive in the check's home currency (`currency` is DecideSnapshot.currency). Phase 5
 * converts each past decision's figures first (05 D-37/D-39); the engine never converts and rejects any other code.
 */
import { divideHalfUp } from '../money/rounding';
import type { CurrencyCode } from '../money/types';
import { BASIS_POINTS_PER_UNIT, ESTIMATE_BIAS_MIN_DECISIONS } from './constants';
import { assertCurrency } from './currency';
import type { DecisionActuals, DecisionFigures, EstimateBias, EstimateFigure, PastDecision } from './types';

const FIGURES: readonly { readonly figure: EstimateFigure; readonly key: keyof DecisionFigures & keyof DecisionActuals }[] =
  [
    { figure: 'day_one', key: 'dayOne' },
    { figure: 'monthly_payment', key: 'monthlyPayment' },
    { figure: 'running_costs', key: 'runningCosts' },
  ];

function assertInteger(n: number, where: string): void {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`estimateBias: ${where} is ${n}, not a safe integer`);
  }
}

export function estimateBias(
  decisions: readonly PastDecision[],
  currency: CurrencyCode
): readonly [EstimateBias, EstimateBias, EstimateBias] {
  for (const d of decisions) {
    assertCurrency(currency, d.currency, `decision ${d.id}`, 'estimateBias');
    for (const { key } of FIGURES) {
      assertInteger(d.estimate[key], `decision ${d.id} estimate ${key}`);
      const a = d.actual[key];
      if (a !== null) assertInteger(a, `decision ${d.id} actual ${key}`);
    }
  }
  const measure = (figure: EstimateFigure, key: keyof DecisionFigures & keyof DecisionActuals): EstimateBias => {
    let sum = 0n;
    let n = 0;
    for (const d of decisions) {
      const actual = d.actual[key];
      const estimate = d.estimate[key];
      if (actual === null || estimate === 0) continue;
      const magnitude = BigInt(estimate < 0 ? -estimate : estimate);
      sum += divideHalfUp((BigInt(actual) - BigInt(estimate)) * BigInt(BASIS_POINTS_PER_UNIT), magnitude);
      n += 1;
    }
    return {
      figure,
      decisionsUsed: n,
      biasBasisPoints: n >= ESTIMATE_BIAS_MIN_DECISIONS ? Number(divideHalfUp(sum, BigInt(n))) : null,
    };
  };
  return [
    measure('day_one', 'dayOne'),
    measure('monthly_payment', 'monthlyPayment'),
    measure('running_costs', 'runningCosts'),
  ];
}
