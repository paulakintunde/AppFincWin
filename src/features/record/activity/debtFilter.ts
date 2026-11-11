// 06-37 (D-38): "See all in Activity" on a debt's detail opens Activity filtered to that debt, through the route
// parameter `?debt=<id>`. A line belongs to the debt when it is tagged to it (debt_id: record_debt_one_off's payment;
// record_debt_sale's lines only once that RPC stamps debt_id, P5-WR-05) or is a line of its payment series (series_id) or
// its extra series (extra_series_id), the same three links
// the debt's Payments list reads (debtLinkFilter). Pure and React-free.
import type { DebtRow } from '@/db/debts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DebtFilter {
  id: string;
  /** The debt's name, or null while the debt has not loaded (or is gone): the chip then reads a plain "Debt". */
  name: string | null;
  /** The debt's payment and extra series ids. */
  series: readonly string[];
}

/** The route parameter as a debt id: one uuid, else null (nothing else ever filters the list). */
export function debtParamOf(raw: string | readonly string[] | undefined | null): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && UUID_RE.test(v) ? v : null;
}

/** The filter for `id`; with the debt not found, only lines tagged to it match. */
export function debtFilterOf(
  id: string | null,
  debts: readonly Pick<DebtRow, 'id' | 'name' | 'series_id' | 'extra_series_id' | 'deleted_at'>[] | undefined
): DebtFilter | null {
  if (id === null) return null;
  const debt = debts?.find((d) => d.id === id && d.deleted_at === null);
  if (debt === undefined) return { id, name: null, series: [] };
  const series = [debt.series_id, debt.extra_series_id].filter((x): x is string => typeof x === 'string');
  return { id, name: debt.name, series };
}

export function matchesDebt(row: { debt_id?: string | null; recurring_series_id: string | null }, f: DebtFilter): boolean {
  if (row.debt_id === f.id) return true;
  return row.recurring_series_id !== null && f.series.includes(row.recurring_series_id);
}
