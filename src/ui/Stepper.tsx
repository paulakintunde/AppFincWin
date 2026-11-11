// 06-09: minus / value / plus. Both buttons are 44 x 44. The group is one adjustable element for a screen reader
// ("Extra each month, 50 dollars, adjustable"); the buttons are still tappable. No haptics here (screens decide).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';

export interface StepperProps {
  /** Value in whole display units (a number the screen formats into `valueText`). */
  value: number;
  step: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  /** The value as the screen formats it ("$50"). */
  valueText: string;
  /** Spoken label, e.g. "Extra each month, 50 dollars". The adjustable role adds the rest. */
  accessibilityLabel: string;
  decrementLabel: string;
  incrementLabel: string;
  /** When font scale makes a row too wide the value stacks above the buttons (UI-SPEC). */
  stacked?: boolean;
}

export function Stepper({ value, step, min = 0, max, onChange, valueText, accessibilityLabel, decrementLabel, incrementLabel, stacked = false }: StepperProps) {
  const { colors, pairing } = useTheme();
  const canDown = value - step >= min;
  const canUp = max === undefined || value + step <= max;
  const down = () => {
    if (canDown) onChange(Math.max(min, value - step));
  };
  const up = () => {
    if (canUp) onChange(max === undefined ? value + step : Math.min(max, value + step));
  };
  const button = (kind: 'minus' | 'plus', label: string, enabled: boolean, onPress: () => void) => (
    <Pressable
      testID={`grow-stepper-${kind}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.fill1, opacity: !enabled ? 0.4 : pressed ? PRESSED_OPACITY : 1 }]}
    >
      <StateGlyph name={kind} color={colors.ink} />
    </Pressable>
  );
  return (
    <View
      testID="grow-stepper"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') up();
        else if (event.nativeEvent.actionName === 'decrement') down();
      }}
      style={[styles.group, stacked && styles.groupStacked]}
    >
      {stacked ? (
        <Text style={{ ...textRole(pairing, 'heading'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{valueText}</Text>
      ) : null}
      <View style={styles.buttons}>
        {button('minus', decrementLabel, canDown, down)}
        {stacked ? null : (
          <Text style={[styles.value, { ...textRole(pairing, 'heading'), color: colors.ink, fontVariant: ['tabular-nums'] }]}>{valueText}</Text>
        )}
        {button('plus', incrementLabel, canUp, up)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.gapSm, alignSelf: 'stretch' },
  groupStacked: { alignItems: 'flex-start' },
  buttons: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: space.gapMd },
  button: { width: space.touchMin, height: space.touchMin, borderRadius: space.touchMin / 2, alignItems: 'center', justifyContent: 'center' },
  value: { flex: 1, textAlign: 'center' },
});
