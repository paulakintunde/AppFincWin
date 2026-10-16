import { divideHalfUp } from '../money/rounding';
import { minorUnits, type MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';
import { assertNever } from '../guards/assertNever';
import { LATE_INVOICE_DAYS_PER_MONTH } from './constants';
import type { Assessment, CashOutcome, SetbackBasis, SetbackInput, SetbackReport, SetbackResult } from './types';

const FN = 'setbackHit';

function mu(value: bigint): MinorUnits {
  return minorFromBigInt(value, FN);
}

function whole(value: number, label: string, max?: number): bigint {
  if (!Number.isInteger(value) || value < 0 || (max !== undefined && value > max)) {
    const range = max === undefined ? 'a whole number >= 0' : `a whole number from 0 to ${max}`;
    throw new RangeError(`${FN}: ${label} ${value} must be ${range}`);
  }
  return BigInt(value);
}

/** A zero month count counts as one month (the prototype's max(1, mo)). */
function monthsAtLeastOne(months: bigint): bigint {
  return months > 0n ? months : 1n;
}

/**
 * The money one setback takes, from a plain basis (DEC-15, D-19). The prototype's dsbHit, mapped:
 * once -> unexpected_expense, drop -> income_drop, none -> job_loss, late -> late_invoice.
 *
 * D-05: an unexpected expense with no amount is one month's costs (the D-02 figure), not the prototype's 1,200.
 * Exposed on a SetbackBasis so incomeAtRisk (D-54) can run every setback with and without the new plan from one
 * implementation.
 */
export function setbackHitFor(setback: SetbackInput, basis: SetbackBasis): MinorUnits {
  switch (setback.code) {
    case 'unexpected_expense': {
      if (setback.amount === null) return basis.monthCosts;
      return mu(whole(setback.amount, 'amount'));
    }
    case 'income_drop': {
      const drop = whole(setback.percentDrop, 'percentDrop', 100);
      const months = monthsAtLeastOne(whole(setback.months, 'months'));
      return mu(divideHalfUp(BigInt(basis.incomeBasis) * drop * months, 100n));
    }
    case 'job_loss': {
      const months = monthsAtLeastOne(whole(setback.months, 'months'));
      return mu(months * BigInt(Math.max(0, basis.burn)));
    }
    case 'late_invoice': {
      const days = whole(setback.daysLate, 'daysLate');
      return mu(divideHalfUp(BigInt(basis.incomeBasis) * days, BigInt(LATE_INVOICE_DAYS_PER_MONTH)));
    }
    default:
      return assertNever(setback, 'setback');
  }
}

export function setbackHit(setback: SetbackInput, assessment: Assessment): MinorUnits {
  return setbackHitFor(setback, {
    incomeBasis: assessment.context.money.incomeBasis,
    burn: assessment.burn,
    monthCosts: assessment.context.monthCosts,
  });
}

/**
 * D-39: whole months the cash lasts, floor(max(0, cash) / burn), never overstated; null when nothing is going out.
 * The prototype showed cash / burn to one decimal.
 */
export function runwayMonthsOf(cash: MinorUnits, burn: MinorUnits): number | null {
  return burn > 0 ? Number(BigInt(Math.max(0, cash)) / BigInt(burn)) : null;
}

/**
 * Re-assesses the plan's cash position under the four setbacks, each alone and combined for the enabled ones
 * (DEC-15, D-19).
 *
 * Every figure starts from assessment.cashAfterBillsAndPurchase: cash after the purchase and after the bills due within
 * 90 days, which are deducted whether or not a cash path exists (D-24), so a setback never double-counts or ignores them.
 *
 * D-39: runwayMonths is that same cash over the monthly burn, in whole months. On an invest-monthly check the burn
 * includes the new contribution, which understates the runway: the safe direction.
 */
export function applySetbacks(assessment: Assessment, setbacks: readonly SetbackInput[]): SetbackReport {
  const start = assessment.cashAfterBillsAndPurchase;
  const reserve = assessment.context.limits.reserve;
  const classify = (cash: MinorUnits): CashOutcome => (cash < 0 ? 'wiped_out' : cash < reserve ? 'through_cushion' : 'absorbed');

  const results: SetbackResult[] = setbacks.map((s) => {
    const hit = setbackHit(s, assessment);
    const cashAfter = minorUnits(start - hit);
    return { code: s.code, enabled: s.enabled, hit, cashAfter, outcome: classify(cashAfter) };
  });
  const enabled = results.filter((r) => r.enabled);
  const combinedHit = mu(enabled.reduce((sum, r) => sum + BigInt(r.hit), 0n));
  const stressedCash = minorUnits(start - combinedHit);
  return {
    results,
    anyEnabled: enabled.length > 0,
    combinedHit,
    stressedCash,
    stressedOutcome: classify(stressedCash),
    runwayMonths: runwayMonthsOf(start, assessment.burn),
  };
}
