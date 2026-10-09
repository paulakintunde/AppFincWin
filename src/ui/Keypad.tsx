/**
 * Money keypad (REC-20, UI-SPEC 8, Confirmed Decision 3: replaces the OS keyboard for the
 * amount field, RESEARCH Pitfall 10). A 4x3 grid: 1-9, decimal, 0, backspace. Every press
 * goes through the engine reducer applyKey, so the text can only ever be strict-parser
 * valid and within the amount ceiling; this component never parses the string itself.
 * Long-press backspace clears.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { applyKey, type KeypadKey } from '@/engine/money/keypad';
import { hapticSelection } from '@/ui/haptics';

export interface KeypadProps {
  value: string;
  onChange: (next: string) => void;
  exponent: number;
  decimalSeparator: string;
  maxMinor?: number;
  disabled?: boolean;
}

const LAYOUT: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['decimal', '0', 'backspace'],
];

export function Keypad({ value, onChange, exponent, decimalSeparator, maxMinor, disabled = false }: KeypadProps) {
  const { colors, pairing } = useTheme();
  const t = useT();

  const press = (key: KeypadKey) => {
    const next = applyKey(value, key, { exponent, decimalSeparator, maxMinor });
    if (next !== value) {
      hapticSelection();
      onChange(next);
    }
  };

  const labelFor = (key: KeypadKey): string =>
    key === 'decimal' ? decimalSeparator : key === 'backspace' ? '⌫' : key;

  return (
    <View style={styles.grid}>
      {LAYOUT.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={
                key === 'decimal'
                  ? t('record.sheet.keypad.decimal')
                  : key === 'backspace'
                    ? t('record.sheet.keypad.backspace')
                    : key
              }
              accessibilityHint={key === 'backspace' ? t('record.sheet.keypad.backspaceHint') : undefined}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => press(key)}
              onLongPress={key === 'backspace' ? () => press('clear') : undefined}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: pressed ? colors.surface : colors.fill1, opacity: pressed || disabled ? 0.7 : 1 },
              ]}
            >
              <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{labelFor(key)}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space.gapMd },
  row: { flexDirection: 'row', gap: space.gapMd },
  key: {
    flex: 1,
    height: space.touchMin + space.gapSm,
    borderRadius: space.gapMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
