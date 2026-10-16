import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { edgeMargin, isOnEdge } from '../margins';

const m = minorUnits;

describe('isOnEdge', () => {
  it('flags a line passed or failed by under 5% of its base', () => {
    expect(isOnEdge(m(29), m(600))).toBe(true);
    expect(isOnEdge(m(-29), m(600))).toBe(true);
    expect(isOnEdge(m(0), m(600))).toBe(true);
  });

  it('exactly 5% is not on the edge', () => {
    expect(isOnEdge(m(30), m(600))).toBe(false);
    expect(isOnEdge(m(-30), m(600))).toBe(false);
  });

  it('a zero base never flags', () => {
    expect(isOnEdge(m(5), m(0))).toBe(false);
  });

  it('matches the integer rule and is symmetric', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000_000 }),
        fc.integer({ min: -10_000_000_000, max: 10_000_000_000 }),
        (b, x) => {
          const abs = x < 0 ? -BigInt(x) : BigInt(x);
          expect(isOnEdge(m(x), m(b))).toBe(100n * abs < 5n * BigInt(b));
          expect(isOnEdge(m(x), m(b))).toBe(isOnEdge(m(-x), m(b)));
        }
      )
    );
  });
});

describe('edgeMargin', () => {
  it('uses the threshold as the base', () => {
    expect(edgeMargin('cash', m(29_999), m(600_000), m(410_000))).toEqual({
      line: 'cash',
      margin: 29_999,
      threshold: 600_000,
      base: 600_000,
      flag: 'on_edge',
    });
    expect(edgeMargin('cash', m(30_000), m(600_000), m(410_000)).flag).toBeNull();
  });

  it('falls back to a month of costs when the threshold is 0', () => {
    expect(edgeMargin('month', m(20_499), m(0), m(410_000))).toMatchObject({ base: 410_000, flag: 'on_edge' });
    expect(edgeMargin('month', m(20_500), m(0), m(410_000)).flag).toBeNull();
  });

  it('does not flag when threshold and costs are both 0', () => {
    expect(edgeMargin('cash', m(100), m(0), m(0))).toMatchObject({ base: 0, flag: null });
  });

  it('flags a failed line within 5%', () => {
    expect(edgeMargin('owe', m(-50), m(7_200_000), m(410_000)).flag).toBe('on_edge');
  });

  it('rejects bad inputs', () => {
    expect(() => edgeMargin('cash', m(1), -1 as never, m(1))).toThrow(/^edgeMargin: /);
    expect(() => edgeMargin('cash', m(1), m(1), -1 as never)).toThrow(/^edgeMargin: /);
    expect(() => edgeMargin('cash', 1.5 as never, m(1), m(1))).toThrow(/^edgeMargin: /);
  });
});
