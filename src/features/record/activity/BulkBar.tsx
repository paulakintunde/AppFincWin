// The bulk action bar shown while Activity is in select mode (ACT-05, D-06): the selected
// count and Mark paid / Mark unpaid / Delete. Ink surface with surface text, per the
// prototype's bulk bar, using Pills for the actions. The screen owns the data hooks.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';

export interface BulkBarProps {
  count: number;
  /** Shown instead of the count after an action with nothing to act on. */
  hint?: string | null;
  onMarkPaid: () => void;
  onMarkUnpaid: () => void;
  onDelete: () => void;
}

export function BulkBar({ count, hint = null, onMarkPaid, onMarkUnpaid, onDelete }: BulkBarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View testID="bulk-bar" style={[styles.bar, { backgroundColor: colors.ink }]}>
      <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.surface }}>
        {hint ?? t('activity.selected', { count })}
      </Text>
      <View style={styles.actions}>
        <Pill label={t('activity.bulkMarkPaid')} variant="secondary" onPress={onMarkPaid} />
        <Pill label={t('activity.bulkMarkUnpaid')} variant="secondary" onPress={onMarkUnpaid} />
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
