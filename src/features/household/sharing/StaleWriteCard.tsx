// 08-19 (D-14, 02 D-26; UI-SPEC 4d): a write for a shared line that the server refused because someone changed the line first.
// Never last-write-wins and never silent: the card names who changed it ("Sam changed this first") through the member
// resolver, says the change was not saved, and offers both paths: look at their change, or make mine again.
import React, { useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { WarningCard } from '@/ui/WarningCard';
import { Pill } from '@/ui/Pill';
import { FadeIn } from '@/ui/motion/FadeIn';
import { hapticWarn } from '@/ui/haptics';
import { useT } from '@/i18n';
import { step } from '@/theme/layout';
import { queryKeys } from '@/data/keys';
import { dismissFailedWrite, getFailedWrites, subscribeFailedWrites, type FailedWrite } from '@/data/sync/failedWrites';
import { useMemberLabel } from '../useMemberLabel';

/** What the server told us about the change that got there first, when it did (field, before, after and time already as words). */
export interface StaleChange {
  field: string;
  before: string;
  after: string;
  time: string;
}

export interface StaleWriteCardProps {
  householdId: string | null | undefined;
  lineId: string;
  /** The line's month, 'YYYY-MM': "See their change" re-reads it. */
  month: string;
  change?: StaleChange;
  /** "Make my change again": the host reopens the edit with the fresh line. Called after the card is cleared. */
  onMakeAgain: () => void;
}

/** The newest conflict parked for this line, if any. */
export function useLineConflict(lineId: string): FailedWrite | null {
  const all = useSyncExternalStore(subscribeFailedWrites, getFailedWrites, getFailedWrites);
  let found: FailedWrite | null = null;
  for (const w of all) {
    if (w.entity === 'transactions' && w.entityId === lineId && w.kind === 'conflict') found = w;
  }
  return found;
}

export function StaleWriteCard({ householdId, lineId, month, change, onMakeAgain }: StaleWriteCardProps) {
  const t = useT();
  const qc = useQueryClient();
  const label = useMemberLabel(householdId);
  const conflict = useLineConflict(lineId);
  const present = conflict !== null;

  useEffect(() => {
    if (present) hapticWarn();
  }, [present, conflict?.id]);

  if (conflict === null) return null;
  const by = typeof conflict.attempted.updated_by === 'string' ? conflict.attempted.updated_by : null;
  const name = by === null ? null : label(by);
  const title = name === null ? t('household.sharing.conflict.titleUnknown') : t('household.sharing.conflict.title', { name });
  const body =
    name !== null && change
      ? t('household.sharing.conflict.bodyField', { name, field: change.field, before: change.before, after: change.after, time: change.time })
      : t('household.sharing.conflict.bodyPlain');

  const clear = async () => {
    await dismissFailedWrite(conflict.id);
  };

  return (
    <FadeIn>
      <View style={styles.column} testID="stale-write-card" accessibilityLiveRegion="polite">
        <WarningCard tone="soft" title={title} value="" body={[body]} />
        <View style={styles.actions}>
          <Pill
            label={t('household.sharing.conflict.see')}
            variant="secondary"
            onPress={() => {
              void clear();
              void qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(householdId ?? '', month) });
            }}
          />
          <Pill
            label={t('household.sharing.conflict.again')}
            variant="primary"
            onPress={() => {
              void clear().then(() => {
                void qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(householdId ?? '', month) });
                onMakeAgain();
              });
            }}
          />
        </View>
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.tight },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: step.tight },
});
