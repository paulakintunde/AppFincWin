/**
 * Activity list filtering and search (ACT-03, ACT-04, D-50). A null filter
 * field means "no constraint". Direction 'in'/'out' exclude transfer legs;
 * 'transfers' shows only transfer legs, keyed on transfer_id, never on the
 * Transfer category.
 */

export interface ActivityFilter {
  categoryIds: readonly (string | null)[] | null; // null entry = uncategorised
  accountIds: readonly string[] | null;
  direction: 'all' | 'in' | 'out' | 'transfers';
  amountMin: number | null; // home-currency minor units, compared on magnitude
  amountMax: number | null;
  /**
   * Keep only bills still to pay: pending, non-transfer, non-refund outflows
   * (03-CONTEXT D-35, D-36). Pending income is excluded so Activity's Unpaid
   * list matches Home's UNPAID figure.
   */
  unpaidOnly: boolean;
}

export const EMPTY_FILTER: ActivityFilter = {
  categoryIds: null,
  accountIds: null,
  direction: 'all',
  amountMin: null,
  amountMax: null,
  unpaidOnly: false,
};

export interface FilterRow {
  category_id: string | null;
  account_id: string;
  original_amount: number;
  amountHome: number | null;
  name: string | null;
  note: string | null;
  transfer_id: string | null;
  status: 'pending' | 'paid' | 'skipped';
  is_refund?: boolean;
}

/** Flow of a row: refunds are 'out' (CONTEXT D-03), never classified by sign alone. */
export function flowOf(
  row: Pick<FilterRow, 'original_amount' | 'transfer_id' | 'is_refund'>
): 'in' | 'out' | 'transfer' {
  if (row.transfer_id !== null) return 'transfer';
  if (row.is_refund === true) return 'out';
  if (row.original_amount < 0) return 'out';
  return 'in';
}

export function isFilterActive(f: ActivityFilter): boolean {
  return (
    f.categoryIds !== null ||
    f.accountIds !== null ||
    f.direction !== 'all' ||
    f.amountMin !== null ||
    f.amountMax !== null ||
    f.unpaidOnly
  );
}

const COMBINING_MARKS = /\p{M}/gu;

export function normaliseForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesSearch(row: Pick<FilterRow, 'name' | 'note'>, term: string): boolean {
  const tokens = normaliseForSearch(term)
    .split(' ')
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return true;
  const haystack = normaliseForSearch(`${row.name ?? ''} ${row.note ?? ''}`);
  return tokens.every((token) => haystack.includes(token));
}

function matchesDirection(row: FilterRow, direction: ActivityFilter['direction']): boolean {
  if (direction === 'all') return true;
  const flow = flowOf(row);
  return direction === 'transfers' ? flow === 'transfer' : flow === direction;
}

function matchesAmountRange(row: FilterRow, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true;
  const magnitude = Math.abs(row.amountHome ?? row.original_amount);
  if (min !== null && magnitude < min) return false;
  if (max !== null && magnitude > max) return false;
  return true;
}

export function isUnpaidBill(
  row: Pick<FilterRow, 'status' | 'transfer_id' | 'is_refund' | 'original_amount'>
): boolean {
  return (
    row.status === 'pending' &&
    row.transfer_id === null &&
    row.is_refund !== true &&
    row.original_amount < 0
  );
}

export function filterRows<T extends FilterRow>(rows: readonly T[], f: ActivityFilter): T[] {
  return rows.filter((row) => {
    if (f.categoryIds !== null && !f.categoryIds.includes(row.category_id)) return false;
    if (f.accountIds !== null && !f.accountIds.includes(row.account_id)) return false;
    if (f.unpaidOnly && !isUnpaidBill(row)) return false;
    if (!matchesDirection(row, f.direction)) return false;
    if (!matchesAmountRange(row, f.amountMin, f.amountMax)) return false;
    return true;
  });
}

export interface FilterProjection {
  categoryId: string | null;
  accountId: string;
  amount: number;
  amountHome: number | null;
}

/** D-34/D-35: projected recurring bills join the Unpaid list (they count in Home's UNPAID); other filters keep hiding projections. */
export function filterProjections<P extends FilterProjection>(
  projections: readonly P[],
  f: ActivityFilter
): P[] {
  if (!f.unpaidOnly) return [];
  if (f.direction === 'in' || f.direction === 'transfers') return [];
  return projections.filter((p) => {
    if (p.amount >= 0) return false;
    if (f.categoryIds !== null && !f.categoryIds.includes(p.categoryId)) return false;
    if (f.accountIds !== null && !f.accountIds.includes(p.accountId)) return false;
    const magnitude = Math.abs(p.amountHome ?? p.amount);
    if (f.amountMin !== null && magnitude < f.amountMin) return false;
    if (f.amountMax !== null && magnitude > f.amountMax) return false;
    return true;
  });
}

export function isOnlyUnpaid(f: ActivityFilter): boolean {
  return f.unpaidOnly && !isFilterActive({ ...f, unpaidOnly: false });
}
