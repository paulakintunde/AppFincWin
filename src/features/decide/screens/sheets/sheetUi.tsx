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
}

export function Field({ value, onChangeText, accessibilityLabel, placeholder, maxLength, numeric = false, decimal = false, readOnly = false }: FieldProps) {
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.fill6 }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={accessibilityLabel}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        maxLength={maxLength}
        inputMode={decimal ? 'decimal' : numeric ? 'numeric' : undefined}
        editable={!readOnly}
        style={[styles.input, { ...textRole(pairing, 'body'), color: colors.ink }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: space.cardPad, paddingHorizontal: space.cardPad, justifyContent: 'center' },
  input: { minHeight: space.touchMin, padding: 0 },
});
