/**
 * Month totals (D-10, D-50). Paid rows are money that moved; pending rows and
 * projections give a separate "still to come" figure. Skipped rows count in
 * neither. Transfer legs (any row with a transfer_id) are excluded from every
 * sum and count here, keyed on the structural transfer link and never on the
 * Transfer category (D-50) -- they still count in an account's balance
 * (balance.ts), just not here.
 *
 * Refunds (CONTEXT D-03, decision 2026-10-09): a paid refund is filed under
 * Money out as a reduction (paidOut moves toward zero) and never under Money in.
 * Net is unchanged by where it is filed.
 */
import type { TxStatus } from './status';

export interface TotalsInput {
  amountHome: number | null;
  status: TxStatus;
  isTransfer: boolean; // row.transfer_id !== null
  isRefund?: boolean;
}

export interface MonthTotals {
  paidIn: number;
  paidOut: number;
  net: number;
  stillToCome: number;
  pendingCount: number;
  projectedCount: number;
  unconvertedCount: number;
  transferCount: number;
  /** Non-transfer, non-skipped rows (ACT-10). */
  count: number;
}

export function monthTotals(
  rows: readonly TotalsInput[],
  projections: readonly { amountHome: number | null }[]
): MonthTotals {
  let paidIn = 0;
  let paidOut = 0;
  let stillToCome = 0;
  let pendingCount = 0;
  let projectedCount = 0;
  let unconvertedCount = 0;
  let transferCount = 0;
  let count = 0;

  for (const row of rows) {
    if (row.isTransfer) {
      transferCount++;
      continue;
    }
    if (row.status === 'skipped') {
      continue;
    }
    count++;
    if (row.amountHome === null) {
      unconvertedCount++;
      continue;
    }
    if (row.status === 'paid') {
      if (row.isRefund === true || row.amountHome < 0) {
        paidOut += row.amountHome;
      } else {
        paidIn += row.amountHome;
      }
    } else {
      // Only 'pending' can reach here: 'skipped' rows already `continue`d above,
      // and TxStatus admits no other member.
      stillToCome += row.amountHome;
      pendingCount++;
    }
  }

  for (const projection of projections) {
    if (projection.amountHome === null) {
      unconvertedCount++;
      continue;
    }
    stillToCome += projection.amountHome;
    projectedCount++;
  }

  return {
    paidIn,
    paidOut,
    net: paidIn + paidOut,
    stillToCome,
    pendingCount,
    projectedCount,
    unconvertedCount,
    transferCount,
    count,
  };
}
