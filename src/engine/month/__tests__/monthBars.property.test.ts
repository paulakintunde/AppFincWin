/** 07-02 (T-07-05): monthBars without this month is the legacy pastMonthBars for every input, and the bars add up. */
import * as fc from 'fast-check';
import { prepare, type Prepared } from '../../decide/v3/prepare';
import { yearMonthOf } from '../../decide/v3/dates';
import { minorFromBigInt } from '../../payoff/types';
import { fcRuns } from '../../decide/v3/__tests__/helpers/fcRuns';
import { inputsArb } from '../../decide/v3/__tests__/invariants/arbitraries';
import { recordedIncomeByMonth } from '../model/incomePattern';
import type { V3Line } from '../../decide/v3/types';
import type { MonthBar } from '../types';
import { monthBars } from '../picture';

const SEED = 0x0702;
const OUT: ReadonlySet<V3Line['role']> = new Set(['spending', 'debt_payment', 'saved_invested', 'other_out']);

/** A copy of the algorithm as it was before 07-02. */
function legacyPastMonthBars(p: Pick<Prepared, 'inputs'>): readonly MonthBar[] {
  const { inputs } = p;
  const ym = yearMonthOf(inputs.asOf);
  const recorded = recordedIncomeByMonth({
    asOf: inputs.asOf,
    history: inputs.months.map((m) => (m.full ? m : { ...m, full: true })),
    series: inputs.series,
    profile: inputs.profile,
    custom: inputs.custom,
  });
  return inputs.months
    .filter((m) => m.month < ym)
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((m) => {
      let out = 0n;
      for (const l of m.lines) {
        if (l.status !== 'paid') continue;
        const amount = BigInt(Math.abs(l.amount));
        if (OUT.has(l.role)) out += amount;
        else if (l.role === 'refund') out -= amount;
      }
      const comesIn = recorded.get(m.month) as bigint;
      return { month: m.month, comesIn: minorFromBigInt(comesIn, 't'), goesOut: minorFromBigInt(out, 't'), left: minorFromBigInt(comesIn - out, 't') };
    });
}

describe('07-02 monthBars properties', () => {
  it('without this month it deep-equals the legacy pastMonthBars', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const p = prepare(inputs);
        expect(monthBars(p, { throughCurrent: false })).toEqual(legacyPastMonthBars(p));
      }),
      { numRuns: fcRuns(200), seed: SEED },
    );
  });

  it('with this month every bar adds up and the earlier bars are unchanged', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const p = prepare(inputs);
        const bars = monthBars(p, { throughCurrent: true });
        for (const b of bars) expect(b.goesOut).toBe(b.comesIn - b.left);
        const past = monthBars(p, { throughCurrent: false });
        expect(bars.slice(0, past.length)).toEqual(past);
      }),
      { numRuns: fcRuns(200), seed: SEED },
    );
  });
});
