/**
 * 05-125 (D-100, R18.1): the Month details breakdown. Every row is read from the engine's own derivation (logged) or
 * from the same formula over the rough figures, so `income - spending - debts - saving - setAside === result` always.
 * Moved from the old Decide home model by 06.1-36; Grow's Lines and Debts screens read it.
 */
import { prepareContext, totalSetAside } from '@/engine/decide';
import type { SnapshotResult } from '@/features/decide/snapshot/types';

export interface MonthBreakdown {
  source: 'logged' | 'rough';
  income: number;
  spending: number;
  /** Debt payments; 0 on a rough source (no debts are known). */
  debts: number;
  /** Saving and investing (pausable); 0 on a rough source. */
  saving: number;
  /** The pots' monthly set-asides (D-101). */
  setAside: number;
  /** Net free cash flow, signed. */
  result: number;
}

/**
 * The breakdown for a source; null when there is none to show. A rough source takes the pots' set-asides off its
 * rough spending exactly as a logged month does (`totalSetAside`, the engine's own sum), so both follow one formula.
 */
export function monthBreakdown(source: SnapshotResult, today: string): MonthBreakdown | null {
  if (source.kind === 'logged') {
    const ctx = prepareContext(source.snapshot);
    if (!ctx.ok) return null;
    const c = ctx.context;
    return {
      source: 'logged',
      income: c.money.incomeBasis,
      spending: c.money.spendingBasis,
      debts: c.debtPayments,
      saving: c.pausable,
      setAside: c.setAside,
      result: c.leftBefore,
    };
  }
  if (source.kind === 'rough') {
    const setAside = totalSetAside(source.pots ?? [], today).total;
    const { monthlyIncome, monthlySpending } = source.figures;
    return { source: 'rough', income: monthlyIncome, spending: monthlySpending, debts: 0, saving: 0, setAside, result: monthlyIncome - monthlySpending - setAside };
  }
  return null;
}
