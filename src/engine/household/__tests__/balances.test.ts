import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { owedToMeTotal, pairBalances, type SharedLineForBalance } from '../balances';

const m = minorUnits;
function line(over: Partial<SharedLineForBalance> & { lineId: string }): SharedLineForBalance {
  return {
    payerKey: 'paul',
    paidFromJoint: false,
    status: 'open',
    pendingSettlementId: null,
    shares: [
      { memberKey: 'paul', amount: m(4200) },
      { memberKey: 'sam', amount: m(4200) },
    ],
    ...over,
  };
}

describe('pairBalances', () => {
  it('payer view: the other owes me', () => {
    expect(pairBalances([line({ lineId: 'l1' })], 'paul')).toEqual([
      { otherKey: 'sam', net: 4200, pending: 0, lineIds: ['l1'] },
    ]);
  });

  it('other view: I owe the payer', () => {
    expect(pairBalances([line({ lineId: 'l1' })], 'sam')).toEqual([
      { otherKey: 'paul', net: -4200, pending: 0, lineIds: ['l1'] },
    ]);
  });

  it('joint-paid lines create no owing', () => {
    expect(pairBalances([line({ lineId: 'l1', paidFromJoint: true })], 'paul')).toEqual([]);
  });

  it('settled and written-off lines are excluded', () => {
    const ls = [line({ lineId: 'a', status: 'settled' }), line({ lineId: 'b', status: 'written_off' })];
    expect(pairBalances(ls, 'paul')).toEqual([]);
  });

  it('pending lines count and show as pending', () => {
    const r = pairBalances([line({ lineId: 'a', status: 'pending', pendingSettlementId: 's1' })], 'paul');
    expect(r).toEqual([{ otherKey: 'sam', net: 4200, pending: 4200, lineIds: ['a'] }]);
    const r2 = pairBalances([line({ lineId: 'a', status: 'pending', pendingSettlementId: 's1' })], 'sam');
    expect(r2[0]).toMatchObject({ net: -4200, pending: -4200 });
  });

  it('never simplifies across three people', () => {
    const ls = [
      line({
        lineId: 'ab',
        payerKey: 'a',
        shares: [
          { memberKey: 'a', amount: m(100) },
          { memberKey: 'b', amount: m(100) },
        ],
      }),
      line({
        lineId: 'bc',
        payerKey: 'b',
        shares: [
          { memberKey: 'b', amount: m(300) },
          { memberKey: 'c', amount: m(300) },
        ],
      }),
    ];
    expect(pairBalances(ls, 'a')).toEqual([{ otherKey: 'b', net: 100, pending: 0, lineIds: ['ab'] }]);
    expect(pairBalances(ls, 'b')).toEqual([
      { otherKey: 'a', net: -100, pending: 0, lineIds: ['ab'] },
      { otherKey: 'c', net: 300, pending: 0, lineIds: ['bc'] },
    ]);
  });

  it('ignores lines the viewer is not part of', () => {
    expect(pairBalances([line({ lineId: 'l1' })], 'zed')).toEqual([]);
  });

  it('skips zero-amount shares and keeps offsetting pairs with their lines', () => {
    const ls = [
      line({
        lineId: 'z',
        shares: [
          { memberKey: 'paul', amount: m(10) },
          { memberKey: 'sam', amount: m(0) },
        ],
      }),
      line({ lineId: 'x' }),
      line({
        lineId: 'y',
        payerKey: 'sam',
        shares: [
          { memberKey: 'paul', amount: m(4200) },
          { memberKey: 'sam', amount: m(0) },
        ],
      }),
    ];
    expect(pairBalances(ls, 'paul')).toEqual([{ otherKey: 'sam', net: 0, pending: 0, lineIds: ['x', 'y'] }]);
  });

  it('counts a line once when it has several shares for the same other member', () => {
    const l = line({
      lineId: 'dup',
      shares: [
        { memberKey: 'sam', amount: m(5) },
        { memberKey: 'sam', amount: m(6) },
      ],
    });
    expect(pairBalances([l], 'paul')).toEqual([{ otherKey: 'sam', net: 11, pending: 0, lineIds: ['dup'] }]);
  });

  it('sorts by otherKey', () => {
    const l = line({
      lineId: 'l',
      shares: [
        { memberKey: 'zed', amount: m(1) },
        { memberKey: 'amy', amount: m(1) },
        { memberKey: 'bob', amount: m(1) },
      ],
    });
    expect(pairBalances([l], 'paul').map((p) => p.otherKey)).toEqual(['amy', 'bob', 'zed']);
  });

  const KEYS = ['a', 'b', 'c', 'd'];
  const lineArb = fc.record({
    payer: fc.constantFrom(...KEYS),
    joint: fc.boolean(),
    status: fc.constantFrom('open', 'pending', 'settled', 'written_off'),
    amts: fc.array(fc.integer({ min: 0, max: 10_000 }), { minLength: 4, maxLength: 4 }),
  });
  const toLines = (
    raw: readonly {
      payer: string;
      joint: boolean;
      status: SharedLineForBalance['status'];
      amts: number[];
    }[],
  ): SharedLineForBalance[] =>
    raw.map((r, i) => ({
      lineId: `l${i}`,
      payerKey: r.payer,
      paidFromJoint: r.joint,
      status: r.status,
      pendingSettlementId: null,
      shares: KEYS.map((k, j) => ({ memberKey: k, amount: m(r.amts[j]!) })),
    }));

  it('property: antisymmetric and zero-sum', () => {
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 8 }), (raw) => {
        const ls = toLines(raw);
        let total = 0;
        for (const x of KEYS) {
          const mine = pairBalances(ls, x);
          for (const p of mine) {
            total += p.net;
            const theirs = pairBalances(ls, p.otherKey).find((q) => q.otherKey === x);
            expect(theirs?.net ?? 0).toBe(-p.net);
          }
        }
        expect(total).toBe(0);
      }),
    );
  });

  it('property: joint-paid lines never change any net', () => {
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 8 }), (raw) => {
        const ls = toLines(raw);
        const withJointOnly = ls.map((l) => ({ ...l, paidFromJoint: true }));
        expect(pairBalances([...ls, ...withJointOnly], 'a').map((p) => p.net)).toEqual(
          pairBalances(ls, 'a').map((p) => p.net),
        );
        expect(pairBalances(withJointOnly, 'a')).toEqual([]);
      }),
    );
  });

  it('property: owedToMeTotal is never negative and counts positives only', () => {
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 8 }), (raw) => {
        const pairs = pairBalances(toLines(raw), 'a');
        const total = owedToMeTotal(pairs);
        expect(total).toBeGreaterThanOrEqual(0);
        expect(total).toBe(pairs.reduce((s, p) => s + Math.max(p.net, 0), 0));
      }),
    );
  });
});

describe('owedToMeTotal', () => {
  it('sums positive nets only', () => {
    expect(
      owedToMeTotal([
        { otherKey: 'a', net: m(300), pending: m(0), lineIds: [] },
        { otherKey: 'b', net: m(-100), pending: m(0), lineIds: [] },
        { otherKey: 'c', net: m(50), pending: m(0), lineIds: [] },
      ]),
    ).toBe(350);
    expect(owedToMeTotal([])).toBe(0);
  });
});
