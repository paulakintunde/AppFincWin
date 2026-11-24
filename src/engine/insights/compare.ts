/**
 * 07-02 (INS-05, D-13): a month against the calendar month before it. Pure, integer minor units.
 * Each category's change is this month's net spending less last month's (both clamped at 0), biggest absolute change first.
 */
import type { MinorUnits } from '../money/types';
import type { MonthBar } from '../month/types';
import { minorFromBigInt } from '../payoff/types';
import { addYearMonths } from '../decide/v3/dates';
import type { V3Month } from '../decide/v3/types';
import { compareIds, spendByCategory } from './categories';

const FN = 'insights/compare';

export type ChangeKind = 'more' | 'less' | 'same' | 'new' | 'none';

export interface CategoryChange {
  readonly categoryId: string | null;
  readonly thisMonth: MinorUnits;
  readonly lastMonth: MinorUnits;
  readonly change: MinorUnits;
  readonly kind: ChangeKind;
}

export interface MonthComparison {
  readonly month: string;
  readonly previous: string;
  readonly bar: MonthBar | null;
  readonly previousBar: MonthBar | null;
  readonly changes: readonly CategoryChange[];
  readonly previousRecorded: boolean;
  readonly totalsChange: { readonly comesIn: MinorUnits; readonly goesOut: MinorUnits; readonly left: MinorUnits } | null;
}

const clamp = (v: bigint | undefined): bigint => (v === undefined || v < 0n ? 0n : v);

function kindOf(now: bigint, before: bigint): ChangeKind {
  if (before === 0n) return 'new';
  if (now === 0n) return 'none';
  if (now > before) return 'more';
  return now < before ? 'less' : 'same';
}

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

export function compareMonths(months: readonly V3Month[], bars: readonly MonthBar[], month: string): MonthComparison {
  const previous = addYearMonths(month, -1);
  const bar = bars.find((b) => b.month === month) ?? null;
  const previousBar = bars.find((b) => b.month === previous) ?? null;
  const now = spendByCategory(months, [month]);
  const before = spendByCategory(months, [previous]);
  const ids = new Set<string | null>([...now.keys(), ...before.keys()]);
  const rows: { categoryId: string | null; now: bigint; before: bigint }[] = [];
  for (const categoryId of ids) {
    const n = clamp(now.get(categoryId));
    const b = clamp(before.get(categoryId));
    if (n === 0n && b === 0n) continue;
    rows.push({ categoryId, now: n, before: b });
  }
  rows.sort((a, b) => {
    const da = abs(a.now - a.before);
    const db = abs(b.now - b.before);
    return da === db ? compareIds(a.categoryId, b.categoryId) : da > db ? -1 : 1;
  });
  const changes = rows.map((r) => ({
    categoryId: r.categoryId,
    thisMonth: minorFromBigInt(r.now, FN),
    lastMonth: minorFromBigInt(r.before, FN),
    change: minorFromBigInt(r.now - r.before, FN),
    kind: kindOf(r.now, r.before),
  }));
  const prevMonth = months.find((m) => m.month === previous);
  const previousRecorded = prevMonth !== undefined && prevMonth.lines.length > 0;
  const totalsChange =
    bar === null || previousBar === null
      ? null
      : {
          comesIn: minorFromBigInt(BigInt(bar.comesIn) - BigInt(previousBar.comesIn), FN),
          goesOut: minorFromBigInt(BigInt(bar.goesOut) - BigInt(previousBar.goesOut), FN),
          left: minorFromBigInt(BigInt(bar.left) - BigInt(previousBar.left), FN),
        };
  return { month, previous, bar, previousBar, changes, previousRecorded, totalsChange };
}
