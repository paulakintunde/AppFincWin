/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 */
import { prepareContext } from '../../assess';
import type { MoneyBasis } from '../../types';
import { fullMonth, monthsOf, snapshotOf } from '../helpers/fixtures';

function money(months: ReturnType<typeof monthsOf>): MoneyBasis {
  const r = prepareContext(snapshotOf({ months }));
  if (!r.ok) throw new Error('expected a resolved context');
  return r.context.money;
}

describe('D-08 spending basis', () => {
  it('D-08: spending is the average of full months, not the current month', () => {
    // Prototype dmoney: `exp` summed `this.items` (the current month only).
    const current = { ...fullMonth('2026-04', 600_000, 900_000), full: false };
    const mb = money([...monthsOf([[600_000, 300_000], [600_000, 310_000], [600_000, 320_000]], '2026-01'), current]);
    expect(mb.spendingAverage).toBe(310_000);
  });

  it('D-08: worst spending is the highest-spending full month', () => {
    const current = { ...fullMonth('2026-04', 600_000, 900_000), full: false };
    const mb = money([...monthsOf([[600_000, 300_000], [600_000, 310_000], [600_000, 320_000]], '2026-01'), current]);
    expect(mb.spendingWorst).toBe(320_000);
  });

  it('D-09/D-10: only the last 6 full months count, and the unfinished month never does', () => {
    const pairs = [900_000, 900_000, 300_000, 310_000, 320_000, 330_000, 340_000, 350_000].map(
      (s) => [600_000, s] as const
    );
    const current = { ...fullMonth('2026-09', 600_000, 999_000), full: false };
    const mb = money([...monthsOf(pairs, '2026-01'), current]);
    expect(mb.fullMonthsUsed).toBe(6);
    expect(mb.spendingAverage).toBe(325_000);
    expect(mb.spendingWorst).toBe(350_000);
  });
});
