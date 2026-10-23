/**
 * UI-SPEC Quick check "Type the rate" field. The rate is kept as text matching the prefix-closed
 * form of the engine percent() grammar (up to 4 integer digits, up to 10 decimals); it is never
 * converted to a number here, so no rate is rounded or invented before the engine boundary
 * (D-02, D-21, D-23).
 *
 * WR-D03: the field shows and accepts the region's own decimal mark (a decimal comma in de, fr, es, nl and others, the
 * only mark their decimal pad offers); the text handed to onChange always uses '.', the engine's form.
 */
import React, { useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { typedRateAbove } from '../snapshot/checkInputs';
import { TextInput } from '@/ui/TextInput';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { localeSeparators } from '@/engine/money';
import { useDeviceLocale } from '@/services/locale/deviceLocale';

const TYPING = /^\d{0,4}(\.\d{0,10})?$/;

/** The typed text in the engine's '.' form: the region's decimal mark (and '.', which every keyboard can send) is read as the point. */
export function toRateText(typed: string, decimal: string): string {
  return decimal === '.' ? typed : typed.split(decimal).join('.');
}

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
  /**
   * 05-61 (R4): the largest rate the field takes, in the engine's '.' text form (e.g. '999.99'). A keystroke that would
   * exceed it is refused (onChange is not called, the shown text stays). Compared as a percent, never through Number().
   */
  max?: string;
  /** 05-61: the bounds in words, shown in warn1 under the field after a refused keystroke. */
  rangeText?: string;
}

export function RateInput({ value, onChange, label, hint, accessibilityLabel, placeholder, onBlur, readOnly = false, max, rangeText }: RateInputProps) {
  const { colors, pairing } = useTheme();
  const { locale, separators } = useDeviceLocale();
  const decimal = (separators ?? localeSeparators(locale)).decimal;
  const [refused, setRefused] = useState(false);
  return (
    <View>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{label}</Text>
      <View style={[styles.field, { backgroundColor: colors.fill1 }]}>
        <TextInput
          value={decimal === '.' ? value : value.replace('.', decimal)}
          onChangeText={(typed) => {
            const text = toRateText(typed, decimal);
            if (!TYPING.test(text)) return;
            if (max !== undefined && typedRateAbove(text, max)) {
              if (!refused && rangeText) AccessibilityInfo.announceForAccessibility(rangeText);
              setRefused(true);
              return;
            }
            setRefused(false);
            onChange(text);
          }}
          onBlur={onBlur}
          // WR-C04: Done commits the rate the same way leaving the field does
          onSubmitEditing={onBlur}
          returnKeyType="done"
          inputMode="decimal"
          accessibilityLabel={accessibilityLabel}
          placeholder={placeholder}
          editable={!readOnly}
          placeholderTextColor={colors.inkFaint}
          style={[styles.input, { ...textRole(pairing, 'body'), color: colors.ink }]}
        />
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>%</Text>
      </View>
      {refused && rangeText ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{rangeText}</Text> : null}
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
