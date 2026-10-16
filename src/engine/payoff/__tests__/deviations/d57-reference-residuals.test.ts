/**
 * Named deviation from a published reference (D-57, D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the printed table.
 */
import { divideHalfUp } from '../../../money/rounding';
import { minorUnits } from '../../../money/types';
import { amortise } from '../../amortise';
import { MONTHLY_RATE_DENOMINATOR, percent, type Percent } from '../../types';

const m = minorUnits;

function balanceAfter(principal: number, apr: Percent, n: number, row: number): bigint {
  const payment = BigInt(amortise(m(principal), apr, n).payment);
  let bal = BigInt(principal);
  for (let k = 1; k <= row; k++) {
    const due = bal + divideHalfUp(bal * apr, MONTHLY_RATE_DENOMINATOR);
    bal = due - (payment < due ? payment : due);
  }
  return bal;
}

describe('D-57 reference residuals', () => {
  it('D-57: R2 prints an unrounded payment, so its last rows differ; the engine final payment absorbs the residual', () => {
    // The printed table carries 973.501998... internally (36 x 973.501998 - 32,000 = 3,046.07);
    // the source also misprints the annuity factor 32.871 as "32.781".
    const apr = percent('6');
    const r = amortise(m(3_200_000), apr, 36);
    expect(balanceAfter(3_200_000, apr, 36, 35)).toBe(96_876n); // printed 96_866 (+10)
    expect(r.finalPayment).toBe(97_360);
    expect(r.totalInterest).toBe(304_610); // printed 304_608
    expect(35 * Number(r.payment) + Number(r.finalPayment)).toBe(3_200_000 + Number(r.totalInterest));
  });

  it('D-57: R3 leaves a -1.38 rounding line; the engine puts the residual into the final payment', () => {
    const apr = percent('3.6');
    const r = amortise(m(14_000_000), apr, 240);
    expect(balanceAfter(14_000_000, apr, 240, 239)).toBe(81_545n); // printed 81_533
    expect(r.finalPayment).toBe(81_790);
    expect(r.totalInterest).toBe(5_659_714);
  });

  it('D-57: R4 names a 3-cent leftover; the engine final payment is 86.30, exactly 86.27 + 0.03', () => {
    const r = amortise(m(50_000), percent('12'), 6);
    expect(r.finalPayment).toBe(8_630);
    expect(r.finalPayment).toBe(r.payment + 3);
  });
});
