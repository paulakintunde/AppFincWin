/**
 * UI-SPEC money field (deposit, loan, "+ Tax, fees"). Free text is parsed only through the shared amount parser and
 * reported as integer minor units (never a float).
 *
 * CR-D01: the value is reported as the user types (null while the text does not parse), so a button pressed while the
 * field still has focus reads the typed figure. The iOS decimal pad has no return key and a tap elsewhere need not blur
 * the field, so a blur-only commit could leave a typed figure uncounted.
 *
 * 06.1-52 (C-10): text that more typing cannot fix (a letter, too many decimals, too large) shows its error as it is
 * typed; a half-typed grouping ('1,2' on the way to '1,200') waits for the blur. 06.1-52 (X-4): once the field loses
 * focus a figure rests grouped, with no fraction on a whole amount ('9,000'); the reported value is unchanged.
 *
 * WR-D05: a value the parent resets to null from outside clears the text and the error. A null the parent sends back in
 * answer to this field's own report (a 0 or an over-limit figure it normalises to null) keeps the typed text.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput } from '@/ui/TextInput';
import type { TextInput as TextInputInstance } from '@/ui/TextInput';
import { Text } from '@/ui/Text';
import { SURFACE_ON_INK_OPACITY } from '@/ui/Chip';
import { useTheme } from '@/theme/ThemeProvider';
import { useFontScale } from '@/theme/FontScaleProvider';
import { effectiveScale } from '@/theme/fontScale';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useAmountParser } from '@/ui/money/useAmountParser';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { currencyCode, minorUnits } from '@/engine/money';

export interface MoneyInputProps {
  value: number | null;
  currency: string;
  onChange: (minor: number | null) => void;
  label: string;
  accessibilityLabel: string;
  large?: boolean;
  /** 05-44: a hint in the empty field (e.g. 'Add amount'). */
  placeholder?: string;
  /** 05.3-52 (F8): with no `placeholder`, the empty field hints a zero amount in the currency's own digits and the region's decimal mark ('0.00', '0,00', '0'). It is a hint, never a value: the field still reports null. */
  zeroHint?: boolean;
  /** 05-44: a decided check cannot be edited. */
  readOnly?: boolean;
  /** 05-61: the compact field beside a slider (pill, fill1, 128 wide, currency prefix). The label is not drawn; the caller shows it once. */
  compact?: boolean;
  /** 05-61: fires when the field loses focus, after the figure is committed. */
  onBlur?: () => void;
  /** 05-85 (D-70, rule I): a control after the label, as its next flex sibling (an info button). */
  labelAccessory?: React.ReactNode;
  /** 05-101 (D-87, R16.3): the running-cost Amount field: no label, a 44-high pill, 1.5px dashed line4 while empty, solid line1 on fill6 with an amount. `width` undefined fills the row. 06.1-61: `width` is at the default font size and grows with the OS font scale (to the 2x body cap), as the typed text does. */
  amountField?: { width?: number };
  /** 05-101: the input instance, so a row press can focus it. */
  inputRef?: React.Ref<TextInputInstance>;
  /** D-95: 'dark' sits on the ink card -- surface at .12 fill, surface text, inkSoft2 placeholder (light: inkMuted, 05.3-52), inkSoft1 labels, a 2px surface focus ring, the parser error in surface text (never danger on ink). */
  tone?: 'light' | 'dark';
  /** D-105: sit like a sheet text Box -- fill6, the card radius and padding, body type -- and lead the text with the currency symbol or marker. */
  boxed?: boolean;
  /** 06.1-52 (X-4): lead the text with the currency's symbol, as `boxed` does, on any field look. */
  prefix?: 'symbol';
  /** 06.1-52 (X-4): a short word after the text (e.g. 'a month', '%'). */
  suffix?: string;
  /** 06.1-52 (C-18): the raw text as typed, so a caller can tell an empty field from one that did not read as an amount. */
  onTextChange?: (text: string) => void;
}

const COMPACT_MIN_WIDTH = 128;
const AMOUNT_BORDER = 1.5; // R16.3
const FOCUS_RING = 2; // D-95

export function MoneyInput({ value, currency, onChange, label, accessibilityLabel, large = false, placeholder, zeroHint = false, readOnly = false, compact = false, onBlur, labelAccessory, amountField, inputRef, tone = 'light', boxed = false, prefix, suffix, onTextChange }: MoneyInputProps) {
  const { colors, pairing } = useTheme();
  const fontScale = useFontScale();
  const dark = tone === 'dark' && !amountField;
  const [focused, setFocused] = useState(false);
  const labelColor = dark ? colors.inkSoft1 : colors.inkDim;
  const parser = useAmountParser();
  const speaker = useMoneyFormatter(false);
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
    onTextChange?.(next);
    if (next.trim() === '') {
      setError(null);
      report(null);
      return;
    }
    const result = parser.parse(next, currency);
    if (result.ok || result.error === 'ambiguous-separator') setError(null);
    else setError(parser.errorMessage(result));
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
      setText(parser.toDisplayText(result.value, currency));
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

  // 05.3-52 (F8): the zero hint goes through the same formatter the typed text does, so it matches the region's marks.
  const hint = placeholder ?? (zeroHint ? parser.toInputText(0, currency) : undefined);

  // D-94: a screen reader speaks the committed figure by currency name, not as a bare number. A custom code Intl
  // cannot read leaves the plain text to be spoken.
  let spoken: string | undefined;
  if (value !== null) {
    try {
      spoken = speaker.formatMoneyA11y({ amount: minorUnits(value), currency: currencyCode(currency) });
    } catch {
      spoken = undefined;
    }
  }

  // formatAmount's rules ("$" is USD only; other dollars keep their marker), read off a zero so the field never decides one itself.
  let symbol = '';
  const leadSymbol = boxed || prefix === 'symbol';
  if (leadSymbol) {
    try {
      symbol = speaker.formatMoney({ amount: minorUnits(0), currency: currencyCode(currency) }).replace(/[^\p{L}\p{S}]/gu, '');
    } catch {
      symbol = currency;
    }
  }

  return (
    <View style={amountField?.width === undefined ? undefined : { width: amountField.width * effectiveScale(fontScale, 'body') }}>
      {compact || amountField ? null : labelAccessory ? (
        <View style={styles.labelRow}>
          <View style={styles.labelText}>
            <Text style={{ ...textRole(pairing, 'label'), color: labelColor }}>{label}</Text>
          </View>
          {labelAccessory}
        </View>
      ) : (
        <Text style={{ ...textRole(pairing, 'label'), color: labelColor }}>{label}</Text>
      )}
      <View
        style={[
          styles.field,
          compact && styles.compact,
          boxed && styles.boxed,
          !boxed && !compact && (prefix !== undefined || suffix !== undefined) && styles.adorned,
          amountField
            ? {
                borderWidth: AMOUNT_BORDER,
                borderStyle: value === null ? 'dashed' : 'solid',
                borderColor: value === null ? colors.line4 : colors.line1,
                backgroundColor: value === null ? 'transparent' : colors.fill6,
              }
            : dark
              ? { borderWidth: FOCUS_RING, borderColor: focused ? colors.surface : 'transparent', overflow: 'hidden' }
              : { backgroundColor: boxed ? colors.fill6 : colors.fill1 },
        ]}
      >
        {dark ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY, borderRadius: radii.pill }]}
          />
        ) : null}
        {leadSymbol && symbol !== '' ? (
          <Text testID="money-symbol" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
            {symbol}
          </Text>
        ) : null}
        {compact ? <Text style={{ ...textRole(pairing, 'body'), color: labelColor }}>{currency}</Text> : null}
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={onText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            handleBlur();
          }}
          onSubmitEditing={commit}
          returnKeyType="done"
          inputMode="decimal"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={spoken === undefined ? undefined : { text: spoken }}
          placeholder={hint}
          editable={!readOnly}
          // 05.3-44/52: inkFaint fails 4.5:1 on fill1 and fill6; inkMuted passes on every light ground the field sits on.
          placeholderTextColor={dark ? colors.inkSoft2 : colors.inkMuted}
          style={[styles.input, (compact || boxed || prefix !== undefined || suffix !== undefined) && styles.compactInput, { ...textRole(pairing, large || compact || boxed ? 'body' : 'label'), color: dark ? colors.surface : colors.ink }]}
        />
        {suffix ? (
          <Text testID="money-suffix" style={{ ...textRole(pairing, 'body'), color: dark ? colors.inkSoft1 : colors.inkDim }}>
            {suffix}
          </Text>
        ) : null}
      </View>
      {error ? <Text style={{ ...textRole(pairing, 'label'), color: dark ? colors.surface : colors.danger }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  labelText: { flexShrink: 1 },
  field: {
    minHeight: space.touchMin,
    borderRadius: radii.pill,
    paddingHorizontal: space.gapMd,
    justifyContent: 'center',
  },
  input: { minHeight: space.touchMin, padding: 0 },
  compact: { minWidth: COMPACT_MIN_WIDTH, flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  compactInput: { flex: 1 },
  adorned: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  boxed: { borderRadius: space.cardPad, paddingHorizontal: space.cardPad, flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
});
