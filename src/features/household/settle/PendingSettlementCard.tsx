// 08-21 Screen 8 (HH-08, D-19, D-20, D-42): one settle-up the viewer is a party to, in the state it is in.
//  - waiting, viewer paid: "Waiting for Sam", reminder day 7, lapse day 14, Cancel settle-up
//  - waiting, viewer is paid: "Sam says they paid you $84" with Yes, I got $84 / Not yet
//  - confirmed within 24 hours: Settled, with Undo (hidden once either person has left, owner answer 12)
//  - lapsed: a "Lapsed" badge; the lines are owed again
// Settle-ups are online-only (nothing is queued). Offline the buttons are disabled with a plain message.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Pill } from '@/ui/Pill';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Text } from '@/ui/Text';
import { Dropdown } from '@/ui/Dropdown';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { showToast } from '@/state/undoToast';
import { useSettlements } from '@/data/queries/householdBalances';
import {
  useCancelSettlement,
  useConfirmSettlement,
  useRejectSettlement,
  useSetSettlementPayerAccount,
  useUndoSettlement,
} from '@/data/mutations/settlements';
import type { HouseholdEventRow } from '@/db/householdEvents';
import type { SettlementWithLines } from '@/db/settlements';
import { useHouseholdMembers } from '@/data/queries/household';
import { useMemberLabel } from '../useMemberLabel';
import { ArrivedInSheet } from './ArrivedInSheet';
import { isWaiting, useRefusalText, useSettleMoney, withinUndoWindow } from './settleHelpers';

/** At and above this font scale the two answers stack (UI-SPEC Accessibility). */
export const STACK_FONT_SCALE = 1.3;

const LAPSED_SHOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Who the viewer is settling with in this settle-up: a user id, or the former key once their account is gone. */
export function otherPartyKey(s: SettlementWithLines, viewerId: string | null): string | null {
  return s.payer_id === viewerId ? (s.receiver_id ?? s.receiver_former_key) : (s.payer_id ?? s.payer_former_key);
}

function OfflineLine() {
  const t = useT();
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.settle.offlineHelper')}</Text>;
}

function FailureLine({ text }: { text: string }) {
  const { colors, pairing } = useTheme();
  return (
    <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
      {text}
    </Text>
  );
}

/** The two answers the person being paid gives. Used on the card and in notices. */
export function ReceiverActions({ settlement, householdId, name }: { settlement: SettlementWithLines; householdId: string; name: string }) {
  const t = useT();
  const { fontScale } = useWindowDimensions();
  const { fmt, myAccounts, online } = useSettleMoney();
  const refusal = useRefusalText();
  const confirm = useConfirmSettlement();
  const reject = useRejectSettlement();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const amountText = fmt(settlement.amount);

  const onConfirm = async (accountId: string) => {
    setFailure(null);
    try {
      const res = await confirm.mutateAsync({ householdId, id: settlement.id, receiverAccount: accountId });
      if (!res.ok) {
        hapticFailed();
        setFailure(refusal(res.reason));
        return;
      }
      hapticTap();
      setOpen(false);
      showToast({ kind: 'ordinary', text: { key: 'household.settle.toasts.settled', params: { amount: amountText, name } } });
    } catch {
      hapticFailed();
      setFailure(t('household.settle.failed'));
    }
  };

  const onNotYet = async () => {
    setFailure(null);
    try {
      const res = await reject.mutateAsync({ householdId, id: settlement.id });
      if (!res.ok) {
        hapticFailed();
        setFailure(refusal(res.reason));
        return;
      }
      hapticTap();
      showToast({ kind: 'ordinary', text: { key: 'household.settle.notYetSaid' } });
    } catch {
      hapticFailed();
      setFailure(t('household.settle.failed'));
    }
  };

  const stacked = fontScale >= STACK_FONT_SCALE;
  return (
    <View style={styles.gap}>
      <View style={[styles.answers, stacked ? styles.stacked : null]}>
        <View style={stacked ? undefined : styles.half}>
          <Pill
            label={t('household.settle.confirmYes', { amount: amountText })}
            variant="primary"
            disabled={!online}
            pending={confirm.isPending}
            onPress={() => setOpen(true)}
          />
        </View>
        <View style={stacked ? undefined : styles.half}>
          <Pill
            label={t('household.settle.confirmNotYet')}
            variant="secondary"
            disabled={!online}
            pending={reject.isPending}
            onPress={() => void onNotYet()}
          />
        </View>
      </View>
      {!online ? <OfflineLine /> : null}
      {failure && !open ? <FailureLine text={failure} /> : null}
      <ArrivedInSheet
        visible={open}
        amountText={amountText}
        accounts={myAccounts}
        busy={confirm.isPending}
        failure={failure}
        onConfirm={(id) => void onConfirm(id)}
        onClose={() => {
          setOpen(false);
          setFailure(null);
        }}
      />
    </View>
  );
}

export interface SettlementCardProps {
  settlement: SettlementWithLines;
  householdId: string;
  now?: number;
}

/** Renders nothing for a settle-up with nothing to show (done, undone, cancelled, old lapsed). */
export function PendingSettlementCard({ settlement: s, householdId, now: nowProp }: SettlementCardProps) {
  const [mountedAt] = useState(() => Date.now());
  const now = nowProp ?? mountedAt;
  const t = useT();
  const { colors, pairing } = useTheme();
  const { fmt, online, userId } = useSettleMoney();
  const label = useMemberLabel(householdId);
  const refusal = useRefusalText();
  const { data: members } = useHouseholdMembers(householdId);
  const cancel = useCancelSettlement();
  const undo = useUndoSettlement();
  const [failure, setFailure] = useState<string | null>(null);

  const iAmPayer = s.payer_id === userId;
  const otherKey = otherPartyKey(s, userId);
  const name = label(otherKey);
  const amountText = fmt(s.amount);
  const payerHere = (members ?? []).some((m) => m.user_id === s.payer_id);
  const receiverHere = (members ?? []).some((m) => m.user_id === s.receiver_id);

  const card = [styles.card, { backgroundColor: colors.fill1 }];
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const meta = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  if (isWaiting(s, now)) {
    if (iAmPayer) {
      const onCancel = async () => {
        setFailure(null);
        try {
          const res = await cancel.mutateAsync({ householdId, id: s.id });
          if (!res.ok) {
            hapticFailed();
            setFailure(refusal(res.reason));
            return;
          }
          hapticTap();
          showToast({ kind: 'ordinary', text: { key: 'household.settle.cancelled' } });
        } catch {
          hapticFailed();
          setFailure(t('household.settle.failed'));
        }
      };
      return (
        <View style={card} testID={`settlement-${s.id}`}>
          <StatusBadge status="pending" label={t('household.settle.pending.waiting', { name })} />
          <Text style={body}>{t('household.settle.pending.detail', { name })}</Text>
          <Text style={meta}>{amountText}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !online }}
            disabled={!online}
            hitSlop={LINK_HIT_SLOP}
            onPress={() => void onCancel()}
            style={styles.link}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: online ? colors.danger : colors.inkFaint }}>
              {t('household.settle.pending.cancel')}
            </Text>
          </Pressable>
          {!online ? <OfflineLine /> : null}
          {failure ? <FailureLine text={failure} /> : null}
        </View>
      );
    }
    return (
      <View style={card} testID={`settlement-${s.id}`}>
        <StatusBadge status="pending" label={t('household.settle.pending.theyPaid', { name })} />
        <Text style={body}>{t('household.settle.pending.says', { name, amount: amountText })}</Text>
        {!payerHere ? <Text style={meta}>{t('household.settle.pendingNote.leaver', { name })}</Text> : null}
        <ReceiverActions settlement={s} householdId={householdId} name={name} />
      </View>
    );
  }

  // Undo is hidden once either person has left, been removed or deleted (owner answer 12, server `party_left`).
  if (s.status === 'confirmed' && withinUndoWindow(s, now) && payerHere && receiverHere) {
    const onUndo = async () => {
      setFailure(null);
      try {
        const res = await undo.mutateAsync({ householdId, id: s.id });
        if (!res.ok) {
          hapticFailed();
          setFailure(refusal(res.reason));
          return;
        }
        hapticTap();
        showToast({ kind: 'ordinary', text: { key: 'household.settle.undone' } });
      } catch {
        hapticFailed();
        setFailure(t('household.settle.failed'));
      }
    };
    return (
      <View style={card} testID={`settlement-${s.id}`}>
        <StatusBadge status="paid" label={t('household.settle.settled')} />
        <Text style={body}>{t('household.settle.toasts.settled', { amount: amountText, name })}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !online }}
          disabled={!online}
          hitSlop={LINK_HIT_SLOP}
          onPress={() => void onUndo()}
          style={styles.link}
        >
          <Text style={{ ...textRole(pairing, 'body'), color: online ? colors.accent : colors.inkFaint }}>{t('household.settle.undo')}</Text>
        </Pressable>
        {failure ? <FailureLine text={failure} /> : null}
      </View>
    );
  }

  const lapsedAt = s.expires_at ? Date.parse(s.expires_at) : NaN;
  const lapsed = s.status === 'lapsed' || (s.status === 'pending' && Number.isFinite(lapsedAt) && lapsedAt <= now);
  if (lapsed && Number.isFinite(lapsedAt) && now - lapsedAt < LAPSED_SHOWN_MS) {
    return (
      <View style={card} testID={`settlement-${s.id}`}>
        <StatusBadge status="behind" label={t('household.settle.lapsed')} />
        <Text style={body}>{t('household.settle.pending.lapsed', { amount: amountText, name })}</Text>
      </View>
    );
  }
  return null;
}

/** The viewer's settle-ups worth showing, optionally only those with one person. */
export function SettlementCards({ householdId, otherKey }: { householdId: string; otherKey?: string }) {
  const { data } = useSettlements(householdId);
  const { userId } = useSettleMoney();
  const list = (data ?? []).filter((s) => otherKey === undefined || otherPartyKey(s, userId) === otherKey);
  return (
    <>
      {list.map((s) => (
        <PendingSettlementCard key={s.id} settlement={s} householdId={householdId} />
      ))}
    </>
  );
}

/**
 * The actions a notice carries: settle_request gives the receiver Yes / Not yet; a settled notice that needs the payer's
 * account asks "Which account did it leave?"; settle_ask opens the settle-up with that person.
 */
export function NoticeSettleActions({
  event,
  householdId,
  onSettleWith,
}: {
  event: HouseholdEventRow;
  householdId: string;
  onSettleWith: (otherKey: string) => void;
}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { data } = useSettlements(householdId);
  const { userId, myAccounts, online } = useSettleMoney();
  const label = useMemberLabel(householdId);
  const refusal = useRefusalText();
  const setAccount = useSetSettlementPayerAccount();
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const s = (data ?? []).find((x) => x.id === event.ref_id);

  if (event.kind === 'settle_request' && s && userId !== null && s.receiver_id === userId && isWaiting(s)) {
    return <ReceiverActions settlement={s} householdId={householdId} name={label(otherPartyKey(s, userId))} />;
  }

  if (event.kind === 'settle_ask' && event.actor_id) {
    const other = event.actor_id;
    return (
      <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={() => onSettleWith(other)} style={styles.link}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('household.settle.settleWith', { name: label(other) })}</Text>
      </Pressable>
    );
  }

  if (event.kind === 'settled' && event.params.needs_account === true && s && s.payer_id === userId && s.payer_account_id === null && !done) {
    return (
      <View style={styles.gap}>
        <Dropdown
          title={t('household.settle.whichAccount')}
          options={myAccounts.map((a) => ({ key: a.id, label: a.name, subLabel: a.currency }))}
          triggerLabel={t('household.settle.whichAccount')}
          triggerA11yLabel={t('household.settle.whichAccount')}
          disabled={!online || myAccounts.length === 0}
          onSelect={(accountId) => {
            setFailure(null);
            void setAccount
              .mutateAsync({ householdId, id: s.id, account: accountId })
              .then((res) => {
                if (!res.ok) {
                  hapticFailed();
                  setFailure(refusal(res.reason));
                  return;
                }
                hapticTap();
                setDone(true);
              })
              .catch(() => {
                hapticFailed();
                setFailure(t('household.settle.failed'));
              });
          }}
        />
        {failure ? <FailureLine text={failure} /> : null}
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  card: { padding: step.card, borderRadius: radii.card, gap: step.tight },
  gap: { gap: step.tight },
  answers: { flexDirection: 'row', gap: step.tight },
  stacked: { flexDirection: 'column' },
  half: { flex: 1 },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
