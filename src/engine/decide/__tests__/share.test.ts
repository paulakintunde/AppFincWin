import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import {
  SOLE_SHARE,
  memberParts,
  myPart,
  resolveShare,
  type ResolvedShare,
  type ShareScope,
  type SplitRule,
} from '../share';

const hh = (memberCount: number, myIndex: number, rule: SplitRule): ShareScope => ({
  kind: 'household',
  memberCount,
  myIndex,
  rule,
});

function share(scope: ShareScope): ResolvedShare {
  const r = resolveShare(scope);
  if (!r.ok) throw new Error('expected ok');
  return r.share;
}

const m = minorUnits;

describe('resolveShare', () => {
  it('personal is the sole share', () => {
    expect(resolveShare({ kind: 'personal' })).toEqual({ ok: true, share: SOLE_SHARE });
    expect(myPart(m(12_345), SOLE_SHARE)).toBe(12_345);
  });

  it('a one-member household is the sole share for any rule', () => {
    expect(share(hh(1, 0, { kind: 'even' }))).toEqual(SOLE_SHARE);
    expect(share(hh(1, 0, { kind: 'weight', weights: [0] }))).toEqual(SOLE_SHARE);
  });

  it('mine is the sole share', () => {
    const s = share(hh(2, 1, { kind: 'mine' }));
    expect(s).toEqual(SOLE_SHARE);
    expect(myPart(m(777), s)).toBe(777);
  });

  it('even split with two members gives the odd unit to the lower index', () => {
    expect(myPart(m(1_001), share(hh(2, 0, { kind: 'even' })))).toBe(501);
    expect(myPart(m(1_001), share(hh(2, 1, { kind: 'even' })))).toBe(500);
  });

  it('even split with three members', () => {
    const parts = [0, 1, 2].map((i) => myPart(m(100), share(hh(3, i, { kind: 'even' }))));
    expect(parts).toEqual([34, 33, 33]);
  });

  it('weight split', () => {
    const rule: SplitRule = { kind: 'weight', weights: [3, 1] };
    expect(myPart(m(1_000), share(hh(2, 0, rule)))).toBe(750);
    expect(myPart(m(1_000), share(hh(2, 1, rule)))).toBe(250);
  });

  it('weight split with a zero-weight member', () => {
    const rule: SplitRule = { kind: 'weight', weights: [2, 0, 1] };
    expect(myPart(m(999), share(hh(3, 1, rule)))).toBe(0);
    expect(myPart(m(999), share(hh(3, 0, rule)))).toBe(666);
    expect(myPart(m(999), share(hh(3, 2, rule)))).toBe(333);
  });

  it('all-zero weights are a guarded result', () => {
    expect(resolveShare(hh(2, 0, { kind: 'weight', weights: [0, 0] }))).toEqual({
      ok: false,
      reason: 'split_weights_zero',
    });
  });

  it('amount split uses figures as proportions', () => {
    const s = share(hh(2, 0, { kind: 'amount', amounts: [m(60_000), m(20_000)] }));
    expect(myPart(m(80_000), s)).toBe(60_000);
    expect(myPart(m(40_000), s)).toBe(30_000);
  });

  it('all-zero amounts are a guarded result', () => {
    expect(resolveShare(hh(2, 0, { kind: 'amount', amounts: [m(0), m(0)] }))).toEqual({
      ok: false,
      reason: 'split_amounts_zero',
    });
  });

  it('negative totals split symmetrically', () => {
    expect(myPart(m(-1_001), share(hh(2, 0, { kind: 'even' })))).toBe(-501);
  });

  it('throws on an unknown scope or rule kind', () => {
    expect(() => resolveShare({ kind: 'x' } as never)).toThrow('Unhandled shareScope');
    expect(() => resolveShare(hh(2, 0, { kind: 'x' } as never))).toThrow('Unhandled splitRule');
  });

  describe('guards', () => {
    it.each([0, 1.5])('rejects memberCount %s', (n) => {
      expect(() => resolveShare(hh(n, 0, { kind: 'even' }))).toThrow(/^resolveShare: /);
    });
    it.each([-1, 2, 0.5])('rejects myIndex %s', (i) => {
      expect(() => resolveShare(hh(2, i, { kind: 'even' }))).toThrow(/^resolveShare: /);
    });
    it('rejects a weights length mismatch', () => {
      expect(() => resolveShare(hh(2, 0, { kind: 'weight', weights: [1] }))).toThrow(
        /^resolveShare: /,
      );
    });
    it.each([-1, 1.5])('rejects weight %s', (w) => {
      expect(() => resolveShare(hh(2, 0, { kind: 'weight', weights: [w, 1] }))).toThrow(
        /^resolveShare: /,
      );
    });
    it('rejects an amounts length mismatch', () => {
      expect(() => resolveShare(hh(2, 0, { kind: 'amount', amounts: [m(1)] }))).toThrow(
        /^resolveShare: /,
      );
    });
    it('rejects a negative amount', () => {
      expect(() => resolveShare(hh(2, 0, { kind: 'amount', amounts: [m(-1), m(1)] }))).toThrow(
        /^resolveShare: /,
      );
    });
  });
});

describe('myPart / memberParts', () => {
  it('myPart guards the index', () => {
    expect(() => myPart(m(10), { weights: [1, 1], myIndex: 2 })).toThrow(/^myPart: /);
    expect(() => myPart(m(10), { weights: [1, 1], myIndex: -1 })).toThrow(/^myPart: /);
  });

  it('memberParts aligns with weights, zero for zero-weight members', () => {
    const s = share(hh(3, 0, { kind: 'weight', weights: [2, 0, 1] }));
    expect(memberParts(m(999), s)).toEqual([666, 0, 333]);
  });

  it('memberParts for the sole share', () => {
    expect(memberParts(m(55), SOLE_SHARE)).toEqual([55]);
  });

  it('property: parts sum to the total and agree with myPart', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.integer({ min: 0, max: 1_000 }), { minLength: 1, maxLength: 6 })
          .filter((w) => w.some((x) => x > 0)),
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        (weights, total) => {
          const t = m(total);
          const parts = weights.map((_, i) => myPart(t, { weights, myIndex: i }));
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
          expect(memberParts(t, { weights, myIndex: 0 })).toEqual(parts);
        },
      ),
    );
  });

  it('property: even split is within 1 of total / memberCount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        (n, total) => {
          const weights = Array<number>(n).fill(1);
          for (let i = 0; i < n; i++) {
            expect(Math.abs(myPart(m(total), { weights, myIndex: i }) - total / n)).toBeLessThan(1);
          }
        },
      ),
    );
  });
});
