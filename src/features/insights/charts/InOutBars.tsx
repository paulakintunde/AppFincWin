// 07-08: money in and out as paired bars (D-24: in = fits green, out = Orange from the chart palette, never the short colour).
// In is always the left bar of a pair; the legend differs in shape and word; each pair is one screen-reader stop.
// Figures come in as props from the engine; nothing here computes money.
import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Line, Rect } from 'react-native-svg';
import type { MonthBar } from '@/engine/month';
import { useT } from '@/i18n';
import { step } from '@/theme/layout';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { chartPalette, stateColors } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { useOncePerSession } from '@/ui/motion/useOncePerSession';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import { useDetailFormat } from '@/features/decide/screens/answer/detail/detailKit';
import { monthShort } from '../format';

const IN = stateColors.fits.stroke;
const OUT = chartPalette[1];

export const PLOT_H = 140;
export const BAR_W = 10;
export const PAIR_GAP = 4;
export const MONTH_GAP = 12;
const COL_W = BAR_W + PAIR_GAP + BAR_W;
const LABEL_H = 32;

/** Total content width for n pairs. */
export function barsWidth(n: number): number {
  return n * COL_W + Math.max(0, n - 1) * MONTH_GAP;
}

export interface InOutBarsProps {
  bars: readonly MonthBar[];
  currency: string;
  selected: string | null;
  onSelect: (month: string) => void;
  currentMonth: string;
  withYear: boolean;
  testID?: string;
}

export function InOutBars({ bars, currency, selected, onSelect, currentMonth, withYear, testID = 'in-out-bars' }: InOutBarsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const motion = useMotion();
  const f = useDetailFormat(currency);
  const { locale } = useMoneyFormatter(false);
  const first = useOncePerSession('insights-in-out');
  const grow = useSharedValue(first ? 0 : 1);
  const draws = first && !motion.reduced;
  useEffect(() => {
    if (!draws) {
      grow.value = 1;
      return;
    }
    grow.value = withTiming(1, { duration: DURATION.fill, easing: EASING, reduceMotion: ReduceMotion.System });
  }, [draws, grow]);
  // Bars grow up from the zero line: scale about the bottom edge.
  const growStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ((1 - grow.value) * PLOT_H) / 2 }, { scaleY: Math.max(grow.value, 0.001) }] }));
  const scroller = useRef<ScrollView>(null);

  const max = Math.max(1, ...bars.map((b) => Math.max(b.comesIn, b.goesOut)));
  const height = (v: number): number => Math.round((Math.max(0, v) / max) * PLOT_H);
  const width = barsWidth(bars.length);
  const labelStyle = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, textAlign: 'center' as const };

  return (
    <View testID={testID} style={styles.column}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View testID={`${testID}-legend-in`} style={[styles.swatch, { backgroundColor: IN }]} />
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('insights.inOut.legendIn')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View testID={`${testID}-legend-out`} style={[styles.swatch, { borderColor: OUT, borderWidth: 2, backgroundColor: 'transparent' }]} />
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('insights.inOut.legendOut')}</Text>
        </View>
      </View>
      <ScrollView
        ref={scroller}
        testID={`${testID}-scroll`}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        accessibilityLabel={t('insights.inOut.chartA11y')}
      >
        <View style={{ width, height: PLOT_H + LABEL_H }}>
          <Svg width={width} height={PLOT_H} style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Line x1={0} x2={width} y1={PLOT_H - 0.5} y2={PLOT_H - 0.5} stroke={colors.line2} strokeWidth={1} />
          </Svg>
          {bars.map((b, i) => {
            const month = b.month as string;
            const name = monthShort(month, locale, withYear);
            const monthText = f.month(month);
            const left = b.left as number;
            const spokenMonth = month === currentMonth ? t('insights.inOut.soFar', { month: monthText }) : monthText;
            const label =
              left < 0
                ? t('insights.inOut.readoutShort', { month: spokenMonth, in: f.spoken(b.comesIn), out: f.spoken(b.goesOut), short: f.spoken(-left) })
                : t('insights.inOut.readout', { month: spokenMonth, in: f.spoken(b.comesIn), out: f.spoken(b.goesOut), left: f.spoken(left) });
            const inH = height(b.comesIn);
            const outH = height(b.goesOut);
            return (
              <Pressable
                key={month}
                testID={`${testID}-col-${month}`}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: selected === month }}
                hitSlop={{ left: 10, right: 10, top: 8, bottom: 8 }}
                onPress={() => onSelect(month)}
                style={{ position: 'absolute', left: i * (COL_W + MONTH_GAP), width: COL_W, height: PLOT_H + LABEL_H }}
              >
                <Animated.View style={[{ width: COL_W, height: PLOT_H }, growStyle]}>
                  <Svg width={COL_W} height={PLOT_H} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    <Rect testID={`${testID}-in-${month}`} x={0} y={PLOT_H - inH} width={BAR_W} height={inH} fill={IN} />
                    <Rect testID={`${testID}-out-${month}`} x={BAR_W + PAIR_GAP} y={PLOT_H - outH} width={BAR_W} height={outH} fill={OUT} />
                  </Svg>
                </Animated.View>
                {selected === month ? <View testID={`${testID}-marker-${month}`} style={[styles.marker, { backgroundColor: colors.ink }]} /> : null}
                <Text
                  numberOfLines={2}
                  style={[labelStyle, { position: 'absolute', top: PLOT_H + step.hair + 2, left: -(MONTH_GAP / 2), width: COL_W + MONTH_GAP, height: LABEL_H }]}
                >
                  {month === currentMonth ? t('insights.inOut.soFar', { month: name }) : name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.tight },
  legend: { flexDirection: 'row', gap: step.card },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: step.tight },
  swatch: { width: 12, height: 12 },
  marker: { position: 'absolute', left: 0, right: 0, top: PLOT_H + 1, height: 2 },
});
