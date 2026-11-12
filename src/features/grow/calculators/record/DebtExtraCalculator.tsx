// 06-19 GC04 (D-18): the extra-payment calculator for one debt. Chips None / +25 / +50 / +100 show the new payoff date, interest
// saved and the share of pay. Figures come from debtExtraModel (engine fixedPayoff). Nothing is saved until the user confirms
// "Make this the plan" (D-20), which goes through useSaveDebtPlan (one save; the server builds the one Undo).
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSaveDebtPlan } from '@/data/mutations/growDebts';
import { useAccounts } from '@/data/queries/accounts';
import { currencyExponent } from '@/engine/money';
import { useT } from '@/i18n';
import { dueDateOf } from '@/features/grow/connect/debtPoint';
import { fitLineName, payAccountId, useDebtFormat, useDebtMonth, useDebtRows } from '@/features/grow/debts/debtScreenData';
import { useDebtsRead } from '@/features/grow/debts/useDebtsRead';
import { CalcResultCard } from '@/features/grow/ui/CalcResultCard';
import type { ChangeRow } from '@/features/grow/ui/ChangeRows';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { CalcPage, Card, FooterNote, ValueRow } from '../typed/CalcFields';
import { MakePlanSheet } from './MakePlanSheet';
import { debtExtraModel } from './recordCalcModels';

/** The extra amounts offered, in whole currency units. */
export const EXTRA_CHIP_UNITS = [0, 25, 50, 100] as const;

export function DebtExtraCalculator({ id }: { id: string }) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const read = useDebtsRead();
  const fmt = useDebtFormat();
  const rows = useDebtRows(read.householdId);
  const accounts = useAccounts(read.householdId ?? undefined).data ?? [];
  const month = useDebtMonth();
  const planSave = useSaveDebtPlan();

  const row = rows.get(id);
  const line = read.model.debts.find((d) => d.id === id) ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  // P3-WR-02: one plan save per visit; a second tap before the screen closes does nothing.
  const saved = useRef(false);

  const ctx = useMemo(() => {
    if (row === undefined || line === null || line.point.paidInFull || line.point.balance <= 0) return null;
    return {
      balance: line.point.balance,
      apr: row.apr && row.apr.trim() !== '' ? row.apr : '0',
      payment: line.point.minimum,
      firstDate: dueDateOf(read.today, line.point.dueDay ?? Number(read.today.slice(8, 10)), 0),
      // P3-WR-05: the share of pay only when the debt and Decide's pay are in the same currency.
      usualPay: line.currency === month.currency ? month.usualPay : null,
    };
  }, [row, line, read.today, month.usualPay, month.currency]);

  const extra = picked ?? line?.extra ?? 0;
  const result = useMemo(() => (ctx === null ? null : debtExtraModel(ctx, extra)), [ctx, extra]);
  const nowResult = useMemo(() => (ctx === null || line === null ? null : debtExtraModel(ctx, line.extra)), [ctx, line]);
  const noExtra = useMemo(() => (ctx === null ? null : debtExtraModel(ctx, 0)), [ctx]);

  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted };

  if (row === undefined || line === null || ctx === null) {
    return (
      <CalcPage title="">
        <View testID={read.status === 'loading' ? 'debt-calc-loading' : 'debt-calc-missing'} style={[styles.card, { backgroundColor: colors.surface, ...shadows.card }]}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
            {read.status === 'loading' ? t('grow.home.loading') : t('grow.common.notFoundBody')}
          </Text>
        </View>
      </CalcPage>
    );
  }

  const cur = line.currency;
  const exp = currencyExponent(cur);
  const cents = (n: number) => fmt.cents(n, cur);
  const unit = 10 ** exp;
  const chipExtras = [...EXTRA_CHIP_UNITS.map((u) => u * unit)];
  if (!chipExtras.includes(line.extra)) chipExtras.push(line.extra);
  chipExtras.sort((a, b) => a - b);
  const chipLabel = (n: number) => (n === 0 ? t('grow.calc.debtExtra.none') : `+${fmt.money(n, cur)}`);
  const rate = fmt.rate(row.apr ?? null);

  const sooner = (n: number) => t('grow.calc.payoff.debtFreeValue', { count: n });
  const isNow = extra === line.extra;

  const rowsForSheet = (): ChangeRow[] => {
    if (result === null) return [];
    // P3-WR-14: when the payment now never clears the debt there is no "before" date or interest to show.
    const out: ChangeRow[] = [
      { key: 'payment', label: t('grow.calc.debtExtra.paymentRow', { name: row.name }), before: cents(line.point.minimum + line.extra), after: cents(result.eachMonth) },
      { key: 'paidoff', label: t('grow.calc.debtExtra.paidOff'), before: nowResult === null ? '—' : fmt.monthYear(nowResult.endDate), after: fmt.monthYear(result.endDate) },
      { key: 'interest', label: t('grow.calc.debtExtra.interestFrom'), before: nowResult === null ? '—' : cents(nowResult.interest), after: cents(result.interest) },
    ];
    if (result.sharePercent !== null && nowResult !== null && nowResult.sharePercent !== null) {
      out.push({ key: 'share', label: t('grow.calc.debtExtra.shareRow'), before: `${nowResult.sharePercent}%`, after: `${result.sharePercent}%` });
    }
    return out;
  };

  const confirm = () => {
    if (result === null || read.userId === null || saved.current) return;
    const ownerId = read.userId;
    try {
      const accountId = extra > 0 ? payAccountId(row, accounts) : null;
      if (extra > 0 && accountId === null) throw new RangeError('no account');
      // P3-WR-03 (D-34): one debt carries the extra. save_debt_plan stops it on any other debt in the same undo step.
      const { stepId } = planSave.save({
        ownerId,
        debt: row,
        extra,
        order: line.order,
        paidFromAccountId: accountId,
        seriesName: fitLineName(t, 'grow.debts.extraSeriesName', row.name),
      });
      saved.current = true;
      hapticLight();
      setConfirming(false);
      showToast({
        kind: 'ordinary',
        text: { key: 'grow.calc.debtExtra.planSavedToast', params: { amount: cents(result.eachMonth), date: fmt.monthYear(result.endDate) } },
        stepId,
      });
      router.back();
    } catch {
      setConfirming(false);
      showToast({ kind: 'refusal', text: { key: 'grow.common.saveFailed' } });
    }
  };

  // P3-WR-14: the payment alone never clears this debt (noExtra is null): say so, with or without a clearing extra.
  const baseNeverClears = noExtra === null;
  const newPlanText = (r: NonNullable<typeof result>): string =>
    r.soonerMonths === null
      ? t('grow.calc.debtExtra.newPlanNoBase', { count: r.months, payment: cents(r.eachMonth) })
      : t('grow.calc.debtExtra.newPlan', {
          count: r.months,
          payment: cents(r.eachMonth),
          sooner: sooner(r.soonerMonths),
          date: noExtra === null ? '' : fmt.monthYear(noExtra.endDate),
        });

  const headline = result
    ? result.paidInOnePayment
      ? t('grow.calc.debtExtra.paidOffOnePayment')
      : fmt.monthYear(result.endDate)
    : null;

  return (
    <CalcPage title={t('grow.calc.debtExtra.title')}>
      <Text style={label}>{row.name}</Text>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
        {rate === null
          ? `${fmt.money(line.point.balance, cur)}`
          : t('grow.calc.debtExtra.subtitle', {
              owed: fmt.money(line.point.balance, cur),
              rate,
              payment: fmt.money(line.point.minimum, cur),
              day: fmt.ordinal(line.point.dueDay ?? Number(read.today.slice(8, 10))),
            })}
      </Text>

      <Text accessibilityRole="header" style={label}>{t('grow.calc.debtExtra.extraLabel')}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('grow.calc.debtExtra.extraLabel')}>
        {chipExtras.map((n) => (
          <Chip key={n} label={chipLabel(n)} selected={extra === n} onPress={() => setPicked(n)} />
        ))}
      </View>

      {result === null && baseNeverClears ? (
        // P3-WR-14: the figures come from the record, so "Fill in the numbers above" would be wrong; say why there is no date.
        <View accessibilityLiveRegion="polite" style={[styles.card, { backgroundColor: colors.surface, ...shadows.card }]}>
          <Text testID="debt-calc-never-clears" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {extra > 0 ? t('grow.calc.debtExtra.neverClearsExtra') : t('grow.calc.debtExtra.neverClears')}
          </Text>
        </View>
      ) : (
        <CalcResultCard
          value={headline}
          caption={t('grow.calc.debtExtra.paidOff')}
          announcement={
            result && !result.paidInOnePayment
              ? result.interestSaved === null
                ? t('grow.calc.debtExtra.paidOffA11yNoBase', { date: fmt.monthYear(result.endDate) })
                : t('grow.calc.debtExtra.paidOffA11y', { date: fmt.monthYear(result.endDate), saved: cents(result.interestSaved) })
              : undefined
          }
        >
          {result ? (
            <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
              {isNow ? t('grow.calc.debtExtra.nowPlan', { count: result.months, payment: cents(result.eachMonth) }) : newPlanText(result)}
            </Text>
          ) : null}
        </CalcResultCard>
      )}

      {result ? (
        <>
          <Card>
            <ValueRow first label={t('grow.calc.eachMonth')} value={cents(result.eachMonth)} />
            <ValueRow label={t('grow.calc.debtExtra.interestFrom')} value={cents(result.interest)} />
            <ValueRow label={t('grow.calc.debtExtra.interestSaved')} value={result.interestSaved !== null && result.interestSaved > 0 ? cents(result.interestSaved) : '—'} />
            <ValueRow
              label={t('grow.calc.debtExtra.lastPayment')}
              value={t('grow.calc.debtExtra.lastPaymentValue', { amount: cents(result.lastPayment), date: fmt.monthYear(result.endDate) })}
            />
            {result.sharePercent === null ? null : <ValueRow label={t('grow.calc.debtExtra.shareRow')} value={`${result.sharePercent}%`} />}
          </Card>
          {month.rule !== null ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.calc.debtExtra.lineNote', { rule: month.rule })}</Text> : null}

          <Text accessibilityRole="header" style={label}>{t('grow.calc.debtExtra.orderTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.calc.debtExtra.orderNote')}</Text>
          <View style={styles.link}>
            <Pill label={t('grow.calc.debtExtra.moreDebts')} variant="secondary" onPress={() => pushOnce('/grow/calculators/payoff' as Href)} />
          </View>

          {isNow ? (
            <Text testID="debt-calc-plan-now" style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
              {t('grow.calc.planNow')}
            </Text>
          ) : (
            <Pill label={t('grow.calc.makePlan')} variant="primary" onPress={() => setConfirming(true)} />
          )}
        </>
      ) : null}
      <FooterNote text={t('grow.calc.debtExtra.footer')} />

      <MakePlanSheet
        visible={confirming && result !== null}
        rows={rowsForSheet()}
        lineNote={month.rule !== null ? t('grow.calc.debtExtra.lineNote', { rule: month.rule }) : undefined}
        note={result ? t('grow.calc.debtExtra.confirmNote', { date: fmt.dayMonth(ctx.firstDate), amount: cents(extra) }) : undefined}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      />
    </CalcPage>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  link: { flexDirection: 'row' },
});

