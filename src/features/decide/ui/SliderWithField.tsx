/**
 * 05-61 (D-71, R1): a money slider with a compact typed field beside it (stacked under rule S).
 *
 * Dragging calls onChange with the snapped value (whole currency units when `wholeUnits`, else cents allowed). Typing
 * inside [typedMin, typedMax] applies the value exactly, with no snap; beyond the track the thumb pins to the end and a
 * line says which side. A typed value outside the typed range is not applied and the range shows in warn1.
 *
 * The field follows `value` through MoneyInput's own derived state; the out-of-range flag is set on the event path only.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { resolveExponent } from '@/engine/money';
import { pinToTrack } from '../snapshot/customValues';
import { MoneyInput } from './MoneyInput';
import { StepSlider } from './StepSlider';
import { useShouldStack } from './textFit';

export interface SliderWithFieldProps {
  label: string;
  /** Minor units. */
  value: number;
  sliderMin: number;
  sliderMax: number;
  /** Minor units. */
  step: number;
  typedMin: number;
  typedMax: number;
  rangeText: string;
  currency: string;
  wholeUnits: boolean;
  onChange: (minor: number) => void;
  sliderA11y: string;
  fieldA11y: string;
}

export function SliderWithField({
  label,
  value,
  sliderMin,
  sliderMax,
  step,
  typedMin,
  typedMax,
  rangeText,
  currency,
  wholeUnits,
  onChange,
  sliderA11y,
  fieldA11y,
}: SliderWithFieldProps) {
  const { colors, pairing } = useTheme();
  const t = useT();
  const stacked = useShouldStack();
  const [outside, setOutside] = useState(false);

  const unit = 10 ** resolveExponent(currency);
  const sliderStep = wholeUnits ? Math.max(1, Math.ceil(step / unit)) * unit : step;
  const pin = pinToTrack(value, sliderMin, sliderMax);

  const onTyped = (minor: number | null) => {
    if (minor === null) {
      setOutside(false);
      return;
    }
    if (minor < typedMin || minor > typedMax) {
      setOutside(true);
      return;
    }
    setOutside(false);
    onChange(minor);
  };

  const onDrag = (next: number) => {
    setOutside(false);
    onChange(next);
  };

  const field = <MoneyInput compact value={value} currency={currency} onChange={onTyped} label={label} accessibilityLabel={fieldA11y} />;
  const slider = (
    <View style={stacked ? styles.sliderStacked : styles.slider}>
      <StepSlider value={pin.thumb} min={sliderMin} max={sliderMax} step={sliderStep} onChange={onDrag} accessibilityLabel={sliderA11y} />
    </View>
  );

  return (
    <View style={styles.block}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{label}</Text>
      {stacked ? (
        <View style={styles.stack}>
          {field}
          {slider}
        </View>
      ) : (
        <View style={styles.row}>
          {slider}
          {field}
        </View>
      )}
      {outside ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{rangeText}</Text>
      ) : pin.beyond ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkFaint }}>{pin.beyond === 'above' ? t('decide.slider.above') : t('decide.slider.below')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm / 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  stack: { gap: space.gapSm },
  slider: { flex: 1 },
  sliderStacked: { alignSelf: 'stretch' },
});
