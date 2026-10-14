/**
 * Home's This month figures (HOME-02, 03-CONTEXT D-32 amendment, D-34, D-36).
 * UNPAID counts unpaid OUTFLOWS only: pending, non-transfer, non-refund rows
 * with a negative amount, plus projected recurring outflows. Pending income is
 * never counted, so MonthTotals.stillToCome (signed, mixes income) is never
 * used for it. Rows without a rate are counted as unconverted, never
 * estimated. Integer minor units; percentages are display ratios computed with
 * integer half-up arithmetic.
 */
import type { TxStatus } from './status';

export interface MonthFigureRow {
  status: TxStatus;
  isTransfer: boolean;
  isRefund?: boolean;
  originalAmount: number;
  amountHome: number | null;
}

export interface MonthFigureProjection {
  amount: number;
  amountHome: number | null;
}

export interface UnpaidOutflows {
  total: number;
  count: number;
  unconverted: number;
}

export interface MonthPosition {
  paidIn: number;
  paidOut: number;
  unpaid: number;
  unpaidCount: number;
  unconvertedUnpaid: number;
  left: number;
  paidPct: number;
  pendingPct: number;
}

export function isUnpaidOutflow(row: MonthFigureRow): boolean {
  return (
    row.status === 'pending' && !row.isTransfer && row.isRefund !== true && row.originalAmount < 0
  );
}

export function unpaidOutflows(
  rows: readonly MonthFigureRow[],
  projections: readonly MonthFigureProjection[]
): UnpaidOutflows {
  let total = 0;
  let count = 0;
  let unconverted = 0;
  for (const row of rows) {
    if (!isUnpaidOutflow(row)) continue;
    if (row.amountHome === null) {
      unconverted += 1;
      continue;
    }
    total += -row.amountHome;
    count += 1;
  }
  for (const p of projections) {
    if (p.amount >= 0) continue;
    if (p.amountHome === null) {
      unconverted += 1;
      continue;
    }
    total += -p.amountHome;
    count += 1;
  }
  return { total, count, unconverted };
}

/** paidIn + paidOut (negative) - unpaid outflows; no rounding step. */
export function leftAfterEverything(
  totals: { paidIn: number; paidOut: number },
  unpaid: number
): number {
  return totals.paidIn + totals.paidOut - unpaid;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.floor((part * 200 + whole) / (2 * whole)));
}

export function barShares(
  paidIn: number,
  paidOut: number,
  unpaid: number
): { paidPct: number; pendingPct: number } {
  const paidPct = pct(Math.abs(paidOut), paidIn);
  const pendingPct = Math.min(pct(unpaid, paidIn), 100 - paidPct);
  return { paidPct, pendingPct };
}

export function monthPosition(
  totals: { paidIn: number; paidOut: number },
  rows: readonly MonthFigureRow[],
  projections: readonly MonthFigureProjection[]
): MonthPosition {
  const u = unpaidOutflows(rows, projections);
  const { paidPct, pendingPct } = barShares(totals.paidIn, totals.paidOut, u.total);
  return {
    paidIn: totals.paidIn,
    paidOut: totals.paidOut,
    unpaid: u.total,
    unpaidCount: u.count,
    unconvertedUnpaid: u.unconverted,
    left: leftAfterEverything(totals, u.total),
    paidPct,
    pendingPct,
  };
}
