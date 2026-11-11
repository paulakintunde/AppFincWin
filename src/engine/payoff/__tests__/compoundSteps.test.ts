import fc from 'fast-check';
import golden from './golden/calc-grow.json';
import { compoundSteps } from '../compoundSteps';
import { percent } from '../types';
import { minorUnits, type MinorUnits } from '../../money/types';

const m = minorUnits;

describe('compoundSteps', () => {
  it('from nothing at 4% for ten years', () => {
    const r = compoundSteps(m(0), m(20_000), percent('4'), 120);
    expect(r.value).toBe(2_944_998);
    expect(r.putIn).toBe(2_400_000);
    expect(r.growth).toBe(544_998);
    expect(r.interest).toBe(544_998);
  });

  it('from 769000 at 4% for ten years', () => {
    const r = compoundSteps(m(769_000), m(20_000), percent('4'), 120);
    expect(r.value).toBe(4_091_444);
    expect(r.putIn).toBe(3_169_000);
    expect(r.growth).toBe(922_444);
  });

  it.each([
    [0, '2', 2_654_396],
    [0, '6', 3_277_589],
    [769_000, '2', 3_593_502],
    [769_000, '6', 4_676_698],
  ])('start %i at %s%%', (start, apr, value) => {
    expect(compoundSteps(m(start), m(20_000), percent(apr), 120).value).toBe(value);
  });

  it('matches every golden growth figure and year point', () => {
    for (const g of golden.growth) {
      const rate = percent(String(g.bp / 100));
      for (const [start, e] of [
        [0, g.own],
        [769_000, g.withNow],
      ] as const) {
        const r = compoundSteps(m(start), m(20_000), rate, 120);
        expect(r.value).toBe(e.value);
        expect(r.putIn).toBe(e.put);
        expect(r.years.map((y) => ({ value: y.value, put: y.putIn }))).toEqual(e.years);
      }
    }
  });

  it('has one year point per 12 months', () => {
    expect(compoundSteps(m(0), m(100), percent('3'), 30).years).toHaveLength(2);
    expect(compoundSteps(m(0), m(100), percent('3'), 11).years).toHaveLength(0);
    expect(compoundSteps(m(500), m(0), percent('3'), 0)).toMatchObject({ value: 500, putIn: 500, growth: 0 });
  });

  it.each([
    ['start', () => compoundSteps(-1 as MinorUnits, m(0), percent('1'), 12)],
    ['add', () => compoundSteps(m(0), -1 as MinorUnits, percent('1'), 12)],
    ['months', () => compoundSteps(m(0), m(0), percent('1'), -1)],
    ['fractional months', () => compoundSteps(m(0), m(0), percent('1'), 1.5)],
  ])('invalid %s throws', (_n, fn) => {
    expect(fn).toThrow(RangeError);
    expect(fn).toThrow(/^compoundSteps: /);
  });

  it('value = putIn + growth, growth >= 0, and a higher rate never lowers the value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 2_000 }),
        fc.integer({ min: 0, max: 360 }),
        (start, add, bp, months) => {
          const lo = compoundSteps(m(start), m(add), percent((bp / 100).toFixed(2)), months);
          const hi = compoundSteps(m(start), m(add), percent(((bp + 100) / 100).toFixed(2)), months);
          expect(lo.value).toBe(lo.putIn + lo.growth);
          expect(lo.growth).toBeGreaterThanOrEqual(0);
          expect(hi.value).toBeGreaterThanOrEqual(lo.value);
        }
      ),
      { numRuns: 100 }
    );
  });
});
