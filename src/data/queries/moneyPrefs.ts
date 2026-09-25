// D-01/D-06/D-25: home currency, Show cents and lead figure, cached through TanStack Query
// like every other Phase 1 read. engine/ never reads these -- the formatter takes them as
// parameters (D-25).
import { useQuery } from '@tanstack/react-query';
import { fetchMoneyPrefs } from '@/db/profile';
import type { MoneyPrefsRow } from '@/db/rows';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

/** The same 'USD'/false/'home' placeholder the profiles migration defaults new rows to. */
export const DEFAULT_MONEY_PREFS: MoneyPrefsRow = {
  home_currency: 'USD',
  show_cents: false,
  lead_figure: 'home',
};

export function useMoneyPrefs(userId?: string): { prefs: MoneyPrefsRow; loading: boolean } {
  const query = useQuery({
    queryKey: queryKeys.moneyPrefs(userId ?? ''),
    queryFn: async () => (await fetchMoneyPrefs(supabase, userId as string)) ?? DEFAULT_MONEY_PREFS,
    enabled: Boolean(userId),
  });

  // Never surfaces `undefined` to a caller -- a screen renders the placeholder default
  // rather than nothing while the first fetch is in flight or userId isn't known yet.
  return { prefs: query.data ?? DEFAULT_MONEY_PREFS, loading: query.isLoading };
}
