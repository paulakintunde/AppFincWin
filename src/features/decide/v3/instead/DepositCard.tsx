// 05.3-29 (DSV-10): "3 · A fixed-rate deposit". The rate is the user's own and is never defaulted (C11); it lives in the
// screen's state only. Until one is typed the card says so and shows the 0% figure.
import React from 'react';
import { View } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { RateInput } from '../../ui/RateInput';
import { SegmentedToggle } from '../../ui/SegmentedToggle';
import type { InsteadCard } from '../model/insteadModel';
import type { V3Format } from '../shared/useV3Format';
import { CardBody, FutureCard } from './FutureCard';

type Deposit = Extract<InsteadCard, { id: 'deposit' }>;

export interface DepositCardProps {
  card: Deposit;
  rateText: string;
  onRate: (text: string) => void;
  onYears: (years: 1 | 3 | 5) => void;
  /** The whole price, shown in "not the {price} itself". */
  price: number;
  fmt: V3Format;
}

export function DepositCard({ card, rateText, onRate, onYears, price, fmt }: DepositCardProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  // With a rate: what it grows to. Without one: the 0% figure (interest given up, which is nothing at 0%).
  const headMinor = card.view !== null ? card.view.value : card.zeroFigure;
  return (
    <FutureCard title={t('decide.v3.ui.instead.deposit')} figure={fmt.money(headMinor)} figureA11y={fmt.moneyA11y(headMinor)}>
      <RateInput
        value={rateText}
        onChange={onRate}
        label={t('decide.v3.ui.instead.rateField')}
        placeholder={t('decide.v3.ui.instead.ratePlaceholder')}
        accessibilityLabel={t('decide.v3.ui.instead.rateField')}
      />
      <SegmentedToggle
        options={[
          { key: '1', label: t('decide.v3.ui.instead.y1') },
          { key: '3', label: t('decide.v3.ui.instead.y3') },
          { key: '5', label: t('decide.v3.ui.instead.y5') },
        ]}
        value={String(card.years)}
        onChange={(k) => onYears(Number(k) as 1 | 3 | 5)}
        accessibilityLabel={t('decide.v3.ui.instead.deposit')}
      />
      <View accessibilityLiveRegion="polite">
        {card.view === null ? (
          <CardBody>{t('decide.v3.ui.instead.enterRate')}</CardBody>
        ) : (
          <CardBody>
            {t('decide.v3.ui.instead.depositSentence', {
              count: card.years,
              rate: rateText.endsWith('.') ? rateText.slice(0, -1) : rateText,
              value: fmt.money(card.view.value),
              interest: fmt.money(card.view.interestGivenUp),
              price: fmt.money(price),
            })}
          </CardBody>
        )}
      </View>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, marginTop: space.gapSm / 2 }}>{t('decide.v3.ui.instead.disclosure')}</Text>
    </FutureCard>
  );
}
