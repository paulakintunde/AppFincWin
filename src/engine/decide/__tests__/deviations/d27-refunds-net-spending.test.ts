/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 */
import { deriveMoney } from '../../money';
import { SOLE_SHARE } from '../../share';
import type { MonthRecord } from '../../types';
import { USD, fullMonth, line, monthsOf } from '../helpers/fixtures';

const personal = { byDefault: SOLE_SHARE, byCategory: [] };

function money(months: MonthRecord[]) {
  const r = deriveMoney({
    currency: USD,
    months,
    bills: [],
    incomeSeries: [],
    basisOverride: null,
    spendingShare: personal,
  });
  if (!r.ok) throw new Error('expected ok');
  return r.money;
}

describe('D-27 refunds net spending', () => {
  it('D-27: a refund nets against spending in the month it lands and is never income', () => {
    // Prototype: had no refund concept; a refund logged as money in would have raised income.
    const plain = monthsOf([
      [500_000, 300_000],
      [500_000, 300_000],
      [500_000, 300_000],
    ]);
    const refunded = [...plain];
    refunded[1] = fullMonth('2026-02', 500_000, 300_000, [
      line({ id: 'rf', date: '2026-02-20', direction: 'in', amount: 50_000, isRefund: true }),
    ]);
    const a = money(plain);
    const b = money(refunded);
    expect(b.incomeAverage).toBe(a.incomeAverage);
    expect(b.steadiness).toBe(a.steadiness);
    expect(b.monthsUsed.map((x) => x.spending)).toEqual([300_000, 250_000, 300_000]);
  });

  it("D-27: a month's net spending is floored at 0", () => {
    const ms = monthsOf([
      [500_000, 10_000],
      [500_000, 10_000],
      [500_000, 10_000],
    ]);
    ms[0] = fullMonth('2026-01', 500_000, 10_000, [
      line({ id: 'rf', date: '2026-01-20', direction: 'in', amount: 25_000, isRefund: true }),
    ]);
    const r = money(ms);
    expect(r.monthsUsed.find((x) => x.month === '2026-01')!.spending).toBe(0);
    expect(r.monthsUsed.find((x) => x.month === '2026-01')!.income).toBe(500_000);
  });
});
