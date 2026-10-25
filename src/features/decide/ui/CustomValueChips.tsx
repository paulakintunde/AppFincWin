/**
 * 05-61 (D-71, R1): a preset chip row with a last "Custom" chip that opens an inline numeric field under the row (not a
 * sheet). A valid value applies on every keystroke; an out-of-range or unparsable one is not applied, the last valid
 * value stays and the range line turns warn1. On close an empty or invalid entry is dropped.
 *
 * The field's draft text follows the `value` prop through derived state (the last-seen prop is stored beside the draft
 * and the draft is reset during render when the prop changes to something the draft does not already read as) and
 * through the event path only. Nothing sets state in an effect and no ref is read during render.
 */
import React, { useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Chip, SURFACE_ON_INK_OPACITY } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { ReadOnlyScope, useReadOnlyScope } from '@/ui/ReadOnlyScope';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION, useReduceMotion } from '@/theme/motion';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { acceptsMonthsKeystroke, parseWholeInRange, presetFor } from '../snapshot/customValues';

const FIELD_WIDTH = 96;
const FOCUS_RING = 2; // D-95: a surface ring, not the accent (every accent fails 3:1 on ink)

export interface CustomValueFieldProps {
  value: number | null;
  min: number;
  max: number;
  rangeText: string;
  unitWord: string;
  /** The group the field belongs to, for the accessibility label ("{group}, custom, {unit}"). */
  groupLabel: string;
  onChange: (value: number) => void;
  /** Blur or Done. */
  onClose?: () => void;
  autoFocus?: boolean;
  /** D-95: 'dark' sits on the ink card (surface at .12 fill, surface text, a 2px surface focus ring, the range line in surface text). */
  tone?: 'light' | 'dark';
}

const textOf = (value: number | null): string => (value === null ? '' : String(value));

export function CustomValueField({ value, min, max, rangeText, unitWord, groupLabel, onChange, onClose, autoFocus = false, tone = 'light' }: CustomValueFieldProps) {
  const dark = tone === 'dark';
  const { colors, pairing } = useTheme();
  const t = useT();
  const reduced = useReduceMotion();
  const [draft, setDraft] = useState(() => textOf(value));
  const [refused, setRefused] = useState(false);
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    const parsed = parseWholeInRange(draft, min, max);
    if (parsed.kind !== 'ok' || parsed.value !== value) {
      setDraft(textOf(value));
      setRefused(false);
    }
  }

  const aboveRange = value !== null && value > max;
  const warn = refused || aboveRange;

  const onText = (next: string) => {
    if (!acceptsMonthsKeystroke(next)) return;
    setDraft(next);
    const parsed = parseWholeInRange(next, min, max);
    if (parsed.kind === 'ok') {
      setRefused(false);
      onChange(parsed.value);
      return;
    }
    if (parsed.kind === 'empty') {
      setRefused(false);
      return;
    }
    if (!refused) AccessibilityInfo.announceForAccessibility(rangeText);
    setRefused(true);
  };

  const close = () => {
    const parsed = parseWholeInRange(draft, min, max);
    if (parsed.kind !== 'ok') {
      // An empty or invalid entry is dropped: the previous value stays.
      setDraft(textOf(value));
      setRefused(false);
    }
    onClose?.();
  };

  const body = (
    <View style={styles.field}>
      <View style={styles.entry}>
        <View style={[styles.box, dark ? { borderWidth: FOCUS_RING, borderColor: focused ? colors.surface : 'transparent' } : { backgroundColor: colors.fill6 }]}>
          {dark ? (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY, borderRadius: radii.pill }]}
            />
          ) : null}
          <TextInput
            value={draft}
            onChangeText={onText}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              close();
            }}
            onSubmitEditing={close}
            returnKeyType="done"
            inputMode="numeric"
            autoFocus={autoFocus}
            accessibilityLabel={t('decide.custom.fieldA11y', { group: groupLabel, unit: unitWord })}
            accessibilityHint={rangeText}
            placeholderTextColor={dark ? colors.inkSoft2 : colors.inkFaint}
            style={[styles.input, { ...textRole(pairing, 'body'), color: dark ? colors.surface : colors.ink }]}
          />
        </View>
        <Text style={{ ...textRole(pairing, 'body'), color: dark ? colors.inkSoft1 : colors.inkDim, flexShrink: 1 }}>{unitWord}</Text>
      </View>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: dark ? (warn ? colors.surface : colors.inkSoft1) : warn ? colors.warn1 : colors.inkFaint }}>{dark && warn ? t('decide.custom.outOfRange', { range: rangeText }) : rangeText}</Text>
    </View>
  );
  return reduced ? body : <Animated.View entering={FadeIn.duration(DURATION.entrance)}>{body}</Animated.View>;
}

export interface CustomValueChipsProps {
  presets: readonly number[];
  value: number | null;
  onChange: (value: number) => void;
  groupLabel: string;
  min: number;
  max: number;
  rangeText: string;
  unitWord: string;
  /** How a preset (and the Custom chip's value) reads; months by default. */
  formatPreset?: (value: number) => string;
  /** The Custom chip's accessibility label; "Custom, {value}" by default. */
  chipA11y?: (value: string) => string;
  readOnly?: boolean;
  /** D-95: 'dark' sits on the ink card. */
  tone?: 'light' | 'dark';
}

export function CustomValueChips({
  presets,
  value,
  onChange,
  groupLabel,
  min,
  max,
  rangeText,
  unitWord,
  formatPreset,
  chipA11y,
  readOnly: readOnlyProp = false,
  tone = 'light',
}: CustomValueChipsProps) {
  const dark = tone === 'dark';
  const outer = useReadOnlyScope();
  const readOnly = readOnlyProp || outer; // inside a decided check's region the chips stay read-only
  const { colors, pairing } = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const format = formatPreset ?? ((n: number) => t('decide.custom.months', { count: n }));
  const matched = presetFor(value, presets);
  const custom = value !== null && matched === null;
  const customLabel = custom ? format(value) : t('decide.custom.chip');
  const customA11y = custom ? (chipA11y ? chipA11y(format(value)) : t('decide.custom.chipA11y', { value: format(value) })) : t('decide.custom.chip');
  const showField = open && !readOnly;
  const storedAbove = custom && value > max;

  return (
    <ReadOnlyScope.Provider value={readOnly}>
      <View>
        <View accessibilityRole="radiogroup" accessibilityLabel={groupLabel} style={styles.row}>
          {presets.map((p) => (
            <Chip key={p} tone={tone} label={format(p)} selected={matched === p} onPress={() => onChange(p)} />
          ))}
          <Chip tone={tone} label={customLabel} accessibilityLabel={customA11y} selected={custom} onPress={() => setOpen(true)} />
        </View>
        {showField ? (
          <CustomValueField
            value={value}
            min={min}
            max={max}
            rangeText={rangeText}
            unitWord={unitWord}
            groupLabel={groupLabel}
            onChange={onChange}
            onClose={() => setOpen(false)}
            autoFocus
            tone={tone}
          />
        ) : storedAbove ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: dark ? colors.surface : colors.warn1 }}>{dark ? t('decide.custom.outOfRange', { range: rangeText }) : rangeText}</Text>
        ) : null}
      </View>
    </ReadOnlyScope.Provider>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  field: { gap: space.gapSm / 2, paddingTop: space.gapSm },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  box: { minWidth: FIELD_WIDTH, minHeight: space.touchMin, borderRadius: space.cardPad, overflow: 'hidden', paddingHorizontal: space.cardPad, justifyContent: 'center' },
  input: { minHeight: space.touchMin, padding: 0 },
});
