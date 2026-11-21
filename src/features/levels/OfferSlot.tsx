// 09-22 (UI-SPEC 12, D-36, D-37, TIER-05): where an in-context offer appears. Reads the person's own cached lines on their
// device, asks pickOffer which hidden feature (if any) may be offered now, and shows it inline. Showing one counts the week.
// "Not now" hides that feature for 30 days, "Don't suggest" stops it for good; both are silent. Only "Turn on" changes anything.
import React, { useEffect, useMemo, useState } from 'react';
import { useCategoryLookup } from '@/data/queries/categories';
import { useSeriesOffers } from '@/data/queries/offers';
import { useTransactionsForMonth } from '@/data/queries/transactions';
import { monthOf } from '@/engine/time';
import { addMonthsClamped } from '@/engine/time/calendar';
import { useRecordContext } from '@/features/record/useRecordContext';
import { usePlanState } from '@/features/plans/usePlanState';
import { getAnalytics } from '@/services/analytics';
import { OfferCard } from './OfferCard';
import { useOfferState } from './offerStore';
import { triggeredFeatures } from './offerTriggers';
import { paymentNoticeDue, pickOffer, withNever, withShown, withSnooze, type OfferContext } from './offers';
import type { FeatureId } from './featureRegistry';
import { useAllFeatureAccess } from './useFeatureAccess';
import { useChangeFeatureSwitch } from './useChangeFeatureSwitch';

// An offer shown this session stays until it is answered, even though showing it used up the week.
const latched = new Map<string, FeatureId>();

export function OfferSlot({ context }: { context: OfferContext }) {
  const ctx = useRecordContext();
  const userId = ctx.userId ?? undefined;
  const plan = usePlanState();
  const access = useAllFeatureAccess();
  const change = useChangeFeatureSwitch();
  const { state, update } = useOfferState(userId);
  const month = monthOf(ctx.today);
  const lastMonth = monthOf(addMonthsClamped(ctx.today, -1));
  const thisRows = useTransactionsForMonth(ctx.householdId ?? undefined, month).data;
  const lastRows = useTransactionsForMonth(ctx.householdId ?? undefined, lastMonth).data;
  const categories = useCategoryLookup(userId);
  const series = useSeriesOffers({ householdId: ctx.householdId, userId: ctx.userId }, month);
  const [answered, setAnswered] = useState<FeatureId | null>(null);
  // The moment this screen opened: the week and snooze rules are judged against it, not against every render.
  const [now] = useState(() => Date.now());

  const triggered = useMemo(
    () =>
      triggeredFeatures({
        lines: [...(thisRows ?? []), ...(lastRows ?? [])],
        debtCategoryId: categories.builtinIds.get('Debt') ?? null,
        savingsCategoryId: categories.builtinIds.get('Savings') ?? null,
        homeCurrency: ctx.homeCurrency,
        seriesOfferCount: series.offers.length,
        today: ctx.today,
      }),
    [thisRows, lastRows, categories.builtinIds, ctx.homeCurrency, ctx.today, series.offers.length]
  );

  const kept = userId === undefined ? undefined : latched.get(userId);
  const picked = useMemo<FeatureId | null>(() => {
    if (state === null || plan.loading || !ctx.ready) return null;
    const byId = new Map(access.map((a) => [a.id, a] as const));
    return pickOffer({
      now,
      state,
      context,
      planStatus: plan.status,
      planWritable: plan.writable,
      paymentNoticeToday: paymentNoticeDue({ status: plan.status, trialEndsAt: plan.trialEndsAt }, now),
      triggered,
      accessById: (id) => {
        const a = byId.get(id);
        return a === undefined ? { visible: true, reason: null } : { visible: a.visible, reason: a.reason };
      },
    });
  }, [state, now, plan.loading, plan.status, plan.writable, plan.trialEndsAt, ctx.ready, access, context, triggered]);

  // Showing a new offer counts the week; do it once, and keep the card until it is answered.
  useEffect(() => {
    if (userId === undefined || picked === null || kept !== undefined) return;
    latched.set(userId, picked);
    update((s) => withShown(s, Date.now()));
    getAnalytics().track('offer_shown', { feature: picked });
  }, [userId, picked, kept, update]);

  const showing = kept ?? picked;
  if (userId === undefined || showing === null || answered === showing) return null;
  const a = access.find((x) => x.id === showing);
  // Already on (turned on elsewhere, or by the person's level): nothing to offer.
  if (a === undefined || a.visible || a.reason === 'household' || a.reason === 'plan') return null;

  const done = (): void => {
    latched.delete(userId);
    setAnswered(showing);
  };
  return (
    <OfferCard
      featureId={showing}
      onTurnOn={() => {
        change(showing, true, false);
        getAnalytics().track('offer_accepted', { feature: showing });
        done();
      }}
      onNotNow={() => {
        update((s) => withSnooze(s, showing, Date.now()));
        getAnalytics().track('offer_dismissed', { feature: showing, choice: 'not_now' });
        done();
      }}
      onDontSuggest={() => {
        update((s) => withNever(s, showing));
        getAnalytics().track('offer_dismissed', { feature: showing, choice: 'never' });
        done();
      }}
    />
  );
}

/** Test seam: forget what this session latched. */
export function resetOfferLatch(): void {
  latched.clear();
}
