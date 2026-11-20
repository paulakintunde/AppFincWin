/**
 * 08.1-08 (CMP-F19, D-03): the household's money laid into a check's inputs. Pure. The caller works out the one signed figure
 * (engine/household/pool.ts: my agreed slice of the pool less my own money left) and this puts it where the answer reads money
 * left this month: one dated line in the current month, the cash on hand, the first spending account and the confirmed unspent
 * figure, all by the same amount, so the month figure and the earlier-money figure stay in step. A zero figure changes nothing.
 * Nothing here knows who the partner is or what they hold: only the one rounded total ever reached it (T-08.1-26).
 */
import { minorUnits } from '../../money/types';
import type { MinorUnits } from '../../money/types';
import type { V3Account, V3Inputs, V3Line, V3Month } from './types';

/** The id of the line a household figure adds to the month. */
export const HOUSEHOLD_LINE_ID = 'household-pool';

const isSpending = (a: V3Account): boolean => a.noRate !== true && (a.kind === undefined || a.kind === null || a.kind === 'checking' || a.kind === 'current');

export function applyHouseholdMoney(inputs: V3Inputs, delta: MinorUnits): V3Inputs {
  if (delta === 0) return inputs;
  const ym = inputs.asOf.slice(0, 7);
  const line: V3Line = {
    id: HOUSEHOLD_LINE_ID,
    date: inputs.asOf,
    amount: minorUnits(Math.abs(delta)),
    role: delta > 0 ? 'income' : 'spending',
    status: 'paid',
    // more money this month reads like pay already in (the same series, so it is not mistaken for earlier money); less reads as spending
    seriesId: delta > 0 ? (inputs.series.find((s) => s.role === 'pay')?.id ?? null) : null,
    categoryId: null,
    coversMonths: null,
    expected: false,
    incomeKind: null,
    countsAs: null,
  };
  const months: V3Month[] = inputs.months.map((m) => (m.month === ym ? { ...m, lines: [...m.lines, line] } : m));
  const accounts = inputs.accounts;
  const first = accounts === undefined ? -1 : accounts.findIndex(isSpending);
  return {
    ...inputs,
    months,
    balance: minorUnits(inputs.balance + delta),
    ...(accounts === undefined || first < 0 ? {} : { accounts: accounts.map((a, i) => (i === first ? { ...a, balance: minorUnits(a.balance + delta) } : a)) }),
    unspent: inputs.unspent === null ? null : { ...inputs.unspent, amount: minorUnits(inputs.unspent.amount + delta) },
  };
}
