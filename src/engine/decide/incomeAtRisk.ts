import { minorUnits } from '../money/types';
import { runwayMonthsOf, setbackHitFor } from './setbacks';
import type { Assessment, AssessContext, IncomeAtRiskReport, SetbackAtRisk, SetbackBasis, SetbackInput } from './types';

/**
 * D-54: how much resilience the new debt costs. Every setback is re-run twice: with the new plan included and without
 * it. "New payments still met" means cash stays at or above 0 through the setback with the purchase running;
 * "runway lost" is runwayWithout minus runwayWith, both whole months from D-39 (runwayMonthsOf); null when either
 * burn is 0 or below.
 *
 * Both sides start from cash after bills due within 90 days (D-24): context.cashAfterBills without the purchase and
 * assessment.cashAfterBillsAndPurchase with it. The path-aware cash-check figure is never used, so a bill due soon is
 * still deducted when a confirmed pay series exists.
 *
 * D-62: takes the same `readonly SetbackInput[]` as applySetbacks (DEFAULT_SETBACKS or the user's edited list), returns
 * one SetbackAtRisk per input in input order with the enabled flag echoed, and validates through the same
 * setbackHitFor. Callers pass the combined verdict's context and assessment (D-41). D-21: a record of figures, no advice.
 */
export function incomeAtRisk(
  context: AssessContext,
  assessment: Assessment,
  setbacks: readonly SetbackInput[]
): IncomeAtRiskReport {
  const burnWithout = minorUnits(context.mySpendingBasis + context.debtPayments);
  const cashWithout = context.cashAfterBills;
  const cashWith = assessment.cashAfterBillsAndPurchase;
  const withBasis: SetbackBasis = {
    incomeBasis: context.money.incomeBasis,
    burn: assessment.burn,
    monthCosts: context.monthCosts,
  };
  const withoutBasis: SetbackBasis = { ...withBasis, burn: burnWithout };

  const lost = (runwayWith: number | null, runwayWithout: number | null): number | null =>
    runwayWith !== null && runwayWithout !== null ? runwayWithout - runwayWith : null;

  const results: SetbackAtRisk[] = setbacks.map((setback) => {
    const cashAfterWith = minorUnits(cashWith - setbackHitFor(setback, withBasis));
    const cashAfterWithout = minorUnits(cashWithout - setbackHitFor(setback, withoutBasis));
    const runwayWith = runwayMonthsOf(cashAfterWith, assessment.burn);
    const runwayWithout = runwayMonthsOf(cashAfterWithout, burnWithout);
    return {
      code: setback.code,
      enabled: setback.enabled,
      cashAfterWith,
      cashAfterWithout,
      paymentsMet: cashAfterWith >= 0,
      breaksBecauseOfPurchase: cashAfterWithout >= 0 && cashAfterWith < 0,
      runwayWith,
      runwayWithout,
      runwayLost: lost(runwayWith, runwayWithout),
    };
  });

  const runwayWith = runwayMonthsOf(cashWith, assessment.burn);
  const runwayWithout = runwayMonthsOf(cashWithout, burnWithout);
  return { runwayWith, runwayWithout, runwayLost: lost(runwayWith, runwayWithout), setbacks: results };
}
