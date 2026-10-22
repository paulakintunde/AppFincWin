// D-26: the 90-day cash path, hand-built on react-native-svg. Draws once with no animation (reduced
// motion needs nothing extra); the scrub cursor is optional. The text alternative is both the image
// accessibilityLabel and visible text below the chart, so colour is never the only cue.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { CashPathReport, MinorUnits } from '@/engine/decide';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { chartBox, indexAtX, markerPoint, pathFor, xTicks, yTicks } from './chartGeometry';

export const CHART_HEIGHT = 148;
const DEFAULT_WIDTH = 330;
const LINE_WIDTH = 2;
const DASH = '4 4';
const LABEL_W = 34;

export interface ChartMoney {
  /** Formats a whole-currency label (no cents) for the chart currency. */
  formatMoney(amount: MinorUnits): string;
  /** Currency exponent for tick rounding (2 for most currencies). */
  exponent?: number;
}

export interface CashPathChartProps {
  report: CashPathReport;
  reserve: MinorUnits;
  whole: ChartMoney;
  formatDate: (localDate: string) => string;
}

type Available = Extract<CashPathReport, { status: 'available' }>;

/** The calendar date of day index i, offset from the report's own dated lowest point. */
function dateOfDay(report: Available, i: number): string {
  const ref = report.lowestWith;
  const [y, m, d] = ref.date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + (i - ref.day))).toISOString().slice(0, 10);
}

function xOf(index: number, length: number, box: { x0: number; x1: number }): number {
  return length > 1 ? box.x0 + ((box.x1 - box.x0) * index) / (length - 1) : box.x0;
}

function Swatch({ dashed, color }: { dashed: boolean; color: string }) {
  return (
    <Svg width={18} height={8} importantForAccessibility="no-hide-descendants">
      <Line x1={0} x2={18} y1={4} y2={4} stroke={color} strokeWidth={LINE_WIDTH} strokeDasharray={dashed ? DASH : undefined} />
    </Svg>
  );
}

export function CashPathChart({ report, reserve, whole, formatDate }: CashPathChartProps) {
  const t = useT();
  const { colors } = useTheme();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [cursor, setCursor] = useState<number | null>(null);
  const available = report.status === 'available' ? report : null;
  const box = useMemo(() => chartBox({ width, height: CHART_HEIGHT }), [width]);
  const ticks = useMemo(
    () =>
      available ? yTicks([available.withPurchase, available.withoutPurchase], [reserve], whole.exponent ?? 2) : null,
    [available, reserve, whole.exponent]
  );
  const length = available?.withPurchase.length ?? 0;
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .withTestId('cash-path-scrub')
        .activeOffsetX([-8, 8])
        .failOffsetY([-12, 12])
        .onUpdate((e) => setCursor(indexAtX(e.x, length, box))),
    [length, box]
  );
  // WR-D07: a path needs two points to draw, scrub and label; a shorter one shows nothing rather than a broken readout.
  if (!available || !ticks || length < 2) return null;

  const withMark = markerPoint(available.lowestWith.day, available.withPurchase, box, ticks);
  const withoutMark = markerPoint(available.lowestWithout.day, available.withoutPurchase, box, ticks);
  const lowest = available.lowestWith.amount;
  const markFill = lowest < 0 ? colors.danger : lowest < reserve ? colors.warn1 : colors.ink;
  const yOf = (v: number) => box.y0 + ((ticks.max - v) / (ticks.max - ticks.min)) * (box.y1 - box.y0);
  const textAlt = t('decide.depth.cashPath.textAlt', {
    amount: whole.formatMoney(lowest),
    date: formatDate(available.lowestWith.date),
    amountWithout: whole.formatMoney(available.lowestWithout.amount),
    dateWithout: formatDate(available.lowestWithout.date),
  });
  const labelStyle = { fontSize: fontSize.tabLabel, color: colors.inkMuted };
  // WR-D07: each tick is labelled from its own day index (index 0 is today), so a path of any length is labelled with the
  // days it really shows.
  const xLabel = (day: number): string => (day === 0 ? t('decide.depth.cashPath.today') : t('decide.depth.cashPath.plusDays', { count: day }));
  const cur = cursor === null ? null : Math.min(cursor, length - 1);
  const curX = cur === null ? 0 : xOf(cur, length, box);

  return (
    <View>
      <Text style={[styles.readout, { fontSize: fontSize.meta, color: colors.inkMuted }]}>
        {cur === null
          ? ''
          : t('decide.depth.cashPath.scrub', {
              date: formatDate(dateOfDay(available, cur)),
              with: whole.formatMoney(available.withPurchase[cur] as MinorUnits),
              without: whole.formatMoney(available.withoutPurchase[cur] as MinorUnits),
            })}
      </Text>
      <View style={styles.legend}>
        <Swatch dashed={false} color={colors.ink} />
        <Text style={labelStyle}>{t('decide.depth.cashPath.legendWith')}</Text>
        <Swatch dashed color={colors.inkSoft1} />
        <Text style={labelStyle}>{t('decide.depth.cashPath.legendWithout')}</Text>
      </View>
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={textAlt}
          style={{ height: CHART_HEIGHT }}
          onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(120, e.nativeEvent.layout.width))}
        >
          <Svg width={width} height={CHART_HEIGHT} importantForAccessibility="no-hide-descendants">
            <Line x1={box.x0} x2={box.x1} y1={yOf(0)} y2={yOf(0)} stroke={colors.line3} strokeWidth={1} />
            {reserve > 0 ? (
              <Line
                x1={box.x0}
                x2={box.x1}
                y1={yOf(reserve)}
                y2={yOf(reserve)}
                stroke={colors.warn1}
                strokeWidth={1}
                strokeDasharray={DASH}
              />
            ) : null}
            <Path d={pathFor(available.withoutPurchase, box, ticks)} stroke={colors.inkSoft1} strokeWidth={LINE_WIDTH} strokeDasharray={DASH} fill="none" />
            <Path d={pathFor(available.withPurchase, box, ticks)} stroke={colors.ink} strokeWidth={LINE_WIDTH} fill="none" />
            {withoutMark ? (
              <Circle cx={withoutMark.x} cy={withoutMark.y} r={5} stroke={colors.inkSoft1} strokeWidth={LINE_WIDTH} fill="none" />
            ) : null}
            {withMark ? <Circle cx={withMark.x} cy={withMark.y} r={6} fill={markFill} /> : null}
            {cur === null ? null : <Line x1={curX} x2={curX} y1={box.y0} y2={box.y1} stroke={colors.inkMuted} strokeWidth={1} />}
          </Svg>
          <Text allowFontScaling={false} style={[styles.axis, labelStyle, { top: yOf(ticks.max) - 7, left: 0 }]}>
            {whole.formatMoney(ticks.max as MinorUnits)}
          </Text>
          <Text allowFontScaling={false} style={[styles.axis, labelStyle, { top: yOf(0) - 7, left: 0 }]}>
            {t('decide.depth.cashPath.zero')}
          </Text>
          {ticks.min !== 0 ? (
            <Text allowFontScaling={false} style={[styles.axis, labelStyle, { top: yOf(ticks.min) - 7, left: 0 }]}>
              {whole.formatMoney(ticks.min as MinorUnits)}
            </Text>
          ) : null}
          {xTicks(length).map((i) => (
            <Text
              key={i}
              allowFontScaling={false}
              style={[styles.axis, labelStyle, { top: box.y1 + 6, left: xOf(i, length, box) - LABEL_W / 2, width: LABEL_W, textAlign: 'center' }]}
            >
              {xLabel(i)}
            </Text>
          ))}
        </View>
      </GestureDetector>
      <Text style={[styles.alt, { fontSize: fontSize.meta, color: colors.inkMuted }]}>{textAlt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { minHeight: 18 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, marginBottom: space.tabItemPadV },
  axis: { position: 'absolute' },
  alt: { marginTop: space.tabItemPadV },
});
