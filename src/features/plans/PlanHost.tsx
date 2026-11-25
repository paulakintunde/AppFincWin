// 09-10: app-wide plan plumbing, mounted once in the (app) layout after the consent gate. Renders nothing.
// (1) Store identity: logIn(Supabase user id) once per user. (2) Realtime on household_plans, so a purchase on another
// device or a webhook shows here at once. (3) A throttled server refresh when the app returns to the foreground.
// 09-19: (4) keeps the local trial reminder in step with the plan (the tap that opens Subscription is useTrialReminderTap, mounted in the (app) layout). (5) The realtime
// callback also refreshes the double-cover choice, so a pick or the 7-day default by the other payer clears it at once.
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import { useHouseholdId } from '@/data/queries/household';
import { refreshPlan } from '@/db/plans';
import { useAuth } from '@/features/auth/AuthProvider';
import { captureError } from '@/services/errors';
import { supabase } from '@/services/supabase';
import { DOUBLE_COVER_KEY } from './notices/doubleCover';
import { syncTrialReminder } from './notices/trialReminder';
import { loadOffers, purchasesApiKey, startPurchases } from './store/purchasesClient';
import { usePlanState } from './usePlanState';

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
        () => {
          void qc.invalidateQueries({ queryKey: queryKeys.planState(userId) });
          void qc.invalidateQueries({ queryKey: DOUBLE_COVER_KEY(householdId) });
        },
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

  // 09-19 (D-18): the trial reminder follows the plan; the store price is asked only while a renewing trial runs.
  const plan = usePlanState();
  const [foregroundTick, setForegroundTick] = useState(0);
  const renewingTrial = plan.status === 'trial' && plan.willRenew && plan.trialEndsAt !== null;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegroundTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (plan.loading) return undefined;
    let live = true;
    const run = async () => {
      let price: string | null = null;
      if (renewingTrial) {
        const offers = await loadOffers({ platform: Platform.OS === 'ios' ? 'ios' : 'android', trialAvailable: false }).catch(() => []);
        price = offers.find((o) => o.productId === plan.productId)?.priceString ?? null;
      }
      if (live) await syncTrialReminder(plan, price);
    };
    run().catch((e: unknown) => captureError(e, { area: 'unknown' }));
    return () => {
      live = false;
    };
    // The reminder depends on these fields only; the whole plan object changes identity on every read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.loading, plan.status, plan.trialEndsAt, plan.willRenew, plan.productId, renewingTrial, foregroundTick]);

  return null;
}
