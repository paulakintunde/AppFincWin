// 06.1-20: the parts the More detail sheets share. DetailShell is the app Sheet with a title, a scrolling body, the legal footer and a
// pinned Done. SignedBars draws one kind of figure per chart (UX-43): bars at or above the line grow up, bars below it grow down and
// the row under the chart says "short" in words (UX-30). Figures come in as props from the engine; nothing here computes money.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { verdictRowFor, type Evaluation } from '@/engine/decide/v3';
import { currencyCode, minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors, type StateTone } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import type { StateBadgeShape } from '@/ui/StateBadge';
import { stateForVerdict } from '../../logic/stateForVerdict';
import { leadFigure } from '../verdictValues';

export interface DetailFormat {
  /** "$1,200" */
  money: (minor: number) => string;
  /** "1,200 dollars" */
  spoken: (minor: number) => string;
  date: (localDate: string) => string;
  /** 'YYYY-MM' as "November 2026". */
  month: (yearMonth: string) => string;
}

export function useDetailFormat(currency: string, cents = false): DetailFormat {
  const fmt = useMoneyFormatter(cents);
  const { locale } = fmt;
  return React.useMemo(() => {
    const code = currencyCode(currency);
    return {
      money: (n) => fmt.formatMoney({ amount: minorUnits(n), currency: code }),
      spoken: (n) => fmt.formatMoneyA11y({ amount: minorUnits(n), currency: code }),
      date: (d) => fmt.formatDate(d),
      month: (ym) => {
        const [y, m] = ym.split('-').map(Number) as [number, number];
        return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, locale, fmt.formatMoney, fmt.formatDate]);
}

export interface DetailShellProps {
  title: string;
  sub?: string;
  /** legal.decideAnswer.footer, passed by the sheet so every sheet visibly carries it. */
  footer: string;
  /** An Instead or plan view: the caveat line and the cant-see link go above the footer (CO-D-64 (1)). */
  caveatLine?: boolean;
  onCantSee?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function DetailShell({ title, sub, footer, caveatLine = false, onCantSee, onClose, children }: DetailShellProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const body = { ...textRole(pairing, 'label'), color: colors.inkDim };
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.close')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        {sub !== undefined ? <Text style={body}>{sub}</Text> : null}
        {children}
        {caveatLine ? (
          <View testID="detail-caveat" style={styles.tail}>
            <Text style={body}>{t('legal.decideAnswer.caveat')}</Text>
            {onCantSee !== undefined ? (
              <Text testID="detail-cant-see" accessibilityRole="link" onPress={onCantSee} style={{ ...textRole(pairing, 'label'), color: colors.accent, minHeight: space.touchMin }}>
                {t('legal.decideAnswer.cantSeeLink')}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Text testID="detail-footer" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {footer}
        </Text>
      </SheetScroll>
      <Pill label={t('decide.screens.common.done')} variant="primary" onPress={onClose} />
    </Sheet>
  );
}

/** A grey card the rows sit on. */
export function Card({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.fill6 }]}>
      {children}
    </View>
  );
}

export interface BarItem {
  key: string;
  label: string;
  /** Signed minor units of the one figure this chart draws. */
  value: number;
}

const CHART_H = 96;
const BAR_W = 28;
const GAP = 12;
const BAR_RADIUS = 4;

/** Pure: where the zero line sits and how tall each bar is, from the largest figure either way. */
export function barGeometry(values: readonly number[], chartHeight: number): { zeroY: number; bars: { y: number; h: number; down: boolean }[] } {
  const up = Math.max(0, ...values);
  const down = Math.max(0, ...values.map((v) => -v));
  const span = up + down;
  if (span === 0) return { zeroY: chartHeight, bars: values.map(() => ({ y: chartHeight, h: 0, down: false })) };
  const zeroY = (up / span) * chartHeight;
  const bars = values.map((v) => {
    const h = (Math.abs(v) / span) * chartHeight;
    return v < 0 ? { y: zeroY, h, down: true } : { y: zeroY - h, h, down: false };
  });
  return { zeroY, bars };
}

export interface SignedBarsProps {
  items: readonly BarItem[];
  currency: string;
  chartLabel: string;
  testID?: string;
}

export function SignedBars({ items, currency, chartLabel, testID = 'signed-bars' }: SignedBarsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useDetailFormat(currency);
  const { zeroY, bars } = barGeometry(items.map((i) => i.value), CHART_H);
  const width = items.length * BAR_W + Math.max(0, items.length - 1) * GAP;
  const word = (v: number): string => (v < 0 ? t('decide.screens.answerDetail.monthByMonth.shortBy', { amount: f.money(-v) }) : f.money(v));
  const spoken = (v: number): string => (v < 0 ? t('decide.screens.answerDetail.monthByMonth.shortBy', { amount: f.spoken(-v) }) : f.spoken(v));
  return (
    <View testID={testID} style={styles.column}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chart}>
        <Svg width="100%" height={CHART_H} viewBox={`0 0 ${Math.max(width, 1)} ${CHART_H}`} preserveAspectRatio="none">
          {bars.map((b, i) => (
            <Rect
              key={items[i]!.key}
              testID={`${testID}-bar-${items[i]!.key}`}
              x={i * (BAR_W + GAP)}
              y={b.y}
              width={BAR_W}
              height={Math.max(b.h, b.h > 0 ? 1 : 0)}
              rx={BAR_RADIUS}
              fill={b.down ? stateColors.short.stroke : colors.accent}
            />
          ))}
          <Line x1={0} x2={Math.max(width, 1)} y1={zeroY} y2={zeroY} stroke={colors.line4} strokeWidth={1} />
        </Svg>
      </View>
      <View accessible accessibilityLabel={[chartLabel, ...items.map((i) => `${i.label}, ${spoken(i.value)}`)].join('. ')}>
        {items.map((i) => (
          <View key={i.key} testID={`${testID}-row-${i.key}`} style={[styles.row, { borderTopColor: colors.line2 }]}>
            <Text style={[textRole(pairing, 'body'), styles.rowLabel, { color: colors.ink }]}>{i.label}</Text>
            <Text
              scale="capped"
              style={{ ...textRole(pairing, 'label'), fontSize: fontSize.label, color: i.value < 0 ? stateColors.short.color : colors.ink, fontVariant: ['tabular-nums'] }}
            >
              {word(i.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd, paddingBottom: space.gapMd },
  tail: { gap: space.gapSm },
  card: { borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: space.gapSm },
  chart: { minHeight: CHART_H },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd, minHeight: space.touchMin, borderTopWidth: StyleSheet.hairlineWidth },
  rowLabel: { flex: 1, flexShrink: 1 },
});

/** The word, tone and glyph an Evaluation's answer reads as, with the figure its after-buy block leads with. */
export function useVerdictOf(): (evaluation: Evaluation) => { word: string; tone: StateTone; glyph: StateBadgeShape; left: number } {
  const t = useT();
  return (evaluation) => {
    const { code, variant } = evaluation.result;
    const once = evaluation.purchase === null || evaluation.purchase.schedule === null;
    const row = verdictRowFor(code, variant, once);
    const { tone, glyph } = stateForVerdict(code, variant);
    return { word: String(t(row.chipKey as never)), tone, glyph: glyph as StateBadgeShape, left: leadFigure(evaluation.result) };
  };
}
