/**
 * 02.2-UI-SPEC section 8: label + switch row. D-27 shared primitive for entry toggles and
 * You settings; Phase 3 keeps these props.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

// Component geometry from UI-SPEC 8 (not tokens).
const TRACK_W = 46;
const TRACK_H = 28;
const THUMB = 22;
const TRACK_BORDER = 1.5;
const TRACK_PAD = (TRACK_H - THUMB) / 2 - TRACK_BORDER;

export interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityHint?: string;
}

export function ToggleRow({ label, value, onChange, disabled = false, accessibilityHint }: ToggleRowProps) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={[{ ...textRole(pairing, 'body'), color: colors.ink }, styles.label]}>{label}</Text>
      <View
        style={[
          styles.track,
          value
            ? { backgroundColor: colors.accent, borderColor: colors.accent }
            : { backgroundColor: colors.fill1, borderColor: colors.inkFaint },
          { alignItems: value ? 'flex-end' : 'flex-start' },
        ]}
      >
        <View style={[styles.thumb, { backgroundColor: colors.surface }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: space.touchMin,
    paddingVertical: space.gapSm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
  },
  label: { flex: 1 },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    borderWidth: TRACK_BORDER,
    justifyContent: 'center',
    paddingHorizontal: TRACK_PAD,
  },
  thumb: { width: THUMB, height: THUMB, borderRadius: THUMB / 2 },
});
