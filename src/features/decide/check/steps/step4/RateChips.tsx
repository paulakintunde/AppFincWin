/**
 * 05-45 (D-31, D-44, D-48): the rate chips, the horizon chips and the optional holding fee for step 4's
 * "If it went into investing instead". The rate list is the check's one list (`inputs.projectionRates`, assumption 17).
 * The app never suggests or pre-fills a rate or a fee: every figure here is typed by the user.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { percent } from '@/engine/decide';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { CloseGlyph } from '@/ui/CloseGlyph';
import { Text } from '@/ui/Text';
import { isValidProjectionRateText, isValidRateText } from '../../../snapshot/checkInputs';
import { RateInput } from '../../../ui/RateInput';
import { Meta } from '../stepUi';

const MAX_RATES = 3;
const HORIZONS = [12, 24, 36, 60, 120] as const;
const DEFAULT_HORIZON = 60;
const HUNDRED = percent('100');

export interface RateChipsProps {
  rates: string[];
  onChange: (rates: string[]) => void;
  readOnly?: boolean;
}

export function RateChips({ rates, onChange, readOnly = false }: RateChipsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const label = { ...textRole(pairing, 'label'), color: colors.ink };
  const typed = text.trim();
  const tooHigh = typed !== '' && !isValidProjectionRateText(typed);

  const commit = () => {
    if (typed !== '' && isValidProjectionRateText(typed) && rates.length < MAX_RATES && !rates.includes(typed)) onChange([...rates, typed]);
    if (typed === '' || isValidProjectionRateText(typed)) {
      setText('');
      setAdding(false);
    }
  };
  // WR-C04: a rate typed but not yet committed (Next does not blur the field) is committed when the step is left.
  const commitLatest = useRef(commit);
  useEffect(() => {
    commitLatest.current = commit;
  });
  useEffect(() => () => commitLatest.current(), []);

  return (
    <View style={styles.block}>
      <View style={styles.chips}>
        <View style={[styles.chip, { backgroundColor: colors.fill1 }]}>
          <Text style={label}>{t('decide.depth.invest.zero')}</Text>
        </View>
        {rates.map((rate) => (
          <Pressable
            key={rate}
            accessibilityRole="button"
            accessibilityLabel={t('decide.depth.invest.removeRateA11y', { rate })}
            disabled={readOnly}
            onPress={() => onChange(rates.filter((r) => r !== rate))}
            style={({ pressed }) => [styles.chip, { backgroundColor: colors.fill1, opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <Text style={label}>{t('decide.depth.invest.rateChip', { rate })}</Text>
            <CloseGlyph color={colors.inkMuted} />
          </Pressable>
        ))}
      </View>
      {!readOnly && rates.length < MAX_RATES && !adding ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('decide.depth.invest.addRate')} onPress={() => setAdding(true)} style={styles.link}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.depth.invest.addRate')}</Text>
        </Pressable>
      ) : null}
      {rates.length >= MAX_RATES ? <Meta>{t('decide.depth.invest.maxRates')}</Meta> : null}
      {adding && !readOnly ? (
        <RateInput
          value={text}
          onChange={setText}
          onBlur={commit}
          label={t('decide.alt.rateA11y')}
          accessibilityLabel={t('decide.alt.rateA11y')}
          hint={tooHigh ? t('decide.depth.invest.rateCap') : undefined}
        />
      ) : null}
    </View>
  );
}

export interface HorizonChipsProps {
  value: number | null;
  planTerm: number | null;
  onChange: (months: number) => void;
  readOnly?: boolean;
}

export function HorizonChips({ value, planTerm, onChange, readOnly = false }: HorizonChipsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const selected = value ?? planTerm ?? DEFAULT_HORIZON;
  const options: number[] = [...HORIZONS];
  if (planTerm !== null && !options.includes(planTerm)) options.push(planTerm);
  options.sort((a, b) => a - b);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.depth.invest.horizonA11y')} style={styles.chips}>
      {options.map((months) => {
        const on = months === selected;
        return (
          <Pressable
            key={months}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={t('decide.depth.invest.over', { count: months })}
            disabled={readOnly}
            onPress={() => onChange(months)}
            style={({ pressed }) => [styles.chip, { backgroundColor: on ? colors.ink : colors.fill1, opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: on ? colors.surface : colors.ink }}>{t('decide.depth.invest.horizonChip', { count: months })}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface HoldingFeeInputProps {
  value: string | null;
  onChange: (text: string | null) => void;
  readOnly?: boolean;
}

/** D-44: blank until typed; null means no fee. A text above 100 or off the grammar is refused with no change. */
export function HoldingFeeInput({ value, onChange, readOnly = false }: HoldingFeeInputProps) {
  const t = useT();
  const [text, setText] = useState(value ?? '');
  const change = (next: string) => {
    if (next === '') {
      setText('');
      onChange(null);
      return;
    }
    const whole = next.endsWith('.') ? next.slice(0, -1) : next;
    if (!isValidRateText(whole) || percent(whole) > HUNDRED) return;
    setText(next);
    if (next === whole) onChange(next); // a trailing point is still being typed
  };
  return (
    <View style={styles.block}>
      <RateInput
        value={text}
        onChange={change}
        label={`${t('decide.depth.invest.feeLabel')}, ${t('decide.depth.invest.feeSuffix')}`}
        accessibilityLabel={t('decide.depth.invest.feeA11y')}
        readOnly={readOnly}
      />
      <Meta>{t('decide.depth.invest.feeSub')}</Meta>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, minHeight: space.touchMin, paddingHorizontal: space.gapMd, borderRadius: radii.pill },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
