/**
 * UI-SPEC money field (deposit, loan, "+ Tax, fees"). Free text is parsed only through the shared
 * amount parser on blur/submit and reported as integer minor units (never a float).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput } from '@/ui/TextInput';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useAmountParser } from '@/ui/money/useAmountParser';

export interface MoneyInputProps {
  value: number | null;
  currency: string;
  onChange: (minor: number | null) => void;
  label: string;
  accessibilityLabel: string;
  large?: boolean;
}

export function MoneyInput({ value, currency, onChange, label, accessibilityLabel, large = false }: MoneyInputProps) {
  const { colors, pairing } = useTheme();
  const parser = useAmountParser();
  const [text, setText] = useState(() => (value === null ? '' : parser.toInputText(value, currency)));
  const [error, setError] = useState<string | null>(null);

  // Follow external value changes (e.g. a reset) without clobbering text that already parses to it.
  const [seen, setSeen] = useState({ value, currency });
  if (seen.value !== value || seen.currency !== currency) {
    setSeen({ value, currency });
    if (value !== null) {
      const parsed = parser.parse(text, currency);
      if (!parsed.ok || parsed.value !== value) setText(parser.toInputText(value, currency));
    }
  }

  const commit = () => {
    if (text.trim() === '') {
      setError(null);
      onChange(null);
      return;
    }
    const result = parser.parse(text, currency);
    if (result.ok) {
      setError(null);
      onChange(result.value);
    } else {
      setError(parser.errorMessage(result));
      onChange(null);
    }
  };

  return (
    <View>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{label}</Text>
      <View style={[styles.field, { backgroundColor: colors.fill1 }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          inputMode="decimal"
          accessibilityLabel={accessibilityLabel}
          placeholderTextColor={colors.inkFaint}
          style={[styles.input, { ...textRole(pairing, large ? 'body' : 'label'), color: colors.ink }]}
        />
      </View>
      {error ? <Text style={{ ...textRole(pairing, 'label'), color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: space.touchMin,
    borderRadius: radii.pill,
    paddingHorizontal: space.gapMd,
    justifyContent: 'center',
  },
  input: { minHeight: space.touchMin, padding: 0 },
});
