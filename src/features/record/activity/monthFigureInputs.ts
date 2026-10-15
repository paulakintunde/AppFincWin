// 03.1 D-47: the one mapping Home and Activity both use, so the summary figure cannot differ.
// Kept outside engine/ (coverage gate); pure, no React.
import {
  monthPosition,
  type MonthFigureProjection,
  type MonthFigureRow,
  type MonthPosition,
  type MonthTotals,
} from '@/engine/activity';
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';

type FigureSource = {
  rows: readonly Pick<
    ActivityRowView,
    'status' | 'transfer_id' | 'is_refund' | 'original_amount' | 'amountHome'
  >[];
  projections: readonly Pick<ProjectionView, 'amount' | 'amountHome'>[];
  totals: MonthTotals;
};

export function monthFigureInputs(v: Pick<FigureSource, 'rows' | 'projections'>): {
  rows: MonthFigureRow[];
  projections: MonthFigureProjection[];
} {
  return {
    rows: v.rows.map((r) => ({
      status: r.status,
      isTransfer: r.transfer_id !== null,
      isRefund: r.is_refund,
      originalAmount: r.original_amount,
      amountHome: r.amountHome,
    })),
    projections: v.projections.map((p) => ({ amount: p.amount, amountHome: p.amountHome })),
  };
}

export function monthPositionOf(v: FigureSource): MonthPosition {
  const inputs = monthFigureInputs(v);
  return monthPosition(v.totals, inputs.rows, inputs.projections);
}

/** D-51 / T-03-22-01: empty only when nothing is recorded AND nothing is expected. */
export function isMonthEmpty(
  totals: Pick<MonthTotals, 'count'>,
  position: Pick<MonthPosition, 'unpaidCount' | 'unconvertedUnpaid'>
): boolean {
  return totals.count === 0 && position.unpaidCount === 0 && position.unconvertedUnpaid === 0;
}

/**
 * Review WR-04: the Out figure Home and Activity both print. A real outflow (paidOut <= 0) shows as
 * a plain amount; a month where refunds outweigh spending (paidOut > 0, monthFigures L6) keeps its
 * plus sign so it never reads as money spent. Formatting only, no arithmetic beyond the sign.
 */
export function paidOutText(paidOut: number, fmt: (amount: number) => string): string {
  return paidOut > 0 ? `+${fmt(paidOut)}` : fmt(Math.abs(paidOut));
}
