// REC-11, REC-12, D-27, D-28, D-32: the last twelve undoable changes, newest first. "Undo to here"
// reverses that step and every newer one; refused steps are greyed with the reason. No level
// gating yet (D-32: the levels phase adds it).
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useMutationState } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useRollbackUndo } from '@/data/mutations/undo';
import { mutationKeys } from '@/data/keys';
import { useHouseholdMemberNames } from '@/data/queries/activity';
import { useUndoLog } from '@/data/queries/undoLog';
import { parseConflict } from '@/db/patches';
import type { UndoLogRow } from '@/db/rows';
import { rollbackRange, type UndoConflict } from '@/engine/undo';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { EmptyState } from '@/ui/EmptyState';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { conflictText, stepLabel } from './undoCopy';

function conflictOf(row: UndoLogRow): UndoConflict | null {
  if (row.refusal === null) return null;
  try {
    return parseConflict(row.refusal);
  } catch {
    return null;
  }
}

function formatWhen(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
}

export function HistoryScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const ctx = useRecordContext();
  const log = useUndoLog(ctx.userId ?? undefined);
  const memberNames = useHouseholdMemberNames(ctx.householdId);
  const { rollbackTo } = useRollbackUndo();

  const rows = log.data ?? [];
  const [confirming, setConfirming] = useState<{ stepId: string; stepIds: string[] } | null>(null);
  // A rollback in flight (running or queued): its rows show 'Undoing…' until the refetch lands.
  const pending = useMutationState({
    filters: { mutationKey: mutationKeys.rollbackUndo, status: 'pending' },
    select: (m) => (m.state.variables as { stepId?: string } | undefined)?.stepId,
  });
  const undoingIds = new Set<string>();
  for (const stepId of pending) {
    if (stepId === undefined) continue;
    for (const id of rollbackRange(rows, stepId).stepIds) undoingIds.add(id);
  }
  const titleStyle = { ...textRole(pairing, 'body'), color: colors.ink };
  const labelStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  const confirmBody = (ids: string[]): string => {
    const labels = ids.map((id) => {
      const r = rows.find((x) => x.id === id);
      return r ? stepLabel(t, r.label_key, r.label_params) : '';
    });
    return [t('history.confirmBody'), ...labels.filter((l) => l !== '')].join('\n');
  };

  return (
    <DetailScreen title={t('history.title')} scroll>
      <Text style={[labelStyle, styles.gap]}>{t('history.label')}</Text>
      <Text style={labelStyle}>{t('history.note')}</Text>
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState heading={t('history.emptyHeading')} body={t('history.emptyBody')} />
        </View>
      ) : (
        <View style={styles.list}>
          {rows.map((row, index) => {
            const label = stepLabel(t, row.label_key, row.label_params);
            const sub = index === 0 ? t('history.mostRecent') : formatWhen(row.created_at, ctx.timeZone);
            if (row.status === 'refused') {
              const conflict = conflictOf(row);
              const reason = conflict ? conflictText(t, conflict, ctx.userId ?? '', memberNames) : null;
              return (
                <View key={row.id} style={styles.row} testID="history-row-refused">
                  <View style={styles.text}>
                    <Text style={[textRole(pairing, 'body'), { color: colors.inkFaint }]}>{label}</Text>
                    <Text style={[labelStyle, { color: colors.inkFaint }]}>{sub}</Text>
                    <Text style={[labelStyle, { color: colors.danger }]}>{t('history.cantUndo')}</Text>
                    {reason ? <Text style={[labelStyle, { color: colors.danger }]}>{reason}</Text> : null}
                  </View>
                </View>
              );
            }
            const { stepIds, blockedBy } = rollbackRange(rows, row.id);
            const count = stepIds.length;
            if (blockedBy !== null) {
              return (
                <View key={row.id} style={styles.row} testID="history-row">
                  <View style={styles.text}>
                    <Text style={titleStyle}>{label}</Text>
                    <Text style={labelStyle}>{sub}</Text>
                    <Text style={[labelStyle, { color: colors.inkFaint }]}>{t('history.blocked')}</Text>
                  </View>
                </View>
              );
            }
            const undoing = undoingIds.has(row.id);
            return (
              <View key={row.id} style={styles.row} testID="history-row">
                <View style={styles.text}>
                  <Text style={titleStyle}>{label}</Text>
                  <Text style={labelStyle}>{sub}</Text>
                </View>
                {undoing ? (
                  <Text style={labelStyle}>{t('history.undoing')}</Text>
                ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('history.undoToHere')}, ${label}`}
                  accessibilityHint={t('history.undoToHereCount', { count })}
                  disabled={ctx.userId === null || ctx.householdId === null}
                  onPress={() => {
                    if (ctx.userId === null || ctx.householdId === null) return;
                    setConfirming({ stepId: row.id, stepIds });
                  }}
                  style={styles.action}
                >
                  <Text style={[textRole(pairing, 'label'), { color: colors.ink }]}>{t('history.undoToHere')}</Text>
                  <Text style={labelStyle}>{t('history.undoToHereCount', { count })}</Text>
                </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}
      <ConfirmSheet
        visible={confirming !== null}
        title={confirming ? t('history.confirmTitle', { count: confirming.stepIds.length }) : undefined}
        body={confirming ? confirmBody(confirming.stepIds) : undefined}
        destructive
        cancelLabel={t('history.keep')}
        confirmLabel={confirming ? t('history.confirmAction', { count: confirming.stepIds.length }) : ''}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const target = confirming;
          setConfirming(null);
          if (target === null || ctx.userId === null || ctx.householdId === null) return;
          rollbackTo({ stepId: target.stepId, ownerId: ctx.userId, householdId: ctx.householdId });
        }}
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: space.groupGap },
  list: { marginTop: space.gapMd },
  empty: { marginTop: space.groupGap },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    minHeight: space.touchMin,
    paddingVertical: space.rowPadDense,
  },
  text: { flex: 1, gap: 2 },
  action: { minHeight: space.touchMin, minWidth: space.touchMin, alignItems: 'flex-end', justifyContent: 'center' },
});
