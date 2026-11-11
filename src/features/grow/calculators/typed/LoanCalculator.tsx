// 06-13 GC10: loan calculator. Typed amount, rate and length; the payment, total interest, total paid and last payment
// follow 150 ms after typing. Nothing is saved. All figures come from calcModels (engine/payoff amortise).
import React, { useMemo, useState } from 'react';
import { useT } from '@/i18n';
import { CalcResultCard } from '@/features/grow/ui/CalcResultCard';
import { HowWorkedOutBox } from '@/features/grow/ui/HowWorkedOutBox';
import { MoneyInput } from '@/ui/MoneyInput';
import { CalcPage, Card, FooterNote, TypedField, ValueRow, calcStyles, useCalcFormat, useWorkedLines } from './CalcFields';
import { loanCalc } from './calcModels';
import { useDebounced, wholeFromText } from './useCalcInput';
import { View } from 'react-native';

export function LoanCalculator() {
  const t = useT();
  const f = useCalcFormat();
  const [amount, setAmount] = useState<number | null>(null);
  const [rate, setRate] = useState('');
  const [months, setMonths] = useState('');
  const typed = useDebounced({ amount, rate, months });
  const result = useMemo(() => loanCalc({ amount: typed.amount, rate: typed.rate, months: wholeFromText(typed.months) }), [typed]);
  const worked = useWorkedLines(result?.workedOut ?? [], f);

  return (
    <CalcPage title={t('grow.calc.loan.title')}>
      <MoneyInput
        boxed
        value={amount}
        currency={f.currency}
        onChange={setAmount}
        label={t('grow.calc.loan.amount')}
        accessibilityLabel={t('grow.calc.loan.amount')}
      />
      <View style={calcStyles.pair}>
        <TypedField label={t('grow.calc.loan.rate')} value={rate} onChangeText={setRate} suffix="%" testID="loan-rate" />
        <TypedField
          label={t('grow.calc.loan.length')}
          value={months}
          onChangeText={setMonths}
          suffix={t('grow.calc.loan.months')}
          keyboardType="number-pad"
          testID="loan-months"
        />
      </View>
      <CalcResultCard value={result ? f.money(result.payment) : null} caption={t('grow.calc.loan.result')}>
        {result ? <FooterNote text={t('grow.calc.loan.resultSub', { count: result.months })} /> : null}
      </CalcResultCard>
      {result ? (
        <>
          <Card>
            <ValueRow first label={t('grow.calc.loan.totalInterest')} value={f.money(result.totalInterest)} />
            <ValueRow label={t('grow.calc.loan.totalPaid')} value={f.money(result.totalPaid)} />
            <ValueRow label={t('grow.calc.loan.lastPayment')} value={f.money(result.last)} />
          </Card>
          <HowWorkedOutBox lines={worked} />
        </>
      ) : null}
      <FooterNote text={t('grow.calc.loan.footer')} />
    </CalcPage>
  );
}
