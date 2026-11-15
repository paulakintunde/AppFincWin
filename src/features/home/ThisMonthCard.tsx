// HOME-02 / D-30 item 2 / D-32 amendment: Home's This month card. Every figure comes from the
// engine's monthPosition (03-17) and MonthTotals; this component only formats. Lines without a
// rate are counted and labelled, never estimated. The card never replaces position.left while
// anything is due, and read failures are disclosed, never shown as an empty month (T-03-22-01). Figures cap at 1.3x text size and
// stack to one column above it (D-19).
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '@/ui/Text';
import type { MonthPosition, MonthTotals } from '@/engine/activity';
import { money } from '@/engine/money';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_PAIRINGS } from '@/theme/fonts';
import { radii, size, space } from '@/theme/layout';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { MonthDataState } from '@/data/queries/monthDataState';
import { isMonthEmpty, paidOutText } from '@/features/record/activity/monthFigureInputs';
import { useShouldStack } from '@/ui/textFit';
import { useOncePerSession } from '@/ui/motion/useOncePerSession';
import { MonthChips } from './MonthChips';

// UI-SPEC Spacing "prototype-literal exceptions (Home)": the 12 / 14 / 16 px gaps between the
// headline, figures and bar rows.
const HEADLINE_GAP = 12;
const FIGURES_GAP = 14;
const BAR_GAP = 16;
const FIGURE_MIN_FONT_SCALE = 0.8; // D-76 rule N
const FIGURE_MAX_SCALE = 1.3;
const PLACEHOLDER_RADIUS = 8;

export interface ThisMonthCardProps {
  position: MonthPosition;
  totals: MonthTotals;
  month: string;
  months: readonly string[];
  onMonthChange(month: string): void;
  formatter: MoneyFormatter;
  homeCurrency: string;
  currentMonth: string;
  state: MonthDataState;
  /** 05.5-14 (D-19): the shared left-after-plans figure, current month only. */
  afterPlans?: { left: number | bigint } | null;
}

// 06.2 D-18: a segment is a full-width bar stretched by scaleX from its left edge, never a width animation. On the
// first view this session it stretches from 0 over DURATION.fill; on later views and under Reduce Motion it is drawn
// at its length at once; a changed figure later moves from the old length over DURATION.swap. No count-up anywhere.
function Segment({
  pct,
  stretchIn,
  color,
  opacity,
  testID,
}: {
  pct: number;
  stretchIn: boolean;
  color: string;
  opacity?: number;
  testID: string;
}) {
  const { reduced } = useMotion();
  const target = Math.min(100, Math.max(0, pct)) / 100;
  const scale = useSharedValue(stretchIn && !reduced ? 0 : target);
  const settled = useRef(false);
  useEffect(() => {
    if (reduced) {
      scale.value = target;
    } else {
      scale.value = withTiming(target, { duration: settled.current ? DURATION.swap : DURATION.fill, easing: EASING });
    }
    settled.current = true;
  }, [target, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));
  return (
    <Animated.View
      testID={testID}
      style={[styles.segment, { backgroundColor: color }, opacity === undefined ? null : { opacity }, style]}
    />
  );
}

// The bar reads its once-per-session key only when it is drawn, so a first view that starts on the loading
// placeholder still stretches when the figures arrive. Pending is drawn under paid, as long as paid + pending, so the
// two read as one bar with a lighter tail.
function MonthBar({ paidPct, pendingPct, color }: { paidPct: number; pendingPct: number; color: string }) {
  const stretchIn = useOncePerSession('home.thisMonth.bar');
  return (
    <>
      <Segment testID="home-bar-pending" pct={paidPct + pendingPct} stretchIn={stretchIn} color={color} opacity={0.3} />
      <Segment testID="home-bar-paid" pct={paidPct} stretchIn={stretchIn} color={color} />
    </>
  );
}

export function ThisMonthCard({
  position,
  totals,
  month,
  months,
  onMonthChange,
  formatter,
  homeCurrency,
  currentMonth,
  state,
  afterPlans = null,
}: ThisMonthCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const fmt = (amount: number) => formatter.formatMoney(money(amount, homeCurrency));
  const monthDate = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  const monthName = new Intl.DateTimeFormat(formatter.locale, { month: 'long', timeZone: 'UTC' }).format(monthDate);
  const isCurrent = month === currentMonth;
  const sameYear = month.slice(0, 4) === currentMonth.slice(0, 4);
  const headingText = isCurrent
    ? t('home.month.heading')
    : new Intl.DateTimeFormat(
        formatter.locale,
        sameYear ? { month: 'long', timeZone: 'UTC' } : { month: 'long', year: 'numeric', timeZone: 'UTC' }
      ).format(monthDate);
  // T-03-22-01: empty only when nothing is recorded AND nothing is expected.
  const empty = isMonthEmpty(totals, position);
  // D-76 rules N and S: the three columns stack when the window is narrow, text is large or a
  // figure is long; a figure is never broken across lines.
  const longestFigure = Math.max(
    fmt(position.paidIn).length,
    paidOutText(position.paidOut, fmt).length,
    fmt(position.unpaid).length
  );
  const stacked = useShouldStack(longestFigure);

  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
        {headingText}
      </Text>
      <MonthChips months={months} selected={month} locale={formatter.locale} onChange={onMonthChange} />
    </View>
  );

  const container = [styles.card, { backgroundColor: colors.surface }, shadows.card];

  if (state === 'error' || state === 'offline') {
    return (
      <View style={container}>
        {header}
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, marginTop: HEADLINE_GAP }}>
          {t(state === 'error' ? 'home.state.monthError' : 'home.state.monthOffline')}
        </Text>
      </View>
    );
  }

  if (state === 'loading') {
    const block = { backgroundColor: colors.line4, borderRadius: PLACEHOLDER_RADIUS };
    return (
      <View
        style={container}
        accessible
        accessibilityLabel={t('home.loading')}
        accessibilityState={{ busy: true }}
      >
        {header}
        <View style={[styles.headlinePlaceholder, block]} />
        <View style={[styles.track, { backgroundColor: colors.line4, marginTop: BAR_GAP }]} />
        <View style={[styles.figures, { flexDirection: stacked ? 'column' : 'row' }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.figurePlaceholder, block]} />
          ))}
        </View>
      </View>
    );
  }

  const leftText = position.left >= 0 ? `+${fmt(position.left)}` : fmt(position.left);
  const headlineColor = empty ? colors.inkMuted : position.left >= 0 ? colors.accent : colors.danger;
  const figure = empty ? fmt(0) : leftText;

  const plansLeft = afterPlans === null || empty || !isCurrent ? null : Number(afterPlans.left);
  const plansShort = plansLeft !== null && plansLeft < 0;
  const plansAmount = plansLeft === null ? '' : fmt(Math.abs(plansLeft));
  const headlineLabel =
    plansLeft === null
      ? t('home.month.headlineA11y', { figure })
      : t(plansShort ? 'home.month.headlineWithPlansShortA11y' : 'home.month.headlineWithPlansA11y', { figure, afterPlans: plansAmount });

  const cells: { key: string; label: string; value: string; color: string }[] = [
    { key: 'in', label: t('activity.totals.in'), value: fmt(position.paidIn), color: colors.ink },
    { key: 'out', label: t('activity.totals.out'), value: paidOutText(position.paidOut, fmt), color: colors.ink },
    { key: 'unpaid', label: t('home.month.unpaid'), value: fmt(position.unpaid), color: colors.danger },
  ];

  return (
    <View style={container}>
      {header}
      <View
        style={styles.headline}
        accessible
        accessibilityLabel={headlineLabel}
      >
        <Text
          scale="capped"
          maxFontSizeMultiplier={FIGURE_MAX_SCALE}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={FIGURE_MIN_FONT_SCALE}
          style={{ ...textRole(pairing, 'heading'), color: headlineColor }}
        >
          {figure}
        </Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('home.month.caption')}</Text>
      </View>
      {plansLeft === null ? null : (
        <Text testID="home-after-plans" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, marginTop: space.gapSm }}>
          {t(plansShort ? 'home.month.afterPlansShort' : 'home.month.afterPlans', { amount: plansAmount })}
        </Text>
      )}
      {empty ? (
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, marginTop: space.gapSm }}>
          {t(month < currentMonth ? 'home.month.emptyPast' : 'home.month.empty', { month: monthName })}
        </Text>
      ) : null}
      <View
        style={[styles.track, { backgroundColor: colors.fill1, marginTop: BAR_GAP }]}
        accessible
        accessibilityLabel={t('home.month.barA11y', {
          paid: fmt(Math.abs(position.paidOut)),
          in: fmt(position.paidIn),
          pending: fmt(position.unpaid),
        })}
      >
        <MonthBar paidPct={position.paidPct} pendingPct={position.pendingPct} color={colors.accent} />
      </View>
      <View style={[styles.figures, { flexDirection: stacked ? 'column' : 'row' }]}>
        {cells.map((c) => (
          <View
            key={c.key}
            style={stacked ? undefined : styles.cell}
            accessible
            accessibilityLabel={`${c.label}, ${c.value}`}
          >
            <Text
              style={{
                fontSize: fontSize.eyebrow,
                letterSpacing: fontSize.eyebrow * 0.1,
                fontFamily: FONT_PAIRINGS[pairing].body[600],
                color: colors.inkMuted,
                textTransform: 'uppercase',
              }}
            >
              {c.label}
            </Text>
            <Text
              scale="capped"
              maxFontSizeMultiplier={FIGURE_MAX_SCALE}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={FIGURE_MIN_FONT_SCALE}
              style={{ ...textRole(pairing, 'sheetTitle'), color: c.color }}
            >
              {c.value}
            </Text>
          </View>
        ))}
      </View>
      {totals.unconvertedCount > 0 ? (
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, marginTop: space.gapSm }}>
          {t('activity.totals.unconverted', { count: totals.unconvertedCount })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.cardPad,
    marginTop: space.cardPad,
    padding: space.cardPadLg,
    borderRadius: radii.card,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.gapSm,
  },
  headline: {
    marginTop: HEADLINE_GAP,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: space.gapSm,
  },
  track: {
    height: size.homeBarHeight,
    borderRadius: radii.pill,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  // Full width, stretched from the left edge (D-18).
  segment: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, transformOrigin: 'left' },
  figures: { marginTop: FIGURES_GAP, gap: space.groupGap },
  cell: { flex: 1 },
  headlinePlaceholder: { marginTop: HEADLINE_GAP, height: 30, width: 160 },
  figurePlaceholder: { height: 40, flex: 1 },
});
