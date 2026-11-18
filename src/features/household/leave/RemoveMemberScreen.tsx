// Screen 11, remove (HH-13, D-28): the owner removes a member after one clear confirm. The confirm says their records move
// to a household of their own, their lines keep the split, they are told, and the owner can undo for 24 hours by inviting
// them again. An open balance between the owner and that person gets the same warning card as Leave, from the owner's side;
// a waiting settle-up between them is cancelled by the server and the confirm says so (owner answer 10). The toast
// "Sam removed" offers Undo, which asks the server for a reinvite code (reinvite_removed) and opens the InviteSheet on the
// Household home with it. Owner only on screen; the server refuses anyone else (not_owner, T-08-87). Names only through
// the member resolver (D-32). Needs a connection; nothing is queued.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { WarningCard } from '@/ui/WarningCard';
import { Glyph } from '@/ui/icons/Glyph';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useT } from '@/i18n';
import { queueToast, showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSize, space, step } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { useHouseholdBalances, useSettlements } from '@/data/queries/householdBalances';
import { removeMember } from '@/db/householdDeparture';
import { reinviteRemoved } from '@/db/memberDepartures';
import { supabase } from '@/services/supabase';
import { MemberAvatar } from '../components/MemberAvatar';
import { householdIcons } from '../glyphs';
import { ownerReasonKey } from '../ownerReasons';
import { otherPartyKey } from '../settle/PendingSettlementCard';
import { isWaiting, useRefusalText, useSettleMoney } from '../settle/settleHelpers';
import { useHouseholdScope } from '../useHouseholdScope';
import { useMemberLabel } from '../useMemberLabel';
import { requestReinvite } from './reinviteRequest';

export interface RemoveMemberScreenProps {
  /** The member to remove (from the route's ?userId=). */
  userId: string | null;
}

/** Undo on the removal toast: a fresh invite tied to the departure, handed to the Household home's InviteSheet (D-28). */
export async function undoRemoval(departureId: string): Promise<void> {
  try {
    const res = await reinviteRemoved(supabase, departureId);
    if (res.ok) {
      requestReinvite({ code: res.code, expiresAt: res.expires_at });
      return;
    }
    hapticFailed();
    queueToast({ kind: 'refusal', text: { key: ownerReasonKey(res.reason) } });
  } catch {
    hapticFailed();
    queueToast({ kind: 'refusal', text: { key: 'household.home.reasons.failed' } });
  }
}

export function RemoveMemberScreen({ userId: targetId }: RemoveMemberScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const { goBack } = useBackHistory();
  const scope = useHouseholdScope();
  const { householdId, members, isOwner, online, userId } = scope;
  const label = useMemberLabel(householdId);
  const { fmt } = useSettleMoney();
  const balances = useHouseholdBalances(householdId, userId);
  const settlements = useSettlements(householdId).data ?? [];
  const refusal = useRefusalText();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const household = scope.name;
  const head = (
    <View style={styles.back}>
      <BackButton variant="compact" onPress={goBack} />
    </View>
  );

  if (!householdId || members.length === 0 || userId === null) return <Screen scroll>{head}</Screen>;

  const target = members.find((m) => m.user_id === targetId);
  if (!isOwner || !target || target.is_owner || target.user_id === userId) {
    return (
      <Screen scroll>
        {head}
        <Text style={[styles.section, { ...textRole(pairing, 'body'), color: colors.ink }]} testID="remove-unavailable">
          {!isOwner ? t('household.reasons.not_owner') : t('household.leave.removeGone', { household })}
        </Text>
      </Screen>
    );
  }

  const name = label(target.user_id);
  const pair = (balances.data?.pairs ?? []).find((p) => p.otherKey === target.user_id && p.net !== 0);
  const waiting = settlements.filter((s) => isWaiting(s) && otherPartyKey(s, userId) === target.user_id);

  const remove = async () => {
    if (busy || !online) return;
    setBusy(true);
    setFailure(null);
    try {
      const res = await removeMember(supabase, target.user_id);
      if (!res.ok) {
        hapticFailed();
        setFailure(refusal(res.reason));
        return;
      }
      void qc.invalidateQueries({ queryKey: queryKeys.householdMembers(householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.householdBalances(householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.settlements(householdId) });
      void qc.invalidateQueries({ queryKey: ['household', householdId, 'departures'] });
      hapticTap();
      const departureId = res.departure_id;
      showToast({
        kind: 'ordinary',
        text: { key: 'household.leave.removed', params: { name } },
        onUndo: () => void undoRemoval(departureId),
      });
      goBack();
    } catch {
      hapticFailed();
      setFailure(refusal('try_again'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      {head}
      <View style={styles.titleRow}>
        <MemberAvatar householdId={householdId} userId={target.user_id} size={40} />
        <Text accessibilityRole="header" style={[styles.flex, { ...textRole(pairing, 'heading'), color: colors.ink }]}>
          {t('household.leave.removeTitle', { name, household })}
        </Text>
      </View>
      <View style={styles.section}>
        {pair ? (
          <View testID="remove-balance-warning">
            <WarningCard
              tone="soft"
              title={t('household.leave.balanceTitle')}
              value={fmt(Math.abs(pair.net))}
              body={[
                pair.net > 0
                  ? t('household.leave.removeOwed', { name, amount: fmt(pair.net) })
                  : t('household.leave.removeOwes', { name, amount: fmt(Math.abs(pair.net)) }),
              ]}
            />
          </View>
        ) : null}
        {waiting.map((s) => (
          <View key={s.id} style={styles.note} testID="remove-pending-note">
            <Glyph name={householdIcons.settle} size={iconSize.row} color={colors.inkDim} />
            <Text style={[styles.flex, meta]}>{t('household.leave.removePending', { name })}</Text>
          </View>
        ))}
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('household.leave.removeBody', { name })}</Text>
      </View>
      <View style={styles.actions}>
        <Pill
          label={t('household.leave.removeCta', { name })}
          variant="danger"
          disabled={!online}
          pending={busy}
          onPress={() => void remove()}
        />
        <Pill label={t('household.leave.keep', { name })} variant="secondary" onPress={goBack} />
        {!online ? <Text style={meta}>{t('household.home.offline.helper')}</Text> : null}
        {failure ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {failure}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: step.row },
  section: { marginTop: step.section, gap: step.card },
  flex: { flex: 1, flexShrink: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: step.tight },
  actions: { marginTop: step.section, gap: step.row },
});
