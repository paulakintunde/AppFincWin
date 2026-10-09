// REC-24, CONTEXT D-24, UI-SPEC 13: the foot of Account detail. An account with no live lines and
// no active repeating line can be deleted (one undoable step, behind a confirm); any other is
// archived, with the reason in the sub-label. Delete is never shown disabled, and while the usage
// counts are unknown nothing is guessed: Archive shows with no reason.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AccountRow } from '@/db/rows';
import { useDeleteAccount } from '@/data/mutations/accountDelete';
import { useEditAccount } from '@/data/mutations/accounts';
import { newStepId } from '@/data/mutations/undoCapture';
import { accountDeleteState } from '@/engine/accounts';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';

export interface AccountRemoveRowProps {
  account: AccountRow;
  /** Null while the counts are unknown (loading, offline, error). */
  usage: { liveLineCount: number; activeSeriesCount: number } | null;
  onDeleted: () => void;
}

export function AccountRemoveRow({ account, usage, onDeleted }: AccountRemoveRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const { remove } = useDeleteAccount();
  const { edit } = useEditAccount();
  const [confirming, setConfirming] = useState(false);

  const state = usage ? accountDeleteState(usage) : null;

  const doDelete = () => {
    setConfirming(false);
    if (rc.userId === null || rc.householdId === null) return;
    remove(account, { ownerId: rc.userId, householdId: rc.householdId });
    onDeleted();
  };

  const doArchive = () => {
    const vars = {
      id: account.id,
      householdId: account.household_id,
      expectedVersion: account.version,
      patch: { archived_at: '$now' },
    };
    if (rc.userId === null) {
      edit(vars);
      return;
    }
    const stepId = newStepId();
    const recorded = edit(vars, { stepId, ownerId: rc.userId });
    showToast({
      kind: 'ordinary',
      text: undoLabelText('accountEdited', { name: account.name }),
      stepId: recorded ? stepId : null,
    });
  };

  const labelStyle = textRole(pairing, 'body');
  const metaStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  if (state?.kind === 'delete') {
    return (
      <View style={styles.block}>
        <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={styles.press}>
          <Text style={{ ...labelStyle, color: colors.danger }}>{t('accounts.remove.delete')}</Text>
        </Pressable>
        <ConfirmSheet
          visible={confirming}
          body={t('accounts.remove.confirm', { name: account.name })}
          cancelLabel={t('accounts.remove.cancel')}
          confirmLabel={t('accounts.remove.confirmDelete')}
          destructive
          onConfirm={doDelete}
          onCancel={() => setConfirming(false)}
        />
      </View>
    );
  }

  let reason: string | null = null;
  if (state?.kind === 'archive') {
    if (state.reason === 'lines') reason = t('accounts.remove.reasonLines', { count: state.lineCount });
    else if (state.reason === 'series') reason = t('accounts.remove.reasonSeries');
    else reason = t('accounts.remove.reasonBoth', { count: state.lineCount });
  }

  return (
    <View style={styles.block}>
      <Pressable accessibilityRole="button" onPress={doArchive} style={styles.press}>
        <Text style={{ ...labelStyle, color: colors.ink }}>{t('accounts.remove.archive')}</Text>
        {reason !== null ? <Text style={metaStyle}>{reason}</Text> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm / 2 },
  press: { paddingVertical: space.rowPad, gap: space.gapSm / 2 },
});
