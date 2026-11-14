/**
 * 06.1-21 (D01, CO-D-57, UX-30, UX-29): the "Your month" card on Decide home. It leads with the month-picture figure (monthEnd,
 * which is homeFigure, so the home and every answer start from the same number), then COMES IN / GOES OUT / LEFT for a usual month or
 * the low month, and the Records row. The back arrows step to earlier months from the records; those months show what the records
 * say and have no usual/low switch. A month below zero grows its bar downward and says "short" in words, never colour alone.
 * 06.1-55 (A-HOME-1, DS-11): this month's headline carries "after this month's plans" and the tiles carry "A usual month" or
 * "Your low month", so a short headline over a positive LEFT tile is two labelled figures, not one contradicting the other.
 * 06.1-56 (A-HOME-6): as the prototype: "‹ November ›" between the arrows, one stacked horizontal bar (goes out and left, together
 * what comes in) with a two-line legend, whole currency units, a "$X left" sub-line under each of Usual month / Low month, and a
 * records row with a thin n-of-3 bar and a chevron.
 * 06.1-59 (G-10, section D): the headline is the card's one line in view; the switch, explainer and records row open under More.
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
import { StackedBar } from '@/ui/StackedBar';
import { Text } from '@/ui/Text';
import { MoreRow } from '../ui/MoreRow';

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
  /** 06.1-56 (A-HOME-6): one whole currency unit in minor units (100 for USD, 1 for JPY); figures on the card are rounded to it. */
  wholeUnit?: number;
}

/** The records row's bar is n of this many months. */
const RECORD_MONTHS = 3;

/** A month's long name from a 'YYYY-MM' string, in the device language. */
export function monthNameOf(yearMonth: string, locale: string): string {
  const y = Number(yearMonth.slice(0, 4));
  const m = Number(yearMonth.slice(5, 7));
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** 06.1-56 (A-HOME-6): one Usual / Low choice, its word over what that month leaves. A radio in the switch's radio group. */
function BasisOption({ label, sub, selected, onPress }: { label: string; sub: string | null; selected: boolean; onPress: () => void }) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={sub === null ? label : `${label}, ${sub}`}
      onPress={() => {
        if (selected) return;
        hapticSelection();
        onPress();
      }}
      style={[styles.basis, selected ? { backgroundColor: colors.surface } : null]}
    >
      <Text style={{ ...textRole(pairing, 'label'), fontWeight: selected ? '700' : '500', color: selected ? colors.ink : colors.inkDim, textAlign: 'center' }}>
        {label}
      </Text>
      {sub === null ? null : (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {sub}
        </Text>
      )}
    </Pressable>
  );
}

export function YourMonthCard(props: YourMonthCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [back, setBack] = useState(0);
  const [basis, setBasis] = useState<'usual' | 'low'>('usual');
  const { picture, bars } = props;
  const unit = props.wholeUnit ?? 1;
  // 06.1-56 (A-HOME-6): whole currency units on this card, never cents.
  const whole = (minor: number): number => Math.sign(minor) * Math.round(Math.abs(minor) / unit) * unit;
  const formatMoney = (minor: number): string => props.formatMoney(whole(minor));
  // 06.1-81 (review item 4): in and out are rounded to whole units, and left is the rounded in minus the rounded out, so the three
  // figures on the card always add up (rounded on its own, left could be one unit off). Integer minor units throughout.
  const tiles = (b: { comesIn: unknown; goesOut: unknown }): { comesIn: number; goesOut: number; left: number } => {
    const comesIn = whole(Number(b.comesIn));
    const goesOut = whole(Number(b.goesOut));
    return { comesIn, goesOut, left: comesIn - goesOut };
  };

  const past = back > 0 ? (bars[bars.length - back] ?? null) : null;
  const month = past === null ? props.thisMonth : past.month;
  const name = props.monthName(month);

  // The lead is the month picture's figure for this month, or the records' own figure for a past month (its rounded tiles' left).
  const lead = past === null ? (picture === null ? null : Number(picture.monthEnd)) : tiles(past).left;
  const shown =
    past !== null
      ? tiles(past)
      : picture === null
        ? null
        : (basis === 'low' ? picture.low : picture.usual) === null
          ? null
          : tiles((basis === 'low' ? picture.low : picture.usual)!);
  const short = lead !== null && lead < 0;
  const leadColor = short ? stateColors.short.color : colors.ink;
  const canGoBack = back < bars.length;
  // 06.1-55 (A-HOME-1): this month's headline is left after this month's plans; the tiles are a usual (or the low) month. Each is
  // labelled, so the two figures never read as one. A past month's headline and tiles are that month's own records: no labels.
  const leadWords = t(short ? 'decide.screens.home.month.shortIn' : 'decide.screens.home.month.leftIn', { month: name });
  const leadA11y = lead === null ? '' : past === null ? `${formatMoney(Math.abs(lead))} ${leadWords}, ${t('decide.screens.home.month.leadLabel')}` : `${formatMoney(Math.abs(lead))} ${leadWords}`;

  const recordCount = Math.max(0, Math.min(RECORD_MONTHS, props.recordMonths));
  const leftSub = (b: { comesIn: unknown; goesOut: unknown } | null): string | null => {
    if (b === null) return null;
    const { left } = tiles(b);
    return t(left < 0 ? 'decide.screens.home.month.shortSub' : 'decide.screens.home.month.leftSub', { amount: formatMoney(Math.abs(left)) });
  };

  const hasMore = (past === null && picture !== null) || props.recordsUpTo !== null;

  const step = (to: number): void => {
    hapticSelection();
    setBack(to);
  };

  return (
    <View testID="your-month-card" style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('decide.screens.home.month.title')}
      </Text>
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
        <Text testID="month-name" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink, flexShrink: 1, textAlign: 'center' }}>
          {name}
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
        >
          {/* Goes out and left make up what comes in; a short month is what comes in plus the shortfall, which is what goes out.
              The wrapper is the one accessibility stop with all three figures, so the bar itself is hidden from screen readers. */}
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <StackedBar
            segments={
              shown.left < 0
                ? [
                    { key: 'in', value: shown.comesIn, swatch: 'slate' },
                    { key: 'short', value: Math.abs(shown.left), swatch: 'rust' },
                  ]
                : [
                    { key: 'out', value: shown.goesOut, swatch: 'slate' },
                    { key: 'left', value: shown.left, swatch: 'green' },
                  ]
            }
            legend={`${t('decide.screens.home.month.legendIn', { amount: formatMoney(shown.comesIn) })}\n${t(shown.left < 0 ? 'decide.screens.home.month.legendOutShort' : 'decide.screens.home.month.legendOut', { costs: formatMoney(shown.goesOut), left: formatMoney(Math.abs(shown.left)) })}`}
            accessibilityLabel=""
          />
          </View>
        </View>
      )}

      {hasMore ? (
        // 06.1-59 (G-10, section D): the headline and the bar stay; the usual/low switch, its explainer and the records row sit
        // behind More.
        <MoreRow testID="month-more">
          {past === null && picture !== null ? (
            <>
              <View testID="month-basis" accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.home.month.title')} style={[styles.track, { backgroundColor: colors.fill6 }]}>
                <BasisOption label={t('decide.screens.home.month.usual')} sub={leftSub(picture.usual)} selected={basis === 'usual'} onPress={() => setBasis('usual')} />
                <BasisOption label={t('decide.screens.home.month.low')} sub={leftSub(picture.low)} selected={basis === 'low'} onPress={() => setBasis('low')} />
              </View>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
                {t(basis === 'low' ? 'decide.screens.home.month.explainLow' : 'decide.screens.home.month.explainUsual')}
              </Text>
            </>
          ) : null}

          {props.recordsUpTo === null ? null : (
            <Pressable
              testID="month-records"
              accessibilityRole="button"
              accessibilityLabel={t('decide.screens.home.month.recordsRow', { date: props.recordsUpTo, count: recordCount })}
              onPress={() => {
                hapticSelection();
                props.onRecords();
              }}
              style={[styles.records, { borderTopColor: colors.line1 }]}
            >
              <View style={styles.recordsText}>
                <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
                  {t('decide.screens.home.month.recordsRow', { date: props.recordsUpTo, count: recordCount })}
                </Text>
                <View testID="month-records-bar" style={[styles.recordsTrack, { backgroundColor: colors.line4 }]}>
                  <View testID="month-records-fill" style={[styles.recordsFill, { width: `${Math.round((recordCount / RECORD_MONTHS) * 100)}%`, backgroundColor: colors.accent }]} />
                </View>
              </View>
              <View style={[styles.recordsChevron, { borderColor: colors.inkFaint, transform: [{ rotate: '45deg' }] }]} />
            </Pressable>
          )}
        </MoreRow>
      ) : null}
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
  track: { flexDirection: 'row', borderRadius: radii.card, padding: 3, gap: 3 },
  basis: { flex: 1, minHeight: space.touchMin, borderRadius: radii.card - 3, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, paddingHorizontal: space.gapSm },
  records: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, borderTopWidth: 1, paddingTop: space.gapSm },
  recordsText: { flex: 1, gap: 6 },
  recordsTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  recordsFill: { height: 4, borderRadius: 2 },
  recordsChevron: { width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, marginRight: 4 },
});
