/**
 * 06.1-21 (D01, CO-D-57, UX-30, UX-29): the "Your month" card on Decide home. It leads with the month-picture figure (monthEnd,
 * which is homeFigure, so the home and every answer start from the same number), then COMES IN / GOES OUT / LEFT for a usual month or
 * the low month, and the Records row. The back arrows step to earlier months from the records; those months show what the records
 * say and have no usual/low switch. A month below zero grows its bar downward and says "short" in words, never colour alone.
 * 06.1-55 (A-HOME-1, DS-11): this month's headline carries "after this month's plans" and the tiles carry "A usual month" or
 * "Your low month", so a short headline over a positive LEFT tile is two labelled figures, not one contradicting the other.
 * Presentational: the engine's picture and bars come in as props.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MonthBar, MonthPicture } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { hapticSelection } from '@/ui/haptics';
import { SegmentedToggle } from '@/ui/SegmentedToggle';
import { Text } from '@/ui/Text';

export interface YourMonthCardProps {
  picture: MonthPicture | null;
  /** The months before this one, oldest first (pastMonthBars). */
  bars: readonly MonthBar[];
  /** 'YYYY-MM' of the current month. */
  thisMonth: string;
  monthName: (yearMonth: string) => string;
  formatMoney: (minor: number) => string;
  /** The records date as text; null hides the Records row. */
  recordsUpTo: string | null;
  /** How many full months the records cover, shown as "n of 3". */
  recordMonths: number;
  onRecords: () => void;
}

const CHART_UP = 64;
const CHART_DOWN = 28;

/** A month's long name from a 'YYYY-MM' string, in the device language. */
export function monthNameOf(yearMonth: string, locale: string): string {
  const y = Number(yearMonth.slice(0, 4));
  const m = Number(yearMonth.slice(5, 7));
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function Column({ label, value, amount, color, max }: { label: string; value: number; amount: string; color: string; max: number }) {
  const { colors, pairing } = useTheme();
  const height = max <= 0 ? 0 : Math.max(value === 0 ? 0 : 3, Math.round((Math.abs(value) / max) * CHART_UP));
  const down = value < 0;
  return (
    <View style={styles.column}>
      <View style={[styles.up, { height: CHART_UP }]}>{down ? null : <View testID={`bar-${label}`} style={[styles.bar, { height, backgroundColor: color }]} />}</View>
      <View style={[styles.down, { height: CHART_DOWN }]}>{down ? <View testID={`bar-down-${label}`} style={[styles.bar, { height: Math.min(height, CHART_DOWN), backgroundColor: color }]} /> : null}</View>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{label}</Text>
      <Text style={{ ...textRole(pairing, 'bodyStrong'), color: down ? stateColors.short.color : colors.ink, fontVariant: ['tabular-nums'] }}>{amount}</Text>
    </View>
  );
}

export function YourMonthCard(props: YourMonthCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [back, setBack] = useState(0);
  const [basis, setBasis] = useState<'usual' | 'low'>('usual');
  const { picture, bars, formatMoney } = props;

  const past = back > 0 ? (bars[bars.length - back] ?? null) : null;
  const month = past === null ? props.thisMonth : past.month;
  const name = props.monthName(month);

  // The lead is the month picture's figure for this month, or the records' own figure for a past month.
  const lead = past === null ? (picture === null ? null : Number(picture.monthEnd)) : Number(past.left);
  const shown =
    past !== null
      ? { comesIn: Number(past.comesIn), goesOut: Number(past.goesOut), left: Number(past.left) }
      : picture === null
        ? null
        : (basis === 'low' ? picture.low : picture.usual) === null
          ? null
          : (() => {
              const b = (basis === 'low' ? picture.low : picture.usual)!;
              return { comesIn: Number(b.comesIn), goesOut: Number(b.goesOut), left: Number(b.left) };
            })();
  const short = lead !== null && lead < 0;
  const leadColor = short ? stateColors.short.color : colors.ink;
  const max = shown === null ? 0 : Math.max(shown.comesIn, shown.goesOut, Math.abs(shown.left));
  const canGoBack = back < bars.length;
  // 06.1-55 (A-HOME-1): this month's headline is left after this month's plans; the tiles are a usual (or the low) month. Each is
  // labelled, so the two figures never read as one. A past month's headline and tiles are that month's own records: no labels.
  const leadWords = t(short ? 'decide.screens.home.month.shortIn' : 'decide.screens.home.month.leftIn', { month: name });
  const leadA11y = lead === null ? '' : past === null ? `${formatMoney(Math.abs(lead))} ${leadWords}, ${t('decide.screens.home.month.leadLabel')}` : `${formatMoney(Math.abs(lead))} ${leadWords}`;

  const step = (to: number): void => {
    hapticSelection();
    setBack(to);
  };

  return (
    <View testID="your-month-card" style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.head}>
        <Pressable
          testID="month-earlier"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoBack }}
          accessibilityLabel={t('decide.screens.home.month.earlierA11y')}
          disabled={!canGoBack}
          onPress={() => step(back + 1)}
          style={[styles.arrow, { opacity: canGoBack ? 1 : 0.35 }]}
        >
          <View style={[styles.chevron, { borderColor: colors.inkFaint, transform: [{ rotate: '-135deg' }] }]} />
        </Pressable>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flexShrink: 1 }}>
          {t('decide.screens.home.month.title')}
        </Text>
        <Pressable
          testID="month-later"
          accessibilityRole="button"
          accessibilityState={{ disabled: back === 0 }}
          accessibilityLabel={t('decide.screens.home.month.laterA11y')}
          disabled={back === 0}
          onPress={() => step(back - 1)}
          style={[styles.arrow, { opacity: back === 0 ? 0.35 : 1 }]}
        >
          <View style={[styles.chevron, { borderColor: colors.inkFaint, transform: [{ rotate: '45deg' }] }]} />
        </Pressable>
      </View>

      {lead === null ? null : (
        <View testID="month-lead" accessible accessibilityLabel={leadA11y} style={styles.lead}>
          <View style={styles.leadRow}>
            {short ? <StateGlyph name="sDown" color={stateColors.short.color} size={22} /> : null}
            <Text style={{ ...textRole(pairing, 'display'), color: leadColor, fontVariant: ['tabular-nums'] }}>{formatMoney(Math.abs(lead))}</Text>
          </View>
          <Text style={{ ...textRole(pairing, 'body'), color: leadColor }}>{leadWords}</Text>
          {past === null ? (
            <Text testID="month-lead-label" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
              {t('decide.screens.home.month.leadLabel')}
            </Text>
          ) : null}
          {past === null ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('decide.screens.home.month.expected')}</Text> : null}
        </View>
      )}

      {shown === null || past !== null ? null : (
        <Text testID="month-tiles-label" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
          {t(basis === 'low' ? 'decide.screens.home.month.tilesLow' : 'decide.screens.home.month.tilesUsual')}
        </Text>
      )}

      {shown === null ? null : (
        <View
          testID="month-bars"
          accessible
          accessibilityRole="image"
          accessibilityLabel={
            past === null
              ? `${t(basis === 'low' ? 'decide.screens.home.month.tilesLow' : 'decide.screens.home.month.tilesUsual')}: ${t('decide.screens.home.month.barA11y', { moneyIn: formatMoney(shown.comesIn), costs: formatMoney(shown.goesOut), left: formatMoney(shown.left) })}`
              : t('decide.screens.home.month.barA11y', { moneyIn: formatMoney(shown.comesIn), costs: formatMoney(shown.goesOut), left: formatMoney(shown.left) })
          }
          style={styles.chart}
        >
          <Column label={t('decide.screens.home.month.comesIn')} value={shown.comesIn} amount={formatMoney(shown.comesIn)} color={colors.accent} max={max} />
          <Column label={t('decide.screens.home.month.goesOut')} value={shown.goesOut} amount={formatMoney(shown.goesOut)} color={colors.inkMuted} max={max} />
          <Column
            label={shown.left < 0 ? t('decide.screens.home.month.short').toUpperCase() : t('decide.screens.home.month.left')}
            value={shown.left}
            amount={formatMoney(Math.abs(shown.left))}
            color={shown.left < 0 ? stateColors.short.stroke : colors.ink}
            max={max}
          />
        </View>
      )}

      {past === null && picture !== null ? (
        <>
          <SegmentedToggle
            accessibilityLabel={t('decide.screens.home.month.title')}
            value={basis}
            onChange={(key) => setBasis(key === 'low' ? 'low' : 'usual')}
            options={[
              { key: 'usual', label: t('decide.screens.home.month.usual') },
              { key: 'low', label: t('decide.screens.home.month.low') },
            ]}
          />
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
            {t(basis === 'low' ? 'decide.screens.home.month.explainLow' : 'decide.screens.home.month.explainUsual')}
          </Text>
        </>
      ) : null}

      {props.recordsUpTo === null ? null : (
        <Pressable
          testID="month-records"
          accessibilityRole="button"
          accessibilityLabel={t('decide.screens.home.month.recordsRow', { date: props.recordsUpTo, count: Math.min(3, props.recordMonths) })}
          onPress={() => {
            hapticSelection();
            props.onRecords();
          }}
          style={[styles.records, { borderTopColor: colors.line1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
            {t('decide.screens.home.month.recordsRow', { date: props.recordsUpTo, count: Math.min(3, props.recordMonths) })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { minWidth: space.touchMin, minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2 },
  lead: { gap: 2 },
  leadRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  chart: { flexDirection: 'row', gap: space.gapMd },
  column: { flex: 1, alignItems: 'center', gap: 2 },
  up: { width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  down: { width: '100%', justifyContent: 'flex-start', alignItems: 'center' },
  bar: { width: '60%', borderRadius: 4 },
  records: { minHeight: space.touchMin, justifyContent: 'center', borderTopWidth: 1 },
});
