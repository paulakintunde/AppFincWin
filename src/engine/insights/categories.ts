/**
 * 07-02 (INS-04, D-14, D-15, D-27, D-28, ARC-18): paid spending less refunds per category over the given months. Pure, integers only.
 * Transfers, envelope moves, debt payments, saving and income are not spending (the Out bar counts debt payments and saving; this list
 * does not, D-27). Categories under 1% of the total fold into one "everything else" row (D-28).
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';
import type { LineRole, V3Month } from '../decide/v3/types';

const FN = 'insights/categories';

export interface CategoryTotal {
  readonly categoryId: string | null;
  readonly amount: MinorUnits;
  readonly shareBp: number;
}

export interface CategoryBreakdown {
  readonly total: MinorUnits;
  readonly rows: readonly CategoryTotal[];
  readonly rest: { readonly amount: MinorUnits; readonly shareBp: number; readonly count: number } | null;
  readonly refundsExceeded: readonly (string | null)[];
  readonly leftOut: boolean;
}

/** D-28: a category under this share (basis points, 1%) folds into the rest row. */
const FOLD_BELOW_BP = 100n;
const MOVE_ROLES: ReadonlySet<LineRole> = new Set(['own_transfer', 'envelope_deposit', 'envelope_withdrawal', 'emergency_move']);

function inScope(months: readonly V3Month[], include: readonly string[]): readonly V3Month[] {
  const set = new Set(include);
  return months.filter((m) => set.has(m.month));
}

/** Net paid spending per category (unclamped) for one set of months; refunds subtract from their own category. */
export function spendByCategory(months: readonly V3Month[], include: readonly string[]): ReadonlyMap<string | null, bigint> {
  const out = new Map<string | null, bigint>();
  for (const m of inScope(months, include)) {
    for (const l of m.lines) {
      if (l.status !== 'paid') continue;
      if (l.role !== 'spending' && l.role !== 'refund') continue;
      const amount = BigInt(Math.abs(l.amount));
      out.set(l.categoryId, (out.get(l.categoryId) ?? 0n) + (l.role === 'spending' ? amount : -amount));
    }
  }
  return out;
}

/** Biggest first; ties by category id ascending with the uncategorised row last. */
export function compareIds(a: string | null, b: string | null): number {
  // callers compare distinct map keys, so two equal ids (or two nulls) never meet
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export function categoryTotals(months: readonly V3Month[], include: readonly string[]): CategoryBreakdown {
  const net = spendByCategory(months, include);
  const leftOut = inScope(months, include).some((m) => m.lines.some((l) => l.status === 'paid' && MOVE_ROLES.has(l.role)));
  const refundsExceeded: (string | null)[] = [];
  const kept: { categoryId: string | null; amount: bigint }[] = [];
  let total = 0n;
  for (const [categoryId, value] of net) {
    if (value < 0n) refundsExceeded.push(categoryId);
    if (value <= 0n) continue;
    kept.push({ categoryId, amount: value });
    total += value;
  }
  refundsExceeded.sort(compareIds);
  if (total === 0n) return { total: minorFromBigInt(0n, FN), rows: [], rest: null, refundsExceeded, leftOut };
  kept.sort((a, b) => (a.amount === b.amount ? compareIds(a.categoryId, b.categoryId) : a.amount > b.amount ? -1 : 1));
  const rows: CategoryTotal[] = [];
  let restAmount = 0n;
  let restCount = 0;
  for (const k of kept) {
    const bp = divideHalfUp(k.amount * 10000n, total);
    if (bp < FOLD_BELOW_BP) {
      restAmount += k.amount;
      restCount += 1;
    } else rows.push({ categoryId: k.categoryId, amount: minorFromBigInt(k.amount, FN), shareBp: Number(bp) });
  }
  const rest = restCount === 0 ? null : { amount: minorFromBigInt(restAmount, FN), shareBp: Number(divideHalfUp(restAmount * 10000n, total)), count: restCount };
  return { total: minorFromBigInt(total, FN), rows, rest, refundsExceeded, leftOut };
}
