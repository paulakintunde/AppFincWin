/**
 * 05-125 (D-100, R18.1): the Month details breakdown. Every row is read from the v3 month model (05.5-26, ARC-03), so
 * `income - spending - debts - saving - setAside === result` always. Grow's Lines and Debts screens read it.
 * 05.5-26: reads the v3 Prepared through the engine's `monthRows`; the old prepareContext and totalSetAside are gone.
 */
import type { Prepared } from '@/engine/decide/v3';
import { monthRows } from '@/engine/month';

export interface MonthBreakdown {
  source: 'logged' | 'typed';
  income: number;
  spending: number;
  /** Every debt's minimum payment. */
  debts: number;
  /** Fixed saving and investing plans (pausable). */
  saving: number;
  /** The pots' and envelopes' monthly set-asides (D-101). */
  setAside: number;
  /** Net free cash flow, signed. */
  result: number;
}

/** The breakdown for a Prepared; null when there is none to show (not ready, or no usual month yet). */
export function monthBreakdown(prepared: Prepared | null): MonthBreakdown | null {
  if (prepared === null) return null;
  const r = monthRows(prepared);
  if (r === null) return null;
  return { source: r.source, income: r.income, spending: r.spending, debts: r.debts, saving: r.saving, setAside: r.setAside, result: r.result };
}
