// 05.3-29 (DSV-10, D-12): "4 · Buy it later". The head is the answer's ready-by month (insteadModel anchors it); the
// everyday-spending slider moves only the "Then" line. The result is a polite live region, updated ~150 ms after the
// slider stops. No call to explore here: insteadModel (05.3-21) owns it.
import React from 'react';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { SliderWithField } from '../../ui/SliderWithField';
import type { InsteadCard } from '../model/insteadModel';
import { sliderStops } from '../model/insteadModel';
import { useSettledLabel } from '../shared/useSettledLabel';
import type { V3Format } from '../shared/useV3Format';
import { CardBody, FutureCard } from './FutureCard';

type Later = Extract<InsteadCard, { id: 'buy_later' }>;

export const RESULT_SETTLE_MS = 150;

export interface BuyLaterCardProps {
  card: Later;
  /** The everyday-spending cut, minor units. */
  cut: number;
  onCut: (minor: number) => void;
  currency: string;
  exponent: number;
  fmt: V3Format;
}

export function BuyLaterCard({ card, cut, onCut, currency, exponent, fmt }: BuyLaterCardProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  const stops = sliderStops(exponent);
  const result =
    card.result.month === null
      ? ''
      : t(card.result.resultKey, { month: fmt.month(card.result.month), count: card.result.months ?? 0 });
  const settled = useSettledLabel(result, '', RESULT_SETTLE_MS);
  const sliderLabel = t('decide.v3.ui.instead.slider', { amount: fmt.money(cut) });
  const first = stops[0] as number;
  const last = stops[stops.length - 1] as number;
  const step = (stops[1] as number) - first;
  return (
    <FutureCard title={t('decide.v3.ui.instead.later')} figure={card.head.month === null ? null : t('decide.v3.ui.instead.by', { month: fmt.month(card.head.month) })}>
      {card.head.month === null ? null : <CardBody>{t('decide.v3.ui.instead.laterBody', { month: fmt.month(card.head.month) })}</CardBody>}
      <SliderWithField
        label={sliderLabel}
        value={cut}
        sliderMin={first}
        sliderMax={last}
        step={step}
        typedMin={first}
        typedMax={last}
        rangeText={t('decide.custom.range.from', { min: fmt.money(first), max: fmt.money(last) })}
        currency={currency}
        wholeUnits
        onChange={onCut}
        sliderA11y={sliderLabel}
        fieldA11y={sliderLabel}
      />
      {result === '' ? null : (
        <Text accessibilityLiveRegion="polite" accessibilityLabel={settled} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
          {result}
        </Text>
      )}
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, marginTop: space.gapSm / 2 }}>{t('decide.v3.ui.instead.never')}</Text>
    </FutureCard>
  );
}
