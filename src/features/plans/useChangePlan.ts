// 09-20: one place that turns "this household needs plan X" into a store change. The invite confirm (8a) and the payer's
// approval screen (8b) both use it: it loads the store's offers, works out the timing from the held plan with
// changeRule(), and runs the purchase through usePurchaseFlow (so the lock or seats only move when the server says so).
// Prices are always store strings from the offers (T-09-53); nothing here remembers or invents one.
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { captureError } from '@/services/errors';
import { changeRule, plansThatFit, type GoogleChangeMode, type StorePlatform } from './store/catalog';
import { loadOffers } from './store/purchasesClient';
import { heldPlan } from './plansModel';
import { usePlanState } from './usePlanState';
import { usePurchaseFlow } from './usePurchaseFlow';
import type { ChangeTiming, PlanKey, PlanOffer, PlanPeriod, PlanView } from './types';

export interface PlanChangePreview {
  target: PlanKey;
  period: PlanPeriod;
  /** The target plan in the person's current billing period; null while the store answers or on an error. */
  offer: PlanOffer | null;
  monthly: string | null;
  yearly: string | null;
  timing: ChangeTiming | null;
  googleMode: GoogleChangeMode | null;
  /** A failing payment has to be repaired before the store accepts a change (owner P6). */
  blocked: 'fixPaymentFirst' | null;
  /** The person is in a free trial now. */
  inTrial: boolean;
}

/** The smallest plan that holds this many people (D-44: never fewer seats than people). */
export function smallestPlanFor(people: number): PlanKey {
  return plansThatFit(people)[0] ?? 'extended';
}

export function platformNow(): StorePlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/** Pure: what changing the held plan to `target` means, from the store's offers. */
export function previewChange(plan: PlanView, target: PlanKey, offers: PlanOffer[] | null, platform: StorePlatform): PlanChangePreview {
  const held = heldPlan(plan);
  const period: PlanPeriod = held?.period ?? plan.period ?? 'year';
  const find = (p: PlanPeriod) => offers?.find((o) => o.planKey === target && o.period === p) ?? null;
  const offer = find(period);
  let timing: ChangeTiming | null = 'now';
  let googleMode: GoogleChangeMode | null = null;
  let blocked: PlanChangePreview['blocked'] = null;
  if (held) {
    const rule = changeRule({
      from: { ...held, billingIssue: plan.billingIssueAt !== null },
      to: { plan: target, period },
      platform,
    });
    if ('blocked' in rule) {
      blocked = rule.blocked;
      timing = null;
    } else {
      timing = rule.timing;
      googleMode = rule.googleMode ?? null;
    }
  }
  return {
    target,
    period,
    offer,
    monthly: find('month')?.priceString ?? null,
    yearly: find('year')?.priceString ?? null,
    timing,
    googleMode,
    blocked,
    inTrial: held?.inTrial ?? false,
  };
}

export function useChangePlan(enabled = true) {
  const plan = usePlanState();
  const platform = platformNow();
  const [offers, setOffers] = useState<PlanOffer[] | null>(null);
  const [offersError, setOffersError] = useState(false);
  const flow = usePurchaseFlow();
  const trialAvailable = plan.trialAvailable;

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadOffers({ platform, trialAvailable })
      .then((o) => {
        if (!live) return;
        setOffers(o);
        setOffersError(o.length === 0);
      })
      .catch((e) => {
        captureError(e, { area: 'unknown' });
        if (live) setOffersError(true);
      });
    return () => {
      live = false;
    };
  }, [enabled, platform, trialAvailable]);

  const preview = useMemo(() => (target: PlanKey) => previewChange(plan, target, offers, platform), [plan, offers, platform]);

  /** Starts the store change to `target`. Returns false when it cannot start (no offer, or a payment to repair first). */
  const run = (target: PlanKey): boolean => {
    const p = previewChange(plan, target, offers, platform);
    if (!p.offer || p.blocked) return false;
    const held = heldPlan(plan);
    const change =
      held && platform === 'android' && plan.productId && p.googleMode
        ? { fromProductId: plan.productId, googleMode: p.googleMode }
        : undefined;
    void flow.start({
      offer: p.offer,
      ...(change ? { change } : {}),
      timing: p.timing ?? 'now',
    });
    return true;
  };

  return {
    plan,
    offers,
    offersError,
    ready: offers !== null && !offersError,
    preview,
    run,
    flow,
  };
}
