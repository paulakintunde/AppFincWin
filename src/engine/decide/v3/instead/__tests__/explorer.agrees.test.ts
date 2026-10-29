/**
 * D-12 / ROADMAP criterion 1: at slider 0 the explorer's Buy-it-later month is the answer's own ready-by month.
 * Runs over the seeded shadow histories (synthetic only, D-17) and the variable-income goldens, which hold the seasonal
 * earner the seeded histories lack. The basis is the judge's own: the day-one price and the available unspent money
 * (05.3 finding 6), plus answerWaits (the judge dates a "not yet" at next month at the earliest), so no change to the
 * judge is needed.
 */
import { minorUnits } from '../../../../money/types';
import { evaluate } from '../../evaluate';
import { toCheckV2, toV3Inputs } from '../../__tests__/golden/adapter';
import { loadAllVariableCases } from '../../__tests__/golden/variableIncomeLoader';
import { generateHistories } from '../../__tests__/shadow/generate';
import { generateNearLineHistories } from '../../__tests__/shadow/generateNearLine';
import type { CheckV2, V3Inputs } from '../../types';
import { explore } from '../explorer';

describe('explorer at lever 0 agrees with the answer (D-12)', () => {
  it("gives the answer's ready-by month for every not covered result, with a seasonal earner among them", () => {
    let checked = 0;
    let seasonal = 0;
    const misses: string[] = [];
    const cases: { id: string; inputs: V3Inputs; check: CheckV2 }[] = [];
    for (const g of [...generateHistories(), ...generateNearLineHistories()]) {
      for (const purchase of g.purchases) cases.push({ id: g.person.id, inputs: toV3Inputs(g.person, {}), check: toCheckV2(purchase) });
    }
    for (const c of loadAllVariableCases()) cases.push({ id: c.id, inputs: c.inputs, check: c.check });

    for (const c of cases) {
      const ev = evaluate(c.inputs, c.check);
      const r = ev.result;
      if (r.code !== 'not_yet' || r.variant !== 'not_covered' || r.readyBy?.kind !== 'month') continue;
      if (ev.purchase === null || ev.funds.unspent === null) continue;
      // A plan with monthly payments dates its wait from the plan (the monthly part of the judge), not from the whole price.
      if (ev.purchase.monthly > 0) continue;
      const unspent = ev.funds.unspent.available ?? ev.funds.unspent.value;
      const out = explore({
        month: ev.month,
        flexibleSaving: minorUnits(0),
        levers: { everydayCut: minorUnits(0), flexibleSavingCut: minorUnits(0) },
        price: ev.purchase.dayOne,
        unspent: minorUnits(Math.max(0, unspent)),
        answerWaits: true,
      });
      if (out.buyLater.readyBy !== r.readyBy.month) misses.push(`${c.id} ${out.buyLater.readyBy} vs ${r.readyBy.month}`);
      checked += 1;
      if (ev.month.incomePicture?.treated === 'seasonal') seasonal += 1;
    }
    expect(misses).toEqual([]);
    expect(checked).toBeGreaterThan(0);
    expect(seasonal).toBeGreaterThan(0);
  });
});
