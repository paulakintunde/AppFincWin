/**
 * 06.2 D-12 / L02: which Activity row took its category over its monthly cap, and by how much.
 *
 * Pure app-side derivation over rows the screen already loaded (no query, no engine change). It counts what the
 * category usage line counts (useCategoryMonthUsage -> engine categoryUsage): paid and pending lines in home currency,
 * net of refunds, never skipped lines or transfer legs, never a line without a home figure. Integer minor units only.
 *
 * Per category with a cap and per month, rows are walked in date order (then created order). The first spending row
 * whose running total goes past the cap (strictly above: exactly at the cap is not over) is the one that gets the badge,
 * and its value is the running total minus the cap at that row ("$40 over cap"). Nothing is returned when the month
 * ends at or under the cap after refunds, so the cue never claims an over-cap that the month no longer shows.
 */
import type { ActivityRowView } from '@/data/queries/activity';
import type { CategoryRow } from '@/db/rows';

type CapRow = Pick<
  ActivityRowView,
  'id' | 'category_id' | 'local_date' | 'status' | 'transfer_id' | 'amountHome' | 'original_amount'
> & { created_at?: string | null };

type CapCategory = Pick<CategoryRow, 'id' | 'monthly_cap'>;

function counted(row: CapRow): row is CapRow & { amountHome: number } {
  return row.status !== 'skipped' && row.transfer_id === null && row.category_id !== null && row.amountHome !== null;
}

function byDateThenCreated(a: CapRow, b: CapRow): number {
  if (a.local_date !== b.local_date) return a.local_date < b.local_date ? -1 : 1;
  const ca = a.created_at ?? '';
  const cb = b.created_at ?? '';
  if (ca !== cb) return ca < cb ? -1 : 1;
  return 0;
}

/** rowId -> how far past the cap (minor units, home currency) the month's running total went on that row. */
export function overCapRows(rows: readonly CapRow[], categories: readonly CapCategory[]): Map<string, number> {
  const caps = new Map<string, number>();
  for (const c of categories) {
    if (c.monthly_cap !== null && c.monthly_cap !== undefined && c.monthly_cap >= 0) caps.set(c.id, c.monthly_cap);
  }
  const out = new Map<string, number>();
  if (caps.size === 0) return out;

  // Group by category and month (YYYY-MM of the local date).
  const groups = new Map<string, (CapRow & { amountHome: number })[]>();
  for (const row of rows) {
    if (!counted(row)) continue;
    const categoryId = row.category_id as string;
    if (!caps.has(categoryId)) continue;
    const key = `${categoryId}|${row.local_date.slice(0, 7)}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  for (const [key, list] of groups) {
    const cap = caps.get(key.slice(0, key.indexOf('|'))) as number;
    const ordered = [...list].sort(byDateThenCreated);
    let spent = 0;
    let crossing: { id: string; over: number } | null = null;
    for (const row of ordered) {
      // Spending is negative, refunds positive: spent is the negated net.
      spent -= row.amountHome;
      if (crossing === null && row.amountHome < 0 && spent > cap) crossing = { id: row.id, over: spent - cap };
    }
    if (crossing !== null && spent > cap) out.set(crossing.id, crossing.over);
  }
  return out;
}
