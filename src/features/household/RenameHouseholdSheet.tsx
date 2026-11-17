// Screen 1, owner: rename the household (D-11). 1 to 60 characters, needs a connection, undoable from the toast by renaming
// back with the new version. The server checks the version, so a rename made elsewhere first is refused, not overwritten.
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { renameHousehold } from '@/db/householdMembers';
import { supabase } from '@/services/supabase';
import { useHouseholdScope } from './useHouseholdScope';
import { ownerReasonKey, type OwnerReasonKey } from './ownerReasons';

export const HOUSEHOLD_NAME_MAX = 60;

export interface RenameHouseholdSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function RenameHouseholdSheet({ visible, onClose }: RenameHouseholdSheetProps) {
  // The body mounts once per opening, so the field starts from the stored name each time.
  if (!visible) return null;
  return <RenameBody onClose={onClose} />;
}

function RenameBody({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const scope = useHouseholdScope();
  const [value, setValue] = useState(scope.household?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<OwnerReasonKey | null>(null);

  if (!scope.isOwner || !scope.household) return null;
  const household = scope.household;
  const trimmed = value.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= HOUSEHOLD_NAME_MAX;
  const changed = trimmed !== (household.name ?? '');

  const refresh = () => {
    if (scope.householdId) void qc.invalidateQueries({ queryKey: queryKeys.householdDetail(scope.householdId) });
  };

  const save = async () => {
    if (saving || !valid || !changed || !scope.online) return;
    setSaving(true);
    setFailure(null);
    const before = household.name ?? '';
    try {
      const res = await renameHousehold(supabase, trimmed, household.version);
      if (!res.ok) {
        hapticFailed();
        setFailure(ownerReasonKey(res.reason));
        if (res.reason === 'version_conflict') refresh();
        return;
      }
      const newVersion = typeof res.version === 'number' ? res.version : household.version + 1;
      refresh();
      hapticTap();
      showToast({
        kind: 'ordinary',
        text: { key: 'household.home.rename_sheet.toast' },
        onUndo: () => {
          void renameHousehold(supabase, before, newVersion)
            .then(refresh)
            .catch(() => undefined);
        },
      });
      onClose();
    } catch {
      hapticFailed();
      setFailure('household.home.reasons.failed');
    } finally {
      setSaving(false);
    }
  };

  const title = t('household.home.rename_sheet.title');
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dismissible={!saving}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.home.rename_sheet.label')}</Text>
        <TextInput
          testID="household-name-input"
          accessibilityLabel={t('household.home.rename_sheet.label')}
          maxLength={HOUSEHOLD_NAME_MAX}
          value={value}
          onChangeText={setValue}
          style={[textRole(pairing, 'body'), styles.input, { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 }]}
        />
        {!scope.online ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.home.offline.helper')}</Text> : null}
        {failure ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {t(failure)}
          </Text>
        ) : null}
        <Pill
          label={t('household.home.rename_sheet.save')}
          variant="primary"
          onPress={() => void save()}
          disabled={!valid || !changed || !scope.online}
          pending={saving}
        />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.tight },
  input: { paddingHorizontal: step.card, paddingVertical: space.rowPadDense, minHeight: space.touchMin },
});
