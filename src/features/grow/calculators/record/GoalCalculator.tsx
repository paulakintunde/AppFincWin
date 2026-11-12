// 06-19 GC02 (D-17): the goal calculator. "Each month" and "Reaches by" are two linked fields: change one and the other follows.
// The figures come from goalCalcModel (engine goalPlanByMonthly / goalPlanByDate, "needed each month" rounded UP). Nothing is
// saved until the user confirms "Make this the plan" (D-20), which goes through useSaveGoalPlan (one save, one Undo).
import React, { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSaveGoalPlan } from '@/data/mutations/growGoals';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useDecideSettings } from '@/data/queries/decide';
import { currencyExponent } from '@/engine/money';
import { useT } from '@/i18n';
import { lastDayOfMonth } from '@/features/decide/pots/potsModel';
import { useDebtMonth } from '@/features/grow/debts/debtScreenData';
import { goalSeriesOf, seriesPayload } from '@/features/grow/goals/GoalPlanEditSheet';
import { monthStartFromText, planAnchor } from '@/features/grow/goals/goalPlanModel';
import { useGoalToast } from '@/features/grow/goals/useGoalToast';
import { useGoalsRead } from '@/features/grow/goals/useGoalsRead';
import { CalcResultCard } from '@/features/grow/ui/CalcResultCard';
import { type ChangeRow } from '@/features/grow/ui/ChangeRows';
import { HowWorkedOutBox } from '@/features/grow/ui/HowWorkedOutBox';
import { LinkedPairFields } from '@/features/grow/ui/LinkedPairFields';
import { Stepper } from '@/features/grow/ui/Stepper';
import { usePastContext } from '@/features/decide/past/usePastDecisions';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { showToast } from '@/state/undoToast';
import { Chip } from '@/ui/Chip';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { useAmountParser } from '@/ui/money/useAmountParser';
import { CalcPage, Card, FooterNote, ValueRow, useCalcFormat } from '../typed/CalcFields';
import { useDebounced } from '../typed/useCalcInput';
import { MakePlanSheet } from './MakePlanSheet';
import { goalCalcModel, type GoalCalcChoice } from './recordCalcModels';

/** Whole months ahead (from the first deposit) offered as "Or reach it by" chips. */
export const DATE_CHIP_MONTHS = [12, 24, 36] as const;
const STEP_UNITS = 25;

function addMonths(month: string, n: number): string {
  const total = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function GoalCalculator({ id }: { id: string }) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const { fontScale } = useWindowDimensions();
  const calc = useCalcFormat();
  const parser = useAmountParser();
  const read = useGoalsRead();
  const { userId, householdId, today, formatDate } = usePastContext();
  const rows = useSavingsGoalRows(userId ?? undefined, householdId ?? undefined).data;
  const seriesRows = useRecurringSeries(householdId ?? undefined).data;
  const settings = useDecideSettings(userId ?? undefined).data ?? null;
  const month = useDebtMonth();
  const { save } = useSaveGoalPlan();
  const toast = useGoalToast();

  const row = rows?.find((r) => r.id === id && r.deleted_at === null) ?? null;
  const point = read.model.goals.find((g) => g.id === id) ?? null;
  const series = goalSeriesOf(seriesRows, id);
  const currentMonthly = point?.monthlyAmount ?? 0;

  const [lastEdited, setLastEdited] = useState<'first' | 'second'>('first');
  // P3-WR-12: until the user types, "Each month" follows the goal's current amount, so a goal that arrives after the first
  // render (cold start, deep link) still fills it in. null = not typed yet.
  const [typedFirst, setFirstText] = useState<string | null>(null);
  const firstText = typedFirst ?? (currentMonthly > 0 ? parser.toInputText(currentMonthly, calc.currency) : '');
  const [secondText, setSecondText] = useState('');
  const [confirming, setConfirming] = useState(false);

  const anchor = planAnchor(today);
  const exp = currencyExponent(calc.currency);
  const step = STEP_UNITS * 10 ** exp;

  const typed = useDebounced({ lastEdited, firstText, secondText });
  const choice = useMemo<GoalCalcChoice | null>(() => {
    if (typed.lastEdited === 'first') {
      const p = parser.parse(typed.firstText, calc.currency);
      return p.ok && p.value > 0 ? { monthly: p.value } : null;
    }
    const start = monthStartFromText(typed.secondText);
    return start === null ? null : { byDate: start.slice(0, 7) };
  }, [typed, parser, calc.currency]);

  const ctx = useMemo(
    () =>
      row === null || point === null
        ? null
        : {
            saved: point.saved,
            target: row.target,
            anchor,
            currentMonthly,
            intoGoals: read.model.monthlyIntoGoals,
            leftInUsualMonth: month.left,
            savingLine: settings?.saving_floor ?? null,
          },
    [row, point, anchor, currentMonthly, read.model.monthlyIntoGoals, month.left, settings?.saving_floor]
  );
  const result = useMemo(() => (ctx === null || choice === null ? null : goalCalcModel(ctx, choice)), [ctx, choice]);
  const nowResult = useMemo(() => (ctx === null || currentMonthly <= 0 ? null : goalCalcModel(ctx, { monthly: currentMonthly })), [ctx, currentMonthly]);

  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted };

  if (row === null || point === null || ctx === null || row.target === null || row.currency !== calc.currency) {
    return (
      <CalcPage title="">
        <View style={[styles.card, { backgroundColor: colors.surface, ...shadows.card }]} testID={read.status === 'loading' || rows === undefined ? 'goal-calc-loading' : 'goal-calc-missing'}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
            {rows === undefined || read.status === 'loading' ? t('grow.home.loading') : t('grow.common.notFoundBody')}
          </Text>
        </View>
      </CalcPage>
    );
  }

  const target = row.target;
  const money = calc.money;
  const longDate = (date: string) => calc.monthYear(date);
  const mmYyyy = (date: string) => `${date.slice(5, 7)}/${date.slice(0, 4)}`;

  const monthlyShown = lastEdited === 'first' ? firstText : result ? parser.toInputText(result.monthly, calc.currency) : '';
  const reachesShown = lastEdited === 'second' ? secondText : result ? mmYyyy(result.reachesOn) : '';
  const derivedAnnouncement = result
    ? lastEdited === 'first'
      ? `${t('grow.calc.goal.reachesBy', { target: money(target) })} ${longDate(result.reachesOn)}`
      : `${t('grow.calc.goal.eachMonth')} ${money(result.monthly)}`
    : undefined;

  const setMonthly = (minor: number) => {
    setLastEdited('first');
    setFirstText(parser.toInputText(minor, calc.currency));
  };
  const pickMonth = (m: string) => {
    setLastEdited('second');
    setSecondText(`${m.slice(5, 7)}/${m.slice(0, 4)}`);
  };

  const left = target - point.saved;
  const worked: string[] = result
    ? [
        lastEdited === 'first'
          ? t('grow.calc.goal.workedAmount', { target: money(target), saved: money(point.saved), left: money(left), each: money(result.monthly), count: result.deposits, first: longDate(anchor), date: longDate(result.reachesOn) })
          : t('grow.calc.goal.workedDate', { first: longDate(anchor), date: longDate(result.reachesOn), count: result.deposits, left: money(left), each: money(result.monthly) }),
      ]
    : [];

  const rowsForSheet = (): ChangeRow[] => {
    if (result === null) return [];
    const out: ChangeRow[] = [
      { key: 'monthly', label: t('grow.calc.eachMonth'), before: currentMonthly > 0 ? money(currentMonthly) : '—', after: money(result.monthly) },
      {
        key: 'reaches',
        label: t('grow.calc.goal.reaches', { target: money(target) }),
        before: nowResult === null ? '—' : longDate(nowResult.reachesOn),
        after: longDate(result.reachesOn),
      },
      { key: 'into', label: t('grow.calc.intoGoals'), before: money(ctx.intoGoals), after: money(result.intoGoals) },
    ];
    if (result.left !== null && ctx.leftInUsualMonth !== null) {
      out.push({ key: 'left', label: t('grow.calc.leftUsual'), before: money(ctx.leftInUsualMonth), after: money(result.left) });
    }
    return out;
  };

  const confirm = () => {
    if (result === null || userId === null) return;
    const byDate = lastEdited === 'second' && choice !== null && 'byDate' in choice ? choice.byDate : null;
    try {
      const fields = byDate === null ? { monthly_amount: result.monthly } : { monthly_amount: result.monthly, ready_by: lastDayOfMonth(byDate) };
      const { stepId } = save({ ownerId: userId, existing: row, fields, series: series === null ? null : seriesPayload(series, result.monthly) });
      hapticLight();
      setConfirming(false);
      toast({
        key: 'grow.calc.goal.planSavedToast',
        params: { each: money(result.monthly), target: money(target), date: longDate(result.reachesOn) },
        stepId,
        undoLabel: 'goalPlanChanged',
        name: row.name,
        userId,
        householdId,
      });
      router.back();
    } catch {
      setConfirming(false);
      showToast({ kind: 'refusal', text: { key: 'grow.common.saveFailed' } });
    }
  };

  const chips = DATE_CHIP_MONTHS.map((n) => addMonths(anchor.slice(0, 7), n - 1));
  const nowMonth = nowResult === null ? null : nowResult.reachesOn.slice(0, 7);
  const selectedMonth = lastEdited === 'second' && choice !== null && 'byDate' in choice ? choice.byDate : null;

  return (
    <CalcPage title={row.name}>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
        {t('grow.calc.goal.subtitle', { saved: money(point.saved), target: money(target), left: money(left) })}
      </Text>
      <Text accessibilityRole="header" style={label}>{t('grow.calc.goal.pairTitle')}</Text>
      <LinkedPairFields
        first={{ label: t('grow.calc.goal.eachMonth'), value: monthlyShown, onChangeText: (v) => { setLastEdited('first'); setFirstText(v); } }}
        second={{
          label: t('grow.calc.goal.reachesBy', { target: money(target) }),
          value: reachesShown,
          onChangeText: (v) => { setLastEdited('second'); setSecondText(v); },
          keyboardType: 'default',
          placeholder: 'MM/YYYY',
        }}
        lastEdited={lastEdited}
        derivedAnnouncement={derivedAnnouncement}
      />
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.calc.goal.pairNote')}</Text>

      <Stepper
        value={result ? result.monthly : 0}
        step={step}
        min={0}
        onChange={setMonthly}
        valueText={result ? money(result.monthly) : money(0)}
        accessibilityLabel={t('grow.calc.goal.stepperLabel')}
        decrementLabel={`${t('grow.calc.goal.stepperLabel')} −`}
        incrementLabel={`${t('grow.calc.goal.stepperLabel')} +`}
        stacked={fontScale > 1.3}
      />

      <Text accessibilityRole="header" style={label}>{t('grow.calc.goal.orReachBy')}</Text>
      <View style={styles.chips}>
        {chips.map((m) => (
          <Chip key={m} label={longDate(`${m}-01`)} selected={selectedMonth === m} onPress={() => pickMonth(m)} />
        ))}
        {nowMonth !== null && !chips.includes(nowMonth) ? (
          <Chip label={t('grow.calc.goal.currentDate', { date: longDate(`${nowMonth}-01`) })} selected={selectedMonth === nowMonth} onPress={() => pickMonth(nowMonth)} />
        ) : null}
      </View>

      <CalcResultCard
        value={result ? (lastEdited === 'first' ? longDate(result.reachesOn) : money(result.monthly)) : null}
        caption={result ? (lastEdited === 'first' ? t('grow.calc.goal.reachesBy', { target: money(target) }) : t('grow.calc.goal.eachMonth')) : undefined}
        announcement={derivedAnnouncement}
      />

      {result ? (
        <>
          <Text accessibilityRole="header" style={label}>{t('grow.calc.changesTitle')}</Text>
          <Card>
            <ValueRow first label={t('grow.calc.intoGoals')} value={money(result.intoGoals)} />
            {result.left === null ? null : <ValueRow label={t('grow.calc.leftUsual')} value={money(result.left)} />}
          </Card>
          {result.belowSavingLine && ctx.savingLine !== null ? (
            <Text testID="goal-calc-line-note" style={{ ...textRole(pairing, 'label'), color: colors.warn1 }}>
              {t('grow.calc.lineNote', { rule: money(ctx.savingLine), amount: money(result.intoGoals) })}
            </Text>
          ) : null}
          <HowWorkedOutBox lines={worked} />
          {result.isCurrentPlan ? (
            <Text testID="goal-calc-plan-now" style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
              {t('grow.calc.planNow')}
            </Text>
          ) : (
            <Pill label={t('grow.calc.makePlan')} variant="primary" onPress={() => setConfirming(true)} />
          )}
        </>
      ) : null}
      <FooterNote text={t('grow.calc.goal.footer')} />

      <MakePlanSheet
        visible={confirming && result !== null}
        rows={rowsForSheet()}
        note={result ? t('grow.calc.goal.confirmNote', { date: formatDate(anchor) }) : undefined}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      />
    </CalcPage>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});

