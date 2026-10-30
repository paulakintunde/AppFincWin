/**
 * 05.3-23 (UI-SPEC Home, Month card): the month name and day counter, the three-part bar with its legend (one
 * accessibility group), the "on track to leave" figure and the three tap figures. Every number comes from monthBar and
 * homeFigures over the one Evaluation, so the card never disagrees with the answer (T-05.3-23-01).
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Evaluation } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { DURATION, EASING, useReduceMotion } from '@/theme/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { Text } from '@/ui/Text';
import { EmergencyFundSheet } from '../../setup/EmergencyFundSheet';
import { UnspentSheet } from '../../setup/UnspentSheet';
import { StateChip } from '../../ui/StateChip';
import { useShouldStack } from '../../ui/textFit';
import { homeFigures } from '../model/homeFigures';
import { monthBar, type BarSegment } from '../model/monthBar';
import { WORKED_HREF } from '../nav/hrefs';
import { heroAmountText } from '../shared/heroAmountText';
import { useV3Format } from '../shared/useV3Format';

const BAR_RADIUS = 8;
const BAR_HEIGHT = 16;
const DOT = 10;
const FIGURE_MIN_FONT_SCALE = 0.8;

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface MonthBarCardProps {
  evaluation: Pick<Evaluation, 'month' | 'funds'>;
  /** Days since the unspent figure was confirmed; only read when it is stale. */
  unspentStaleDays?: number;
}

export function MonthBarCard({ evaluation, unspentStaleDays }: MonthBarCardProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const stack = useShouldStack();
  const reduced = useReduceMotion();
  const [unspentOpen, setUnspentOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const m = evaluation.month;
  const bar = monthBar(m);
  const figures = homeFigures(evaluation);
  const K = 'decide.v3.ui.home.';

  const monthName = f.month(m.month);
  const dayLine = t(`${K}monthDay`, { day: m.day, days: m.daysInMonth });
  const lastLabel = bar.negative ? t(`${K}legendOverspent`) : t(`${K}legendLeft`);
  const lastAmount = bar.negative ? bar.over : bar.left;
  const barA11y = bar.negative
    ? t(`${K}barA11yOver`, { month: monthName, day: m.day, days: m.daysInMonth, out: f.moneyA11y(bar.outSoFar), toCome: f.moneyA11y(bar.stillToCome), over: f.moneyA11y(bar.over) })
    : t(`${K}barA11y`, { month: monthName, day: m.day, days: m.daysInMonth, out: f.moneyA11y(bar.outSoFar), toCome: f.moneyA11y(bar.stillToCome), left: f.moneyA11y(bar.left) });

  const fill = (s: BarSegment): string =>
    s.kind === 'out' ? colors.ink : s.kind === 'toCome' ? colors.inkSoft1 : s.kind === 'left' ? colors.accent : colors.danger;

  const grow = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    grow.value = reduced ? 1 : withTiming(1, { duration: DURATION.progress, easing: EASING });
  }, [reduced, grow]);
  const growStyle = useAnimatedStyle(() => ({ width: `${grow.value * 100}%` }));

  const figureText = heroAmountText((bar.negative ? '−' : '') + f.money(bar.figure));
  const figureColor = bar.negative ? colors.danger : colors.accent;

  const typical = figures.typical === null ? null : f.money(figures.typical);
  const unspent = figures.unspent === null ? null : f.money(figures.unspent);
  const emergency = figures.emergency === null ? null : f.money(figures.emergency);
  const chipText =
    figures.unspentChip === 'drifted'
      ? t('decide.unspentSheet.chipDrifted')
      : figures.unspentChip === 'stale' && unspentStaleDays !== undefined
        ? t('decide.unspentSheet.chipStale', { n: unspentStaleDays })
        : null;
  const notSet = t(`${K}notSet`);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={[styles.headRow, stack && styles.headStack]}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {monthName}
        </Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{dayLine}</Text>
      </View>

      <View accessible accessibilityLabel={barA11y} style={styles.group}>
        <View importantForAccessibility="no-hide-descendants" style={[styles.track, { backgroundColor: colors.fill1 }]}>
          <Animated.View style={[styles.segments, growStyle]}>
            {bar.segments.map((s) => (
              <View key={s.kind} testID={`bar-${s.kind}`} style={{ flexGrow: s.amount, flexBasis: 0, backgroundColor: fill(s) }} />
            ))}
          </Animated.View>
        </View>
        <View importantForAccessibility="no-hide-descendants" style={styles.legend}>
          <LegendItem color={colors.ink} amount={f.money(bar.outSoFar)} label={t(`${K}legendOut`)} />
          <LegendItem color={colors.inkSoft1} amount={f.money(bar.stillToCome)} label={t(`${K}legendToCome`)} />
          <LegendItem color={bar.negative ? colors.danger : colors.accent} amount={f.money(lastAmount)} label={lastLabel} />
        </View>
      </View>

      <View style={styles.figureBlock}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t(bar.captionKey, { amount: f.money(bar.moneyIn) })}</Text>
        <Text
          scale="capped"
          testID="month-figure"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={FIGURE_MIN_FONT_SCALE}
          maxFontSizeMultiplier={1.3}
          style={{ ...textRole(pairing, 'display'), fontSize: fontSize.netWorth, lineHeight: fontSize.netWorth, color: figureColor }}
        >
          {figureText.text}
        </Text>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.line1 }} />

      <View style={[styles.taps, stack && styles.tapsStack]}>
        <TapFigure
          stack={stack}
          caption={t(`${K}figureTypical`)}
          value={typical ?? notSet}
          muted={typical === null}
          a11y={t(`${K}figureTypicalA11y`, { amount: typical === null ? notSet : f.moneyA11y(figures.typical ?? 0) })}
          onPress={() => pushOnce(WORKED_HREF)}
        />
        <TapFigure
          stack={stack}
          caption={t(`${K}figureUnspent`)}
          value={unspent ?? notSet}
          muted={unspent === null}
          chip={chipText}
          a11y={t(`${K}figureUnspentA11y`, { amount: unspent === null ? notSet : f.moneyA11y(figures.unspent ?? 0) })}
          onPress={() => setUnspentOpen(true)}
        />
        <TapFigure
          stack={stack}
          caption={t(`${K}figureEmergency`)}
          value={emergency ?? notSet}
          muted={emergency === null}
          a11y={t(`${K}figureEmergencyA11y`, { amount: emergency === null ? notSet : f.moneyA11y(figures.emergency ?? 0) })}
          onPress={() => setEmergencyOpen(true)}
        />
      </View>

      <UnspentSheet visible={unspentOpen} onClose={() => setUnspentOpen(false)} />
      <EmergencyFundSheet visible={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
    </View>
  );
}

function LegendItem({ color, amount, label }: { color: string; amount: string; label: string }): React.JSX.Element {
  const { colors, pairing } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim, flexShrink: 1 }}>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.ink, fontWeight: '700' }}>{amount}</Text>
        {' '}
        {label}
      </Text>
    </View>
  );
}

interface TapFigureProps {
  stack: boolean;
  caption: string;
  value: string;
  muted: boolean;
  a11y: string;
  chip?: string | null;
  onPress: () => void;
}

function TapFigure({ stack, caption, value, muted, a11y, chip = null, onPress }: TapFigureProps): React.JSX.Element {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => [styles.tap, stack && styles.tapStack, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, flexShrink: 1 }}>{caption}</Text>
      <View style={stack ? styles.tapValueStack : undefined}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={FIGURE_MIN_FONT_SCALE}
          style={{ ...textRole(pairing, 'sheetTitle'), color: muted ? colors.inkMuted : colors.ink }}
        >
          {value}
        </Text>
        {chip !== null ? <StateChip tone="adjust" label={chip} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.tabHeaderGap },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.gapSm, flexWrap: 'wrap' },
  headStack: { flexDirection: 'column', alignItems: 'flex-start' },
  group: { gap: space.gapMd },
  track: { height: BAR_HEIGHT, borderRadius: BAR_RADIUS, overflow: 'hidden' },
  segments: { flexDirection: 'row', gap: 2, alignSelf: 'stretch' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { height: DOT, width: DOT, borderRadius: 3 },
  figureBlock: { gap: 2 },
  taps: { flexDirection: 'row', gap: space.gapSm },
  tapsStack: { flexDirection: 'column', gap: 0 },
  tap: { flex: 1, minHeight: space.touchMin, justifyContent: 'center', gap: 2 },
  tapStack: { flex: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm },
  tapValueStack: { alignItems: 'flex-end', flexShrink: 1 },
});
