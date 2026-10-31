import { minorUnits as mu } from '../../../../money/types';
import { cardPaidInFullHistory, type CardLedgerInput } from '../cardStatements';

const ASOF = '2026-10-31'; // the last month whose two-month window has ended is 2026-07
const L = (date: string, amount: number) => ({ date, amount: mu(amount) });
const base = (over: Partial<CardLedgerInput>): CardLedgerInput => ({
  asOf: ASOF,
  balanceNow: mu(0),
  lines: [],
  fromMonth: '2026-06',
  ...over,
});

describe('cardPaidInFullHistory', () => {
  it('flags false when 500.00 is owed at each month end and only 25.00 is paid in each window', () => {
    const r = cardPaidInFullHistory(base({ balanceNow: mu(-50000), lines: [L('2026-07-10', 2500), L('2026-08-10', 2500)] }));
    expect(r).toEqual([false, false]);
  });

  it('flags true when each month is paid by a line on the 10th of the next', () => {
    const lines = [
      L('2026-06-05', -10000), L('2026-07-10', 10000),
      L('2026-07-05', -10000), L('2026-08-10', 10000),
      L('2026-08-05', -10000), L('2026-09-10', 10000),
      L('2026-09-05', -10000), L('2026-10-10', 10000),
    ];
    expect(cardPaidInFullHistory(base({ lines }))).toEqual([true, true]);
  });

  it('flags true with no payments when nothing is owed at the month end', () => {
    expect(cardPaidInFullHistory(base({ balanceNow: mu(5000) }))).toEqual([true, true]);
  });

  it('counts payments that exactly equal what was owed, and not one minor unit less', () => {
    const lines = [L('2026-08-10', 3000), L('2026-09-10', 2000)];
    expect(cardPaidInFullHistory(base({ fromMonth: '2026-07', balanceNow: mu(0), lines }))).toEqual([true]);
    expect(cardPaidInFullHistory(base({ fromMonth: '2026-07', balanceNow: mu(-1), lines }))).toEqual([false]);
  });

  it('ignores a payment dated after the two-month window', () => {
    const lines = [L('2026-10-10', 5000), L('2026-08-10', -100)];
    expect(cardPaidInFullHistory(base({ fromMonth: '2026-07', balanceNow: mu(0), lines }))).toEqual([false]);
  });

  it('returns [] when fromMonth is after the last closed month', () => {
    expect(cardPaidInFullHistory(base({ fromMonth: '2026-08' }))).toEqual([]);
  });

  it('counts lines dated after today in the walk back', () => {
    const lines = [L('2026-08-10', 500), L('2026-11-15', -300)];
    expect(cardPaidInFullHistory(base({ fromMonth: '2026-07', balanceNow: mu(-100), lines }))).toEqual([true]);
  });

  it('returns one flag per month, oldest first, ending at the last closed month', () => {
    const r = cardPaidInFullHistory(base({ fromMonth: '2025-11', balanceNow: mu(1) }));
    expect(r).toHaveLength(9); // 2025-11 .. 2026-07
  });

  it('works across a year boundary', () => {
    const r = cardPaidInFullHistory(base({ asOf: '2027-02-10', fromMonth: '2026-11', balanceNow: mu(1) }));
    expect(r).toHaveLength(1); // last closed month is 2026-11
  });

  it('throws when the walked balance leaves the safe integer range', () => {
    const big = Number.MAX_SAFE_INTEGER;
    expect(() => cardPaidInFullHistory(base({ fromMonth: '2026-07', balanceNow: mu(big), lines: [L('2026-08-10', -big)] }))).toThrow(RangeError);
  });
});
