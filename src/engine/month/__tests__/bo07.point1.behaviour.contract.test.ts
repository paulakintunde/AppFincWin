// BO-07 point 1 (month picture) behaviour. Owners: plan 05.5-08 (identity), plan 05.5-14 (Home line).
// The shape contract lives in src/engine/month/__tests__/bo07.point1.contract.test.ts (plan 05.5-01).
// Switching a todo on keeps the exact title. The frozen list lives in src/test/contracts/contractManifest.test.ts.
import { minorUnits } from '../../money/types';
import { homeFigure } from '../../decide/v3/afterBuy';
import { prepare } from '../../decide/v3/prepare';
import { inputsOf, monthOf, v3Line } from '../../decide/v3/__tests__/helpers/fixtures';
import { monthPicture } from '../picture';

describe('BO-07 point 1: month picture behaviour', () => {
  it('leftAfterPlans equals homeFigure(prepared)', () => {
    const months = ['2026-08', '2026-09'].map((m) =>
      monthOf(m, [
        v3Line({ id: `p-${m}`, date: `${m}-25`, amount: 300_000, role: 'income' }),
        v3Line({ id: `e-${m}`, date: `${m}-12`, amount: 100_000 }),
      ]),
    );
    const prepared = prepare(inputsOf({ months: [...months, monthOf('2026-10', [], { full: false })], balance: minorUnits(250_000) }));
    expect(monthPicture(prepared).leftAfterPlans).toBe(homeFigure(prepared));
  });
  test.todo('Home small line and Decide lead show the same figure');
});
