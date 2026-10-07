// D-01/D-06/D-25: home currency, Show cents and lead figure, cached through TanStack Query
// like every other Phase 1 read. engine/ never reads these -- the formatter takes them as
// parameters (D-25).
import { useQuery } from '@tanstack/react-query';
import { fetchMoneyPrefs } from '@/db/profile';
import type { MoneyPrefsRow } from '@/db/rows';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

/** The same 'USD'/false/'home'/null placeholder the profiles migration defaults new rows to. */
export const DEFAULT_MONEY_PREFS: MoneyPrefsRow = {
  home_currency: 'USD',
  show_cents: false,
  lead_figure: 'home',
  region: null,
};

export interface MoneyPrefsQuery {
  prefs: MoneyPrefsRow;
  loading: boolean;
  /** W6-13 WR-07: the prefs are a real server read. When false, `prefs` may be the placeholder. */
  isSuccess: boolean;
  /** The read failed: `prefs` is DEFAULT_MONEY_PREFS, NOT the user's stored values. */
  isError: boolean;
  /** Read from the server in this mount (not only restored from the persisted cache). */
  isFetchedAfterMount: boolean;
}

export function useMoneyPrefs(userId?: string): MoneyPrefsQuery {
  const query = useQuery({
    queryKey: queryKeys.moneyPrefs(userId ?? ''),
    queryFn: async () => (await fetchMoneyPrefs(supabase, userId as string)) ?? DEFAULT_MONEY_PREFS,
    enabled: Boolean(userId),
  });

  // Never surfaces `undefined` to a caller -- a screen renders the placeholder default
  // rather than nothing while the first fetch is in flight or userId isn't known yet. A caller
  // that DECIDES something from the values (not just renders them) must check isSuccess.
  return {
    prefs: query.data ?? DEFAULT_MONEY_PREFS,
    loading: query.isLoading,
    isSuccess: query.isSuccess,
    isError: query.isError,
    isFetchedAfterMount: query.isFetchedAfterMount,
  };
}
