/**
 * Activity sort orders (ACT-09). Stable; Biggest/Smallest compare absolute
 * home-currency value. Ties fall back to Newest, mirroring the section
 * comparator in activitySections.ts.
 */
import { normaliseForSearch } from './filters';

export const SORT_KEYS = ['newest', 'oldest', 'biggest', 'smallest', 'az'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface SortRow {
  id: string;
  local_date: string;
  created_at: string;
  name: string | null;
  original_amount: number;
  amountHome: number | null;
}

function cmp<V extends string | number>(a: V, b: V): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function newestFirst(a: SortRow, b: SortRow): number {
  return cmp(b.local_date, a.local_date) || cmp(b.created_at, a.created_at) || cmp(b.id, a.id);
}

function magnitude(r: SortRow): number {
  return Math.abs(r.amountHome ?? r.original_amount);
}

export function sortRows<T extends SortRow>(rows: readonly T[], key: SortKey): T[] {
  const copy = [...rows];
  switch (key) {
    case 'newest':
      return copy.sort(newestFirst);
    case 'oldest':
      return copy.sort((a, b) => newestFirst(b, a));
    case 'biggest':
      return copy.sort((a, b) => cmp(magnitude(b), magnitude(a)) || newestFirst(a, b));
    case 'smallest':
      return copy.sort((a, b) => cmp(magnitude(a), magnitude(b)) || newestFirst(a, b));
    case 'az':
      return copy.sort(
        (a, b) =>
          cmp(normaliseForSearch(a.name ?? ''), normaliseForSearch(b.name ?? '')) ||
          newestFirst(a, b)
      );
  }
}
