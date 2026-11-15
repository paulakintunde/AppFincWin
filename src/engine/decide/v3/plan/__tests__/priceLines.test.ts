import fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { priceAfterLines, type PriceLine } from '../priceLines';

const mu = minorUnits;
const line = (amount: number, effect: PriceLine['effect'], counted = true): PriceLine => ({ amount: mu(amount), effect, counted });

describe('priceAfterLines (05.5-26)', () => {
  it('is the advertised price with no lines', () => {
    expect(priceAfterLines(mu(100_000), [])).toBe(100_000);
  });

  it('adds counted fees and takes off counted trade-ins; an uncounted line changes nothing', () => {
    expect(priceAfterLines(mu(100_000), [line(8_000, 'adds'), line(20_000, 'takes_off'), line(5_000, 'adds', false)])).toBe(88_000);
  });

  it('never goes below 0', () => {
    expect(priceAfterLines(mu(10_000), [line(50_000, 'takes_off')])).toBe(0);
  });

  it('property: equals advertised + counted adds - counted takes-off, floored at 0', () => {
    const lineArb = fc.record({
      amount: fc.integer({ min: 0, max: 1_000_000 }),
      effect: fc.constantFrom('adds' as const, 'takes_off' as const),
      counted: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.array(lineArb, { maxLength: 8 }), (adv, ls) => {
        const net = ls.filter((l) => l.counted).reduce((t, l) => t + (l.effect === 'adds' ? l.amount : -l.amount), 0);
        expect(priceAfterLines(mu(adv), ls.map((l) => ({ ...l, amount: mu(l.amount) })))).toBe(Math.max(0, adv + net));
      })
    );
  });
});
