/**
 * I-D67 (05.4 D-67, owner 2026-11-03): "regular saving/investing transfers out of the paying (main/everyday) account are taken out
 * of it everywhere: the month-end figure, spare money (the D-56 cap), and the 90-day cash path". Adding a regular saving to a golden
 * person never raises the month-end figure, the spare money judged against or the 90-day low point; the month-end figure drops by
 * exactly the saving still to move this month; a transfer already logged this month is not taken a second time.
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { applyPurchaseFlows } from '../../cash/path';
import { addDays, daysBetween, yearMonthOf } from '../../dates';
import { evaluate } from '../../evaluate';
import { prepare } from '../../prepare';
import type { V3Inputs, V3Series } from '../../types';
import { fcRuns } from '../helpers/fcRuns';
import { v3Line, v3Series } from '../helpers/fixtures';
import { checkArb, inputsArb } from './arbitraries';

interface SavingTweak {
  readonly amount: number;
  readonly day: number;
  readonly role: 'saving' | 'investing';
  readonly logged: boolean;
}

const savingArb: fc.Arbitrary<SavingTweak> = fc.record({
  amount: fc.integer({ min: 1_000, max: 200_000 }),
  day: fc.integer({ min: 1, max: 28 }),
  role: fc.constantFrom('saving' as const, 'investing' as const),
  logged: fc.boolean(),
});

function savingOf(inputs: V3Inputs, t: SavingTweak): V3Series {
  const ym = yearMonthOf(addDays(inputs.asOf, -62));
  return v3Series({ id: 'd67-saving', role: t.role, cadence: { unit: 'month', every: 1 }, anchorDate: `${ym}-${String(t.day).padStart(2, '0')}`, amount: t.amount, savingMode: 'fixed' });
}

/** The person with the saving added; when logged, this month's transfer is a linked paid line dated its due day (when not after asOf). */
function withSaving(inputs: V3Inputs, t: SavingTweak): V3Inputs {
  const ym = yearMonthOf(inputs.asOf);
  const date = `${ym}-${String(t.day).padStart(2, '0')}`;
  const series = [...inputs.series, savingOf(inputs, t)];
  if (!t.logged || date > inputs.asOf) return { ...inputs, series };
  const line = v3Line({ id: 'd67-line', date, amount: t.amount, role: 'saved_invested', seriesId: 'd67-saving' });
  const has = inputs.months.some((m) => m.month === ym);
  const months = has
    ? inputs.months.map((m) => (m.month === ym ? { ...m, lines: [...m.lines, line] } : m))
    : [...inputs.months, { month: ym, full: false, mark: null, lines: [line] }];
  return { ...inputs, series, months };
}

function readingFigures(inputs: V3Inputs): { readonly monthEnd: number; readonly low: number } {
  const r = prepare(inputs).readings[0]!;
  const path = applyPurchaseFlows(r.open, minorUnits(r.funds.spending), []);
  return { monthEnd: r.spareInAccount, low: Math.min(...path.points.map((p) => p.balance)) };
}

/** The saving still to move this month: the occurrence on or after asOf, unless a logged transfer already made it. */
function stillToMove(inputs: V3Inputs, t: SavingTweak): number {
  const ym = yearMonthOf(inputs.asOf);
  const date = `${ym}-${String(t.day).padStart(2, '0')}`;
  if (date < inputs.asOf) return 0;
  if (t.logged && daysBetween(date, inputs.asOf) === 0) return 0;
  return t.amount;
}

describe('I-D67 regular saving leaves the everyday account everywhere', () => {
  it('I-D67 a regular saving never raises the month-end figure, spare money or the 90-day low point', () => {
    fc.assert(
      fc.property(inputsArb, savingArb, checkArb, (inputs, t, check) => {
        const without = readingFigures(inputs);
        const withS = readingFigures(withSaving(inputs, t));
        expect(withS.monthEnd).toBeLessThanOrEqual(without.monthEnd);
        expect(withS.low).toBeLessThanOrEqual(without.low);
        // the month-end figure drops by exactly the saving still to move this month (D-55 "expected at month end ... after savings")
        expect(without.monthEnd - withS.monthEnd).toBe(stillToMove(inputs, t));
        const a = evaluate(inputs, check).spare ?? null;
        const b = evaluate(withSaving(inputs, t), check).spare ?? null;
        if (a !== null && b !== null) expect(b).toBeLessThanOrEqual(a);
      }),
      { numRuns: fcRuns(200), seed: 0x5467 }
    );
  });

  it('I-D67 a transfer already logged this month is taken once, a flexible saving is never taken', () => {
    fc.assert(
      fc.property(inputsArb, savingArb, (inputs, t) => {
        const base = readingFigures(inputs);
        const flexible = readingFigures({ ...inputs, series: [...inputs.series, { ...savingOf(inputs, t), savingMode: 'flexible' }] });
        expect(flexible).toEqual(base);
        const logged = withSaving(inputs, { ...t, logged: true });
        const date = `${yearMonthOf(inputs.asOf)}-${String(t.day).padStart(2, '0')}`;
        // a logged transfer is in the balance already, so this month's occurrence is not taken again
        if (date <= inputs.asOf) expect(readingFigures(logged).monthEnd).toBe(base.monthEnd);
      }),
      { numRuns: fcRuns(200), seed: 0x5468 }
    );
  });
});
