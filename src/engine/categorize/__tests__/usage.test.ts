import fc from 'fast-check';
import { categoryUsage, crossesCap, type UsageRow } from '../usage';

const row = (amountHome: number | null, o: Partial<UsageRow> = {}): UsageRow => ({
  amountHome,
  status: 'paid',
  isTransfer: false,
  ...o,
});

describe('categoryUsage', () => {
  it('counts paid and pending, over cap', () => {
    const r = categoryUsage([row(-5000), row(-2000, { status: 'pending' })], 6000);
    expect(r).toMatchObject({ count: 2, spent: 7000, state: 'over', over: 1000 });
  });
  it('refunds reduce spend', () => {
    expect(categoryUsage([row(-5000), row(3000, { isRefund: true })], null).spent).toBe(2000);
  });
  it('refundsExceed is not floored', () => {
    const r = categoryUsage([row(-1000), row(3000, { isRefund: true })], 500);
    expect(r.spent).toBe(-2000);
    expect(r.state).toBe('refundsExceed');
  });
  it('unused, used, capped, exactly at cap', () => {
    expect(categoryUsage([], null).state).toBe('unused');
    expect(categoryUsage([row(-1)], null).state).toBe('used');
    expect(categoryUsage([row(-1)], 10).state).toBe('capped');
    expect(categoryUsage([row(-10)], 10)).toMatchObject({ state: 'over', over: 0 });
  });
  it('ignores skipped and transfers; null amount counts but is unconverted', () => {
    const r = categoryUsage(
      [row(-100, { status: 'skipped' }), row(-100, { isTransfer: true }), row(null)],
      null,
    );
    expect(r).toMatchObject({ count: 1, spent: 0, unconvertedCount: 1, state: 'used' });
  });
  it('property: spent is negated sum; refunds never increase spent; over >= 0', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 })),
        fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: null }),
        fc.integer({ min: 1, max: 1000 }),
        (amts, cap, refund) => {
          const rows = amts.map((a) => row(a));
          const base = categoryUsage(rows, cap);
          expect(base.spent).toBe(0 - amts.reduce((a, b) => a + b, 0));
          expect(base.over).toBeGreaterThanOrEqual(0);
          const withRefund = categoryUsage([...rows, row(refund, { isRefund: true })], cap);
          expect(withRefund.spent).toBeLessThanOrEqual(base.spent);
        },
      ),
    );
  });
});

describe('crossesCap', () => {
  it('only on the crossing save', () => {
    expect(crossesCap(4000, 6000, 5000)).toBe(true);
    expect(crossesCap(6000, 7000, 5000)).toBe(false);
    expect(crossesCap(4000, 4500, 5000)).toBe(false);
    expect(crossesCap(4000, 6000, null)).toBe(false);
  });
});
