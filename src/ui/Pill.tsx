/**
 * UI-SPEC Design System: the shared pill primitive reused for entry-sheet primary CTAs,
 * status toggles, filter actions and ConfirmSheet's two actions. Variants: 'primary'
 * (accent background, surface text), 'secondary' (fill1 background, ink text), 'danger'
 * (danger text on dangerTint1). A 'selected' pill gets an accent border. Colour and size
 * are resolved only through the theme/layout tokens (DSG-02).
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useReadOnlyScope } from '@/ui/ReadOnlyScope';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { usePressFeedback } from '@/ui/pressFeedback';

export type PillVariant = 'primary' | 'secondary' | 'danger';

export interface PillProps {
  label: string;
  variant: PillVariant;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /**
   * 06.1-62 (H-1): work started by this pill is still running. Dimmed, announced busy, repeat taps ignored.
   * Same label, no spinner and no new copy.
   */
  pending?: boolean;
}

export function Pill({ label, variant, selected = false, disabled = false, pending = false, onPress, accessibilityLabel, accessibilityHint }: PillProps) {
  const { colors, pairing } = useTheme();
  // a pill inside a read-only region is announced disabled and inert; the region already dims it
  const scoped = useReadOnlyScope();
  const inert = disabled || scoped;
  // 06.1-62 (CB-5 / CF-1): a native ripple on Android and a pressed dim on iOS, but never on an inert or pending pill
  const feedback = usePressFeedback(variant === 'primary' ? 'fill' : 'row');
  const live = !inert && !pending;

  const backgroundColor =
    variant === 'primary' ? colors.accent : variant === 'danger' ? colors.dangerTint1 : colors.fill1;
  const textColor = variant === 'primary' ? colors.surface : variant === 'danger' ? colors.danger : colors.ink;
  const borderColor = selected ? colors.accent : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={pending ? { disabled: true, selected, busy: true } : { disabled: inert, selected }}
      disabled={inert || pending}
      onPress={pending ? undefined : onPress}
      android_ripple={live ? feedback.android_ripple : undefined}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor, borderColor, opacity: disabled || pending ? 0.5 : 1 },
        live ? feedback.pressedStyle(pressed) : null,
      ]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: textColor }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: space.touchMin,
    paddingVertical: space.pillPadV,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.pill,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
});
