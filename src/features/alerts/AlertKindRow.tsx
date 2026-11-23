// 10-22 (UI-SPEC section 5): one alert kind. The body opens the kind's sheet; the switch turns the alert on or off.
// Accessible label carries the state ("Alert: Over cap, off").
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useReadOnlyScope } from '@/ui/ReadOnlyScope';
import { hapticTick } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { rowHeight, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

const TRACK_W = 46;
const TRACK_H = 28;
const THUMB = 22;
const TRACK_BORDER = 1.5;
const TRACK_PAD = (TRACK_H - THUMB) / 2 - TRACK_BORDER;

export interface AlertKindRowProps {
  kindId: string;
  label: string;
  sub: string;
  enabled: boolean;
  /** Over cap before the caps feature is on. */
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  onOpen: () => void;
}

export function AlertKindRow({ kindId, label, sub, enabled, disabled = false, onToggle, onOpen }: AlertKindRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const scoped = useReadOnlyScope();
  const inert = disabled || scoped;
  const a11y = t(enabled ? 'system.alerts.a11yKindOn' : 'system.alerts.a11yKindOff', { kind: label });
  return (
    <View style={[styles.row, { opacity: disabled ? 0.5 : 1 }]} testID={`alert-row-${kindId}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${sub}`}
        disabled={disabled}
        onPress={onOpen}
        style={styles.body}
        testID={`alert-body-${kindId}`}
      >
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{label}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{sub}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={a11y}
        accessibilityState={{ checked: enabled, disabled: inert }}
        disabled={inert}
        hitSlop={space.gapSm}
        onPress={() => {
          hapticTick();
          onToggle(!enabled);
        }}
        testID={`alert-switch-${kindId}`}
        style={[
          styles.track,
          enabled
            ? { backgroundColor: colors.accent, borderColor: colors.accent }
            : { backgroundColor: colors.fill1, borderColor: colors.inkFaint },
          { alignItems: enabled ? 'flex-end' : 'flex-start' },
        ]}
      >
        <View style={[styles.thumb, { backgroundColor: colors.surface }]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: rowHeight.two, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  body: { flex: 1, minHeight: space.touchMin, justifyContent: 'center' },
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
