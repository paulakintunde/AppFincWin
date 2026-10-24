/**
 * UI-SPEC Design System: the sheet title row -- the sheetTitle text role plus a labelled
 * Cancel control, shared by every Record sheet.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface SheetHeaderProps {
  title: string;
  cancelLabel: string;
  onCancel: () => void;
  /** An optional control drawn after the title (an info button). */
  titleAccessory?: React.ReactNode;
}

export function SheetHeader({ title, cancelLabel, onCancel, titleAccessory }: SheetHeaderProps) {
  const { colors, pairing } = useTheme();

  const titleStyle = { ...textRole(pairing, 'sheetTitle'), color: colors.ink };
  const cancelStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <View style={styles.row}>
      {titleAccessory ? (
        <View style={styles.titleGroup}>
          <Text style={[titleStyle, styles.titleText]}>{title}</Text>
          {titleAccessory}
        </View>
      ) : (
        <Text style={titleStyle}>{title}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        onPress={onCancel}
        style={styles.cancel}
        hitSlop={CANCEL_HIT_SLOP}
      >
        <Text style={cancelStyle}>{cancelLabel}</Text>
      </Pressable>
    </View>
  );
}

const CANCEL_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: space.touchMin,
  },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, flexShrink: 1 },
  titleText: { flexShrink: 1 },
  cancel: {
    minHeight: space.touchMin,
    justifyContent: 'center',
  },
});
