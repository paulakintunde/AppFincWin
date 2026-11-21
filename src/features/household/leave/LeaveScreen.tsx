// Screen 11, leave (HH-13, D-25..D-27): a member leaves after one clear confirm. An owner with other members first picks the
// new owner (required), then sees the same confirm. With an open balance a warning card says what stays on both sides as
// "[you] (left)" (D-25); a waiting settle-up is cancelled by the server and the confirm says so (owner answer 10). After the
// server answers, the cached household is dropped (resetHouseholdScope) and a calm page says "You're no longer in ...", then
// Home with the toast "You left ...". A household of one has nothing to leave (Leave is not offered there; `alone` lands here).
// Names only through the member resolver (D-32). Leaving needs a connection; nothing is queued.
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Screen } from '@/ui/Screen';
import { WarningCard } from '@/ui/WarningCard';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { Glyph } from '@/ui/icons/Glyph';
import { FadeIn } from '@/ui/motion/FadeIn';
import { hapticFailed, hapticTap, hapticTick } from '@/ui/haptics';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSize, radii, rowHeight, space, step } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { resetHouseholdScope } from '@/data/queries/household';
import { useHouseholdBalances, useSettlements } from '@/data/queries/householdBalances';
import { leaveHousehold } from '@/db/householdDeparture';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { supabase } from '@/services/supabase';
import { PLAN_ENDED_HREF } from '@/features/plans/routes';
import { loadOffers } from '@/features/plans/store/purchasesClient';
import { usePlanState } from '@/features/plans/usePlanState';
import { usePurchaseFlow } from '@/features/plans/usePurchaseFlow';
import type { PlanOffer } from '@/features/plans/types';
import { MemberAvatar } from '../components/MemberAvatar';
import { householdIcons } from '../glyphs';
import { otherPartyKey } from '../settle/PendingSettlementCard';
import { isWaiting, useRefusalText, useSettleMoney } from '../settle/settleHelpers';
import { useHouseholdScope } from '../useHouseholdScope';
import { useMemberLabel, useMemberSeen } from '../useMemberLabel';

const href = (path: string): Href => path as Href;

type Step = 'pick' | 'confirm';
/** 8d: 'solo' opens "Leave and continue on Solo"; 'own' ("Start your own plan", owner answer Q3) first says what starting it means. */
export type LeaveMode = 'solo' | 'own';
type SoloSheet = 'none' | 'intro' | 'confirm';

export interface LeaveScreenProps {
  mode?: LeaveMode;
}

export function LeaveScreen({ mode }: LeaveScreenProps = {}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const { goBack } = useBackHistory();
  const scope = useHouseholdScope();
  const { householdId, members, isOwner, online, userId } = scope;
  const label = useMemberLabel(householdId);
  const seen = useMemberSeen(householdId);
  const { fmt } = useSettleMoney();
  const balances = useHouseholdBalances(householdId, userId);
  const settlements = useSettlements(householdId).data ?? [];
  const refusal = useRefusalText();

  const others = members.filter((m) => m.user_id !== userId);
  const [step, setStep] = useState<Step | null>(null);
  const [newOwner, setNewOwner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The household name is kept from before the call: once the scope resets, the scope reads the new household.
  const [done, setDone] = useState<string | null>(null);

  // 09-20 (D-14, D-41..D-43): leaving to start a Solo plan. The Solo offer is the no-trial one: the trial is a first-plan offer.
  const plan = usePlanState();
  const flow = usePurchaseFlow();
  const [sheet, setSheet] = useState<SoloSheet>(mode === 'solo' ? 'confirm' : mode === 'own' ? 'intro' : 'none');
  const [soloOffer, setSoloOffer] = useState<PlanOffer | null>(null);
  const [offerFailed, setOfferFailed] = useState(false);
  // Set once the leave went through and the Solo purchase is under way; holds the home's name (the scope resets after the leave).
  const [buying, setBuying] = useState<string | null>(null);
  const wantSolo = sheet !== 'none';

  useEffect(() => {
    if (!wantSolo || soloOffer !== null) return;
    let live = true;
    loadOffers({ platform: Platform.OS === 'ios' ? 'ios' : 'android', trialAvailable: false })
      .then((offers) => {
        if (!live) return;
        const hit = offers.find((o) => o.planKey === 'solo' && o.period === 'year') ?? offers.find((o) => o.planKey === 'solo') ?? null;
        setSoloOffer(hit);
        setOfferFailed(hit === null);
      })
      .catch(() => live && setOfferFailed(true));
    return () => {
      live = false;
    };
  }, [wantSolo, soloOffer]);

  // After the leave, the purchase decides where the person lands: access returns when the server says covered; a failed or
  // cancelled purchase leaves a household of one that is locked, so the lock explainer ("Choose a plan") is next (UI-SPEC 8d).
  // Derived, not set from an effect: the server has the Solo plan on record.
  const soloDone = buying !== null && flow.state === 'done' ? buying : null;

  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const household = scope.name;

  if (buying !== null && done === null && soloDone === null) {
    return (
      <Screen scroll>
        <Text accessibilityLiveRegion="polite" testID="leave-buying" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
          {t('plans.paywall.states.updating')}
        </Text>
      </Screen>
    );
  }

  const finished = done ?? soloDone;
  if (finished !== null) {
    const toHome = () => {
      showToast({ kind: 'ordinary', text: { key: 'household.leave.left', params: { household: finished } } });
      router.navigate(href('/home'));
    };
    return (
      <Screen scroll>
        <FadeIn style={styles.calm} testID="leave-done">
          <EmptyState
            heading={t('household.leave.noLonger.title', { household: finished })}
            body={t('household.leave.noLonger.body')}
            icon={householdIcons.people}
            actionLabel={t('household.leave.noLonger.gotIt')}
            onAction={toHome}
          />
        </FadeIn>
      </Screen>
    );
  }

  const head = (
    <View style={styles.back}>
      <BackButton variant="compact" onPress={goBack} />
    </View>
  );

  // Still loading the household: only the way back.
  if (!householdId || members.length === 0 || userId === null) return <Screen scroll>{head}</Screen>;

  if (others.length === 0) {
    return (
      <Screen scroll>
        {head}
        <FadeIn style={styles.section} testID="leave-alone">
          <EmptyState
            heading={t('household.leave.alone.title')}
            body={t('household.leave.alone.body', { household })}
            icon={householdIcons.people}
            actionLabel={t('household.leave.alone.back')}
            onAction={goBack}
          />
        </FadeIn>
      </Screen>
    );
  }

  // D-27: an owner with other members picks the new owner first; everyone else goes straight to the confirm.
  const current: Step = step ?? (isOwner ? 'pick' : 'confirm');

  const leave = async (andSubscribe = false) => {
    if (busy || !online) return;
    if (andSubscribe && soloOffer === null) return;
    setBusy(true);
    setFailure(null);
    try {
      const res = await leaveHousehold(supabase, isOwner ? newOwner : null);
      if (!res.ok) {
        hapticFailed();
        if (res.reason === 'pick_new_owner') {
          setNewOwner(null);
          setStep('pick');
        }
        setFailure(refusal(res.reason));
        return;
      }
      const name = household;
      resetHouseholdScope(qc, userId, householdId);
      hapticTap();
      if (andSubscribe && soloOffer !== null) {
        // The leave is done and cannot be undone here; the purchase follows and the server decides when access returns.
        setSheet('none');
        setBuying(name);
        const started = await flow.start({ offer: soloOffer, timing: 'now' });
        if (started !== 'submitted') router.replace(PLAN_ENDED_HREF);
        return;
      }
      setDone(name);
    } catch {
      hapticFailed();
      setFailure(refusal('try_again'));
    } finally {
      setBusy(false);
    }
  };

  const planCovered = plan.status === 'trial' || plan.status === 'active' || plan.status === 'grace';
  const offlineLine = !online ? <Text style={meta}>{t('household.home.offline.helper')}</Text> : null;
  const failureLine = failure ? (
    <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
      {failure}
    </Text>
  ) : null;

  if (current === 'pick') {
    const chosen = newOwner === null ? null : label(newOwner);
    return (
      <Screen scroll>
        {head}
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('household.leave.ownerPick')}
        </Text>
        <Text style={[meta, styles.lead]}>{t('household.leave.ownerPickBody', { household })}</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]} accessibilityRole="radiogroup" testID="owner-pick">
          {others.map((m) => {
            const picked = newOwner === m.user_id;
            return (
              <Pressable
                key={m.user_id}
                accessibilityRole="radio"
                accessibilityState={{ checked: picked }}
                accessibilityLabel={label(m.user_id)}
                onPress={() => {
                  hapticTick();
                  setNewOwner(m.user_id);
                }}
                style={styles.pickRow}
                testID={`owner-pick-${m.user_id}`}
              >
                <MemberAvatar householdId={householdId} userId={m.user_id} size={40} />
                <Text style={[styles.flex, { ...textRole(pairing, 'body'), color: colors.ink }]} numberOfLines={2}>
                  {label(m.user_id)}
                </Text>
                <RadioDot selected={picked} />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.actions}>
          <Pill
            label={chosen ? t('household.leave.ownerCta', { name: chosen }) : t('household.leave.ownerCtaEmpty')}
            variant="primary"
            disabled={newOwner === null}
            onPress={() => {
              setFailure(null);
              setStep('confirm');
            }}
          />
          <Pill label={t('household.leave.stay')} variant="secondary" onPress={goBack} />
          {failureLine}
        </View>
      </Screen>
    );
  }

  // D-25: every open balance, from the viewer's side, warned about before the call (the server returns the same list).
  const self = seen(userId).seen ?? label(userId);
  const open = (balances.data?.pairs ?? []).filter((p) => p.net !== 0);
  const waiting = settlements.filter((s) => isWaiting(s) && (s.payer_id === userId || s.receiver_id === userId));

  return (
    <Screen scroll>
      {head}
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('household.leave.leaveTitle', { household })}
      </Text>
      <View style={styles.section}>
        {open.map((p) => {
          const name = label(p.otherKey, { left: !members.some((m) => m.user_id === p.otherKey) });
          const amount = fmt(Math.abs(p.net));
          const sentence =
            p.net < 0 ? t('household.leave.leaveOwes', { name, amount, self }) : t('household.leave.leaveOwed', { name, amount, self });
          return (
            <View key={p.otherKey} testID="leave-balance-warning">
              <WarningCard tone="soft" title={t('household.leave.balanceTitle')} value={amount} body={[sentence]} />
            </View>
          );
        })}
        {waiting.map((s) => (
          <View key={s.id} style={styles.note} testID="leave-pending-note">
            <Glyph name={householdIcons.settle} size={iconSize.row} color={colors.inkDim} />
            <Text style={[styles.flex, meta]}>{t('household.leave.leavePending', { name: label(otherPartyKey(s, userId)) })}</Text>
          </View>
        ))}
        {/* 8c: what leaving does to access and billing, above the existing text. */}
        {planCovered && !plan.payerIsMe ? (
          <View style={styles.planLines} testID="leave-plan-member">
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('plans.leave.member')}</Text>
            <Pressable
              accessibilityRole="link"
              hitSlop={LINK_HIT_SLOP}
              onPress={() => setSheet('confirm')}
              style={styles.link}
              testID="leave-continue-solo"
            >
              <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('plans.leave.memberLink')}</Text>
            </Pressable>
          </View>
        ) : null}
        {planCovered && plan.payerIsMe ? (
          <Text testID="leave-plan-payer" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {t('plans.leave.payer')}
          </Text>
        ) : null}
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('household.leave.leaveBody', { household })}</Text>
      </View>
      <View style={styles.actions}>
        <Pill
          label={t('household.leave.leaveCta')}
          variant="danger"
          disabled={!online || (isOwner && newOwner === null)}
          pending={busy}
          onPress={() => void leave()}
        />
        <Pill label={t('household.leave.stay')} variant="secondary" onPress={goBack} />
        {offlineLine}
        {failureLine}
      </View>

      {/* Owner answer Q3: "Start your own plan" says what it means before the 8d confirm. */}
      <ConfirmSheet
        visible={sheet === 'intro'}
        title={t('plans.member.startOwnTitle')}
        body={t('plans.member.startOwnBody', { home: household })}
        cancelLabel={t('plans.member.startOwnStay', { home: household })}
        confirmLabel={t('plans.member.startOwnContinue')}
        onCancel={() => {
          setSheet('none');
          goBack();
        }}
        onConfirm={() => setSheet('confirm')}
      />
      {/* 8d: leave and buy Solo together, no trial. Accent, not a destructive action: the leave itself keeps its own confirm. */}
      <ConfirmSheet
        visible={sheet === 'confirm'}
        title={t('plans.leave.solo.title')}
        body={
          soloOffer
            ? t('plans.leave.solo.body', {
                home: household,
                price: soloOffer.priceString,
                period: t(soloOffer.period === 'year' ? 'plans.paywall.periodWord.year' : 'plans.paywall.periodWord.month'),
              })
            : offerFailed
              ? t('plans.paywall.states.loadFailed')
              : t('plans.paywall.states.loadingPrice')
        }
        cancelLabel={t('plans.leave.solo.secondary', { home: household })}
        confirmLabel={t('plans.leave.solo.primary')}
        onCancel={() => {
          setSheet('none');
          if (mode !== undefined) goBack();
        }}
        onConfirm={() => void leave(true)}
      >
        {failureLine}
      </ConfirmSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  lead: { marginTop: step.tight },
  section: { marginTop: step.section, gap: step.card },
  card: { marginTop: step.section, paddingHorizontal: step.card, borderRadius: radii.card },
  pickRow: { minHeight: rowHeight.two, flexDirection: 'row', alignItems: 'center', gap: step.row },
  flex: { flex: 1, flexShrink: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: step.tight },
  planLines: { gap: step.tight },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  actions: { marginTop: step.section, gap: step.row },
  calm: { flex: 1, justifyContent: 'center', marginTop: step.section },
});
