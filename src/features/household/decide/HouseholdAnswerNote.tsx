// 08.1-10 (D-37, UX-21): the shared-bills caveat on a Household answer. Shown only when the check is a Household check and another
// member has not logged a shared line for more than 30 days; a member who never logged one has no date to name, so nothing shows
// for them (owner 2026-11-20). The couples note is the engine's own shared_money sentence (the same words), so it is not drawn twice.
// 08.1-23 (Q6, Q12): one meta line names the spending rule the check counted, and the out-of-date line follows it when set shares
// need updating. The engine's shared_money line is unchanged.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { SharedBillsCaveat, useStaleSharedBills } from './SharedBillsCaveat';
import { answerLinesOf } from './spendNote';
import { useSpendNote } from './useSpendNote';

export function HouseholdAnswerNote({ householdId, today }: { householdId: string | null | undefined; today: string }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const stale = useStaleSharedBills(householdId, today);
  const lines = answerLinesOf(useSpendNote());
  const say = t as unknown as (key: string, values?: Readonly<Record<string, string | number>>) => string;
  if (stale === null && lines.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {lines.map((l) => (
        <Text key={l.key} testID={`household-rule-${l.key.split('.').pop() ?? ''}`} style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
          {say(l.key, l.values)}
        </Text>
      ))}
      {stale === null ? null : <SharedBillsCaveat householdId={householdId} partnerId={stale.partnerId} lastDate={stale.lastDate} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: step.tight },
});
