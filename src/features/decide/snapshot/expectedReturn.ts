/**
 * 05-83 (D-82, R15.5): the expected-return projection for an investment check. PURE and display only: nothing here feeds
 * the verdict, the warnings or the alternatives. Money stays integer minor units; the growth maths is the engine's
 * futureValue (bigint inside), reached through the barrels.
 */
import { percent } from '@/engine/decide';
import type { PurchaseCheck } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { futureValue } from '@/engine/payoff';
import { isValidProjectionRateText } from './checkInputs';
import type { CheckInputs } from './types';

/** D-82: the horizon a lump sum is projected over when none is typed. */
export const LUMP_HORIZON_DEFAULT = 60;

export interface ExpectedReturn {
  /** The value at the end of `months`, minor units; null when it is beyond the supported range (D-47). */
  readonly fv: number | null;
  readonly months: number;
  readonly rateText: string;
}

/**
 * Null unless the check is an investment with a valid expected return (0-100 % a year). A monthly contribution grows over
 * its term, a lump sum over the typed horizon (default 60 months).
 */
export function expectedReturnProjection(inputs: CheckInputs, check: PurchaseCheck | null): ExpectedReturn | null {
  if (check === null || check.kind !== 'invest') return null;
  const rateText = inputs.investReturnText;
  if (rateText === null || !isValidProjectionRateText(rateText)) return null;
  const monthly = check.payment.method === 'monthly';
  const months = check.payment.method === 'monthly' ? check.payment.termMonths : (inputs.lumpHorizonMonths ?? LUMP_HORIZON_DEFAULT);
  if (months === null) return null;
  const zero = minorUnits(0);
  try {
    return { fv: futureValue(monthly ? check.amount : zero, percent(rateText), months, monthly ? zero : check.amount), months, rateText };
  } catch {
    // a RangeError from the engine (beyond a safe integer, or an unsupported term): no figure rather than a wrong one
    return { fv: null, months, rateText };
  }
}
