/**
 * 09-19 (UI-SPEC section 7): plan notices on screen. `PlanNoticeSlot` (Home) shows only the first notice in priority order;
 * `PlanNoticeList` (You > Subscription) shows them all. The choice of notices is the pure planNotices model; this file only
 * gathers its inputs, draws each notice and runs its actions. Dismissals live on the phone under one key and are wiped with
 * the rest of the device data at sign-out. The one-time takeover toast is raised from Home only.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT } from '@/i18n';
import { useHouseholdEvents } from '@/data/queries/household';
import { useSaveUserSetup } from '@/data/mutations/userSetup';
import { useAuth } from '@/features/auth/AuthProvider';
import { useHouseholdScope } from '@/features/household/useHouseholdScope';
import { useMemberLabel } from '@/features/household/useMemberLabel';
import { useUserSetup } from '@/features/levels/useUserSetup';
import { captureError } from '@/services/errors';
import { showToast } from '@/state/undoToast';
import { space } from '@/theme/layout';
import { STATUS } from '@/ui/status/statusMap';
import { NoticeCard, PlanLink, type NoticeAction } from '../components/NoticeCard';
import { MoveToSoloSheet } from '../MoveToSoloSheet';
import { OfflineSavesNotice, useOfflineSavesCount } from '../OfflineSavesNotice';
import { loadOffers, openManageSubscription } from '../store/purchasesClient';
import type { PlanKey, PlanOffer, PlanPeriod } from '../types';
import { usePlanState } from '../usePlanState';
import { DoubleCoverNotice } from './DoubleCoverNotice';
import { useDoubleCover } from './doubleCover';
import { DISMISS_LINK_KEY, dismissValue, needsDismissLink, planNotices, takeoverToast, type Notice } from './planNotices';

export const NOTICE_DISMISS_STORAGE_KEY = 'fincwin:plan-notice-dismissed';
export const TAKEOVER_SEEN_STORAGE_KEY = 'fincwin:plan-takeover-seen';

type Translate = (key: string, params?: Record<string, unknown>) => string;

async function readDismissed(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(NOTICE_DISMISS_STORAGE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Everything planNotices needs, read from the app's caches, plus what the actions need. */
export function usePlanNotices() {
  const t = useT();
  const tk = t as unknown as Translate;
  const plan = usePlanState();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const householdId = plan.householdId;
  const { events } = useHouseholdEvents(householdId, userId ?? undefined);
  const doubleCover = useDoubleCover(householdId).data ?? null;
  const offlineCount = useOfflineSavesCount();
  const setup = useUserSetup().data;
  const scope = useHouseholdScope();
  const label = useMemberLabel(householdId);
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const [offers, setOffers] = useState<PlanOffer[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  useEffect(() => {
    let live = true;
    void readDismissed().then((d) => {
      if (live) setDismissed(d);
    });
    return () => {
      live = false;
    };
  }, []);

  // Store prices only for the payer, who is the only one shown a price. Asked each mount, never remembered.
  const wantsPrices = plan.payerIsMe && (plan.status === 'trial' || plan.status === 'active' || plan.status === 'grace');
  useEffect(() => {
    if (!wantsPrices) return undefined;
    let live = true;
    loadOffers({ platform: Platform.OS === 'ios' ? 'ios' : 'android', trialAvailable: false })
      .then((list) => {
        if (live) setOffers(list);
      })
      .catch((e: unknown) => captureError(e, { area: 'unknown' }));
    return () => {
      live = false;
    };
  }, [wantsPrices]);

  const price = offers?.find((o) => o.productId === plan.productId)?.priceString ?? null;
  const notices = useMemo(
    () =>
      planNotices({
        plan,
        events,
        offlineCount,
        existingCard: setup?.existingCard ?? null,
        dismissed,
        now,
        tz,
        price,
        period: plan.period,
        userId,
        doubleCover,
        homeName: scope.name,
        nameOf: (id) => label(id),
        planNameOf: (k: PlanKey) => tk(`plans.paywall.cards.${k}.name`),
        periodWord: (p: PlanPeriod) => tk(`plans.paywall.periodWord.${p}`),
        priceFor: (k: PlanKey) => offers?.find((o) => o.planKey === k && o.period === plan.period)?.priceString ?? null,
        inviteeName: tk('household.join.waitingPerson'),
      }),
    [plan, events, offlineCount, setup?.existingCard, dismissed, now, tz, price, userId, doubleCover, scope.name, label, tk, offers],
  );

  const dismiss = useCallback(
    (n: Notice) => {
      if (!n.dismissKey) return;
      const at = Date.now();
      const next = { ...dismissed, [n.dismissKey]: dismissValue(n, at, tz) };
      setDismissed(next);
      setNow(at);
      void AsyncStorage.setItem(NOTICE_DISMISS_STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
    },
    [dismissed, tz],
  );

  return { notices, doubleCover, dismiss, setup, userId, events, label };
}

function NoticeView({ notice, onDismiss, onMoveSolo, onExistingDismiss }: {
  notice: Notice;
  onDismiss: (n: Notice) => void;
  onMoveSolo: () => void;
  onExistingDismiss: () => void;
}) {
  const t = useT();
  const tk = t as unknown as Translate;
  const actions: NoticeAction[] = notice.actions.map((a) => ({
    kind: a.style,
    label: tk(a.labelKey, a.kind === 'choose' ? a.params : undefined),
    onPress: () => {
      switch (a.kind) {
        case 'manage':
          void openManageSubscription().catch((e: unknown) => captureError(e, { area: 'unknown' }));
          return;
        case 'navigate':
          router.push(a.href as Href);
          return;
        case 'dismiss':
          onDismiss(notice);
          return;
        case 'moveSolo':
          onMoveSolo();
          return;
        case 'existingDismiss':
          onExistingDismiss();
          return;
        default:
          return;
      }
    },
  }));
  const title = tk(notice.titleKey, notice.params);
  // The signed copy uses one text as "badge and title" (trial, payment failed): the word is then shown once, as the title.
  const badgeRepeats = notice.badge !== undefined && tk(STATUS[notice.badge].wordKey) === title;
  return (
    <View style={styles.wrap} testID={`plan-notice-${notice.id}`}>
      <NoticeCard
        title={title}
        body={tk(notice.bodyKey, notice.params) + (notice.footKey ? '\n\n' + tk(notice.footKey, notice.params) : '')}
        badge={badgeRepeats ? undefined : notice.badge}
        actions={actions}
      />
      {needsDismissLink(notice) ? (
        <PlanLink label={tk(DISMISS_LINK_KEY)} onPress={() => onDismiss(notice)} testID={`plan-notice-${notice.id}-dismiss`} />
      ) : null}
    </View>
  );
}

function PlanNotices({ which }: { which: 'first' | 'all' }) {
  const { notices, doubleCover, dismiss, setup, userId, events, label } = usePlanNotices();
  const { saveUserSetup } = useSaveUserSetup();
  const [moveSolo, setMoveSolo] = useState(false);

  // D-19: "{name} now pays for this home", once per takeover, from Home only.
  useEffect(() => {
    if (which !== 'first' || events.length === 0) return undefined;
    let live = true;
    void AsyncStorage.getItem(TAKEOVER_SEEN_STORAGE_KEY).then((seen) => {
      const toast = takeoverToast(events, seen, userId, label);
      if (!live || !toast) return;
      showToast({ kind: 'info', text: { key: toast.key, params: toast.params } });
      void AsyncStorage.setItem(TAKEOVER_SEEN_STORAGE_KEY, toast.seenAt).catch(() => undefined);
    });
    return () => {
      live = false;
    };
  }, [which, events, userId, label]);

  const onExistingDismiss = useCallback(() => {
    if (!userId) return;
    saveUserSetup({ userId, patch: { existingCard: 'dismissed' }, baseVersion: setup?.version ?? 0 });
  }, [saveUserSetup, userId, setup?.version]);

  const shown = which === 'first' ? notices.slice(0, 1) : notices;
  if (shown.length === 0) return null;
  return (
    <View style={styles.list} testID={which === 'first' ? 'plan-notice-slot' : 'plan-notice-list'}>
      {shown.map((n) =>
        n.id === 'offlineSaves' ? (
          <OfflineSavesNotice key={n.id} />
        ) : n.id === 'doubleCover' ? (
          <DoubleCoverNotice key={n.id} state={doubleCover} />
        ) : (
          <NoticeView key={n.id} notice={n} onDismiss={dismiss} onMoveSolo={() => setMoveSolo(true)} onExistingDismiss={onExistingDismiss} />
        ),
      )}
      {moveSolo ? <MoveToSoloSheet visible onClose={() => setMoveSolo(false)} /> : null}
    </View>
  );
}

/** Home: the one notice that matters most now (UI-SPEC 7). Others wait in You > Subscription. */
export function PlanNoticeSlot() {
  return <PlanNotices which="first" />;
}

/** You > Subscription: every notice that applies, in the same order. */
export function PlanNoticeList() {
  return <PlanNotices which="all" />;
}

const styles = StyleSheet.create({
  list: { gap: space.gapMd },
  wrap: { gap: space.gapSm },
});
