// The bulk action bar shown while Activity is in select mode (ACT-05, D-06): Mark paid /
// Mark unpaid / Delete. The selected count lives in the header's SelectBar only (Phase
// 3.1), so this bar shows text just for the hint after an action with nothing to act on.
// Ink surface with surface text, per the prototype's bulk bar, using Pills for the actions.
// The screen owns the data hooks.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { BulkShare } from '@/features/household/sharing/BulkShare';
import type { TransactionRow } from '@/db/rows';

export interface BulkBarProps {
  /** Shown after an action with nothing to act on. */
  hint?: string | null;
  onMarkPaid: () => void;
  onMarkUnpaid: () => void;
  onDelete: () => void;
  /** 08-19 (D-13): the selected lines. Given, a household of 2 or more gets a Share action that counts before it asks. */
  selectedRows?: readonly TransactionRow[];
  /** Called after lines were shared, so the screen can leave select mode. */
  onShared?: () => void;
}

export function BulkBar({ hint = null, onMarkPaid, onMarkUnpaid, onDelete, selectedRows, onShared }: BulkBarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View testID="bulk-bar" style={[styles.bar, { backgroundColor: colors.ink }]}>
      {hint !== null ? (
        <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.surface }}>
          {hint}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Pill label={t('activity.bulkMarkPaid')} variant="secondary" onPress={onMarkPaid} />
        <Pill label={t('activity.bulkMarkUnpaid')} variant="secondary" onPress={onMarkUnpaid} />
        {selectedRows !== undefined ? <BulkShare rows={selectedRows} onShared={onShared} /> : null}
        <Pill label={t('activity.bulkDelete')} variant="danger" onPress={onDelete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: radii.card,
    padding: space.gapMd,
    gap: space.gapSm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.gapSm,
  },
});
