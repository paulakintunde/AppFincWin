// 06-13 GC20: savings calculator. How many monthly deposits reach a target, with an optional yearly interest rate.
// First deposit is next month. Nothing is saved. Figures come from calcModels (engine/grow monthsToReach).
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useT } from '@/i18n';
import { CalcResultCard } from '@/features/grow/ui/CalcResultCard';
import { HowWorkedOutBox } from '@/features/grow/ui/HowWorkedOutBox';
import { MoneyInput } from '@/ui/MoneyInput';
import { CalcPage, Card, FooterNote, TypedField, ValueRow, calcStyles, useCalcFormat, useWorkedLines } from './CalcFields';
import { savingsCalc } from './calcModels';
import { useDebounced } from './useCalcInput';

export function SavingsCalculator() {
  const t = useT();
  const f = useCalcFormat();
  const [target, setTarget] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [monthly, setMonthly] = useState<number | null>(null);
  const [rate, setRate] = useState('');
  const typed = useDebounced({ target, saved, monthly, rate });
  const result = useMemo(() => savingsCalc({ ...typed, start: f.start }), [typed, f.start]);
  const worked = useWorkedLines(result?.workedOut ?? [], f);

  return (
    <CalcPage title={t('grow.calc.savings.title')}>
      <MoneyInput boxed value={target} currency={f.currency} onChange={setTarget} label={t('grow.calc.savings.target')} accessibilityLabel={t('grow.calc.savings.target')} />
      <MoneyInput boxed value={saved} currency={f.currency} onChange={setSaved} label={t('grow.calc.savings.saved')} accessibilityLabel={t('grow.calc.savings.saved')} />
      <View style={calcStyles.pair}>
        <View style={{ flex: 1 }}>
          <MoneyInput boxed value={monthly} currency={f.currency} onChange={setMonthly} label={t('grow.calc.savings.each')} accessibilityLabel={t('grow.calc.savings.each')} />
        </View>
        <TypedField label={t('grow.calc.savings.interest')} value={rate} onChangeText={setRate} suffix="%" testID="savings-rate" />
      </View>
      <FooterNote text={t('grow.calc.savings.interestHelp')} />
      <CalcResultCard
        value={result ? t('grow.calc.savings.months', { count: result.deposits }) : null}
        caption={result && typed.target !== null ? t('grow.calc.savings.reaches', { target: f.money(typed.target) }) : undefined}
      >
        {result && typed.monthly !== null ? (
          <FooterNote
            text={t('grow.calc.savings.by', {
              date: f.monthYear(result.reachesOn),
              amount: f.money(typed.monthly),
              first: f.monthYear(f.start),
            })}
          />
        ) : null}
      </CalcResultCard>
      {result ? (
        <>
          <Card>
            <ValueRow first label={t('grow.calc.savings.putIn')} value={f.money(result.putIn)} />
            <ValueRow label={t('grow.calc.savings.interestEarned')} value={f.money(result.interest)} />
            <ValueRow label={t('grow.calc.savings.total', { date: f.monthYear(result.reachesOn) })} value={f.money(result.total)} />
          </Card>
          <HowWorkedOutBox lines={worked} />
        </>
      ) : null}
      <FooterNote text={t('grow.calc.savings.footer')} />
    </CalcPage>
  );
}
