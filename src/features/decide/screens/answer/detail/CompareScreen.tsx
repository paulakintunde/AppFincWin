// 06.1-20 (N16 / D62, UX-10, UX-13, CMP-F15): "Cash or installments", side by side. Both answers come from judgeBoth through
// useCheckEngine().both(): each side carries its own engine verdict and its own figures. The two columns share one style set; neither
// is highlighted or ordered as the better one (T-06.1-20-01). The Interest and fees row is always drawn, "None" for cash (T-06.1-20-02).
// Above 1.3x text scale the two sides stack. Reached from the answer's "Cash and installments side by side".
// 06.1-63 (CB-4, CN-8): drawn in DetailScreen, so the title "Cash or installments" sits in the header with a Back and the insets.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { BothResults, CheckV2, Evaluation } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { space } from '@/theme/layout';
import { useFontScale } from '@/theme/FontScaleProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { Text } from '@/ui/Text';
import { LegalBlock } from '../LegalBlock';
import { Card, useDetailFormat, useVerdictOf, type DetailFormat } from './detailKit';
import { fullCostFigures } from './FullCostSheet';

/** Above this text scale the two sides stack, one under the other. */
export const STACK_SCALE = 1.3;

export type CompareSide = 'cash' | 'installments';

export interface CompareScreenProps {
  check: CheckV2;
  currency: string;
  /** Only `both` is used: judgeBoth on the held Prepared. */
  engine: { both: () => BothResults | null };
  onSeeAnswer: (side: CompareSide) => void;
  onCantSee: () => void;
}

interface SideFigures {
  word: string;
  tone: keyof typeof stateColors;
  glyph: React.ComponentProps<typeof StateGlyph>['name'];
  upFront: number;
  /** null for cash. */
  each: { amount: number; count: number } | null;
  inAll: number;
  interest: number | null;
  usualLeaves: number;
}

function figuresOf(evaluation: Evaluation, check: CheckV2, plan: boolean, verdict: ReturnType<typeof useVerdictOf>): SideFigures {
  const v = verdict(evaluation);
  const { afterBuy } = evaluation.result;
  const schedule = evaluation.purchase?.schedule ?? null;
  const cost = fullCostFigures(evaluation, check);
  return {
    word: v.word,
    tone: v.tone,
    glyph: v.glyph,
    upFront: evaluation.purchase?.dayOne ?? 0,
    each: plan && schedule !== null ? { amount: schedule.payment + schedule.fees.perPeriod, count: schedule.lastPaying } : null,
    inAll: cost.total,
    interest: plan ? (cost.planCost ?? 0) : null,
    usualLeaves: afterBuy.usualMonth ?? afterBuy.before,
  };
}

export function CompareScreen({ check, currency, engine, onSeeAnswer, onCantSee }: CompareScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const fontScale = useFontScale();
  const f = useDetailFormat(currency, true);
  const verdict = useVerdictOf();
  const k = (key: string, values?: Record<string, string | number>): string => String(t(`decide.screens.answerDetail.sideBySide.${key}` as never, values as never));
  const both = React.useMemo(() => engine.both(), [engine]);
  const stacked = fontScale > STACK_SCALE;

  const cash = both === null ? null : figuresOf(both.cash, check, false, verdict);
  const plan = both === null || both.plan === null ? null : figuresOf(both.plan, check, true, verdict);

  const rows: { key: string; label: string; cash: string; plan: string; cashSpoken: string; planSpoken: string }[] = [];
  if (cash !== null) {
    const none = k('interestNone');
    const planEach = plan?.each ?? null;
    const eachText = (e: SideFigures['each'], spoken: boolean): string =>
      e === null ? '—' : k('times', { amount: spoken ? f.spoken(e.amount) : f.money(e.amount), count: e.count });
    const money = (n: number | null, spoken: boolean): string => (n === null ? '—' : spoken ? f.spoken(n) : f.money(n));
    rows.push(
      { key: 'upFront', label: k('upFront'), cash: money(cash.upFront, false), plan: money(plan?.upFront ?? null, false), cashSpoken: money(cash.upFront, true), planSpoken: money(plan?.upFront ?? null, true) },
      { key: 'eachMonth', label: k('eachMonth'), cash: eachText(null, false), plan: eachText(planEach, false), cashSpoken: eachText(null, true), planSpoken: eachText(planEach, true) },
      { key: 'inAll', label: k('inAll'), cash: money(cash.inAll, false), plan: money(plan?.inAll ?? null, false), cashSpoken: money(cash.inAll, true), planSpoken: money(plan?.inAll ?? null, true) },
      {
        key: 'interest',
        label: k('interest'),
        cash: none,
        plan: plan === null ? '—' : money(plan.interest, false),
        cashSpoken: none,
        planSpoken: plan === null ? '—' : money(plan.interest, true),
      },
      { key: 'usual', label: k('usualLeaves'), cash: signed(f, cash.usualLeaves, false, t), plan: plan === null ? '—' : signed(f, plan.usualLeaves, false, t), cashSpoken: signed(f, cash.usualLeaves, true, t), planSpoken: plan === null ? '—' : signed(f, plan.usualLeaves, true, t) }
    );
  }

  const head = { ...textRole(pairing, 'bodyStrong'), color: colors.ink };
  const small = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const cell = { ...textRole(pairing, 'body'), color: colors.ink, fontVariant: ['tabular-nums' as const] };

  const answerCell = (s: SideFigures | null, testID: string): React.ReactNode =>
    s === null ? (
      <Text style={cell}>—</Text>
    ) : (
      <View testID={testID} style={styles.word}>
        <StateGlyph name={s.glyph} color={stateColors[s.tone].color} size={16} />
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: stateColors[s.tone].color }}>{s.word}</Text>
      </View>
    );

  const sideName = { cash: k('cash'), plan: k('installments') };
  const group = (label: string, cashNode: React.ReactNode, planNode: React.ReactNode, key: string, spoken: string): React.ReactNode => (
    <View key={key} testID={`compare-row-${key}`} accessible accessibilityLabel={spoken} style={[styles.rowGroup, { borderTopColor: colors.line2 }]}>
      <Text style={small}>{label}</Text>
      <View style={stacked ? styles.cellsStacked : styles.cells}>
        <View testID={`compare-cash-${key}`} style={styles.cell}>
          {stacked ? <Text style={small}>{sideName.cash}</Text> : null}
          {cashNode}
        </View>
        {plan !== null ? (
          <View testID={`compare-plan-${key}`} style={styles.cell}>
            {stacked ? <Text style={small}>{sideName.plan}</Text> : null}
            {planNode}
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <DetailScreen title={k('title')}>
      <View testID="compare-screen" style={styles.content}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{plan === null ? k('noPlan') : k('sub')}</Text>
        {cash === null ? (
          <Text testID="compare-not-ready" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
            {k('noRecords')}
          </Text>
        ) : (
          <Card testID="compare-table">
            <View role="grid" accessibilityLabel={k('tableA11y')}>
              {!stacked ? (
                <View testID="compare-head" style={styles.cells}>
                  <Text style={[head, styles.cell]}>{sideName.cash}</Text>
                  {plan !== null ? <Text style={[head, styles.cell]}>{sideName.plan}</Text> : null}
                </View>
              ) : null}
              {group(
                k('answer'),
                answerCell(cash, 'compare-cash-word'),
                answerCell(plan, 'compare-plan-word'),
                'answer',
                `${k('answer')}, ${sideName.cash}, ${cash.word}${plan === null ? '' : `, ${sideName.plan}, ${plan.word}`}`
              )}
              {rows.map((r) =>
                group(r.label, <Text style={cell}>{r.cash}</Text>, <Text style={cell}>{r.plan}</Text>, r.key, `${r.label}, ${sideName.cash}, ${r.cashSpoken}${plan === null ? '' : `, ${sideName.plan}, ${r.planSpoken}`}`)
              )}
            </View>
          </Card>
        )}
        <View style={stacked ? styles.cellsStacked : styles.cells}>
          <View style={styles.cell}>
            <Pill label={k('seeCash')} variant="secondary" onPress={() => onSeeAnswer('cash')} />
          </View>
          {plan !== null ? (
            <View style={styles.cell}>
              <Pill label={k('seeInstallments')} variant="secondary" onPress={() => onSeeAnswer('installments')} />
            </View>
          ) : null}
        </View>
        <LegalBlock basis={null} caveat={null} caveatFigures={[]} onCantSee={onCantSee} />
      </View>
    </DetailScreen>
  );
}

/** A figure that can be below zero reads "{{amount}} short" (UX-30). */
function signed(f: DetailFormat, n: number, spoken: boolean, t: ReturnType<typeof useT>): string {
  if (n >= 0) return spoken ? f.spoken(n) : f.money(n);
  return String(t('decide.screens.answerDetail.monthByMonth.shortBy' as never, { amount: spoken ? f.spoken(-n) : f.money(-n) } as never));
}

const styles = StyleSheet.create({
  content: { paddingTop: space.groupGap, gap: space.gapMd },
  rowGroup: { gap: space.gapSm, paddingVertical: space.gapSm, borderTopWidth: StyleSheet.hairlineWidth },
  cells: { flexDirection: 'row', gap: space.gapMd },
  cellsStacked: { gap: space.gapSm },
  cell: { flex: 1, flexShrink: 1, gap: 2 },
  word: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
