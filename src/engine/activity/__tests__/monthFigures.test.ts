import fc from 'fast-check';
import {
  isUnpaidOutflow,
  unpaidOutflows,
  leftAfterEverything,
  barShares,
  monthPosition,
  type MonthFigureRow,
} from '../monthFigures';

const row = (over: Partial<MonthFigureRow> = {}): MonthFigureRow => ({
  status: 'pending',
  isTransfer: false,
  originalAmount: -1000,
  amountHome: -1000,
  ...over,
});

describe('isUnpaidOutflow', () => {
  it('accepts a pending negative non-transfer non-refund row', () => {
    expect(isUnpaidOutflow(row())).toBe(true);
  });
  it('rejects paid, skipped, transfer, refund and positive rows', () => {
    expect(isUnpaidOutflow(row({ status: 'paid' }))).toBe(false);
    expect(isUnpaidOutflow(row({ status: 'skipped' }))).toBe(false);
    expect(isUnpaidOutflow(row({ isTransfer: true }))).toBe(false);
    expect(isUnpaidOutflow(row({ isRefund: true }))).toBe(false);
    expect(isUnpaidOutflow(row({ originalAmount: 400, amountHome: 400 }))).toBe(false);
    expect(isUnpaidOutflow(row({ originalAmount: 0, amountHome: 0 }))).toBe(false);
  });
});

describe('unpaidOutflows', () => {
  it('sums only unpaid outflows and outflow projections', () => {
    const rows = [
      row({ originalAmount: -5000, amountHome: -5000 }),
      row({ originalAmount: 3000, amountHome: 3000 }),
      row({ status: 'paid', originalAmount: -2000, amountHome: -2000 }),
      row({ isTransfer: true, originalAmount: -1000, amountHome: -1000 }),
      row({ status: 'skipped', originalAmount: -700, amountHome: -700 }),
      row({ isRefund: true, originalAmount: 400, amountHome: 400 }),
    ];
    const projections = [
      { amount: -1500, amountHome: -1500 },
      { amount: 900, amountHome: 900 },
    ];
    expect(unpaidOutflows(rows, projections)).toEqual({ total: 6500, count: 2, unconverted: 0 });
  });
  it('counts rows and projections without a rate as unconverted, not in total', () => {
    const rows = [row({ amountHome: null })];
    const projections = [{ amount: -300, amountHome: null }];
    expect(unpaidOutflows(rows, projections)).toEqual({ total: 0, count: 0, unconverted: 2 });
  });
  it('is empty for no input', () => {
    expect(unpaidOutflows([], [])).toEqual({ total: 0, count: 0, unconverted: 0 });
  });
});

describe('leftAfterEverything', () => {
  it('is paid in + paid out - unpaid', () => {
    expect(leftAfterEverything({ paidIn: 10000, paidOut: -4000 }, 3000)).toBe(3000);
    expect(leftAfterEverything({ paidIn: 0, paidOut: 0 }, 2500)).toBe(-2500);
  });
});

describe('barShares', () => {
  it('computes integer percents of money in', () => {
    expect(barShares(10000, -2500, 3333)).toEqual({ paidPct: 25, pendingPct: 33 });
  });
  it('is 0 when money in is 0', () => {
    expect(barShares(0, -500, 100)).toEqual({ paidPct: 0, pendingPct: 0 });
  });
  it('clamps so paid + pending <= 100', () => {
    expect(barShares(1000, -900, 900)).toEqual({ paidPct: 90, pendingPct: 10 });
  });
  it('clamps paid to 100', () => {
    expect(barShares(100, -500, 0)).toEqual({ paidPct: 100, pendingPct: 0 });
  });
  it('rounds half up', () => {
    expect(barShares(3, -1, 0).paidPct).toBe(33);
    expect(barShares(8, -1, 0).paidPct).toBe(13);
  });
  it('property: shares are bounded and sum to at most 100', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        (paidIn, paidOut, unpaid) => {
          const { paidPct, pendingPct } = barShares(paidIn, paidOut, unpaid);
          return paidPct >= 0 && pendingPct >= 0 && paidPct + pendingPct <= 100;
        }
      )
    );
  });
});

describe('monthPosition', () => {
  it('builds every figure from the parts', () => {
    const rows = [row({ originalAmount: -3000, amountHome: -3000 }), row({ amountHome: null })];
    const p = monthPosition({ paidIn: 10000, paidOut: -2000 }, rows, [{ amount: -1000, amountHome: -1000 }]);
    expect(p).toEqual({
      paidIn: 10000,
      paidOut: -2000,
      unpaid: 4000,
      unpaidCount: 2,
      unconvertedUnpaid: 1,
      left: 4000,
      paidPct: 20,
      pendingPct: 40,
    });
  });
});

describe('unpaid properties', () => {
  const outflow = fc.integer({ min: 1, max: 1_000_000 }).map((n) => row({ originalAmount: -n, amountHome: -n }));
  const ignored = fc.oneof(
    fc.integer({ min: 1, max: 1_000_000 }).map((n) => row({ originalAmount: n, amountHome: n })),
    fc.integer({ min: 1, max: 1_000_000 }).map((n) => row({ isTransfer: true, originalAmount: -n, amountHome: -n })),
    fc.integer({ min: 1, max: 1_000_000 }).map((n) => row({ isRefund: true, originalAmount: n, amountHome: n })),
    fc.integer({ min: 1, max: 1_000_000 }).map((n) => row({ status: 'skipped', originalAmount: -n, amountHome: -n })),
    fc.integer({ min: 1, max: 1_000_000 }).map((n) => row({ status: 'paid', originalAmount: -n, amountHome: -n }))
  );
  it('never decreases when an outflow row is added', () => {
    fc.assert(
      fc.property(fc.array(outflow), outflow, (rows, extra) => {
        return unpaidOutflows([...rows, extra], []).total >= unpaidOutflows(rows, []).total;
      })
    );
  });
  it('is unchanged by transfer, income, refund, skipped or paid rows', () => {
    fc.assert(
      fc.property(fc.array(outflow), fc.array(ignored), (rows, extras) => {
        return unpaidOutflows([...rows, ...extras], []).total === unpaidOutflows(rows, []).total;
      })
    );
  });
});
