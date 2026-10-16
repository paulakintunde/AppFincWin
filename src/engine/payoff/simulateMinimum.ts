/**
 * DEC-03: revolving minimum-payment simulation (prototype `dSimMin`), all
 * bigint with one divideHalfUp per rounding point per month (D-20).
 *
 * D-16: the minimum-payment terms are card-record inputs. The prototype's
 * `max($25, 1% + interest)` is only the US market-table entry and is supplied
 * from outside; the engine has no default.
 *
 * D-17: two distinct outcomes. `never_clears` fires on the first month the
 * payment cannot cover that month's interest (explicit check, independent of
 * the cap). `exceeds_month_cap` means the balance was still open at
 * SIMULATION_MONTH_CAP although payments always exceeded interest; it is never
 * inferred as never-clears.
 *
 * Finding: under the prototype's own formula (percent + interest, with a
 * floor) the payment always exceeds interest, so its never branch is
 * unreachable. Success criterion 2 is therefore exercised with
 * `interestAdded: false` terms, the D-16 field that exists for exactly this.
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { SIMULATION_MONTH_CAP } from './constants';
import {
  MONTHLY_RATE_DENOMINATOR,
  ONE_HUNDRED_PERCENT,
  minorFromBigInt,
  type CardMinimumTerms,
  type MinimumPaymentResult,
  type Percent,
} from './types';

const FN = 'simulateMinimum';

export function simulateMinimum(
  balance: MinorUnits,
  apr: Percent,
  terms: CardMinimumTerms
): MinimumPaymentResult {
  if (balance < 0) {
    throw new RangeError('simulateMinimum: balance must be >= 0');
  }
  const D = MONTHLY_RATE_DENOMINATOR;
  const floor = BigInt(terms.floor);
  let bal = BigInt(balance);
  if (bal === 0n) {
    return {
      outcome: 'cleared',
      months: 0,
      firstPayment: minorFromBigInt(0n, FN),
      totalInterest: minorFromBigInt(0n, FN),
      remainingBalance: minorFromBigInt(0n, FN),
    };
  }

  let month = 0;
  let totalInterest = 0n;
  let first = 0n;
  while (bal > 0n) {
    if (month === SIMULATION_MONTH_CAP) {
      return {
        outcome: 'exceeds_month_cap',
        months: SIMULATION_MONTH_CAP,
        firstPayment: minorFromBigInt(first, FN),
        totalInterest: minorFromBigInt(totalInterest, FN),
        remainingBalance: minorFromBigInt(bal, FN),
      };
    }
    const interest = divideHalfUp(bal * apr, D);
    const percentPart = divideHalfUp(bal * terms.minimumPercent, ONE_HUNDRED_PERCENT);
    const base = terms.interestAdded ? percentPart + interest : percentPart;
    const scheduled = base > floor ? base : floor;
    const due = bal + interest;
    const paid = scheduled < due ? scheduled : due;
    if (month === 0) first = paid;
    month += 1;
    // D-17: explicit, per-month check, independent of the cap.
    if (paid <= interest) {
      return {
        outcome: 'never_clears',
        months: month,
        firstPayment: minorFromBigInt(first, FN),
        totalInterest: null,
        remainingBalance: minorFromBigInt(bal, FN),
      };
    }
    totalInterest += interest;
    bal = due - paid;
  }
  return {
    outcome: 'cleared',
    months: month,
    firstPayment: minorFromBigInt(first, FN),
    totalInterest: minorFromBigInt(totalInterest, FN),
    remainingBalance: minorFromBigInt(0n, FN),
  };
}
