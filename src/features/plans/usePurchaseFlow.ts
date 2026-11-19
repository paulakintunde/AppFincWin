// 09-14: the purchase state machine. The store reporting a purchase never lifts the lock (T-09-51): only the server's
// plan_state does, through usePlanState().writable. Asking the server to re-sync is forced after every purchase and every
// restore that did not fail outright (09-06: a webhook run can fail while the store has the receipt).
import { useCallback, useEffect, useState } from 'react';
import { requestPlanRefresh } from '@/features/plans/PlanHost';
import { purchasePlan, restorePurchases } from '@/features/plans/store/purchasesClient';
import type { GoogleChangeMode } from '@/features/plans/store/catalog';
import { usePlanState } from '@/features/plans/usePlanState';
import type { ChangeTiming, PlanOffer } from '@/features/plans/types';
import { getAnalytics } from '@/services/analytics';
import { captureError } from '@/services/errors';

export type PurchaseFlowState = 'idle' | 'pending' | 'waitingServer' | 'slow' | 'done' | 'failed';
export type RestoreToastKey = 'plans.paywall.states.restoreNone' | 'plans.paywall.states.restoreFailed' | 'plans.member.title';

export const SLOW_AFTER_MS = 60_000;

export interface StartArgs {
  offer: PlanOffer;
  /** Set when the person already holds a store plan (Android replacement mode needs it). */
  change?: { fromProductId: string; googleMode: GoogleChangeMode };
  /** How the change takes effect; 'now' for a first purchase. */
  timing: ChangeTiming;
}

interface Target {
  plan: PlanOffer['planKey'] | null;
  period: PlanOffer['period'] | null;
}

export function usePurchaseFlow() {
  const plan = usePlanState();
  const [phase, setState] = useState<PurchaseFlowState>('idle');
  const [notCharged, setNotCharged] = useState(false);
  const [target, setTarget] = useState<Target>({ plan: null, period: null });

  const covered =
    plan.writable &&
    (plan.status === 'trial' || plan.status === 'active') &&
    (target.plan === null || (plan.planKey === target.plan && plan.period === target.period));

  // Covered by the server while waiting means done; derived, not set from an effect.
  const state: PurchaseFlowState = (phase === 'waitingServer' || phase === 'slow') && covered ? 'done' : phase;

  useEffect(() => {
    if (phase !== 'waitingServer') return;
    const id = setTimeout(() => setState((s) => (s === 'waitingServer' ? 'slow' : s)), SLOW_AFTER_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const start = useCallback(
    async ({ offer, change, timing }: StartArgs) => {
      setNotCharged(false);
      setState('pending');
      let outcome;
      try {
        outcome = await purchasePlan(offer, change ? { change } : {});
      } catch (e) {
        captureError(e, { area: 'unknown' });
        setNotCharged(false);
        setState('failed');
        return;
      }
      if (outcome.kind === 'cancelled') {
        setState('idle');
        return;
      }
      if (outcome.kind === 'failed') {
        setNotCharged(outcome.notCharged);
        setState('failed');
        return;
      }
      if (outcome.kind === 'already-used-by-another-account') {
        setNotCharged(false);
        setState('failed');
        return;
      }
      // purchased, or pending store approval: the server decides when the plan is covered.
      if (outcome.kind === 'purchased') {
        if (offer.hasTrial && (offer.planKey === 'solo' || offer.planKey === 'duo')) {
          getAnalytics().track('trial_started', { plan: offer.planKey, period: offer.period });
        } else {
          getAnalytics().track('plan_changed', { plan: offer.planKey, period: offer.period, timing });
        }
      }
      // A change that starts at renewal leaves the current plan in place, so the server will not show the new plan yet.
      const deferred = timing === 'renewal';
      setTarget(deferred ? { plan: null, period: null } : { plan: offer.planKey, period: offer.period });
      setState('waitingServer');
      try {
        await requestPlanRefresh({ force: true });
      } catch (e) {
        captureError(e, { area: 'unknown' });
      }
      if (deferred) setState('done');
    },
    [],
  );

  const restore = useCallback(async (): Promise<RestoreToastKey | null> => {
    let result: Awaited<ReturnType<typeof restorePurchases>>;
    try {
      result = await restorePurchases();
    } catch (e) {
      captureError(e, { area: 'unknown' });
      result = 'failed';
    }
    getAnalytics().track('plan_restored', { result: result === 'already-used-by-another-account' ? 'already_used' : result });
    if (result !== 'failed') {
      try {
        await requestPlanRefresh({ force: true });
      } catch (e) {
        captureError(e, { area: 'unknown' });
      }
    }
    if (result === 'restored') {
      setTarget({ plan: null, period: null });
      setState('waitingServer');
      return null;
    }
    if (result === 'nothing') return 'plans.paywall.states.restoreNone';
    if (result === 'already-used-by-another-account') return 'plans.member.title';
    return 'plans.paywall.states.restoreFailed';
  }, []);

  const reset = useCallback(() => {
    setNotCharged(false);
    setState('idle');
  }, []);

  return { state, notCharged, start, restore, reset };
}
