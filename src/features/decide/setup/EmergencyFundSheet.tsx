/**
 * Plan 05.2-27 (D-04): the emergency fund sheet. Same body as the setup step (EmergencyFundFields). Mounted per opening
 * so every field starts from what is stored. Save and Remove each give one Undo toast; Remove asks nothing and moves
 * nothing in the bank.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { showToast } from '@/state/undoToast';
import { TextButton } from '@/features/income/steps/shared';
import { EmergencyFundFields, useEmergencyFundForm } from './EmergencyFundFields';

export interface EmergencyFundSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The read-only "Used $600 on Oct 12 · rebuilding" line, once 05.3 writes that data. Nothing is drawn without it. */
  usedLine?: string | null;
}

export function EmergencyFundSheet(props: EmergencyFundSheetProps) {
  return props.visible ? <EmergencyFundForm {...props} /> : null;
}

function EmergencyFundForm({ onClose, usedLine = null }: EmergencyFundSheetProps) {
  const t = useT();
  const form = useEmergencyFundForm('sheet');
  const title = t('decide.emergencySheet.title');

  const save = (): void => {
    const result = form.save();
    if (result !== null) {
      showToast({
        kind: 'ordinary',
        text: result.linked
          ? { key: 'decide.emergencySheet.toastSavedAccount', params: { account: result.linked.name } }
          : { key: 'decide.emergencySheet.toastSaved' },
        stepId: result.stepId,
      });
    }
    onClose();
  };

  const remove = (): void => {
    const result = form.remove();
    showToast({ kind: 'ordinary', text: { key: 'decide.emergencySheet.toastRemoved' }, stepId: result.stepId });
    onClose();
  };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={form.dirty}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <EmergencyFundFields form={form} usedLine={usedLine} />
        <View style={styles.actions}>
          <Pill label={t('decide.emergencySheet.save')} variant="primary" disabled={!form.valid || form.value.mode === null} onPress={save} />
          {form.hasStored ? <TextButton label={t('decide.emergencySheet.remove')} onPress={remove} danger /> : null}
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd },
  actions: { gap: space.gapSm, marginTop: space.gapSm },
});
