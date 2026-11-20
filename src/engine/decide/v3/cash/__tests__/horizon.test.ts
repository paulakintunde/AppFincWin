/**
 * 08.1 D-05 / D-06: the no-purchase cash path stretched past 90 days. A fresh window on the first day is the ordinary path; later
 * months add exactly what the series and the spread add, once (the first build counted saving and debt flows once per month window).
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { addDays } from '../../dates';
import { buildHorizon, horizonDays } from '../horizon';
import { buildCashPathV3 } from '../path';
import { v3Series } from '../../__tests__/helpers/fixtures';

const mu = (n: number) => minorUnits(n);
const MONTH = { unit: 'month', every: 1 } as const;
const ASOF = '2026-11-15';
const series = [
  v3Series({ id: 'pay', role: 'pay', cadence: MONTH, anchorDate: '2026-12-01', amount: 300000 }),
  v3Series({ id: 'rent', role: 'bill', cadence: MONTH, anchorDate: '2026-12-01', amount: 120000 }),
];
const base = { asOf: ASOF, series, paidThisMonth: new Set<string>(), erest: mu(40000), e: mu(80000), opening: mu(140000) };
const CARD_DATES = ['2026-11-25', '2026-12-25', '2027-01-25', '2027-02-25', '2027-03-25', '2027-04-25', '2027-05-25', '2027-06-25', '2027-07-25', '2027-08-25', '2027-09-25', '2027-10-25', '2027-11-25', '2027-12-25', '2028-01-25'];
const outflows = CARD_DATES.map((date) => ({ date, amount: mu(30000) }));

function lowestOf(points: readonly { balance: number }[]): bigint {
  return BigInt(Math.min(...points.map((p) => p.balance)));
}

describe('buildHorizon', () => {
  it('a window opened on the check day is the ordinary 90-day path, purchase included', () => {
    const h = buildHorizon({ ...base, outflows, totalDays: 460 });
    fc.assert(
      fc.property(fc.array(fc.record({ day: fc.integer({ min: 0, max: 89 }), amount: fc.integer({ min: 1, max: 400000 }) }), { maxLength: 4 }), (buys) => {
        const flows = buys.map((b) => ({ date: addDays(ASOF, b.day), amount: mu(b.amount) }));
        const ref = buildCashPathV3({ ...base, days: 90, savings: outflows, extraOut: flows });
        return h.lowestFrom(ASOF, flows) === lowestOf(ref.points);
      })
    );
  });

  it('each later month adds the usual month once: $700 a month here, never more, never less', () => {
    const h = buildHorizon({ ...base, outflows, totalDays: 460 });
    // the same day of each later month sits one usual month apart: pay 3000 - bills 1200 - spending 800 - card 300 = +700
    const jan = h.lowestFrom('2027-01-01', []);
    const feb = h.lowestFrom('2027-02-01', []);
    expect(feb - jan).toBe(70000n);
    const may = h.lowestFrom('2027-05-01', []);
    const jun = h.lowestFrom('2027-06-01', []);
    expect(jun - may).toBe(70000n);
  });

  it('a purchase flow dated before the window, or after it, is not read', () => {
    const h = buildHorizon({ ...base, outflows, totalDays: 460 });
    const none = h.lowestFrom('2027-03-01', []);
    expect(h.lowestFrom('2027-03-01', [{ date: '2027-02-28', amount: mu(999999) }])).toBe(none);
    expect(h.lowestFrom('2027-03-01', [{ date: '2027-08-01', amount: mu(999999) }])).toBe(none);
    expect(h.lowestFrom('2027-03-01', [{ date: '2027-03-01', amount: mu(1000) }])).toBeLessThan(none);
  });

  it('flows before the check day are ignored, and a card payment past the span falls off the end', () => {
    const h = buildHorizon({ ...base, outflows: [{ date: '2026-11-01', amount: mu(5) }, { date: '2029-01-01', amount: mu(5) }, ...outflows], totalDays: 460 });
    const clean = buildHorizon({ ...base, outflows, totalDays: 460 });
    expect(h.lowestFrom('2026-12-01', [])).toBe(clean.lowestFrom('2026-12-01', []));
  });

  it('horizonDays covers every start day to the limit plus a whole window', () => {
    expect(horizonDays('2026-11-15', '2027-11-15')).toBe(365 + 90 + 1);
  });
});
