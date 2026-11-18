// 08-30 (ARC-18, HH-08): settlement records are neither spending nor income. They are left out of every month total the way
// transfer legs are, but they are not transfers and do not add to transferCount. A row without the flag behaves as before.
import fc from 'fast-check';
import { myShareOfLine } from '../../household/myShare';
import { minorUnits } from '../../money/types';
import { monthTotals, type TotalsInput } from '../totals';

const row = (over: Partial<TotalsInput> = {}): TotalsInput => ({
  amountHome: -1000,
  status: 'paid',
  isTransfer: false,
  ...over,
});

describe('monthTotals settlement rows (ARC-18)', () => {
  it('leaves a paid settlement out of money out', () => {
    const t = monthTotals([row({ amountHome: -4000, isSettlement: true }), row({ amountHome: -1000 })], []);
    expect(t.paidOut).toBe(-1000);
    expect(t.net).toBe(-1000);
    expect(t.count).toBe(1);
  });

  it('leaves a paid settlement out of money in', () => {
    const t = monthTotals([row({ amountHome: 4000, isSettlement: true }), row({ amountHome: 2500 })], []);
    expect(t.paidIn).toBe(2500);
    expect(t.net).toBe(2500);
    expect(t.count).toBe(1);
  });

  it('leaves a pending settlement out of still to come and the pending count', () => {
    const t = monthTotals([row({ status: 'pending', amountHome: -4000, isSettlement: true })], []);
    expect(t.stillToCome).toBe(0);
    expect(t.pendingCount).toBe(0);
    expect(t.count).toBe(0);
  });

  it('does not count a settlement without a home amount as waiting for a rate', () => {
    const t = monthTotals([row({ amountHome: null, isSettlement: true })], []);
    expect(t.unconvertedCount).toBe(0);
  });

  it('does not count a settlement as a transfer leg', () => {
    const t = monthTotals([row({ isSettlement: true }), row({ isTransfer: true }), row({ amountHome: -300 })], []);
    expect(t.transferCount).toBe(1);
    expect(t.paidOut).toBe(-300);
    expect(t.count).toBe(1);
  });

  it('treats an omitted or false flag exactly as before', () => {
    const rows = [row({ amountHome: -700 }), row({ amountHome: 900, isSettlement: false })];
    const plain = monthTotals(rows.map((r) => ({ ...r, isSettlement: undefined })), []);
    expect(monthTotals(rows, [])).toEqual(plain);
    expect(plain.paidIn).toBe(900);
    expect(plain.paidOut).toBe(-700);
  });
});

// 08.1-04 (D-04): totals take a per-line share function. The default is the full amount, so every existing caller is unchanged.
describe('monthTotals share function (08.1-04)', () => {
  const arbRow = fc.record({
    amountHome: fc.option(fc.integer({ min: -500000, max: 500000 }), { nil: null }),
    status: fc.constantFrom('paid' as const, 'pending' as const, 'skipped' as const),
    isTransfer: fc.boolean(),
    isRefund: fc.boolean(),
  });

  it('an identity share gives the same totals as no share function', () => {
    fc.assert(
      fc.property(fc.array(arbRow, { maxLength: 30 }), (rows) => {
        expect(monthTotals(rows, [], (r) => r.amountHome)).toEqual(monthTotals(rows, []));
      })
    );
  });

  it('with a household share the total is the sum of the viewer shares', () => {
    const viewer = 'me';
    const partner = 'you';
    type Line = TotalsInput & { id: string; createdBy: string; isShared: boolean; split: { me: number; you: number } };
    const arbLine = fc
      .record({
        id: fc.uuid(),
        total: fc.integer({ min: 1, max: 400000 }),
        mineShare: fc.integer({ min: 0, max: 100 }),
        isShared: fc.boolean(),
        own: fc.boolean(),
      })
      .map((x): Line => {
        const amount = -x.total;
        const mine = -Math.floor((x.total * x.mineShare) / 100);
        return {
          id: x.id,
          amountHome: amount,
          status: 'paid',
          isTransfer: false,
          createdBy: x.own ? viewer : partner,
          isShared: x.isShared,
          split: { me: mine, you: amount - mine },
        };
      });
    fc.assert(
      fc.property(fc.array(arbLine, { maxLength: 25 }), (lines) => {
        const shareOf = (l: Line) =>
          myShareOfLine(
            { createdBy: l.createdBy, isShared: l.isShared, amount: minorUnits(l.amountHome ?? 0) },
            [
              { memberKey: viewer, share: minorUnits(l.split.me) },
              { memberKey: partner, share: minorUnits(l.split.you) },
            ],
            viewer
          ).amount;
        const expected = lines.reduce((sum, l) => sum + shareOf(l), 0);
        const got = monthTotals(lines, [], shareOf);
        expect(got.paidOut + got.paidIn).toBe(expected);
        expect(got.net).toBe(expected);
      })
    );
  });

  it('a null share counts as waiting for a rate', () => {
    const t = monthTotals([row({ amountHome: -100 })], [], () => null);
    expect(t.unconvertedCount).toBe(1);
    expect(t.paidOut).toBe(0);
  });
});
