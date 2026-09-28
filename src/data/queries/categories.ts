// Cached category reads (REC-07, D-33, D-34, D-50): a per-user list, plus a derived lookup
// screens use for picker ordering, id-by-builtin-key resolution and the system Transfer
// category's own id. Copies src/data/queries/accounts.ts's shape for the raw fetch; the
// lookup's ordering/filtering is pure derivation over the same cached data, memoised so it
// is not recomputed on every render.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCategories } from '@/db/categories';
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
