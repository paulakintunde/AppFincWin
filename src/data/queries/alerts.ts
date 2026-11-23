// 10-03: the person's alert switches, delivery preferences and recent alert log. Own rows; settings, not lock-gated.
import { useQuery } from '@tanstack/react-query';
import { fetchAlertLog, fetchAlertPrefs, fetchAlertSettings } from '@/db/alerts';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

const ONE_MINUTE = 60 * 1000;
const FIVE_MINUTES = 5 * ONE_MINUTE;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export function useAlertSettings(userId?: string) {
  return useQuery({
    queryKey: queryKeys.alertSettings(userId ?? ''),
    queryFn: () => fetchAlertSettings(supabase, userId as string),
    enabled: Boolean(userId),
    staleTime: FIVE_MINUTES,
  });
}

export function useAlertPrefs(userId?: string) {
  return useQuery({
    queryKey: queryKeys.alertPrefs(userId ?? ''),
    queryFn: () => fetchAlertPrefs(supabase, userId as string),
    enabled: Boolean(userId),
    staleTime: FIVE_MINUTES,
  });
}

/** The last 30 days of alerts, newest first. */
export function useAlertLog(userId?: string) {
  return useQuery({
    queryKey: queryKeys.alertLog(userId ?? ''),
    queryFn: () => fetchAlertLog(supabase, userId as string, new Date(Date.now() - THIRTY_DAYS).toISOString()),
    enabled: Boolean(userId),
    staleTime: ONE_MINUTE,
  });
}
