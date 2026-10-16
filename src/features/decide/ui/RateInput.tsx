/**
 * UI-SPEC Quick check "Type the rate" field. The rate is kept as text matching the prefix-closed
 * form of the engine percent() grammar (up to 4 integer digits, up to 10 decimals); it is never
 * converted to a number here, so no rate is rounded or invented before the engine boundary
 * (D-02, D-21, D-23).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput } from '@/ui/TextInput';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

const TYPING = /^\d{0,4}(\.\d{0,10})?$/;

export interface RateInputProps {
  value: string;
  onChange: (text: string) => void;
  label: string;
  hint?: string;
  accessibilityLabel: string;
  placeholder?: string;
  /** Fires when the field loses focus (05-14: the card rate is saved on blur). */
  onBlur?: () => void;
  /** 05-44: a decided check cannot be edited. */
  readOnly?: boolean;
}

export function RateInput({ value, onChange, label, hint, accessibilityLabel, placeholder, onBlur, readOnly = false }: RateInputProps) {
  const { colors, pairing } = useTheme();
  return (
    <View>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{label}</Text>
      <View style={[styles.field, { backgroundColor: colors.fill1 }]}>
        <TextInput
          value={value}
          onChangeText={(text) => {
            if (TYPING.test(text)) onChange(text);
          }}
          onBlur={onBlur}
          inputMode="decimal"
          accessibilityLabel={accessibilityLabel}
          placeholder={placeholder}
          editable={!readOnly}
          placeholderTextColor={colors.inkFaint}
          style={[styles.input, { ...textRole(pairing, 'body'), color: colors.ink }]}
        />
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>%</Text>
      </View>
      {hint ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: space.touchMin,
    borderRadius: radii.pill,
    paddingHorizontal: space.gapMd,
    gap: space.gapSm,
  },
  input: { flex: 1, minHeight: space.touchMin, padding: 0 },
});
