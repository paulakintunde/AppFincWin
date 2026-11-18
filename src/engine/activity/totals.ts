/**
 * Month totals (D-10, D-50). Paid rows are money that moved; pending rows and
 * projections give a separate "still to come" figure. Skipped rows count in
 * neither. Transfer legs (any row with a transfer_id) are excluded from every
 * sum and count here, keyed on the structural transfer link and never on the
 * Transfer category (D-50) -- they still count in an account's balance
 * (balance.ts), just not here. Settlement records (ARC-18, Phase 8) are excluded the same way.
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
  /**
   * rate_pending on the row. A row with no home amount counts as "waiting for a rate" only when its rate is actually
   * pending; omitted means pending. A false value leaves the row out of the unconverted count.
   */
  ratePending?: boolean;
  /** ARC-18: settlement records are neither spending nor income; callers set this from engine/household isSettlement. Omitted = not a settlement. */
  isSettlement?: boolean;
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

/**
 * 08.1-04 (D-04): the amount a line contributes to the totals. Default is the line's own home amount. A household caller passes
 * the viewer's share of the line (the same helper Home's Mine uses), so Activity and Home print one figure.
 */
export type ShareOf<R extends TotalsInput = TotalsInput> = (row: R) => number | null;

export function monthTotals<R extends TotalsInput = TotalsInput>(
  rows: readonly R[],
  projections: readonly { amountHome: number | null }[],
  shareOf?: ShareOf<R>
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
    // ARC-18: a settle-up record is money moving between people, not spending or income. It still moves its account's
    // balance (balance.ts), is not a transfer leg, and is not counted at all here.
    if (row.isSettlement === true) continue;
    if (row.isTransfer) {
      transferCount++;
      continue;
    }
    if (row.status === 'skipped') {
      continue;
    }
    count++;
    const amount = shareOf === undefined ? row.amountHome : shareOf(row);
    if (amount === null) {
      if (row.ratePending !== false) unconvertedCount++;
      continue;
    }
    if (row.status === 'paid') {
      if (row.isRefund === true || amount < 0) {
        paidOut += amount;
      } else {
        paidIn += amount;
      }
    } else {
      // Only 'pending' can reach here: 'skipped' rows already `continue`d above,
      // and TxStatus admits no other member.
      stillToCome += amount;
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
