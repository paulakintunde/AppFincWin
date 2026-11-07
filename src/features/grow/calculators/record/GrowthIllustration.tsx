// 06-19 GC05 (D-19, GRW-11): the growth illustration for the user's own savings or investments. An illustration at one steady
// rate the user picks, never a forecast: the badge sits directly under the title and cannot be removed. Figures come from
// growthIllustrationModel (engine compoundSteps). Starting value and monthly amount arrive as route params (digits, minor
// units) from the investing screens; nothing is saved.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { usePastContext } from '@/features/decide/past/usePastDecisions';
import { BarChart } from '@/features/grow/ui/BarChart';
import { CalcResultCard } from '@/features/grow/ui/CalcResultCard';
import { HowWorkedOutBox } from '@/features/grow/ui/HowWorkedOutBox';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { CalcPage, Card, FooterNote, ValueRow, useCalcFormat } from '../typed/CalcFields';
import { prefillMinor, prefillRate } from '../typed/useCalcInput';
import { growthIllustrationModel } from './recordCalcModels';

export const ILLUSTRATION_YEARS = 10;
export const RATE_CHIPS = ['2', '4', '6'] as const;

export interface GrowthIllustrationProps {
  /** Minor units as digits. */
  start?: string;
  /** Percent text, e.g. '4' or '4.5'. */
  rate?: string;
  /** Minor units as digits. */
  monthly?: string;
}

export function GrowthIllustration({ start: startParam, rate: rateParam, monthly: monthlyParam }: GrowthIllustrationProps = {}) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const f = useCalcFormat();
  const { today, formatDate } = usePastContext();
  const start = prefillMinor(startParam) ?? 0;
  const monthly = prefillMinor(monthlyParam) ?? 0;
  const given = prefillRate(rateParam);
  const [rate, setRate] = useState(given === '' ? '4' : given);

  const result = useMemo(() => growthIllustrationModel({ start, monthly, rate, years: ILLUSTRATION_YEARS }), [start, monthly, rate]);
  const chips = (RATE_CHIPS as readonly string[]).includes(given) || given === '' ? [...RATE_CHIPS] : [...RATE_CHIPS, given].sort((a, b) => Number(a) - Number(b));

  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted };
  const years = ILLUSTRATION_YEARS;
  const worked = result
    ? [
        t('grow.calc.growth.worked', {
          rate: result.rateText,
          monthly: f.money(monthly),
          count: years * 12,
          start: f.money(start),
          put: f.money(result.putIn),
          total: f.money(result.value),
          growth: f.money(result.growth),
        }),
      ]
    : [];

  return (
    <CalcPage title={t('grow.calc.growth.title')}>
      <View style={styles.badge}>
        <StateBadge tone="slate" shape="sQuestion" label={t('grow.calc.illustrationBadge')} />
      </View>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
        {t('grow.calc.growth.subtitle', { start: f.money(start), monthly: f.money(monthly) })}
      </Text>

      <Text accessibilityRole="header" style={label}>{t('grow.calc.growth.rateLabel')}</Text>
      <View style={styles.chips}>
        {chips.map((r) => (
          <Chip key={r} label={`${r}%`} selected={rate === r} onPress={() => setRate(r)} />
        ))}
      </View>

      <CalcResultCard
        value={result ? f.money(result.value) : null}
        caption={result ? t('grow.calc.growth.after', { years, rate: result.rateText }) : undefined}
      >
        {result ? (
          <BarChart
            bars={result.years.map((y, i) => ({ key: String(i + 1), putIn: y.putIn, growth: y.growth }))}
            putInLegend={t('grow.calc.growth.legendPutIn')}
            growthLegend={t('grow.calc.growth.legendGrowth')}
            accessibilityLabel={t('grow.calc.growth.chartA11y', { rate: result.rateText, years, value: f.money(result.value), putIn: f.money(result.putIn) })}
          />
        ) : null}
      </CalcResultCard>

      {result ? (
        <>
          <Card>
            <ValueRow first label={t('grow.calc.growth.starting')} value={t('grow.calc.growth.startingValue', { amount: f.money(start), date: formatDate(today) })} />
            <ValueRow label={t('grow.calc.growth.putIn', { years })} value={f.money(result.putIn)} />
            <ValueRow label={t('grow.calc.growth.growth')} value={f.money(result.growth)} />
            <ValueRow label={t('grow.calc.growth.alone', { monthly: f.money(monthly), zero: f.money(0) })} value={f.money(result.alone)} />
          </Card>
          <HowWorkedOutBox lines={worked} />
          <View testID="growth-note" style={[styles.note, { backgroundColor: colors.accentTint1 }]}>
            <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.label, color: colors.inkDim }}>{t('grow.calc.growth.note')}</Text>
          </View>
        </>
      ) : null}
      <FooterNote text={t('grow.calc.growth.footer')} />
    </CalcPage>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  note: { borderRadius: radii.card, padding: space.cardPad },
});
