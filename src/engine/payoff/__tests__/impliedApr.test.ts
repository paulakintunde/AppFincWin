import fc from 'fast-check';
import { amortise, amortiseDue } from '../amortise';
import { MAX_APR, MAX_IMPLIED_APR_COUNT, impliedApr, impliedAprDisplay, type ImpliedAprInput } from '../impliedApr';
import { percent, percentFromScaled, type Percent } from '../types';
import { minorUnits } from '../../money/types';

const m = minorUnits;

function base(over: Partial<ImpliedAprInput> = {}): ImpliedAprInput {
  return { financed: m(120_000), payment: m(10_662), count: 12, periodsPerYear: 12, timing: 'ordinary', ...over };
}

function solved(input: ImpliedAprInput): Percent {
  const r = impliedApr(input);
  if (r === null || 'aboveMax' in r) throw new Error('expected a rate');
  return r.apr;
}

describe('impliedApr (D-90)', () => {
  it('D-90 solves a hand-checked ordinary plan (1,200.00 over 12 at 106.62 is about 12%)', () => {
    const apr = solved(base());
    expect(apr).toBeGreaterThanOrEqual(percent('12'));
    expect(apr).toBeLessThan(percent('12.01'));
  });

  it('D-90 solves a hand-checked due plan (105.57 first payment today is about 12%)', () => {
    const apr = solved(base({ payment: m(10_557), timing: 'due' }));
    expect(apr).toBeGreaterThanOrEqual(percent('12'));
    expect(apr).toBeLessThan(percent('12.02'));
  });

  it('D-90 a single ordinary payment solves (one period at the periodic rate)', () => {
    // 100.00 financed, 110.00 paid one month on: r = 10% a month = 120% a year.
    const apr = solved(base({ financed: m(10_000), payment: m(11_000), count: 1 }));
    expect(apr).toBe(percent('120'));
  });

  it('D-90 the frequency changes the rate for the same figures', () => {
    const monthly = solved(base());
    const weekly = solved(base({ periodsPerYear: 52, count: 12 }));
    expect(weekly).toBeGreaterThan(monthly);
  });

  it('D-90 below the price is null', () => {
    expect(impliedApr(base({ payment: m(9_999) }))).toBeNull();
  });

  it('D-90 nothing financed is null', () => {
    expect(impliedApr(base({ financed: m(0) }))).toBeNull();
  });

  it('D-90 a total equal to financed is 0%', () => {
    expect(impliedApr(base({ payment: m(10_000) }))).toEqual({ apr: 0n });
  });

  it('D-90 a single payment on the day has no rate', () => {
    expect(impliedApr(base({ count: 1, timing: 'due', payment: m(130_000) }))).toBeNull();
  });

  it('D-90 above the cap reports aboveMax', () => {
    expect(impliedApr(base({ financed: m(10_000), payment: m(11_000), count: 1, periodsPerYear: 12 }))).toEqual({
      apr: percent('120'),
    });
    expect(impliedApr(base({ financed: m(1_000), payment: m(10_000), count: 2 }))).toEqual({ aboveMax: true });
  });

  it('D-90 a caller-supplied ceiling is honoured', () => {
    expect(impliedApr(base({ maxApr: percent('5') }))).toEqual({ aboveMax: true });
    expect(impliedApr(base({ maxApr: percent('50') }))).toEqual({ apr: solved(base()) });
  });

  it('D-90 the cap equals 999.99%', () => {
    expect(MAX_APR).toBe(percent('999.99'));
  });

  it('D-90 invalid inputs throw RangeError', () => {
    expect(() => impliedApr(base({ financed: m(-1) }))).toThrow(RangeError);
    expect(() => impliedApr(base({ payment: m(1.5) }))).toThrow(RangeError);
    expect(() => impliedApr(base({ count: 0 }))).toThrow(RangeError);
    expect(() => impliedApr(base({ periodsPerYear: 0 }))).toThrow(RangeError);
    expect(() => impliedApr(base({ count: Number.MAX_SAFE_INTEGER + 2 }))).toThrow(RangeError);
    expect(() => impliedApr(base({ count: MAX_IMPLIED_APR_COUNT + 1 }))).toThrow(RangeError);
  });

  it('D-90 the display rounds up to one decimal', () => {
    expect(impliedAprDisplay(percent('18.41'))).toBe('18.5');
    expect(impliedAprDisplay(percent('18.4'))).toBe('18.4');
    expect(impliedAprDisplay(percent('18.0000000001'))).toBe('18.1');
    expect(impliedAprDisplay(percent('18'))).toBe('18');
    expect(impliedAprDisplay(percentFromScaled(0n))).toBe('0');
    expect(impliedAprDisplay(percent('0.01'))).toBe('0.1');
  });

  it('D-90 n = 500 finishes well inside a loose guard', () => {
    const input = base({ financed: m(10_000_000), payment: m(25_000), count: 500 });
    const t0 = Date.now();
    solved(input);
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(1000);
  });

  it('D-90 the solved rate reproduces the payment within one minor unit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 50_000, max: 5_000_000 }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 2, max: 60 }),
        fc.boolean(),
        (financed, aprWhole, count, due) => {
          const apr = percent(String(aprWhole));
          const plan = due ? amortiseDue(m(financed), apr, count) : amortise(m(financed), apr, count);
          const timing = due ? 'due' : 'ordinary';
          const r = impliedApr({ financed: m(financed), payment: plan.payment, count, periodsPerYear: 12, timing });
          if (r === null || 'aboveMax' in r) return true;
          const again = due ? amortiseDue(m(financed), r.apr, count) : amortise(m(financed), r.apr, count);
          return Math.abs(again.payment - plan.payment) <= 1;
        },
      ),
      { numRuns: 300 },
    );
  });

  it('D-90 the rate rises with the payment', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10_000, max: 1_000_000 }),
        fc.integer({ min: 2, max: 60 }),
        fc.integer({ min: 0, max: 5_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        fc.constantFrom('due' as const, 'ordinary' as const),
        fc.constantFrom(12, 26, 52),
        (financed, count, a, b, timing, periodsPerYear) => {
          const floor = Math.ceil(financed / count);
          const rate = (p: number): bigint => {
            const r = impliedApr({ financed: m(financed), payment: m(p), count, periodsPerYear, timing });
            if (r === null) return -1n;
            return 'aboveMax' in r ? MAX_APR + 1n : r.apr;
          };
          const lo = floor + Math.min(a, b);
          const hi = floor + Math.max(a, b);
          return rate(lo) <= rate(hi);
        },
      ),
      { numRuns: 300 },
    );
  });
});
