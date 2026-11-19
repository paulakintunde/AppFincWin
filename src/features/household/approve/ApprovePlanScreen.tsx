// 09-20 (UI-SPEC 8b, D-21, D-17): the payer's approval screen. Someone invited past the plan's size is waiting; this shows
// the plan now, the plan after, both store prices and when the change takes effect, before the store sheet opens (T-09-71).
// "Approve and change plan" runs the store change; the invitee is admitted by the server once the bigger plan is on record,
// never by this screen (T-09-69). "Cancel invite" withdraws the request.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useHousehold } from '@/data/queries/household';
import { cancelJoinRequest, fetchJoinRequest } from '@/db/householdInvites';
import { supabase } from '@/services/supabase';
import { formatPlanDate } from '@/features/plans/formatPlanDate';
import { PLAN_SIZES } from '@/features/plans/store/catalog';
import { smallestPlanFor, useChangePlan } from '@/features/plans/useChangePlan';
import type { PlanKey } from '@/features/plans/types';

export interface ApprovePlanScreenProps {
  requestId: string;
  /** The invitee's name when the link that opened this screen carried it. */
  name?: string;
}

export function ApprovePlanScreen({ requestId, name }: ApprovePlanScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const change = useChangePlan(true);
  const { plan, flow } = change;
  const home = useHousehold(plan.householdId).data?.name ?? '';
  const request = useQuery({
    queryKey: ['plan-join-request', requestId],
    queryFn: () => fetchJoinRequest(supabase, requestId),
  });
  const [cancelling, setCancelling] = useState(false);
  const [failed, setFailed] = useState(false);

  // The smallest plan that holds everyone including the person waiting; the server's own figure wins when it is bigger.
  const needSize = Math.max(plan.members + 1, request.data?.needed_plan_size ?? 0);
  const target = smallestPlanFor(needSize);
  const pv = change.preview(target);
  const nameOf = (k: PlanKey) => t(`plans.paywall.cards.${k}.name`);
  const nowKey: PlanKey = plan.planKey ?? 'solo';

  // Nothing left to decide: approved, cancelled or expired.
  const closed = request.data !== undefined && (request.data === null || request.data.status !== 'waiting');
  const done = flow.state === 'done';
  useEffect(() => {
    if (closed || done) goBack();
  }, [closed, done, goBack]);

  const busy = flow.state === 'pending' || flow.state === 'waitingServer' || flow.state === 'slow';
  const ready = pv.offer !== null && pv.blocked === null;
  const invitee = name && name.length > 0 ? name : t('household.join.waitingPerson');

  const effect =
    pv.timing === 'renewal'
      ? t('plans.invite.approval.takesEffectRenewal', { date: formatPlanDate(plan.coveredUntil) })
      : t('plans.invite.approval.takesEffectNow');
  const trialLine =
    pv.inTrial && pv.timing === 'trialContinues'
      ? t('plans.invite.thirdPersonTrialContinues')
      : pv.inTrial && pv.timing === 'now'
        ? t('plans.invite.thirdPersonTrial', { price: pv.offer?.priceString ?? '' })
        : null;

  const approve = () => {
    if (busy || !ready) return;
    hapticTap();
    setFailed(false);
    if (!change.run(target)) hapticFailed();
  };
  const cancel = async () => {
    if (cancelling || busy) return;
    setCancelling(true);
    try {
      const res = await cancelJoinRequest(supabase, requestId);
      if (res.ok) {
        hapticTap();
        goBack();
      } else {
        hapticFailed();
        setFailed(true);
      }
    } catch {
      hapticFailed();
      setFailed(true);
    } finally {
      setCancelling(false);
    }
  };

  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const meta = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('plans.invite.approval.title')}
      </Text>
      <Text style={[meta, styles.lead]} testID="approve-heading">
        {t('plans.invite.approval.heading', { name: invitee, home })}
      </Text>

      <View style={[styles.card, { backgroundColor: colors.surface }]} testID="approve-card">
        <Text style={body}>{t('plans.invite.approval.planNow', { plan: nameOf(nowKey), count: PLAN_SIZES[nowKey] })}</Text>
        <Text style={body}>{t('plans.invite.approval.planAfter', { plan: nameOf(target), count: PLAN_SIZES[target] })}</Text>
        {pv.monthly ? <Text style={body}>{t('plans.paywall.priceMonth', { price: pv.monthly })}</Text> : null}
        {pv.yearly ? <Text style={body}>{t('plans.paywall.priceYear', { price: pv.yearly })}</Text> : null}
        <Text style={body}>{effect}</Text>
        {trialLine ? <Text style={meta}>{trialLine}</Text> : null}
        {!pv.offer && change.offersError ? <Text style={meta}>{t('plans.paywall.states.loadFailed')}</Text> : null}
        {pv.blocked ? <Text style={meta}>{t('plans.paywall.states.storeProblem')}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Pill label={t('plans.invite.approval.approve')} variant="primary" disabled={!ready} pending={busy} onPress={approve} />
        <Pill
          label={t('plans.invite.approval.cancel')}
          variant="secondary"
          disabled={busy}
          pending={cancelling}
          onPress={() => void cancel()}
        />
        <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={goBack} style={styles.later}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('plans.invite.approval.later')}</Text>
        </Pressable>
        {busy ? (
          <Text accessibilityLiveRegion="polite" style={meta}>
            {t('plans.paywall.states.updating')}
          </Text>
        ) : null}
        {flow.state === 'failed' || failed ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {t('plans.paywall.states.failed')} {flow.notCharged ? t('plans.paywall.states.notCharged') : ''}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  lead: { marginTop: step.tight },
  card: { marginTop: step.section, padding: step.card, borderRadius: radii.card, gap: step.tight },
  actions: { marginTop: step.section, gap: step.row },
  later: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
