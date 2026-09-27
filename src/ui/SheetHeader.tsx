/**
 * UI-SPEC Design System: the sheet title row -- the sheetTitle text role plus a labelled
 * Cancel control, shared by every Record sheet.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface SheetHeaderProps {
  title: string;
  cancelLabel: string;
  onCancel: () => void;
}

export function SheetHeader({ title, cancelLabel, onCancel }: SheetHeaderProps) {
  const { colors, pairing } = useTheme();

  const titleStyle = { ...textRole(pairing, 'sheetTitle'), color: colors.ink };
  const cancelStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <View style={styles.row}>
      <Text style={titleStyle}>{title}</Text>
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
  cancel: {
    minHeight: space.touchMin,
    justifyContent: 'center',
  },
});
