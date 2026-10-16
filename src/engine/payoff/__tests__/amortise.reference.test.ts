/**
 * D-57: independent reference tables. Where the prototype and a reference disagree, the reference wins.
 *
 * Sources (amounts converted to minor units):
 *  R1  OpenStax, Contemporary Mathematics, section 6.8 Ex. 6.79
 *      https://openstax.org/books/contemporary-mathematics/pages/6-8-the-basics-of-loans
 *  R2  OpenStax, Principles of Finance, section 8.3 car loan
 *      https://openstax.org/books/principles-finance/pages/8-3-loan-amortization
 *  R3  OpenStax, Principles of Finance, section 8.3 20-year mortgage (Table 8.5)
 *      https://openstax.org/books/principles-finance/pages/8-3-loan-amortization
 *  R4  Sekhon and Bloom, Applied Finite Mathematics, section 6.5 Ex. 6
 *      https://math.libretexts.org/Bookshelves/Applied_Mathematics/Applied_Finite_Mathematics_(Sekhon_and_Bloom)/06:_Mathematics_of_Finance/6.05:_Miscellaneous_Application_Problems
 *
 * Row figures come from a local helper that replays amortise's documented schedule and is
 * cross-checked against amortise's own totals, so the rows tested are amortise's rows.
 */
import { divideHalfUp } from '../../money/rounding';
import { minorUnits } from '../../money/types';
import { amortise } from '../amortise';
import { MONTHLY_RATE_DENOMINATOR, ZERO_PERCENT, percent, type Percent } from '../types';

const m = minorUnits;

interface Row {
  readonly interest: bigint;
  readonly paid: bigint;
  readonly balance: bigint;
}

function rows(principal: number, apr: Percent, n: number): Row[] {
  const payment = BigInt(amortise(m(principal), apr, n).payment);
  const out: Row[] = [];
  let bal = BigInt(principal);
  for (let k = 1; k <= n; k++) {
    const interest = divideHalfUp(bal * apr, MONTHLY_RATE_DENOMINATOR);
    const due = bal + interest;
    const paid = k === n ? due : payment < due ? payment : due;
    bal = due - paid;
    out.push({ interest, paid, balance: bal });
  }
  return out;
}

function crossCheck(principal: number, apr: Percent, n: number): void {
  const r = amortise(m(principal), apr, n);
  const rs = rows(principal, apr, n);
  expect(rs[n - 1]!.paid).toBe(BigInt(r.finalPayment));
  expect(rs.reduce((s, x) => s + x.interest, 0n)).toBe(BigInt(r.totalInterest));
  expect(rs.reduce((s, x) => s + x.paid, 0n)).toBe(BigInt(r.totalPaid));
}

describe('D-57 published amortisation references', () => {
  it('R1 OpenStax Contemporary Mathematics 6.8: 10,000.00 at 4.75% over 240 months', () => {
    const apr = percent('4.75');
    const r = amortise(m(1_000_000), apr, 240);
    const rs = rows(1_000_000, apr, 240);
    expect(r.payment).toBe(6_462);
    expect(rs[0]!.interest).toBe(3_958n);
    expect(rs[0]!.paid - rs[0]!.interest).toBe(2_504n);
    expect(rs[9]!.interest).toBe(3_868n);
    expect(rs[14]!.balance).toBe(961_383n);
    expect(r.finalPayment).toBe(6_538);
    expect(r.totalInterest).toBe(550_956);
    crossCheck(1_000_000, apr, 240);
  });

  it('R2 OpenStax Principles of Finance 8.3 car loan: 32,000.00 at 6% over 36 months', () => {
    const apr = percent('6');
    const r = amortise(m(3_200_000), apr, 36);
    const rs = rows(3_200_000, apr, 36);
    expect(r.payment).toBe(97_350);
    expect([rs[0]!.balance, rs[1]!.balance, rs[2]!.balance]).toEqual([3_118_650n, 3_036_893n, 2_954_727n]);
    expect([rs[0]!.interest, rs[1]!.interest, rs[2]!.interest]).toEqual([16_000n, 15_593n, 15_184n]);
    expect(rs[35]!.interest).toBe(484n);
    crossCheck(3_200_000, apr, 36);
  });

  it('R3 OpenStax Principles of Finance 8.3 mortgage: 140,000.00 at 3.6% over 240 months', () => {
    const apr = percent('3.6');
    const r = amortise(m(14_000_000), apr, 240);
    const rs = rows(14_000_000, apr, 240);
    expect(r.payment).toBe(81_916);
    expect([rs[0]!.balance, rs[1]!.balance, rs[2]!.balance]).toEqual([13_960_084n, 13_920_048n, 13_879_892n]);
    expect([rs[0]!.interest, rs[1]!.interest, rs[2]!.interest]).toEqual([42_000n, 41_880n, 41_760n]);
    expect(rs[238]!.interest).toBe(489n);
    expect(rs[239]!.interest).toBe(245n);
    crossCheck(14_000_000, apr, 240);
  });

  it('R4 Sekhon and Bloom 6.5: 500.00 at 12% over 6 months', () => {
    const apr = percent('12');
    const r = amortise(m(50_000), apr, 6);
    const rs = rows(50_000, apr, 6);
    expect(r.payment).toBe(8_627);
    expect(rs[0]!.interest).toBe(500n);
    expect(rs[0]!.paid - rs[0]!.interest).toBe(8_127n);
    expect(rs[0]!.balance).toBe(41_873n);
    expect(rs[5]!.interest).toBe(85n);
    crossCheck(50_000, apr, 6);
  });

  it('zero rate is an even split with the remainder in the final payment', () => {
    const r = amortise(m(100_000), ZERO_PERCENT, 12);
    expect(r.payment).toBe(8_333);
    expect(r.finalPayment).toBe(8_337);
  });
});
