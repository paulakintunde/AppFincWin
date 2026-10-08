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
  /** Keep only rows still to be paid (status 'pending'): the prototype's "Unpaid only". */
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
  const isTransfer = row.transfer_id !== null;
  switch (direction) {
    case 'all':
      return true;
    case 'transfers':
      return isTransfer;
    case 'in':
      return !isTransfer && row.original_amount > 0;
    case 'out':
      return !isTransfer && row.original_amount < 0;
  }
}

function matchesAmountRange(row: FilterRow, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true;
  const magnitude = Math.abs(row.amountHome ?? row.original_amount);
  if (min !== null && magnitude < min) return false;
  if (max !== null && magnitude > max) return false;
  return true;
}

export function filterRows<T extends FilterRow>(rows: readonly T[], f: ActivityFilter): T[] {
  return rows.filter((row) => {
    if (f.categoryIds !== null && !f.categoryIds.includes(row.category_id)) return false;
    if (f.accountIds !== null && !f.accountIds.includes(row.account_id)) return false;
    if (f.unpaidOnly && row.status !== 'pending') return false;
    if (!matchesDirection(row, f.direction)) return false;
    if (!matchesAmountRange(row, f.amountMin, f.amountMax)) return false;
    return true;
  });
}
