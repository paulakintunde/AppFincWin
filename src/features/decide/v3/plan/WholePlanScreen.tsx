// 05.3-28 (DSV-09): "The whole plan". Every figure is planModel's (Purchase.schedule and PlanCard); this screen formats and lays out,
// it computes nothing. D-11: an implied rate over the cap reads "over 999%", never the engine's internal maximum.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useCheckV3 } from '@/data/queries/decideCheckV3';
import { readStoredCheck } from '@/engine/decide/v3';
import { useLooseT } from '@/features/decide/v3/check/useLooseT';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { useShouldStack } from '../../ui/textFit';
import { V3NotFound } from '../nav/V3NotFound';
import { V3Skeleton } from '../nav/V3Skeleton';
import { planModel, type CadenceWord, type PlanModel, type PlanRow } from '../model/planModel';
import { useV3Format } from '../shared/useV3Format';
import { PlanMixBar } from './PlanMixBar';
import { PlanSummaryCard } from './PlanSummaryCard';

const KEY = 'decide.v3.ui.plan';
const EVERY_WORD: Record<Exclude<CadenceWord, 'other'>, string> = {
  week: 'decide.v3.ui.record.everyWeek',
  twoWeeks: 'decide.v3.ui.record.everyTwoWeeks',
  month: 'decide.v3.ui.record.everyMonth',
};
const CARD_PAD_H = 18;
const CARD_PAD_V = 4;
const ROW_MIN = 44;
const RULE = 2;
const NOTE_PAD_V = 12;
const NOTE_PAD_H = 14;
const NOTE_RADIUS = 16;
const FIT_MIN = 0.8;

function Figure({ text, big, color }: { text: string; big?: boolean; color: string }): React.JSX.Element {
  const { fonts } = useTheme();
  return (
    <Text
      scale={big ? 'capped' : 'body'}
      numberOfLines={1} adjustsFontSizeToFit minimumFontScale={FIT_MIN}
      style={{ fontFamily: fonts.body[700],fontSize: big ? fontSize.heading : fontSize.body, lineHeight: (big ? fontSize.heading : fontSize.body) * (big ? 1.16 : 1.5), color }}
    >
      {text}
    </Text>
  );
}

export function WholePlanScreen({ id }: { id: string }): React.JSX.Element {
  const { status, row, evaluation } = useCheckV3(id);
  if (status === 'loading') return <V3Skeleton />;
  if (status === 'error' || row === null || evaluation === null || evaluation.purchase === null) return <V3NotFound />;
  return <PlanBody name={row.name} inputs={row.inputs} evaluation={evaluation} />;
}

function PlanBody({ name, inputs, evaluation }: { name: string; inputs: unknown; evaluation: NonNullable<ReturnType<typeof useCheckV3>['evaluation']> }): React.JSX.Element {
  const t = useLooseT();
  const f = useV3Format();
  const { colors, fonts } = useTheme();
  const stack = useShouldStack();
  const check = readStoredCheck(inputs).check;
  const pay = check.pay;
  const model: PlanModel | null = evaluation.purchase === null ? null : planModel({
    purchase: evaluation.purchase,
    planCard: evaluation.planCard,
    quoted: evaluation.quoted,
    taxPercent: check.taxPercent,
    rate: pay.mode === 'plan' ? pay.apr : null,
    deposit: pay.mode === 'plan' ? pay.deposit : undefined,
  });
  if (model === null) return <V3NotFound />;

  const s = model.summary;
  const every = s.cadenceWord === 'other'
    ? t((s.cadence.unit === 'week' ? `${KEY}.everyNWeeks` : `${KEY}.everyNMonths`), { n: s.cadence.every })
    : t(EVERY_WORD[s.cadenceWord]);
  const ends = f.monthYear(s.endsYm);
  const caption = t(`${KEY}.caption`, { count: s.count, every });
  const a11yLabel = t(`${KEY}.cardA11y`, {
    count: s.count,
    payment: f.moneyA11y(Number(s.payment)),
    every,
    perMonth: f.moneyA11y(Number(s.perMonth)),
    date: ends,
  });
  const rowText = (r: PlanRow): string => t(r.labelKey, r.labelParams);
  const textStyle = { fontFamily: fonts.body[500], fontSize: fontSize.body, lineHeight: fontSize.body * 1.5, color: colors.ink };

  const line = (label: string, figure: React.JSX.Element, key: string, last: boolean): React.JSX.Element => (
    <View
      key={key}
      style={[
        stack ? styles.rowStack : styles.rowSide,
        { borderBottomColor: colors.line1, borderBottomWidth: last ? 0 : 1 },
      ]}
    >
      <Text style={[textStyle, styles.label]}>{label}</Text>
      {figure}
    </View>
  );

  return (
    <DetailScreen title={t(`${KEY}.header`, { item: name })}>
      <View style={styles.body}>
        <PlanSummaryCard
          caption={caption}
          payment={f.money(Number(s.payment))}
          perMonthEnds={t(`${KEY}.perMonthEnds`, { amount: f.money(Number(s.perMonth)), date: ends })}
          running={s.running > 0 ? t(`${KEY}.running`, { amount: f.money(Number(s.running)) }) : null}
          a11yLabel={a11yLabel}
        />
        <View style={[styles.rows, { backgroundColor: colors.surface }]}>
          {model.rows.map((r, i) =>
            line(rowText(r), <Figure text={f.money(Number(r.amount))} color={colors.ink} />, `${i}`, false),
          )}
          <View style={[stack ? styles.totalStack : styles.totalSide, { borderTopColor: colors.ink, borderTopWidth: RULE }]}>
            <Text style={[textStyle, styles.label, { fontFamily: fonts.body[600], fontSize: fontSize.sheetTitle, lineHeight: fontSize.sheetTitle * 1.2 }]}>
              {t(`${KEY}.total`, { count: model.total.months })}
            </Text>
            <Figure big text={f.money(Number(model.total.amount))} color={colors.ink} />
          </View>
        </View>
        <PlanMixBar mix={model.mix} />
        <View style={[styles.note, { backgroundColor: colors.fill2 }]}>
          <Text style={{ fontFamily: fonts.body[500], fontSize: fontSize.s13_5, lineHeight: fontSize.s13_5 * 1.5, color: colors.inkDim }}>{t(`${KEY}.note`)}</Text>
          {model.quotedDiffers === null ? null : (
            <Text style={{ fontFamily: fonts.body[500], fontSize: fontSize.s13_5, lineHeight: fontSize.s13_5 * 1.5, color: colors.warn1 }}>
              {t('decide.v3.fact.quoted_differs', {
                quoted: f.money(Number(model.quotedDiffers.quoted)),
                computed: f.money(Number(model.quotedDiffers.computed)),
              })}
            </Text>
          )}
        </View>
        <Pill variant="primary" label={t(`${KEY}.back`)} onPress={() => router.back()} />
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingTop: space.gapSm },
  rows: { borderRadius: radii.card, paddingHorizontal: CARD_PAD_H, paddingVertical: CARD_PAD_V },
  rowSide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd, minHeight: ROW_MIN, paddingVertical: space.gapSm },
  rowStack: { gap: 2, minHeight: ROW_MIN, paddingVertical: space.gapSm },
  totalSide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd, minHeight: ROW_MIN, paddingVertical: space.gapMd },
  totalStack: { gap: 2, minHeight: ROW_MIN, paddingVertical: space.gapMd },
  label: { flexShrink: 1 },
  note: { borderRadius: NOTE_RADIUS, paddingVertical: NOTE_PAD_V, paddingHorizontal: NOTE_PAD_H, gap: space.gapSm },
});
