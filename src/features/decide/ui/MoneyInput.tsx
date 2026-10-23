/**
 * UI-SPEC money field (deposit, loan, "+ Tax, fees"). Free text is parsed only through the shared amount parser and
 * reported as integer minor units (never a float).
 *
 * CR-D01: the value is reported as the user types (null while the text does not parse), so a button pressed while the
 * field still has focus reads the typed figure. The iOS decimal pad has no return key and a tap elsewhere need not blur
 * the field, so a blur-only commit could leave a typed figure uncounted. The parser's error is shown on blur or submit.
 *
 * WR-D05: a value the parent resets to null from outside clears the text and the error. A null the parent sends back in
 * answer to this field's own report (a 0 or an over-limit figure it normalises to null) keeps the typed text.
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
  /** 05-44: a hint in the empty field (e.g. 'Add amount'). */
  placeholder?: string;
  /** 05-44: a decided check cannot be edited. */
  readOnly?: boolean;
  /** 05-61: the compact field beside a slider (pill, fill1, 128 wide, currency prefix). The label is not drawn; the caller shows it once. */
  compact?: boolean;
  /** 05-61: fires when the field loses focus, after the figure is committed. */
  onBlur?: () => void;
}

const COMPACT_MIN_WIDTH = 128;

export function MoneyInput({ value, currency, onChange, label, accessibilityLabel, large = false, placeholder, readOnly = false, compact = false, onBlur }: MoneyInputProps) {
  const { colors, pairing } = useTheme();
  const parser = useAmountParser();
  const [text, setText] = useState(() => (value === null ? '' : parser.toInputText(value, currency)));
  const [error, setError] = useState<string | null>(null);

  // True for the one render that follows this field's own report: a value arriving then is the parent's answer to it.
  const [answering, setAnswering] = useState(false);
  // Follow external value changes (e.g. a reset) without clobbering text that already parses to it.
  const [seen, setSeen] = useState({ value, currency });
  if (seen.value !== value || seen.currency !== currency) {
    setSeen({ value, currency });
    if (answering) setAnswering(false);
    if (value !== null) {
      const parsed = parser.parse(text, currency);
      if (!parsed.ok || parsed.value !== value) setText(parser.toInputText(value, currency));
    } else if (!answering) {
      if (text !== '') setText('');
      setError(null);
    }
  } else if (answering) {
    setAnswering(false);
  }

  const report = (minor: number | null) => {
    setAnswering(true);
    onChange(minor);
  };

  const onText = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      setError(null);
      report(null);
      return;
    }
    const result = parser.parse(next, currency);
    if (result.ok) setError(null);
    report(result.ok ? result.value : null);
  };

  const commit = () => {
    if (text.trim() === '') {
      setError(null);
      report(null);
      return;
    }
    const result = parser.parse(text, currency);
    if (result.ok) {
      setError(null);
      report(result.value);
    } else {
      setError(parser.errorMessage(result));
      report(null);
    }
  };

  const handleBlur = () => {
    commit();
    onBlur?.();
  };

  return (
    <View>
      {compact ? null : <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{label}</Text>}
      <View style={[styles.field, compact && styles.compact, { backgroundColor: colors.fill1 }]}>
        {compact ? <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{currency}</Text> : null}
        <TextInput
          value={text}
          onChangeText={onText}
          onBlur={handleBlur}
          onSubmitEditing={commit}
          returnKeyType="done"
          inputMode="decimal"
          accessibilityLabel={accessibilityLabel}
          placeholder={placeholder}
          editable={!readOnly}
          placeholderTextColor={colors.inkFaint}
          style={[styles.input, compact && styles.compactInput, { ...textRole(pairing, large || compact ? 'body' : 'label'), color: colors.ink }]}
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
  compact: { minWidth: COMPACT_MIN_WIDTH, flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  compactInput: { flex: 1 },
});
