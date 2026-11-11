/**
 * GRW-08/09: several debts, one constant monthly budget (sum of the starting
 * minimums of the debts that owe money, plus the extra), paid in one of two orders (D-13): 'rate' = highest
 * rate first, 'balance' = smallest original balance first. Freed minimums roll
 * over because the budget never shrinks. Port of prototype `strategy`.
 *
 * The engine returns codes only; screens own the wording.
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { SIMULATION_MONTH_CAP } from './constants';
import type { PayoffOutcome } from './fixedPayoff';
import { MONTHLY_RATE_DENOMINATOR, minorFromBigInt, type Percent } from './types';

const FN = 'strategy';

export type PayoffOrder = 'rate' | 'balance';

export interface PlanDebt {
  id: string;
  balance: MinorUnits;
  apr: Percent;
  minimum: MinorUnits;
}

export interface StrategyResult {
  outcome: PayoffOutcome;
  months: number;
  totalInterest: MinorUnits | null;
  budget: MinorUnits;
  debts: ReadonlyArray<{ id: string; doneMonth: number | null; interest: MinorUnits }>;
}

interface Live {
  id: string;
  apr: Percent;
  minimum: bigint;
  original: bigint;
  bal: bigint;
  interest: bigint;
  done: number | null;
}

export interface StrategyOptions {
  /** One-off payment applied before the first month's interest, in the chosen order (D-30, D-33). */
  lump?: MinorUnits;
}

export function strategy(
  debts: readonly PlanDebt[],
  extra: MinorUnits,
  order: PayoffOrder,
  opts: StrategyOptions = {}
): StrategyResult {
  const lump = opts.lump ?? 0;
  if (extra < 0) throw new RangeError(`${FN}: extra must be >= 0`);
  if (lump < 0) throw new RangeError(`${FN}: lump must be >= 0`);
  for (const d of debts) {
    if (d.balance < 0 || d.minimum < 0) {
      throw new RangeError(`${FN}: balance and minimum must be >= 0`);
    }
  }
  const ds: Live[] = debts.map((d) => ({
    id: d.id,
    apr: d.apr,
    minimum: BigInt(d.minimum),
    original: BigInt(d.balance),
    bal: BigInt(d.balance),
    interest: 0n,
    done: d.balance === 0 ? 0 : null,
  }));
  // P2-WR-08: a debt already at $0 is not being paid, so its recorded minimum is not part of the monthly budget.
  const budget = ds.reduce((s, d) => s + (d.original > 0n ? d.minimum : 0n), 0n) + BigInt(extra);

  const build = (outcome: PayoffOutcome, months: number, withInterest: boolean): StrategyResult => ({
    outcome,
    months,
    totalInterest: withInterest ? minorFromBigInt(ds.reduce((s, d) => s + d.interest, 0n), FN) : null,
    budget: minorFromBigInt(budget, FN),
    debts: ds.map((d) => ({ id: d.id, doneMonth: d.done, interest: minorFromBigInt(d.interest, FN) })),
  });

  const byOrder = (a: Live, b: Live): number => {
    const diff = order === 'rate' ? b.apr - a.apr : a.original - b.original;
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  };

  // The lump lands before month 1's interest, on the open debts in order.
  let lumpLeft = BigInt(lump);
  for (const d of ds.filter((x) => x.bal > 0n).sort(byOrder)) {
    if (lumpLeft <= 0n) break;
    const p = lumpLeft < d.bal ? lumpLeft : d.bal;
    d.bal -= p;
    lumpLeft -= p;
    if (d.bal === 0n) d.done = 0;
  }

  let month = 0;
  while (ds.some((d) => d.bal > 0n)) {
    if (month === SIMULATION_MONTH_CAP) return build('exceeds_month_cap', month, true);
    let monthInterest = 0n;
    let startTotal = 0n;
    for (const d of ds) {
      if (d.bal > 0n) {
        const i = divideHalfUp(d.bal * d.apr, MONTHLY_RATE_DENOMINATOR);
        d.interest += i;
        d.bal += i;
        monthInterest += i;
        startTotal += d.bal;
      }
    }
    // Explicit per-month check: the budget cannot beat this month's interest.
    const payable = budget < startTotal ? budget : startTotal;
    if (payable <= monthInterest) {
      month += 1;
      return build('never_clears', month, false);
    }
    let left = budget;
    for (const d of ds) {
      if (d.bal > 0n) {
        const p = d.minimum < d.bal ? d.minimum : d.bal;
        d.bal -= p;
        left -= p;
      }
    }
    const open = ds
      .filter((d) => d.bal > 0n)
      .sort(byOrder);
    for (const d of open) {
      if (left <= 0n) break;
      const p = left < d.bal ? left : d.bal;
      d.bal -= p;
      left -= p;
    }
    month += 1;
    for (const d of ds) {
      if (d.bal === 0n && d.done === null) d.done = month;
    }
  }
  return build('cleared', month, true);
}
