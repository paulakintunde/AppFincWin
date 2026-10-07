// Cached category reads (REC-07, D-33, D-34, D-50): a per-user list, plus a derived lookup
// screens use for picker ordering, id-by-builtin-key resolution and the system Transfer
// category's own id. Copies src/data/queries/accounts.ts's shape for the raw fetch; the
// lookup's ordering/filtering is pure derivation over the same cached data, memoised so it
// is not recomputed on every render.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCategories } from '@/db/categories';
import { MERGE_LIMIT, MERGE_ROWS_MAX, fetchActiveIdsByCategory } from '@/db/transactions';
import type { CategoryRow } from '@/db/rows';
import { BUILTIN_CATEGORY_KEYS, type BuiltinCategoryKey } from '@/engine/categorize';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useCategories(userId?: string) {
  return useQuery({
    queryKey: queryKeys.categories(userId ?? ''),
    queryFn: () => fetchCategories(supabase, userId as string),
    enabled: Boolean(userId),
  });
}

export interface CategoryLookup {
  all: CategoryRow[];
  active: CategoryRow[];
  byId: Map<string, CategoryRow>;
  builtinIds: Map<BuiltinCategoryKey, string>;
  transferCategoryId: string | null;
  loading: boolean;
}

const BUILTIN_ORDER = new Map<string, number>(BUILTIN_CATEGORY_KEYS.map((key, index) => [key, index]));

function isBuiltinCategoryKey(key: string | null): key is BuiltinCategoryKey {
  return key !== null && BUILTIN_ORDER.has(key);
}

/** Builtins in BUILTIN_CATEGORY_KEYS order, then custom categories oldest-created first. */
function compareActive(a: CategoryRow, b: CategoryRow): number {
  const aOrder = isBuiltinCategoryKey(a.builtin_key) ? (BUILTIN_ORDER.get(a.builtin_key) as number) : null;
  const bOrder = isBuiltinCategoryKey(b.builtin_key) ? (BUILTIN_ORDER.get(b.builtin_key) as number) : null;
  if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
  if (aOrder !== null) return -1;
  if (bOrder !== null) return 1;
  if (a.created_at < b.created_at) return -1;
  if (a.created_at > b.created_at) return 1;
  return 0;
}

/** REC-07/D-34/D-50: derives picker ordering, an id-by-builtin-key map and the system Transfer category's own id from the cached category list. */
export function useCategoryLookup(userId?: string): CategoryLookup {
  const query = useCategories(userId);
  const all = useMemo(() => query.data ?? [], [query.data]);

  return useMemo(() => {
    const active = [...all].filter((c) => c.archived_at === null && !c.is_system).sort(compareActive);

    const byId = new Map<string, CategoryRow>();
    for (const c of all) byId.set(c.id, c);

    const builtinIds = new Map<BuiltinCategoryKey, string>();
    for (const c of active) {
      if (isBuiltinCategoryKey(c.builtin_key)) builtinIds.set(c.builtin_key, c.id);
    }

    const transferRow = all.find((c) => c.builtin_key === 'Transfer' && c.is_system);

    return { all, active, byId, builtinIds, transferCategoryId: transferRow?.id ?? null, loading: query.isLoading };
  }, [all, query.isLoading]);
}

/** W6-13 WR-06: what useCategoryUsage reports. See the contract on the hook. */
export interface CategoryUsage {
  /** Active rows using the category, capped at MERGE_LIMIT. 0 whenever !isKnown -- never act on it then. */
  count: number;
  /** More rows than one merge can move (> MERGE_ROWS_MAX). Only meaningful when isKnown. */
  capped: boolean;
  /** True only after a successful read in THIS mount. The only state in which count may be trusted. */
  isKnown: boolean;
  /** The read failed, or is paused offline: the count is unknown (not 0). */
  isUnavailable: boolean;
  /** Enabled and still waiting for the first answer of this mount (neither known nor unavailable). */
  isLoading: boolean;
  /** Aliases of isKnown for callers that test TanStack-style flags: false/non-success means unknown. */
  known: boolean;
  isSuccess: boolean;
  /** The failed-read half of isUnavailable. */
  isError: boolean;
  status: 'success' | 'unavailable' | 'pending' | 'disabled';
}

/**
 * D-36: how many active transactions use a category, read before the user chooses merge or
 * archive. The server read is capped at MERGE_LIMIT + 1 rows; a count above MERGE_LIMIT is
 * reported as MERGE_LIMIT, and `capped` is set once the rows cannot be merged in one step
 * (more than MERGE_ROWS_MAX, W6-13 WR-03).
 *
 * W6-13 WR-06 contract: an unknown count is never a 0. Treat a category as unused (and archive it
 * without asking) ONLY when `isKnown && count === 0 && !capped`. When `isUnavailable` (a failed
 * or offline read) the caller must offer the merge-or-archive choice, not decide for the user. A
 * count cached from an earlier mount is not "known" until it has been re-read in this one, so a
 * persisted 0 can never auto-archive a category that has gained rows since.
 */
export function useCategoryUsage(householdId: string | null, categoryId: string | null, enabled: boolean): CategoryUsage {
  const on = enabled && Boolean(householdId) && Boolean(categoryId);
  const query = useQuery({
    queryKey: ['categories', 'usage', householdId, categoryId] as const,
    queryFn: async () => (await fetchActiveIdsByCategory(supabase, householdId as string, categoryId as string)).length,
    enabled: on,
  });
  const isKnown = on && query.isSuccess && query.isFetchedAfterMount && query.fetchStatus !== 'paused';
  const isUnavailable = on && !isKnown && (query.isError || query.fetchStatus === 'paused');
  const total = isKnown ? query.data : 0;
  return {
    count: Math.min(total, MERGE_LIMIT),
    capped: isKnown && total > MERGE_ROWS_MAX,
    isKnown,
    isUnavailable,
    isLoading: on && !isKnown && !isUnavailable,
    known: isKnown,
    isSuccess: isKnown,
    isError: on && query.isError,
    status: !on ? 'disabled' : isKnown ? 'success' : isUnavailable ? 'unavailable' : 'pending',
  };
}
