/**
 * 05.5-26 (ARC-03, D-07): the usual month as rows, read from the v3 Prepared instead of the old prepareContext. Pure, integer minor
 * units, no clock. Grow's money-rules screen and the Debts screens read it.
 *
 * Every row comes from the month model the Decide home already shows, so the rows add up:
 * income - spending - debts - saving - setAside = result, exactly (integer minor units, no rounding step).
 * - income / result: the usual month's money in and what is left (the month model's typicalIncome and typicalLeft).
 * - debts: every debt's minimum, whether the month sets it aside or it is paid through a bill.
 * - saving: the fixed regular saving and investing plans (the month model's own rule, flexible plans left out).
 * - setAside: the envelopes and pots the month sets aside (the month's set-aside less the debts and saving above).
 * - spending: the rest of what goes out (bills and everyday spending), the remainder, so the rows always add up.
 * A month with no logged months but typed estimates reads the typed figures (source 'typed'); no usual month gives null.
 */
import type { MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';
import { debtsInMonth } from '../decide/v3/debts';
import { monthlyEquivalentOf } from '../decide/v3/plan/cadence';
import type { Prepared } from '../decide/v3/prepare';
import { liveSeriesOf } from './model/series';
import { homeReading } from './picture';

const FN = 'month/rows';

type RowsInput = Pick<Prepared, 'inputs' | 'readings'>;

export interface MonthRows {
  readonly source: 'logged' | 'typed';
  readonly income: MinorUnits;
  readonly spending: MinorUnits;
  readonly debts: MinorUnits;
  readonly saving: MinorUnits;
  readonly setAside: MinorUnits;
  readonly result: MinorUnits;
}

/** Fixed regular saving and investing, monthly (the month model's own rule). */
function fixedSavingOf(p: RowsInput): bigint {
  let total = 0n;
  for (const role of ['saving', 'investing'] as const) {
    for (const s of liveSeriesOf(p.inputs.series, p.inputs.asOf, role)) {
      if (s.savingMode === 'flexible') continue;
      total += BigInt(monthlyEquivalentOf(s.amount, s.cadence));
    }
  }
  return total;
}

export function monthRows(p: RowsInput): MonthRows | null {
  const m = homeReading(p).month;
  if (m.typicalLeft === null) return null;
  const { inputs } = p;
  const t = inputs.typedEstimates;
  if (inputs.everydayOverride === null && m.monthsUsed.length === 0 && t !== null) {
    // typed estimates only: the money out already holds the bills and set-asides, counted once (D-74)
    const income = BigInt(t.income);
    const debts = BigInt(t.debt);
    const saving = BigInt(t.saving) + BigInt(t.invest);
    const result = BigInt(m.typicalLeft);
    return {
      source: 'typed',
      income: minorFromBigInt(income, FN),
      spending: minorFromBigInt(income - result - debts - saving, FN),
      debts: minorFromBigInt(debts, FN),
      saving: minorFromBigInt(saving, FN),
      setAside: minorFromBigInt(0n, FN),
      result: minorFromBigInt(result, FN),
    };
  }
  let debtsAll = 0n;
  for (const d of inputs.debts) debtsAll += BigInt(d.minimum);
  let debtsSetAside = 0n;
  for (const d of debtsInMonth(inputs.debts, inputs.series, inputs.asOf)) debtsSetAside += BigInt(d.minimum);
  const saving = fixedSavingOf(p);
  const pots = BigInt(m.setAside) - debtsSetAside - saving;
  const income = BigInt(m.typicalIncome);
  const result = BigInt(m.typicalLeft);
  return {
    source: 'logged',
    income: minorFromBigInt(income, FN),
    spending: minorFromBigInt(income - result - debtsAll - saving - pots, FN),
    debts: minorFromBigInt(debtsAll, FN),
    saving: minorFromBigInt(saving, FN),
    setAside: minorFromBigInt(pots, FN),
    result: minorFromBigInt(result, FN),
  };
}

/**
 * The standing saving and investing plans, monthly, for the Grow money-rules badges (the old screen read the logged averages plus
 * these plans; 05.5-26 reads the plans alone, a moved figure listed for D-07). Flexible plans count: they are set amounts.
 */
export function standingPlans(p: Pick<RowsInput, 'inputs'>): { readonly saving: MinorUnits; readonly investing: MinorUnits } {
  const sum = (role: 'saving' | 'investing'): MinorUnits => {
    let total = 0n;
    for (const s of liveSeriesOf(p.inputs.series, p.inputs.asOf, role)) total += BigInt(monthlyEquivalentOf(s.amount, s.cadence));
    return minorFromBigInt(total, FN);
  };
  return { saving: sum('saving'), investing: sum('investing') };
}
