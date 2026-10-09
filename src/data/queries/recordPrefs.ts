// Record-polish reads (CONTEXT D-11, D-16, D-23): the user's week-start and sample-prompt
// answer, the household's horizon month, whether sample data exists and the server-stored
// dismissed series offers. Same cached-read shape as moneyPrefs.ts.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDismissedOfferKeys } from '@/db/dismissedOffers';
import { fetchHouseholdHorizon, fetchRecordPrefs, type RecordPrefsRow } from '@/db/recordPrefs';
import { fetchSampleDataExists } from '@/db/samples';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export const DEFAULT_RECORD_PREFS: RecordPrefsRow = { week_start: null, sample_prompt_answered_at: null };

export function useRecordPrefs(userId?: string): { prefs: RecordPrefsRow; loading: boolean; isSuccess: boolean } {
  const query = useQuery({
    queryKey: queryKeys.recordPrefs(userId ?? ''),
    queryFn: async () => (await fetchRecordPrefs(supabase, userId as string)) ?? DEFAULT_RECORD_PREFS,
    enabled: Boolean(userId),
  });
  return { prefs: query.data ?? DEFAULT_RECORD_PREFS, loading: query.isLoading, isSuccess: query.isSuccess };
}

export function useHouseholdHorizon(householdId?: string): { horizonMonth: string | null; isSuccess: boolean } {
  const query = useQuery({
    queryKey: queryKeys.householdHorizon(householdId ?? ''),
    queryFn: () => fetchHouseholdHorizon(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
  return { horizonMonth: query.data ?? null, isSuccess: query.isSuccess };
}

export function useSampleExists(householdId?: string): { hasSamples: boolean; isSuccess: boolean } {
  const query = useQuery({
    queryKey: queryKeys.sampleExists(householdId ?? ''),
    queryFn: () => fetchSampleDataExists(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
  return { hasSamples: query.data ?? false, isSuccess: query.isSuccess };
}

const NO_KEYS: ReadonlySet<string> = new Set();

export function useDismissedOffers(userId?: string): { keys: ReadonlySet<string>; isSuccess: boolean } {
  const query = useQuery({
    queryKey: queryKeys.dismissedOffers(userId ?? ''),
    queryFn: () => fetchDismissedOfferKeys(supabase),
    enabled: Boolean(userId),
  });
  const keys = useMemo<ReadonlySet<string>>(() => query.data ?? NO_KEYS, [query.data]);
  return { keys, isSuccess: query.isSuccess };
}
