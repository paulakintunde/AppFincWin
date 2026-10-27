import fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { impliedApr } from '../../../../payoff/impliedApr';
import { BIWEEKLY, MONTHLY } from '../cadence';
import { checkQuoted, scoredPayment } from '../quoted';

const m = minorUnits;
const base = {
  financed: m(200000),
  count: 24,
  cadence: MONTHLY,
  timing: 'ordinary' as const,
};

describe('scoredPayment (I41)', () => {
  it('I41 never improves: result >= computed and >= quoted', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
        fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
        (c, q) => {
          const r = scoredPayment(c === null ? null : m(c), q === null ? null : m(q));
          if (c === null && q === null) return r === null;
          if (r === null) return false;
          return (c === null || r >= c) && (q === null || r >= q);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('returns the larger value and null when both null', () => {
    expect(scoredPayment(m(8500), m(8300))).toBe(8500);
    expect(scoredPayment(m(8500), m(8700))).toBe(8700);
    expect(scoredPayment(null, m(5))).toBe(5);
    expect(scoredPayment(m(5), null)).toBe(5);
    expect(scoredPayment(null, null)).toBeNull();
  });
});

describe('checkQuoted', () => {
  it('C1 differs above tolerance, matches within it', () => {
    const t = { ...base, computed: m(8500), tolerance: m(100) };
    expect(checkQuoted({ ...t, quoted: m(8700) })).toEqual({
      kind: 'differs', computed: 8500, quoted: 8700, gap: 200, direction: 'higher',
    });
    expect(checkQuoted({ ...t, quoted: m(8550) })).toEqual({ kind: 'matches', computed: 8500, quoted: 8550 });
    expect(checkQuoted({ ...t, quoted: m(8600) }).kind).toBe('matches'); // strict: gap equal to tolerance matches
    const low = checkQuoted({ ...t, quoted: m(8300) });
    expect(low).toMatchObject({ kind: 'differs', gap: 200, direction: 'lower' });
    expect(scoredPayment(m(8500), m(8300))).toBe(8500);
  });

  it('none when no quote', () => {
    expect(checkQuoted({ ...base, computed: m(8500), quoted: null, tolerance: m(100) })).toEqual({ kind: 'none' });
  });

  it('D-26 tolerance 0 flags any difference', () => {
    expect(checkQuoted({ ...base, computed: m(8500), quoted: m(8501), tolerance: m(0) }).kind).toBe('differs');
    expect(checkQuoted({ ...base, computed: m(8500), quoted: m(8500), tolerance: m(0) }).kind).toBe('matches');
  });

  it('I36 from quote: implied rate reported, none invented', () => {
    const r = checkQuoted({ ...base, computed: null, quoted: m(10000), tolerance: m(100) });
    expect(r.kind).toBe('from_quote');
    if (r.kind !== 'from_quote') throw new Error('x');
    const direct = impliedApr({ financed: m(200000), payment: m(10000), count: 24, periodsPerYear: 12, timing: 'ordinary' });
    expect(direct).not.toBeNull();
    expect(r.impliedApr).toBe((direct as { apr: bigint }).apr);
  });

  it('from_quote with a total below financed has no rate (null), above ceiling is above_max', () => {
    expect(checkQuoted({ ...base, computed: null, quoted: m(100), tolerance: m(100) })).toEqual({
      kind: 'from_quote', quoted: 100, impliedApr: null,
    });
    expect(checkQuoted({ ...base, financed: m(100), count: 1, computed: null, quoted: m(2000), tolerance: m(1) })).toMatchObject({
      kind: 'from_quote', impliedApr: 'above_max',
    });
  });

  it('every-N cadence: implied APR for {week,2} equals impliedApr at ppy 26 within one scaled unit', () => {
    const r = checkQuoted({ ...base, cadence: BIWEEKLY, computed: null, quoted: m(9000), tolerance: m(1) });
    const direct = impliedApr({ financed: m(200000), payment: m(9000), count: 24, periodsPerYear: 26, timing: 'ordinary' });
    if (r.kind !== 'from_quote' || direct === null || !('apr' in direct) || typeof r.impliedApr !== 'bigint') {
      throw new Error('unexpected');
    }
    const d = r.impliedApr - direct.apr;
    expect(d < 0n ? -d : d).toBeLessThanOrEqual(1n);
  });

  it('rejects a negative tolerance', () => {
    expect(() => checkQuoted({ ...base, computed: m(1), quoted: m(1), tolerance: m(-1) })).toThrow(RangeError);
  });
});
