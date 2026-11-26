// 10.1-30 (D-28): Clone last month keeps a split line's category parts.
import fc from 'fast-check';
import { cloneCandidates, type CloneSourceRow } from '../cloneMonth';

function src(over: Partial<CloneSourceRow> & { id: string }): CloneSourceRow {
  return {
    local_date: '2026-01-15',
    name: 'Shop',
    original_amount: -1001,
    original_currency: 'GBP',
    category_id: 'c1',
    account_id: 'a1',
    payment_type: 'card',
    recurring_series_id: null,
    transfer_id: null,
    status: 'paid',
    ...over,
  };
}
const parts = [
  { categoryId: 'c1', amount: -600 },
  { categoryId: 'c2', amount: -401, label: 'taxTip' as const },
];

describe('cloneCandidates parts', () => {
  it('copies the parts as they are when the amount is the same', () => {
    const out = cloneCandidates({ prevRows: [src({ id: '1', parts })], currentRows: [], targetMonth: '2026-02' });
    expect(out[0]!.parts).toEqual(parts);
    expect(out[0]!.parts).not.toBe(parts);
  });

  it('gives null for an unsplit row and for one part only', () => {
    const out = cloneCandidates({
      prevRows: [src({ id: '1', name: 'A' }), src({ id: '2', name: 'B', parts: [parts[0]!] }), src({ id: '3', name: 'C', parts: null })],
      currentRows: [],
      targetMonth: '2026-02',
    });
    expect(out.map((c) => c.parts)).toEqual([null, null, null]);
  });

  it('scales to a different amount, odd cent to the largest part, label kept', () => {
    const out = cloneCandidates({
      prevRows: [src({ id: '1', parts })],
      currentRows: [],
      targetMonth: '2026-02',
      amountOverrides: new Map([['1', -2001]]),
    });
    expect(out[0]!.amount).toBe(-2001);
    expect(out[0]!.parts!.reduce((s, p) => s + p.amount, 0)).toBe(-2001);
    expect(out[0]!.parts![1]!.label).toBe('taxTip');
  });

  it('scaled parts always add up and keep the sign', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100000 }), { minLength: 2, maxLength: 8 }),
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.boolean(),
        (sizes, target, neg) => {
          const sign = neg ? -1 : 1;
          const ps = sizes.map((a, i) => ({ categoryId: `c${i}`, amount: sign * a }));
          const total = ps.reduce((s, p) => s + p.amount, 0);
          const out = cloneCandidates({
            prevRows: [src({ id: '1', original_amount: total, parts: ps })],
            currentRows: [],
            targetMonth: '2026-02',
            amountOverrides: new Map([['1', sign * target]]),
          });
          const got = out[0]!.parts!;
          expect(got.reduce((s, p) => s + p.amount, 0)).toBe(sign * target);
          expect(got.every((p) => (p.amount < 0) === neg || p.amount === 0)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('keeps an unplaced gap as a gap when scaling (D-03)', () => {
    const out = cloneCandidates({
      prevRows: [src({ id: '1', original_amount: -1000, parts: [{ categoryId: 'c1', amount: -300 }, { categoryId: 'c2', amount: -300 }] })],
      currentRows: [],
      targetMonth: '2026-02',
      amountOverrides: new Map([['1', -500]]),
    });
    expect(out[0]!.parts).toHaveLength(2);
    expect(out[0]!.parts!.reduce((s, p) => s + p.amount, 0)).toBe(-300); // 150 + 150 placed, the 200 gap stays unplaced
  });
});
