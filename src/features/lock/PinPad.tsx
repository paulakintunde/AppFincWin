// 10-21 (UI-SPEC "New components"): a 3 x 4 grid of 64 x 64 fill1 keys at every width. Digits 1-9, then an empty
// cell, 0 and backspace. No haptic per digit (hapticTap is the lock screen's, on a correct PIN). Keys read their digit.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, rowHeight, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Glyph } from '@/ui/icons/Glyph';
import { Text } from '@/ui/Text';

const KEY = rowHeight.two;
const ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '<'],
];

export interface PinPadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}

export function PinPad({ onDigit, onBackspace, disabled = false }: PinPadProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View style={styles.grid} testID="pin-pad">
      {ROWS.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((k, c) => {
            if (k === '') return <View key={c} style={styles.key} />;
            const back = k === '<';
            return (
              <Pressable
                key={c}
                testID={back ? 'pin-key-backspace' : `pin-key-${k}`}
                accessibilityRole="button"
                accessibilityLabel={back ? t('system.appLock.a11yPinDelete') : k}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => (back ? onBackspace() : onDigit(k))}
                style={({ pressed }) => [
                  styles.key,
                  styles.fill,
                  { backgroundColor: colors.fill1, opacity: disabled ? 0.5 : pressed ? 0.72 : 1 },
                ]}
              >
                {back ? (
                  <Glyph name="close" size={20} color={colors.ink} />
                ) : (
                  <Text scale="capped" style={{ ...textRole(pairing, 'heading'), color: colors.ink, fontVariant: ['tabular-nums'] }}>
                    {k}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: step.row, alignItems: 'center' },
  row: { flexDirection: 'row', gap: step.row },
  key: { width: KEY, height: KEY },
  fill: { borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
