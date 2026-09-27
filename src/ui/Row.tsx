/**
 * UI-SPEC Design System: the shared list row -- label, optional value, optional leading
 * node, optional trailing chevron. Used for every settings-style and field-picker row
 * across Record. No icon library: the chevron is the Phase 0 convention of a small
 * rotated-border View.
 */
import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface RowProps {
  label: string;
  value?: string;
  leading?: ReactNode;
  chevron?: boolean;
  dense?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function Row({ label, value, leading, chevron = false, dense = false, onPress, accessibilityLabel }: RowProps) {
  const { colors, pairing } = useTheme();
  const labelStyle = { ...textRole(pairing, 'body'), color: colors.ink };
  const valueStyle = { ...textRole(pairing, 'body'), color: colors.inkMuted };

  const content = (
    <View
      style={[
        styles.row,
        { paddingVertical: dense ? space.rowPadDense : space.rowPad },
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <Text style={[styles.label, labelStyle]}>{label}</Text>
      {value ? <Text style={valueStyle}>{value}</Text> : null}
      {chevron ? <ChevronGlyph color={colors.inkFaint} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        testID="row-root"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        onPress={onPress}
        style={styles.minHeight}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View testID="row-root" style={styles.minHeight}>
      {content}
    </View>
  );
}

function ChevronGlyph({ color }: { color: string }) {
  return <View style={[styles.chevron, { borderColor: color }]} />;
}

const styles = StyleSheet.create({
  minHeight: {
    minHeight: space.touchMin,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
  },
  leading: {
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
  chevron: {
    width: 8,
    height: 8,
    borderTopWidth: 2,
    borderRightWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
});
