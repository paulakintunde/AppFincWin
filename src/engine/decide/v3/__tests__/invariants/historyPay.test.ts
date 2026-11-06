/**
 * I-D52 (05.4 D-52): pay expected from history only ever adds money to the 90-day cash path, and it never exists alongside a
 * live pay series. Golden persons (inputsArb), half of them with their pay series removed and a freelance profile, so the rule
 * is reached.
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { CASH_PATH_DAYS_V3 } from '../../constants';
import { applyPurchaseFlows, openCashPath } from '../../cash/path';
import { buildMonthModel } from '../../month/model';
import { historyPay } from '../../month/historyPay';
import { liveSeriesOf } from '../../month/series';
import type { V3Inputs } from '../../types';
import { fcRuns } from '../helpers/fcRuns';
import { inputsArb } from './arbitraries';

const irregularArb: fc.Arbitrary<V3Inputs> = fc.tuple(inputsArb, fc.boolean()).map(([i, strip]) =>
  strip ? { ...i, series: i.series.filter((s) => s.role !== 'pay'), profile: { types: ['freelance'], variable: null, steady: null, billsHorizonMonths: null } } : i
);

describe('history pay invariants', () => {
  it('I-D52 history pays never lower any point of the 90-day path, and there is none with a live pay series', () => {
    let reached = 0;
    fc.assert(
      fc.property(irregularArb, fc.integer({ min: 0, max: 2_000_000 }), (inputs, opening) => {
        const hp = historyPay(inputs);
        if (liveSeriesOf(inputs.series, inputs.asOf, 'pay').length > 0) expect(hp).toBeNull();
        if (hp === null) return;
        reached += 1;
        const month = buildMonthModel(inputs);
        const base = { asOf: inputs.asOf, days: CASH_PATH_DAYS_V3, series: inputs.series, paidThisMonth: new Set<string>(), erest: month.erest, e: month.e ?? minorUnits(0) };
        const without = applyPurchaseFlows(openCashPath(base), minorUnits(opening), []);
        const withPay = applyPurchaseFlows(openCashPath({ ...base, extraPays: hp.dates.map((date) => ({ date, amount: hp.amount })) }), minorUnits(opening), []);
        withPay.points.forEach((p, i) => expect(p.balance).toBeGreaterThanOrEqual((without.points[i] as (typeof without.points)[number]).balance));
        expect(hp.amount).toBeGreaterThanOrEqual(0);
        for (const d of hp.dates) expect(d > inputs.asOf).toBe(true);
      }),
      { numRuns: fcRuns(200), seed: 0x5472 }
    );
    expect(reached).toBeGreaterThan(0);
  });
});
