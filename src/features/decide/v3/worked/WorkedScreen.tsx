/**
 * 05.3-30 (UI-SPEC How this was worked out, DSV-11): the month line by line, the last six months, the regular payments
 * counted, and what the figures assume. Every figure comes from workedModel over the same home Evaluation the answer uses,
 * so the result row equals the engine's monthLeft (T-05.3-30-01). The footer is legal.decideFooter (T-05.3-30-02).
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useChecksV3 } from '@/data/queries/decideCheckV3';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import type { Evaluation, V3Inputs } from '@/engine/decide/v3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { LabelValueRow } from '../../ui/LabelValueRow';
import { useShouldStack } from '../../ui/textFit';
import { V3Skeleton } from '../nav/V3Skeleton';
import { workedModel } from '../model/workedModel';
import { useV3Format } from '../shared/useV3Format';
import { SixMonthBars } from './SixMonthBars';

const REGULAR_STEP_HREF = '/decide/setup?only=regular' as Href;
const FIGURE_MIN_FONT_SCALE = 0.8;
const RULE = 2;
type Translate = (key: string, options?: Record<string, unknown>) => string;

export function WorkedScreen(): React.JSX.Element {
  const checks = useChecksV3();
  const rc = useRecordContext();
  const series = useRecurringSeries(rc.householdId ?? undefined).data;
  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of series ?? []) m[s.id] = s.name;
    return m;
  }, [series]);
  if (checks.home === null || checks.inputs === null) return <V3Skeleton />;
  return <WorkedBody evaluation={checks.home} inputs={checks.inputs} names={names} />;
}

export interface WorkedBodyProps {
  evaluation: Pick<Evaluation, 'month'>;
  inputs: V3Inputs;
  names: Readonly<Record<string, string>>;
}

export function WorkedBody({ evaluation, inputs, names }: WorkedBodyProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const stack = useShouldStack();
  const K = 'decide.v3.ui.worked.';
  const w = workedModel(evaluation, inputs, names);
  const m = evaluation.month;

  const minus = '−';
  const resultText = (w.result.negative ? minus : '') + f.money(Math.abs(Number(w.result.amount)));
  const resultA11y = (w.result.negative ? minus : '') + f.moneyA11y(Math.abs(Number(w.result.amount)));
  const resultLabel = t(`${K}result`, { month: f.month(w.result.month) });

  const hasPay = inputs.series.some((s) => s.role === 'pay' && s.confirmed && s.status !== 'dismissed');
  const monthEnd = `${m.month}-${String(m.daysInMonth).padStart(2, '0')}`;
  const assumptions: string[] = [
    t(`${K}assumeIncome`, { summary: t(`${K}${hasPay ? 'incomePay' : 'incomeRecords'}`) }),
    t(`${K}assumeEveryday`, { date: f.date(monthEnd) }),
    ...(inputs.unspent === null ? [] : [t(`${K}assumeUnspent`, { date: f.date(inputs.unspent.at), amount: f.money(Number(inputs.unspent.amount)) })]),
    t(`${K}assumeEmergency`),
    t(`${K}assumePlans`),
  ];

  return (
    <DetailScreen title={t(`${K}header`)}>
      <View style={styles.body}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {t(`${K}title`)}
          </Text>
          <View>
            {w.rows.map((r) => {
              const params = r.key.endsWith('.pay') ? { ...r.params, date: r.params['date'] === '' ? '' : f.date(String(r.params['date'])) } : r.params;
              const text = (r.deduct ? minus : '') + f.money(Number(r.amount));
              return (
                <LabelValueRow
                  key={r.key}
                  label={t(r.key, params)}
                  value={text}
                  a11yLabel={`${t(r.key, params)}, ${(r.deduct ? minus : '') + f.moneyA11y(Number(r.amount))}`}
                />
              );
            })}
          </View>
          <View style={[styles.rule, { borderTopColor: colors.ink }]} />
          <View accessible accessibilityLabel={`${resultLabel}, ${resultA11y}`} style={stack ? styles.resultStack : styles.result}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, flexShrink: 1 }}>{resultLabel}</Text>
            <Text
              scale="capped"
              testID="worked-result"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={FIGURE_MIN_FONT_SCALE}
              style={{ ...textRole(pairing, 'display'), fontSize: fontSize.sheetTitle, color: w.result.negative ? colors.danger : colors.accent }}
            >
              {resultText}
            </Text>
          </View>
        </View>

        {w.six.length === 0 ? null : (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
              {t(`${K}six`)}
            </Text>
            <SixMonthBars six={w.six} typical={w.typical} largest={w.largest} />
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {t(`${K}regularHeading`)}
          </Text>
          {w.regularEmpty ? (
            <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.body, color: colors.inkMuted }}>{t(`${K}noRegular`)}</Text>
          ) : null}
          {w.regular.length === 0 ? null : (
            <View>
              {w.regular.map((r, i) => (
                <LabelValueRow
                  key={`${r.name}-${i}`}
                  label={t(r.confirmed ? `${K}regularRow` : `${K}unconfirmedRow`, { name: r.name, day: r.day })}
                  value={f.money(Number(r.amount))}
                  a11yLabel={`${t(r.confirmed ? `${K}regularRow` : `${K}unconfirmedRow`, { name: r.name, day: r.day })}, ${f.moneyA11y(Number(r.amount))}`}
                />
              ))}
            </View>
          )}
          {w.regularEmpty ? (
            <View style={styles.action}>
              <Pill variant="secondary" label={t(`${K}confirmRegular`)} onPress={() => pushOnce(REGULAR_STEP_HREF)} />
            </View>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {t(`${K}assumes`)}
          </Text>
          {assumptions.map((a) => (
            <Text key={a} style={{ ...textRole(pairing, 'body'), fontSize: fontSize.body, color: colors.ink }}>
              {a}
            </Text>
          ))}
        </View>

        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('legal.decideFooter')}</Text>
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap },
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapMd },
  rule: { borderTopWidth: RULE },
  result: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.gapSm },
  resultStack: { gap: space.gapSm },
  action: { alignItems: 'flex-start' },
});
