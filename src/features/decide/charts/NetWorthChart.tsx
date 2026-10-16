// D-31: net worth with and without the purchase over the investing horizon. Same geometry as the cash
// path. Points the engine marks out of range (D-47, ME-01) are null: the line breaks there and the
// end label says so. Draws once with no animation.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import type { MinorUnits, NetWorthPath } from '@/engine/decide';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { CHART_HEIGHT, type ChartMoney } from './CashPathChart';
import { chartBox, lastValue, pathFor, xTicks, yTicks } from './chartGeometry';

const DEFAULT_WIDTH = 330;
const LINE_WIDTH = 2;
const DASH = '4 4';
const LABEL_W = 34;

export interface NetWorthChartProps {
  path: NetWorthPath;
  horizonMonths: number;
  /** The rate as shown in copy, e.g. "5". */
  rateLabel: string;
  whole: ChartMoney;
}

export function NetWorthChart({ path, horizonMonths, rateLabel, whole }: NetWorthChartProps) {
  const t = useT();
  const { colors } = useTheme();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const box = useMemo(() => chartBox({ width, height: CHART_HEIGHT }), [width]);
  const ticks = useMemo(
    () => yTicks([path.withPurchase, path.withoutPurchase], [], whole.exponent ?? 2),
    [path, whole.exponent]
  );
  const endWith = lastValue(path.withPurchase);
  const endWithout = lastValue(path.withoutPurchase);
  const outOfRange = path.rangeCode === 'exceeds_range';
  const allNull = endWith === null && endWithout === null;
  const alt = outOfRange
    ? t('decide.depth.invest.netWorthAltTooLarge', { months: horizonMonths, rate: rateLabel })
    : t('decide.depth.invest.netWorthAlt', {
        months: horizonMonths,
        with: endWith ? whole.formatMoney(endWith.value as MinorUnits) : '',
        without: endWithout ? whole.formatMoney(endWithout.value as MinorUnits) : '',
        rate: rateLabel,
      });
  const labelStyle = { fontSize: fontSize.tabLabel, color: colors.inkMuted };
  const metaStyle = { fontSize: fontSize.meta, color: colors.inkMuted };
  const endLabel = (path_: readonly (number | null)[], end: { value: number } | null) =>
    end !== null && path_[path_.length - 1] !== null && path_[path_.length - 1] !== undefined
      ? whole.formatMoney(end.value as MinorUnits)
      : t('decide.depth.invest.tooLarge');
  const yOf = (v: number) => box.y0 + ((ticks.max - v) / (ticks.max - ticks.min)) * (box.y1 - box.y0);
  const length = path.withPurchase.length;
  const xOf = (i: number) => (length > 1 ? box.x0 + ((box.x1 - box.x0) * i) / (length - 1) : box.x0);

  if (allNull) return <Text style={[styles.alt, metaStyle]}>{alt}</Text>;

  return (
    <View>
      <View style={styles.ends}>
        <Text style={metaStyle}>
          {t('decide.depth.cashPath.legendWithout')}: {endLabel(path.withoutPurchase, endWithout)}
        </Text>
        <Text style={metaStyle}>
          {t('decide.depth.cashPath.legendWith')}: {endLabel(path.withPurchase, endWith)}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={alt}
        style={{ height: CHART_HEIGHT }}
        onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(120, e.nativeEvent.layout.width))}
      >
        <Svg width={width} height={CHART_HEIGHT} importantForAccessibility="no-hide-descendants">
          <Line x1={box.x0} x2={box.x1} y1={yOf(0)} y2={yOf(0)} stroke={colors.line3} strokeWidth={1} />
          <Path d={pathFor(path.withoutPurchase, box, ticks)} stroke={colors.inkSoft1} strokeWidth={LINE_WIDTH} strokeDasharray={DASH} fill="none" />
          <Path d={pathFor(path.withPurchase, box, ticks)} stroke={colors.ink} strokeWidth={LINE_WIDTH} fill="none" />
        </Svg>
        <Text allowFontScaling={false} style={[styles.axis, labelStyle, { top: yOf(ticks.max) - 7, left: 0 }]}>
          {whole.formatMoney(ticks.max as MinorUnits)}
        </Text>
        {ticks.min !== 0 ? (
          <Text allowFontScaling={false} style={[styles.axis, labelStyle, { top: yOf(ticks.min) - 7, left: 0 }]}>
            {whole.formatMoney(ticks.min as MinorUnits)}
          </Text>
        ) : null}
        {xTicks(length, 4).map((i) => (
          <Text
            key={i}
            allowFontScaling={false}
            style={[styles.axis, labelStyle, { top: box.y1 + 6, left: xOf(i) - LABEL_W / 2, width: LABEL_W, textAlign: 'center' }]}
          >
            {i === 0 ? t('decide.depth.cashPath.today') : String(i)}
          </Text>
        ))}
      </View>
      <Text style={[styles.alt, metaStyle]}>{alt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.tabItemPadV },
  axis: { position: 'absolute' },
  alt: { marginTop: space.tabItemPadV },
});
