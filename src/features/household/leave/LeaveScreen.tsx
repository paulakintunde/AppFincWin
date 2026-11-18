// Screen 11, leave (HH-13, D-25..D-27): a member leaves after one clear confirm. An owner with other members first picks the
// new owner (required), then sees the same confirm. With an open balance a warning card says what stays on both sides as
// "[you] (left)" (D-25); a waiting settle-up is cancelled by the server and the confirm says so (owner answer 10). After the
// server answers, the cached household is dropped (resetHouseholdScope) and a calm page says "You're no longer in ...", then
// Home with the toast "You left ...". A household of one has nothing to leave (Leave is not offered there; `alone` lands here).
// Names only through the member resolver (D-32). Leaving needs a connection; nothing is queued.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Screen } from '@/ui/Screen';
import { WarningCard } from '@/ui/WarningCard';
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
import { supabase } from '@/services/supabase';
import { MemberAvatar } from '../components/MemberAvatar';
import { householdIcons } from '../glyphs';
import { otherPartyKey } from '../settle/PendingSettlementCard';
import { isWaiting, useRefusalText, useSettleMoney } from '../settle/settleHelpers';
import { useHouseholdScope } from '../useHouseholdScope';
import { useMemberLabel, useMemberSeen } from '../useMemberLabel';

const href = (path: string): Href => path as Href;

type Step = 'pick' | 'confirm';

export function LeaveScreen() {
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

  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const household = scope.name;

  if (done !== null) {
    const toHome = () => {
      showToast({ kind: 'ordinary', text: { key: 'household.leave.left', params: { household: done } } });
      router.navigate(href('/home'));
    };
    return (
      <Screen scroll>
        <FadeIn style={styles.calm} testID="leave-done">
          <EmptyState
            heading={t('household.leave.noLonger.title', { household: done })}
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

  const leave = async () => {
    if (busy || !online) return;
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
      setDone(name);
    } catch {
      hapticFailed();
      setFailure(refusal('try_again'));
    } finally {
      setBusy(false);
    }
  };

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
            p.net < 0
              ? t('household.leave.leaveOwes', { name, amount, self })
              : t('household.leave.leaveOwed', { name, amount, self });
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
  actions: { marginTop: step.section, gap: step.row },
  calm: { flex: 1, justifyContent: 'center', marginTop: step.section },
});
