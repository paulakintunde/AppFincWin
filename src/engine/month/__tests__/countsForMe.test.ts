import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { fcRuns } from '../../decide/v3/__tests__/helpers/fcRuns';
import { countsForMe, countsForMeTotal } from '../index';
import type { CountsLine } from '../types';

const m = minorUnits;
const line = (o: Partial<CountsLine> & Pick<CountsLine, 'amount' | 'isShared' | 'isMine'>): CountsLine => ({
  id: 'l',
  ...o,
});

describe('countsForMe', () => {
  it('my own personal line counts in full', () => {
    expect(countsForMe(line({ amount: m(-5000), isShared: false, isMine: true }))).toBe(-5000);
  });
  it('a settlement of mine counts 0', () => {
    expect(countsForMe(line({ amount: m(-5000), isShared: false, isMine: true, isSettlement: true }))).toBe(0);
  });
  it('a shared settlement counts 0 (D-06)', () => {
    expect(countsForMe(line({ amount: m(30000), isShared: true, isMine: false, isSettlement: true }))).toBe(0);
  });
  it('a shared line counts its stored share', () => {
    expect(countsForMe(line({ amount: m(-2000), isShared: true, isMine: false }))).toBe(-2000);
  });
  it('a partner personal line without opt-in counts 0 (absent means off)', () => {
    expect(countsForMe(line({ amount: m(-9000), isShared: false, isMine: false }))).toBe(0);
  });
  it('a partner personal line with opt-in false counts 0', () => {
    expect(countsForMe(line({ amount: m(-9000), isShared: false, isMine: false, partnerOptIn: false }))).toBe(0);
  });
  it('a partner personal line with opt-in true counts in full', () => {
    expect(countsForMe(line({ amount: m(250000), isShared: false, isMine: false, partnerOptIn: true }))).toBe(250000);
  });
  it('a zero line counts 0', () => {
    expect(countsForMe(line({ amount: m(0), isShared: true, isMine: true }))).toBe(0);
  });
  it('isSettlement false does not suppress the line', () => {
    expect(countsForMe(line({ amount: m(-100), isShared: false, isMine: true, isSettlement: false }))).toBe(-100);
  });
});

describe('countsForMeTotal', () => {
  it('is 0 for no lines', () => {
    expect(countsForMeTotal([])).toBe(0);
  });
  it('sums what counts', () => {
    expect(
      countsForMeTotal([
        line({ amount: m(-5000), isShared: false, isMine: true }),
        line({ amount: m(-9000), isShared: false, isMine: false }),
        line({ amount: m(-2000), isShared: true, isMine: false }),
        line({ amount: m(777), isShared: true, isMine: true, isSettlement: true }),
      ]),
    ).toBe(-7000);
  });
  it('throws when the sum leaves the safe range', () => {
    const big = line({ amount: m(Number.MAX_SAFE_INTEGER), isShared: false, isMine: true });
    expect(() => countsForMeTotal([big, big])).toThrow(RangeError);
  });

  const lineArb: fc.Arbitrary<CountsLine> = fc.record({
    id: fc.string(),
    amount: fc.integer({ min: -1_000_000, max: 1_000_000 }).map(minorUnits),
    isShared: fc.boolean(),
    isMine: fc.boolean(),
    isSettlement: fc.option(fc.boolean(), { nil: undefined }),
    partnerOptIn: fc.option(fc.boolean(), { nil: undefined }),
  });

  it('property: total is additive over concatenation', () => {
    fc.assert(
      fc.property(fc.array(lineArb), fc.array(lineArb), (xs, ys) => {
        expect(countsForMeTotal([...xs, ...ys])).toBe(countsForMeTotal(xs) + countsForMeTotal(ys));
      }),
      { numRuns: fcRuns(200) },
    );
  });

  it('property: marking a line a settlement removes exactly its contribution', () => {
    fc.assert(
      fc.property(fc.array(lineArb), lineArb, fc.array(lineArb), (xs, l, ys) => {
        const before = countsForMeTotal([...xs, l, ...ys]);
        const after = countsForMeTotal([...xs, { ...l, isSettlement: true }, ...ys]);
        expect(after).toBe(before - countsForMe(l));
      }),
      { numRuns: fcRuns(200) },
    );
  });
});
