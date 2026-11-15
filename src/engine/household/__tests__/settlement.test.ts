import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { pairBalances, type SharedLineForBalance } from '../balances';
import { excludeSettlements, isSettlement, settleUpTotal } from '../settlement';

const m = minorUnits;
function line(lineId: string, over: Partial<SharedLineForBalance> = {}): SharedLineForBalance {
  return {
    lineId,
    payerKey: 'paul',
    paidFromJoint: false,
    status: 'open',
    pendingSettlementId: null,
    shares: [
      { memberKey: 'paul', amount: m(500) },
      { memberKey: 'sam', amount: m(500) },
    ],
    ...over,
  };
}

describe('isSettlement / excludeSettlements', () => {
  it('is true only for an explicit true', () => {
    expect(isSettlement({ isSettlement: true })).toBe(true);
    expect(isSettlement({ isSettlement: false })).toBe(false);
    expect(isSettlement({ isSettlement: null })).toBe(false);
    expect(isSettlement({})).toBe(false);
  });

  it('drops settlement rows and keeps order', () => {
    const rows = [{ id: 1 }, { id: 2, isSettlement: true }, { id: 3, isSettlement: false }];
    expect(excludeSettlements(rows).map((r) => r.id)).toEqual([1, 3]);
  });
});

describe('settleUpTotal', () => {
  it('totals exactly the ticked open lines', () => {
    const ls = [line('a'), line('b', { shares: [{ memberKey: 'sam', amount: m(200) }] }), line('c')];
    expect(settleUpTotal(ls, 'sam', 'paul', new Set(['a', 'b']))).toEqual({
      amount: 700,
      lineIds: ['a', 'b'],
    });
  });

  it('refuses pending and settled lines by omission', () => {
    const ls = [line('a'), line('p', { status: 'pending' }), line('s', { status: 'settled' })];
    expect(settleUpTotal(ls, 'sam', 'paul', new Set(['a', 'p', 's']))).toEqual({
      amount: 500,
      lineIds: ['a'],
    });
  });

  it('is zero with nothing ticked or no pair lines', () => {
    expect(settleUpTotal([line('a')], 'sam', 'paul', new Set())).toEqual({ amount: 0, lineIds: [] });
  });

  it('goes negative when the ticked set nets the other way', () => {
    const ls = [line('a', { payerKey: 'sam' })];
    expect(settleUpTotal(ls, 'sam', 'paul', new Set(['a']))).toMatchObject({ amount: -500 });
  });

  it('property: all open lines ticked equals the pair net', () => {
    const KEYS = ['a', 'b', 'c'];
    const arb = fc.array(
      fc.record({
        payer: fc.constantFrom(...KEYS),
        joint: fc.boolean(),
        open: fc.boolean(),
        amts: fc.array(fc.integer({ min: 0, max: 5000 }), { minLength: 3, maxLength: 3 }),
      }),
      { maxLength: 8 },
    );
    fc.assert(
      fc.property(arb, (raw) => {
        const ls: SharedLineForBalance[] = raw.map((r, i) => ({
          lineId: `l${i}`,
          payerKey: r.payer,
          paidFromJoint: r.joint,
          status: r.open ? 'open' : 'settled',
          pendingSettlementId: null,
          shares: KEYS.map((k, j) => ({ memberKey: k, amount: m(r.amts[j]!) })),
        }));
        const all = new Set(ls.map((l) => l.lineId));
        const net = pairBalances(ls, 'b').find((p) => p.otherKey === 'a')?.net ?? 0;
        expect(settleUpTotal(ls, 'a', 'b', all).amount).toBe(net);
      }),
    );
  });
});
