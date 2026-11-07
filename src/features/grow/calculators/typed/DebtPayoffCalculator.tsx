// 06-13 GC40: debt payoff. Two to six typed debts and one extra amount; the two payoff orders sit side by side with the
// same weight (D-13: no highlight, no ranking), then the minimums-only line. "The choice is yours." Nothing is saved.
// Figures come from calcModels (engine/payoff strategy).
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useT } from '@/i18n';
import { CalcResultCard } from '@/features/grow/ui/CalcResultCard';
import { HowWorkedOutBox } from '@/features/grow/ui/HowWorkedOutBox';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { MoneyInput } from '@/ui/MoneyInput';
import { Text } from '@/ui/Text';
import { CalcPage, Card, FooterNote, TypedField, ValueRow, calcStyles, useCalcFormat, useWorkedLines, type CalcFormat } from './CalcFields';
import { debtPayoffCalc, type DebtInput, type OrderResult } from './calcModels';
import { useDebounced } from './useCalcInput';

const MIN_DEBTS = 1;
const MAX_DEBTS = 6;
const STACK_FONT_SCALE = 1.3;

interface DebtRow extends DebtInput {
  id: number;
}

export function DebtPayoffCalculator() {
  const t = useT();
  const f = useCalcFormat();
  const { colors, pairing } = useTheme();
  const { fontScale } = useWindowDimensions();
  const nextId = useRef(3);
  const [debts, setDebts] = useState<DebtRow[]>([
    { id: 1, balance: null, rate: '', minimum: null },
    { id: 2, balance: null, rate: '', minimum: null },
  ]);
  const [extra, setExtra] = useState<number | null>(null);
  const typed = useDebounced({ debts, extra });
  const result = useMemo(
    () => debtPayoffCalc({ debts: typed.debts, extra: typed.extra, start: f.start }),
    [typed, f.start],
  );
  const worked = useWorkedLines(result?.workedOut ?? [], f);

  const patch = (id: number, change: Partial<DebtInput>) => setDebts((rows) => rows.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const add = () => {
    const id = nextId.current++;
    setDebts((rows) => (rows.length >= MAX_DEBTS ? rows : [...rows, { id, balance: null, rate: '', minimum: null }]));
  };
  const remove = (id: number) => setDebts((rows) => (rows.length <= MIN_DEBTS ? rows : rows.filter((r) => r.id !== id)));
  const name = (index: number) => t('grow.calc.payoff.debtName', { n: index + 1 });
  const stacked = fontScale > STACK_FONT_SCALE;

  const orderCard = (title: string, detail: string, o: OrderResult, testID: string) => (
    <View testID={testID} style={[styles.order, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{title}</Text>
      <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.label, color: colors.inkMuted }}>{detail}</Text>
      {o.outcome === 'cleared' && o.interest !== null && o.endDate !== null ? (
        <>
          <Text style={[styles.cap, { color: colors.inkMuted }]}>{t('grow.calc.payoff.debtFree')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('grow.calc.payoff.debtFreeValue', { count: o.months })}</Text>
          <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.label, color: colors.inkMuted }}>
            {t('grow.calc.payoff.by', { date: f.monthYear(o.endDate) })}
          </Text>
          <Text style={[styles.cap, { color: colors.inkMuted }]}>{t('grow.debts.totalInterest')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{f.money(o.interest)}</Text>
          {o.firstCleared ? (
            <>
              <Text style={[styles.cap, { color: colors.inkMuted }]}>{t('grow.debts.firstCleared')}</Text>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                {`${name(o.firstCleared.index)} · ${t('grow.calc.payoff.debtFreeValue', { count: o.firstCleared.month })}`}
              </Text>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <CalcPage title={t('grow.calc.payoff.title')}>
      <FooterNote text={t('grow.calc.payoff.subtitle')} />
      {debts.map((d, index) => (
        <View key={d.id} testID={`debt-${index + 1}`} style={[styles.debt, { backgroundColor: colors.surface, ...shadows.card }]}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
            {name(index)}
          </Text>
          <MoneyInput
            boxed
            value={d.balance}
            currency={f.currency}
            onChange={(v) => patch(d.id, { balance: v })}
            label={t('grow.calc.payoff.owed')}
            accessibilityLabel={`${name(index)}, ${t('grow.calc.payoff.owed')}`}
          />
          <View style={calcStyles.pair}>
            <TypedField
              label={t('grow.calc.payoff.rate')}
              value={d.rate}
              onChangeText={(v) => patch(d.id, { rate: v })}
              suffix="%"
              accessibilityLabel={`${name(index)}, ${t('grow.calc.payoff.rate')}`}
              testID={`debt-${index + 1}-rate`}
            />
            <View style={{ flex: 1 }}>
              <MoneyInput
                boxed
                value={d.minimum}
                currency={f.currency}
                onChange={(v) => patch(d.id, { minimum: v })}
                label={t('grow.calc.payoff.minimum')}
                accessibilityLabel={`${name(index)}, ${t('grow.calc.payoff.minimum')}`}
              />
            </View>
          </View>
          {debts.length > MIN_DEBTS ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('grow.calc.payoff.removeDebt')}, ${name(index)}`}
              onPress={() => remove(d.id)}
              style={styles.textButton}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.calc.payoff.removeDebt')}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {debts.length < MAX_DEBTS ? (
        <Pressable accessibilityRole="button" onPress={add} style={styles.textButton}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('grow.calc.payoff.addDebt')}</Text>
        </Pressable>
      ) : null}
      <MoneyInput
        boxed
        value={extra}
        currency={f.currency}
        onChange={setExtra}
        label={t('grow.calc.payoff.extra')}
        accessibilityLabel={t('grow.calc.payoff.extra')}
      />
      {result ? <FooterNote text={t('grow.calc.payoff.extraHelp', { amount: f.money(result.budget) })} /> : null}

      {result ? (
        <View accessibilityLiveRegion="polite" style={{ gap: space.gapMd }}>
          <View style={[styles.orders, stacked ? styles.stacked : null]}>
            {orderCard(t('grow.debts.orderRate'), rateDetail(t, debtsAt(typed.debts, result.extraTo.rate), result.extraTo.rate), result.rate, 'order-rate')}
            {orderCard(t('grow.debts.orderBalance'), balanceDetail(t, f, debtsAt(typed.debts, result.extraTo.balance), result.extraTo.balance), result.balance, 'order-balance')}
          </View>
          {result.sameForOneDebt ? <FooterNote text={t('grow.debts.oneDebt')} /> : null}
        </View>
      ) : (
        <CalcResultCard value={null} />
      )}
      {result ? (
        <>
          <Card>
            <ValueRow
              first
              label={t('grow.calc.payoff.minimumsOnly')}
              value={
                result.minimumsOnly.endDate !== null
                  ? `${t('grow.calc.payoff.debtFreeValue', { count: result.minimumsOnly.months })} · ${f.monthYear(result.minimumsOnly.endDate)}`
                  : '–'
              }
            />
            {result.minimumsOnly.interest !== null ? (
              <ValueRow label={t('grow.calc.payoff.minimumsInterest')} value={f.money(result.minimumsOnly.interest)} />
            ) : null}
          </Card>
          <HowWorkedOutBox lines={worked} />
          <FooterNote text={t('grow.debts.choiceIsYours')} />
        </>
      ) : null}
      <FooterNote text={t('grow.calc.payoff.footer')} />
    </CalcPage>
  );
}

function debtsAt(debts: readonly DebtInput[], index: number): DebtInput {
  return debts[index]!;
}

type T = ReturnType<typeof useT>;

function rateDetail(t: T, d: DebtInput, index: number): string {
  return t('grow.calc.payoff.rateOrder', { name: t('grow.calc.payoff.debtName', { n: index + 1 }), rate: d.rate.trim().replace(',', '.') });
}

function balanceDetail(t: T, f: CalcFormat, d: DebtInput, index: number): string {
  return t('grow.calc.payoff.balanceOrder', { name: t('grow.calc.payoff.debtName', { n: index + 1 }), owed: f.money(d.balance ?? 0) });
}

const styles = StyleSheet.create({
  debt: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  textButton: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 4 },
  orders: { flexDirection: 'row', gap: space.gapMd },
  stacked: { flexDirection: 'column' },
  order: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: radii.card, padding: 14, gap: 2 },
  cap: { fontSize: fontSize.meta, marginTop: 10 },
});
