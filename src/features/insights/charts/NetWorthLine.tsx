// 07-08: the net-worth line (D-24: the theme colour at full strength). One dot per point, a larger last dot, no area fill,
// an inline readout for a tapped point. Geometry comes from Grow's LineChart (linePath, lineLength, linePoints).
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useT } from '@/i18n';
import { step } from '@/theme/layout';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { useOncePerSession } from '@/ui/motion/useOncePerSession';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import { useDetailFormat } from '@/features/decide/screens/answer/detail/detailKit';
import { lineLength, linePath, linePoints } from '@/features/grow/ui/LineChart';
import { monthShort } from '../format';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface NetWorthLinePoint {
  date: string;
  value: number;
}

export interface NetWorthLineProps {
  points: readonly NetWorthLinePoint[];
  currency: string;
  selected: number | null;
  onSelect: (index: number) => void;
  summary: string;
  testID?: string;
}

const HEIGHT = 160;
const DEFAULT_WIDTH = 330;
const TARGET = 44;
const LABEL_W = 40;

export function NetWorthLine({ points, currency, selected, onSelect, summary, testID = 'net-worth-line' }: NetWorthLineProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const motion = useMotion();
  const f = useDetailFormat(currency);
  const { locale } = useMoneyFormatter(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const first = useOncePerSession('insights-net-worth');
  const values = points.map((p) => p.value);
  const draws = first && !motion.reduced && points.length > 1;
  const drawn = useSharedValue(first ? 0 : 1);
  useEffect(() => {
    if (!draws) {
      drawn.value = 1;
      return;
    }
    drawn.value = withTiming(1, { duration: DURATION.fill + 50, easing: EASING, reduceMotion: ReduceMotion.System });
  }, [draws, drawn]);
  const length = lineLength(values, width, HEIGHT);
  const reveal = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - drawn.value) }));
  const lastFade = useAnimatedProps(() => ({ opacity: drawn.value }));
  if (points.length === 0) return null;

  const xy = linePoints(values, width, HEIGHT);
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const crossesZero = Math.min(...values) < 0 && max > 0;
  const zeroY = xy.length > 0 ? 8 + (HEIGHT - 16) - ((HEIGHT - 16) * (0 - min)) / (max - min || 1) : 0;
  const lastIndex = points.length - 1;
  // D-29: every third month once there are more than 24 points, and never closer than one label width, counted back from today.
  const spacing = points.length > 1 ? (width - 16) / (points.length - 1) : width;
  const labelStep = Math.max(points.length > 24 ? 3 : 1, Math.ceil(LABEL_W / spacing));
  // D-29: three value labels (low, middle, high) on the same scale linePoints uses (0 is always inside the range).
  const span = max - min || 1;
  const yOf = (v: number): number => 8 + (HEIGHT - 16) - ((HEIGHT - 16) * (v - min)) / span;
  const ticks = [min, Math.round((min + max) / 2), max].map((v) => ({ v, y: yOf(v) }));
  const metaStyle = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const sel = selected !== null ? points[selected] : undefined;

  return (
    <View testID={testID} style={styles.column}>
      {sel ? (
        <Text testID={`${testID}-readout`} style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
          {t('insights.netWorth.readout', { date: f.date(sel.date), amount: f.money(sel.value) })}
        </Text>
      ) : null}
      <View onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(120, e.nativeEvent.layout.width))}>
        <View testID={`${testID}-image`} accessible accessibilityRole="image" accessibilityLabel={summary}>
          <Svg width={width} height={HEIGHT} importantForAccessibility="no-hide-descendants">
            <Line x1={8} x2={width - 8} y1={HEIGHT - 8} y2={HEIGHT - 8} stroke={colors.line3} strokeWidth={1} />
            {crossesZero ? <Line testID={`${testID}-zero`} x1={8} x2={width - 8} y1={zeroY} y2={zeroY} stroke={colors.line2} strokeWidth={1} /> : null}
            {points.length > 1 ? (
              draws ? (
                <AnimatedPath
                  testID={`${testID}-path`}
                  d={linePath(values, width, HEIGHT)}
                  stroke={colors.accent}
                  strokeWidth={2}
                  fill="none"
                  strokeDasharray={[length, length]}
                  animatedProps={reveal}
                />
              ) : (
                <Path testID={`${testID}-path`} d={linePath(values, width, HEIGHT)} stroke={colors.accent} strokeWidth={2} fill="none" />
              )
            ) : null}
            {xy.map((p, i) =>
              i === lastIndex ? (
                <AnimatedCircle
                  key={points[i]!.date}
                  testID={`${testID}-dot-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={4}
                  fill={colors.accent}
                  stroke={colors.surface}
                  strokeWidth={2}
                  animatedProps={lastFade}
                />
              ) : (
                <Circle key={points[i]!.date} testID={`${testID}-dot-${i}`} cx={p.x} cy={p.y} r={2.5} fill={colors.accent} />
              ),
            )}
          </Svg>
        </View>
        {ticks.map((tk, i) => (
          <Text key={`tick-${i}`} testID={`${testID}-tick-${i}`} pointerEvents="none" style={[metaStyle, { position: 'absolute', left: 8, top: Math.min(Math.max(0, tk.y - 16), HEIGHT - 16) }]}>
            {f.money(tk.v)}
          </Text>
        ))}
        {xy.map((p, i) => (
          <Pressable
            key={points[i]!.date}
            testID={`${testID}-point-${i}`}
            accessibilityRole="button"
            accessibilityLabel={t('insights.netWorth.pointA11y', { date: f.date(points[i]!.date), amount: f.spoken(points[i]!.value) })}
            accessibilityState={{ selected: selected === i }}
            onPress={() => onSelect(i)}
            style={{ position: 'absolute', left: p.x - TARGET / 2, top: p.y - TARGET / 2, width: TARGET, height: TARGET }}
          />
        ))}
      </View>
      <View style={styles.axis}>
        {points.map((p, i) =>
          (lastIndex - i) % labelStep === 0 ? (
            <Text key={p.date} style={[metaStyle, { position: 'absolute', left: Math.min(Math.max(0, xy[i]!.x - LABEL_W / 2), width - LABEL_W), width: LABEL_W, textAlign: 'center' }]}>
              {monthShort(p.date.slice(0, 7), locale, false)}
            </Text>
          ) : null,
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.tight },
  axis: { height: 18 },
});
