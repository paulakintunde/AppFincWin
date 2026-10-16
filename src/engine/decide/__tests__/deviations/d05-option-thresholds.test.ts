import { minorUnits } from '../../../money/types';
import { ZERO_PERCENT, percent } from '../../../payoff/types';
import { assessPlan, prepareContext } from '../../assess';
import { buildOptions } from '../../options';
import { resolvePlanStrict } from '../../plan';
import type { BuyCheck, DecideOption, DecideSnapshot } from '../../types';
import { buyCash, monthsOf, snapshotOf } from '../helpers/fixtures';

const mu = minorUnits;
const LIMITS = {
  reserve: mu(600_000),
  dsrLine: null,
  unsecuredIncomeMultiple: null,
  investingFloor: null,
  savingFloor: null,
  spareFloor: null,
};

function optionsOf(s: DecideSnapshot, check: BuyCheck): readonly DecideOption[] {
  const r = prepareContext(s);
  if (!r.ok) throw new Error('expected ok');
  return buildOptions(r.context, check, assessPlan(r.context, check, resolvePlanStrict(check)));
}

describe('D-05 / D-06 option thresholds', () => {
  it('D-05: save-first uses the real monthly surplus, not max(50, surplus)', () => {
    // Prototype: `Math.ceil(need / Math.max(50, M.left))`: a zero surplus was treated as 50.00 a month.
    const s = snapshotOf({
      limits: LIMITS,
      months: monthsOf([
        [600_000, 600_000],
        [600_000, 600_000],
        [600_000, 600_000],
      ]),
    });
    const o = optionsOf(s, buyCash(2_000_000)).find((x) => x.code === 'save_first');
    expect(o).toMatchObject({ code: 'save_first', need: 600_000, monthlySpare: 0, months: null });
  });

  it('D-05: cut-line has no 10.00 minimum and no rounding to 5.00', () => {
    // Prototype: `Math.max(10, Math.round(l.v * 0.2 / 5) * 5)`
    const s = snapshotOf({
      limits: LIMITS,
      expenseLines: [{ lineId: 'x', averageMonthly: mu(1_234), cuttable: true }],
    });
    const gapped = optionsOf(s, buyCash(1_700_000)).find((x) => x.code === 'cut_line');
    expect(gapped).toMatchObject({ code: 'cut_line', lineAverage: 1_234, cut: 247 });
  });

  it('D-06: do-without projects at 0% unless the user entered a return', () => {
    // Prototype: the do-without figure grew at a built-in 6.5%.
    const check = buyCash(100_000, { runningCostsNet: mu(10_000) });
    const base = snapshotOf({ limits: LIMITS, cashOnHand: mu(650_000) });
    const zero = optionsOf(base, check).find((x) => x.code === 'do_without');
    expect(zero).toMatchObject({ keptMonthly: 10_000, horizonMonths: 60, projected: 600_000, projectionReturn: ZERO_PERCENT });
    const entered = optionsOf({ ...base, projectionReturn: percent('6.5') }, check).find((x) => x.code === 'do_without');
    expect(entered).toMatchObject({ projectionReturn: percent('6.5') });
    expect((entered as { projected: number }).projected).toBeGreaterThan(600_000);
  });
});
