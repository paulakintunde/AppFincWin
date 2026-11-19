// 09-10: app-wide plan plumbing, mounted once in the (app) layout after the consent gate. Renders nothing.
// (1) Store identity: logIn(Supabase user id) once per user. (2) Realtime on household_plans, so a purchase on another
// device or a webhook shows here at once. (3) A throttled server refresh when the app returns to the foreground.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import { useHouseholdId } from '@/data/queries/household';
import { refreshPlan } from '@/db/plans';
import { useAuth } from '@/features/auth/AuthProvider';
import { captureError } from '@/services/errors';
import { supabase } from '@/services/supabase';
import { purchasesApiKey, startPurchases } from './store/purchasesClient';

const REFRESH_MIN_GAP_MS = 60_000;
let lastRefreshAt = 0;
let activeClient: { invalidate: (userId: string) => void; userId: string } | null = null;

/**
 * The client half of webhook recovery: asks the server to re-read the store, then re-reads the plan. Call it with
 * `force: true` after every purchase and restore; the foreground path is throttled to once a minute.
 */
export async function requestPlanRefresh(opts: { force?: boolean } = {}): Promise<void> {
  const now = Date.now();
  if (!opts.force && now - lastRefreshAt < REFRESH_MIN_GAP_MS) return;
  lastRefreshAt = now;
  await refreshPlan(supabase);
  if (activeClient) activeClient.invalidate(activeClient.userId);
}

export function PlanHost() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  const { data: householdId } = useHouseholdId(userId);

  useEffect(() => {
    if (!userId) return undefined;
    activeClient = { userId, invalidate: (id) => void qc.invalidateQueries({ queryKey: queryKeys.planState(id) }) };
    return () => {
      activeClient = null;
    };
  }, [qc, userId]);

  useEffect(() => {
    if (!userId) return;
    const key = purchasesApiKey();
    if (!key) return;
    startPurchases(key, userId).catch((e) => captureError(e, { area: 'unknown' }));
  }, [userId]);

  useEffect(() => {
    if (!userId || !householdId) return undefined;
    const ch = supabase
      .channel('plan:' + householdId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'household_plans', filter: 'household_id=eq.' + householdId },
        () => void qc.invalidateQueries({ queryKey: queryKeys.planState(userId) }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc, userId, householdId]);

  useEffect(() => {
    if (!userId) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void requestPlanRefresh();
    });
    return () => sub.remove();
  }, [userId]);

  return null;
}
