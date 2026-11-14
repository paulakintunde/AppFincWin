// 06.1-15: the two small pieces the input sheets share: a field label and a filled text box (fill6, card pad, 44 high).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{children}</Text>;
}

export function Note({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warn' }) {
  const { colors, pairing } = useTheme();
  return (
    <Text
      accessibilityRole={tone === 'warn' ? 'alert' : undefined}
      style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: tone === 'warn' ? colors.warn1 : colors.inkMuted }}
    >
      {children}
    </Text>
  );
}

export interface FieldProps {
  value: string;
  onChangeText: (text: string) => void;
  accessibilityLabel: string;
  placeholder?: string;
  maxLength?: number;
  numeric?: boolean;
  decimal?: boolean;
  readOnly?: boolean;
  /** 06.1-57 (A-ST-1, A-ST-7): a short word after the text, such as '%'. */
  suffix?: string;
  /** 06.1-57 (A-ST-7): the whole text is selected on focus, so typing replaces a shown example. */
  selectTextOnFocus?: boolean;
}

export function Field({ value, onChangeText, accessibilityLabel, placeholder, maxLength, numeric = false, decimal = false, readOnly = false, suffix, selectTextOnFocus }: FieldProps) {
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.box, suffix === undefined ? null : styles.adorned, { backgroundColor: colors.fill6 }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={accessibilityLabel}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        maxLength={maxLength}
        inputMode={decimal ? 'decimal' : numeric ? 'numeric' : undefined}
        editable={!readOnly}
        selectTextOnFocus={selectTextOnFocus}
        style={[styles.input, suffix === undefined ? null : styles.grow, { ...textRole(pairing, 'body'), color: colors.ink }]}
      />
      {suffix === undefined ? null : (
        <Text testID="field-suffix" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
          {suffix}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: space.cardPad, paddingHorizontal: space.cardPad, justifyContent: 'center' },
  input: { minHeight: space.touchMin, padding: 0 },
  adorned: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  grow: { flex: 1 },
});
