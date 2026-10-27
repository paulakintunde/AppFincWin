import { minorUnits } from '../../../../money/types';
import { addYearMonths } from '../../dates';
import type { IncomeMonth } from '../../types';
import { seasonalReadyMonth } from '../seasonWalk';

const mu = minorUnits;

/** Last year, November to October: Nov..Apr 20,000 left each, May..Sep 150,000, Oct 20,000. */
function lastYear(leftOf: (calendar: string) => number): { readonly months: readonly IncomeMonth[] } {
  return {
    months: Array.from({ length: 12 }, (_, i): IncomeMonth => {
      const ym = addYearMonths('2025-11', i);
      return { month: ym, income: mu(0), everyday: mu(0), left: mu(leftOf(ym.slice(5))), lean: false };
    }),
  };
}

const seasonal = lastYear((mm) => (['05', '06', '07', '08', '09'].includes(mm) ? 150_000 : 20_000));

describe('seasonalReadyMonth (D-60)', () => {
  it('D-60 walks the season: 300,000 from November is ready in June, the second busy month', () => {
    // Dec..Apr save 5 x 20,000 = 100,000; May adds 150,000 (250,000); June adds 150,000 (400,000).
    expect(seasonalReadyMonth(seasonal, '2026-11', 300_000n)).toEqual({ months: 7, month: '2027-06' });
  });

  it('D-60 is never the typical-month answer: the same gap over the typical month would be much later', () => {
    const typical = (5 * 20_000 + 5 * 150_000 + 2 * 20_000) / 12; // the mean leftover, 74,167
    const byTypical = Math.ceil(300_000 / typical);
    const walked = seasonalReadyMonth(seasonal, '2026-11', 300_000n);
    expect(walked?.months).toBeGreaterThan(byTypical);
  });

  it('D-60 a gap of zero is ready in the next month', () => {
    expect(seasonalReadyMonth(seasonal, '2026-11', 0n)).toEqual({ months: 1, month: '2026-12' });
  });

  it('D-60 a month that is short last year saves nothing, never a negative', () => {
    const dip = lastYear((mm) => (mm === '12' ? -500_000 : 100_000));
    expect(seasonalReadyMonth(dip, '2026-11', 100_000n)).toEqual({ months: 2, month: '2027-01' });
  });

  it('D-60 a year that saves nothing gives null', () => {
    expect(seasonalReadyMonth(lastYear(() => 0), '2026-11', 1n)).toBeNull();
    expect(seasonalReadyMonth(lastYear(() => -10_000), '2026-11', 1n)).toBeNull();
  });

  it('D-60 no months of last year gives null', () => {
    expect(seasonalReadyMonth({ months: [] }, '2026-11', 1n)).toBeNull();
  });

  it('D-60 beyond the simulation horizon gives null', () => {
    expect(seasonalReadyMonth(seasonal, '2026-11', 10n ** 15n)).toBeNull();
  });

  it('I13 a dearer gap is never ready sooner', () => {
    let last = '';
    for (const gap of [1n, 20_000n, 100_000n, 250_000n, 300_000n, 900_000n]) {
      const r = seasonalReadyMonth(seasonal, '2026-11', gap);
      expect((r as { month: string }).month >= last).toBe(true);
      last = (r as { month: string }).month;
    }
  });
});
