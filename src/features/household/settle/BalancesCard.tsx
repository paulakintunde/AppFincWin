// 08-21 Screen 1 item 1 and Screen 2 (HH-07, D-23, ENG-25): the balances on the Household home. A declarative sentence says
// who owes whom, the card lists one row per person with an open balance (members who left stay listed with "(left)"), and a
// row opens the pair sheet with the lines behind it. Owed money is a separate figure and says "Not spendable until it
// arrives". Amounts are signs and words, never red. Settlement records are transfers, never spending or income.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Row } from '@/ui/Row';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Text } from '@/ui/Text';
import { FadeIn } from '@/ui/motion/FadeIn';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, step } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { useHouseholdMembers } from '@/data/queries/household';
import { useHouseholdBalances, useSettlements } from '@/data/queries/householdBalances';
import { MemberAvatar } from '../components/MemberAvatar';
import { useHouseholdScope } from '../useHouseholdScope';
import { useMemberLabel } from '../useMemberLabel';
import { heroSentence } from './heroSentence';
import { PairSheet } from './PairSheet';
import { SettleUpSheet } from './SettleUpSheet';
import { SettlementCards, otherPartyKey } from './PendingSettlementCard';
import { isWaiting, useSettleMoney } from './settleHelpers';

export interface BalancesSectionProps {
  householdId: string | null;
  /** The household has only the viewer in it. */
  alone: boolean;
}

/** The home's balances section: hero sentence, the not-spendable note, the pair rows, and the waiting settle-ups. */
export function BalancesSection({ householdId, alone }: BalancesSectionProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { fmt, userId } = useSettleMoney();
  const { name: householdName } = useHouseholdScope();
  const label = useMemberLabel(householdId);
  const { data: members } = useHouseholdMembers(householdId);
  const balances = useHouseholdBalances(householdId, userId);
  const settlements = useSettlements(householdId).data ?? [];
  const [pairKey, setPairKey] = useState<string | null>(null);
  const [settleKey, setSettleKey] = useState<string | null>(null);

  const pairs = balances.data?.pairs ?? [];
  const owedToMe = balances.data?.owedToMe ?? 0;
  const showCards = settlements.length > 0;
  if (!householdId) return null;
  // A household of one with nothing owed has no balances to show (the "Just you for now" state covers it).
  if (alone && pairs.length === 0 && !showCards) return null;

  const hero = heroSentence(pairs)
    .map((line) =>
      t(line.key, {
        name: line.params.otherKey ? label(line.params.otherKey) : '',
        amount: fmt(line.params.amount ?? 0),
        count: line.params.count ?? 0,
        household: householdName,
      } as never),
    )
    .join(' ');

  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const rows = pairs.filter((p) => p.net !== 0);

  return (
    <FadeIn once="household-balances" style={styles.section}>
      <View style={styles.stack} testID="household-balances">
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }} testID="balances-hero">
          {hero}
        </Text>
        {owedToMe > 0 ? <Text style={meta}>{t('household.home.balances.notSpendable')}</Text> : null}

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {rows.length === 0 ? (
            <View>
              <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('household.home.balances.emptyTitle')}</Text>
              <Text style={meta}>{t('household.home.balances.emptyBody', { household: householdName })}</Text>
            </View>
          ) : (
            rows.map((p) => {
              const inHousehold = (members ?? []).some((m) => m.user_id === p.otherKey);
              const name = label(p.otherKey, { left: !inHousehold });
              const waiting = settlements.find((s) => isWaiting(s) && otherPartyKey(s, userId) === p.otherKey);
              const status = waiting ? (
                <StatusBadge
                  status="pending"
                  label={
                    waiting.payer_id === userId
                      ? t('household.settle.pending.waiting', { name })
                      : t('household.settle.pending.theyPaid', { name })
                  }
                />
              ) : undefined;
              const word = p.net > 0 ? t('household.settle.owesYouWord') : t('household.settle.youOweWord');
              return (
                <Row
                  key={p.otherKey}
                  label={name}
                  sublabel={word}
                  amount={fmt(Math.abs(p.net))}
                  leading={<MemberAvatar householdId={householdId} userId={p.otherKey} size={32} />}
                  status={status}
                  statusText={waiting ? t('household.settle.a11y.pending', { name, amount: fmt(Math.abs(p.net)) }) : undefined}
                  accessibilityLabel={`${name}, ${p.net > 0 ? t('household.home.balances.owesYou', { amount: fmt(Math.abs(p.net)) }) : t('household.home.balances.youOwe', { amount: fmt(Math.abs(p.net)) })}`}
                  chevron
                  onPress={() => setPairKey(p.otherKey)}
                />
              );
            })
          )}
        </View>

        <SettlementCards householdId={householdId} />
      </View>
      <PairSheet
        visible={pairKey !== null}
        householdId={householdId}
        otherKey={pairKey}
        onClose={() => setPairKey(null)}
        onSettle={(key) => {
          setPairKey(null);
          setSettleKey(key);
        }}
      />
      <SettleUpSheet visible={settleKey !== null} householdId={householdId} otherKey={settleKey} onClose={() => setSettleKey(null)} />
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: step.section },
  stack: { gap: step.tight },
  card: { padding: step.card, borderRadius: radii.card, gap: step.tight },
});
