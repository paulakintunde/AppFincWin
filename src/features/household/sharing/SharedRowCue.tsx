// 08-19 (D-13, 06.2 D-06): the household cue under an Activity row. One status badge per row: Settled first, then whatever
// status the row already shows, then Shared. When the row's own badge takes the slot, the rest read as words in a second line
// ("Shared · logged by Sam"). "logged by" shows when the viewer is the named payer but did not log the line.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { TransactionRow } from '@/db/rows';
import { SharedBadge } from '../components/SharedBadge';
import { useHouseholdScope } from '../useHouseholdScope';
import { useMemberLabel } from '../useMemberLabel';
import { useLineCover } from './sharedLineState';

export interface SharedRowCueProps {
  row: Pick<TransactionRow, 'id' | 'created_by' | 'paid_by'>;
  /** The row already shows its own status badge (overdue, over cap, due, expected). */
  hasBadge: boolean;
}

export function SharedRowCue({ row, hasBadge }: SharedRowCueProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { householdId, userId } = useHouseholdScope();
  const label = useMemberLabel(householdId);
  const cover = useLineCover(householdId, row.id);
  const viewerIsPayer = userId !== null && row.paid_by === userId && row.created_by !== userId;
  const settledWord = t('household.sharing.settledBadge');
  const waitingWord = t('household.sharing.waitingBadge');
  const coverWord = cover === 'settled' ? settledWord : cover === 'waiting' ? waitingWord : null;

  const words: string[] = [];
  if (hasBadge) {
    if (coverWord !== null) words.push(coverWord);
    words.push(t('household.sharing.badge'));
  }
  if (viewerIsPayer) words.push(t('household.sharing.loggedByMeta', { name: label(row.created_by) }));

  return (
    <View style={styles.wrap} testID={`shared-cue-${row.id}`}>
      {!hasBadge ? (
        cover !== null ? (
          <StatusBadge status={cover === 'settled' ? 'paid' : 'pending'} label={coverWord as string} testID={`settled-badge-${row.id}`} />
        ) : (
          <SharedBadge testID={`shared-badge-${row.id}`} />
        )
      ) : null}
      {words.length > 0 ? (
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{words.join(' · ')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: step.tight },
});
