// 06-13 GC30: compound growth. An illustration at one steady rate, never a forecast: the badge is always shown.
// Optional initial values (route params from an account's "See what it could grow to", 06-18) fill the fields once;
// they stay fully editable, and a bad one is ignored. Nothing is saved. Figures come from calcModels (engine compoundSteps).
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useT } from '@/i18n';
import { BarChart } from '@/features/grow/ui/BarChart';
import { CalcResultCard } from '@/features/grow/ui/CalcResultCard';
import { HowWorkedOutBox } from '@/features/grow/ui/HowWorkedOutBox';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { MoneyInput } from '@/ui/MoneyInput';
import { CalcPage, Card, FooterNote, TypedField, ValueRow, calcStyles, useCalcFormat, useWorkedLines } from './CalcFields';
import { compoundCalc } from './calcModels';
import { prefillMinor, prefillRate, useDebounced, wholeFromText } from './useCalcInput';

export interface CompoundCalculatorProps {
  /** Minor units as digits. */
  start?: string;
  /** Percent text, e.g. '4' or '4.5'. */
  rate?: string;
  /** Minor units as digits. */
  monthly?: string;
}

export function CompoundCalculator({ start: startParam, rate: rateParam, monthly: monthlyParam }: CompoundCalculatorProps = {}) {
  const t = useT();
  const f = useCalcFormat();
  const [start, setStart] = useState<number | null>(() => prefillMinor(startParam));
  const [monthly, setMonthly] = useState<number | null>(() => prefillMinor(monthlyParam));
  const [rate, setRate] = useState(() => prefillRate(rateParam));
  const [years, setYears] = useState('10');
  const typed = useDebounced({ start, monthly, rate, years });
  const result = useMemo(() => compoundCalc({ start: typed.start, monthly: typed.monthly, rate: typed.rate, years: wholeFromText(typed.years) }), [typed]);
  const worked = useWorkedLines(result?.workedOut ?? [], f);
  const yearCount = wholeFromText(typed.years) ?? 0;

  return (
    <CalcPage title={t('grow.calc.compound.title')}>
      <View style={calcStyles.pair}>
        <View style={{ flex: 1 }}>
          <MoneyInput boxed value={start} currency={f.currency} onChange={setStart} label={t('grow.calc.compound.start')} accessibilityLabel={t('grow.calc.compound.start')} />
        </View>
        <View style={{ flex: 1 }}>
          <MoneyInput boxed value={monthly} currency={f.currency} onChange={setMonthly} label={t('grow.calc.compound.add')} accessibilityLabel={t('grow.calc.compound.add')} />
        </View>
      </View>
      <View style={calcStyles.pair}>
        <TypedField label={t('grow.calc.compound.rate')} value={rate} onChangeText={setRate} suffix="%" testID="compound-rate" />
        <TypedField
          label={t('grow.calc.compound.years')}
          value={years}
          onChangeText={setYears}
          suffix={t('grow.calc.compound.yearsUnit')}
          keyboardType="number-pad"
          testID="compound-years"
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <StateBadge tone="slate" shape="sQuestion" label={t('grow.calc.illustrationBadge')} />
      </View>
      <CalcResultCard
        value={result ? f.money(result.value) : null}
        caption={result && typed.monthly !== null ? t('grow.calc.compound.label', { monthly: f.money(typed.monthly), rate: typed.rate.trim().replace(',', '.'), years: yearCount }) : undefined}
      >
        {result ? (
          <BarChart
            bars={result.years.map((y, i) => ({ key: String(i + 1), putIn: y.putIn, growth: y.growth }))}
            putInLegend={t('grow.calc.growth.legendPutIn')}
            growthLegend={t('grow.calc.growth.legendGrowth')}
            accessibilityLabel={t('grow.calc.growth.chartA11y', {
              rate: typed.rate.trim().replace(',', '.'),
              years: yearCount,
              value: f.money(result.value),
              putIn: f.money(result.putIn),
            })}
          />
        ) : null}
      </CalcResultCard>
      {result ? (
        <>
          <Card>
            <ValueRow first label={t('grow.calc.compound.putIn')} value={f.money(result.putIn)} />
            <ValueRow label={t('grow.calc.compound.growth')} value={f.money(result.growth)} />
          </Card>
          <HowWorkedOutBox lines={worked} />
          <FooterNote text={t('grow.calc.compound.note')} />
        </>
      ) : null}
      <FooterNote text={t('grow.calc.compound.footer')} />
    </CalcPage>
  );
}
