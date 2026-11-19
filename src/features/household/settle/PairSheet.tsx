// 08-21 Screen 2 (HH-07, D-23, D-25): one pair's balance with every line behind it. Every amount traces to these lines.
// Actions: settle up, ask the person to settle up (once per 24 hours), and for someone who left: record a payment or
// write the balance off. Settle-ups are online-only; offline the actions are disabled with a plain message.
import React, { useState } from 'react';
import { isPlanWriteBlocked } from '@/data/sync/planWriteGuard';
import { StyleSheet, View } from 'react-native';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { DetailSheet } from '@/ui/DetailSheet';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, step } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { showToast } from '@/state/undoToast';
import { useHouseholdMembers } from '@/data/queries/household';
import { useHouseholdBalances, usePairLines } from '@/data/queries/householdBalances';
import { useAskToSettle, useWriteOff } from '@/data/mutations/settlements';
import { MemberAvatar } from '../components/MemberAvatar';
import { useMemberLabel } from '../useMemberLabel';
import { SettlementCards } from './PendingSettlementCard';
import { useRefusalText, useSettleMoney } from './settleHelpers';

const RULES = ['even', 'weight', 'amount', 'mine'] as const;

export interface PairSheetProps {
  visible: boolean;
  householdId: string | null | undefined;
  otherKey: string | null;
  onClose: () => void;
  /** Opens the settle-up sheet for this person. */
  onSettle: (otherKey: string) => void;
}

export function PairSheet(props: PairSheetProps) {
  if (!props.visible || !props.householdId || !props.otherKey) return null;
  return <PairBody householdId={props.householdId} otherKey={props.otherKey} onClose={props.onClose} onSettle={props.onSettle} />;
}

function PairBody({
  householdId,
  otherKey,
  onClose,
  onSettle,
}: {
  householdId: string;
  otherKey: string;
  onClose: () => void;
  onSettle: (otherKey: string) => void;
}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { fmt, formatDate, online, userId } = useSettleMoney();
  const label = useMemberLabel(householdId);
  const refusal = useRefusalText();
  const { data: members } = useHouseholdMembers(householdId);
  const balances = useHouseholdBalances(householdId, userId);
  const lines = usePairLines(householdId, userId, otherKey).data ?? [];
  const ask = useAskToSettle();
  const writeOff = useWriteOff();
  const [confirmOff, setConfirmOff] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [askedAt, setAskedAt] = useState<string | null>(null);

  const name = label(otherKey);
  const former = !(members ?? []).some((m) => m.user_id === otherKey);
  const net = balances.data?.pairs.find((p) => p.otherKey === otherKey)?.net ?? 0;
  const abs = Math.abs(net);
  const owedToMe = net > 0;
  const openIds = lines.filter((l) => l.status === 'open').map((l) => l.line.id);

  const sentence =
    net === 0
      ? t('household.settle.pairClosed')
      : owedToMe
        ? t('household.home.balances.owesYou', { amount: fmt(abs) })
        : t('household.home.balances.youOwe', { amount: fmt(abs) });

  const timeText = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
  };

  const onAsk = async () => {
    setFailure(null);
    try {
      const res = await ask.mutateAsync({ householdId, other: otherKey });
      if (!res.ok) {
        hapticFailed();
        if (res.reason === 'too_soon' && typeof res.sent_at === 'string') setAskedAt(res.sent_at);
        else setFailure(refusal(res.reason));
        return;
      }
      hapticTap();
      setAskedAt(new Date().toISOString());
    } catch (err) {
      if (isPlanWriteBlocked(err)) return; // 09-25: the guard opened the plan sheet; not a failure
      hapticFailed();
      setFailure(t('household.settle.failed'));
    }
  };

  const onWriteOff = async () => {
    setConfirmOff(false);
    setFailure(null);
    try {
      const res = await writeOff.mutateAsync({ householdId, other: otherKey, lineIds: openIds });
      if (!res.ok) {
        hapticFailed();
        setFailure(refusal(res.reason));
        return;
      }
      hapticTap();
      showToast({ kind: 'ordinary', text: { key: 'household.settle.writtenOff' } });
      onClose();
    } catch (err) {
      if (isPlanWriteBlocked(err)) return; // 09-25: the guard opened the plan sheet; not a failure
      hapticFailed();
      setFailure(t('household.settle.failed'));
    }
  };

  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const canSettle = net !== 0 && openIds.length > 0;
  const primary = former
    ? owedToMe
      ? t('household.settle.receiverCta', { amount: fmt(abs) })
      : t('household.settle.recordPaid')
    : t('household.settle.settleWith', { name });

  return (
    <>
      <DetailSheet
        visible
        onDismiss={onClose}
        accessibilityLabel={name}
        leading={<MemberAvatar householdId={householdId} userId={otherKey} size={40} />}
        title={name}
        subtitle={sentence}
        actions={
          <View style={styles.actions}>
            {canSettle ? (
              <Pill label={primary} variant="primary" disabled={!online} onPress={() => onSettle(otherKey)} />
            ) : null}
            {owedToMe && !former ? (
              <Pill
                label={askedAt ? t('household.settle.askSent', { time: timeText(askedAt) }) : t('household.settle.askWith', { name })}
                variant="secondary"
                disabled={!online || askedAt !== null}
                pending={ask.isPending}
                onPress={() => void onAsk()}
              />
            ) : null}
            {former && canSettle ? (
              <Pill label={t('household.settle.writeOff.action')} variant="danger" disabled={!online} onPress={() => setConfirmOff(true)} />
            ) : null}
            {!online ? <Text style={meta}>{t('household.settle.offlineHelper')}</Text> : null}
            {failure ? (
              <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
                {failure}
              </Text>
            ) : null}
          </View>
        }
      >
        <View style={styles.column}>
          <View style={[styles.total, { backgroundColor: colors.fill1 }]}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.settle.total')}</Text>
            <Text scale="capped" style={{ ...textRole(pairing, 'display'), color: colors.ink }}>
              {fmt(abs)}
            </Text>
            {owedToMe ? <Text style={meta}>{t('household.home.balances.notSpendable')}</Text> : null}
          </View>
          <SettlementCards householdId={householdId} otherKey={otherKey} />
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
            {t('household.home.balances.linesBehind')}
          </Text>
          {lines.length === 0 ? (
            <View>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('household.home.balances.linesBehindEmptyTitle')}</Text>
              <Text style={meta}>{t('household.home.balances.linesBehindEmptyBody')}</Text>
            </View>
          ) : (
            lines.map((l) => {
              const rule = RULES.find((r) => r === l.line.split_rule);
              const payerKey = l.signed > 0 ? userId : otherKey;
              const abs1 = Math.abs(l.signed);
              return (
                <View key={l.line.id} style={styles.line} accessible>
                  <View style={styles.lineText}>
                    <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{l.line.name ?? formatDate(l.line.local_date)}</Text>
                    <Text style={meta}>
                      {t('household.home.balances.lineMeta', {
                        date: formatDate(l.line.local_date),
                        rule: rule ? t(`household.rules.names.${rule}`) : '',
                        name: label(payerKey),
                      })}
                    </Text>
                    {l.signed < 0 ? <Text style={meta}>{t('household.home.balances.yourShare', { amount: fmt(abs1) })}</Text> : null}
                  </View>
                  <Text scale="capped" style={{ ...textRole(pairing, 'bodyStrong'), color: l.signed > 0 ? colors.accent : colors.ink }}>
                    {l.signed > 0 ? t('household.settle.signedIn', { amount: fmt(abs1) }) : t('household.settle.signedOut', { amount: fmt(abs1) })}
                  </Text>
                </View>
              );
            })
          )}
          <Text style={meta}>{t('household.home.balances.traces')}</Text>
        </View>
      </DetailSheet>
      <ConfirmSheet
        visible={confirmOff}
        title={t('household.settle.writeOff.title', { amount: fmt(abs), name })}
        body={t('household.settle.writeOff.body')}
        cancelLabel={t('household.settle.writeOff.keep')}
        confirmLabel={t('household.settle.writeOff.action')}
        destructive
        onConfirm={() => void onWriteOff()}
        onCancel={() => setConfirmOff(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  actions: { gap: step.tight },
  column: { gap: step.tight },
  total: { padding: step.card, borderRadius: radii.card, gap: step.hair },
  line: { flexDirection: 'row', alignItems: 'center', gap: step.row, paddingVertical: step.tight },
  lineText: { flex: 1, flexShrink: 1, gap: step.hair },
});
