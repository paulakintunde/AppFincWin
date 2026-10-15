// Band 3 of the Activity header (D-47..D-50, D-70): the read-only summary card. It formats engine
// output only; no arithmetic beyond Math.abs for display. The figure is position.left, never
// changed by the entry count or a narrowing filter (D-70). There is no paid-versus-pending bar
// (D-48), and the card is one screen-reader stop (D-50).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import type { MonthPosition } from '@/engine/activity';
import { money } from '@/engine/money';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { useFontScale } from '@/theme/FontScaleProvider';
import { radii, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';

const FIGURE_STACK_ABOVE = 1.3;
// final-size placeholder (UI-SPEC Loading)
const PLACEHOLDER_FIGURE_HEIGHT = 30;
const PLACEHOLDER_FIGURE_WIDTH = 160;
const PLACEHOLDER_LINE_HEIGHT = 14;
const PLACEHOLDER_LINE_WIDTH = 200;
const PLACEHOLDER_RADIUS = 8;

export interface ActivitySummaryCardProps {
  position: MonthPosition;
  unconvertedCount: number;
  entryCount: { total: number; shown: number; narrowed: boolean };
  balanceNote?: { allAccounts: boolean; inexact: boolean };
  loading: boolean;
  /** CR-01 / T-03-22-01: a core read failed or is offline with nothing cached; no figure shows. */
  unavailable?: 'error' | 'offline' | null;
  formatter: MoneyFormatter;
  homeCurrency: string;
}

export function ActivitySummaryCard({
  position,
  unconvertedCount,
  entryCount,
  balanceNote,
  loading,
  unavailable = null,
  formatter,
  homeCurrency,
}: ActivitySummaryCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const fontScale = useFontScale();
  const stacked = fontScale > FIGURE_STACK_ABOVE;
  const fmt = (amount: number) => formatter.formatMoney(money(amount, homeCurrency));
  const container = [styles.card, { backgroundColor: colors.surface }, shadows.card];

  if (loading) {
    const block = { backgroundColor: colors.line4, borderRadius: PLACEHOLDER_RADIUS };
    return (
      <View
        testID="activity-summary-card"
        style={container}
        accessible
        accessibilityLabel={t('home.loading')}
        accessibilityState={{ busy: true }}
      >
        <View style={[block, { height: PLACEHOLDER_FIGURE_HEIGHT, width: PLACEHOLDER_FIGURE_WIDTH }]} />
        <View
          style={[block, { height: PLACEHOLDER_LINE_HEIGHT, width: PLACEHOLDER_LINE_WIDTH, marginTop: space.gapSm }]}
        />
      </View>
    );
  }

  // D-47: the same copy and rule as Home's ThisMonthCard, so the two tabs agree on a failed read.
  if (unavailable !== null) {
    return (
      <View testID="activity-summary-card" accessible style={container}>
        <Text testID="activity-summary-unavailable" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {t(unavailable === 'error' ? 'home.state.monthError' : 'home.state.monthOffline')}
        </Text>
      </View>
    );
  }

  const entries =
    entryCount.narrowed && entryCount.shown !== entryCount.total
      ? t('activity.summary.entriesOf', { shown: entryCount.shown, count: entryCount.total })
      : t('activity.months.entries', { count: entryCount.total });
  const caption = t('activity.summary.caption', { caption: t('home.month.caption'), entries });
  const figure = position.left >= 0 ? `+${fmt(position.left)}` : fmt(position.left);
  const figureColor = position.left >= 0 ? colors.accent : colors.danger;
  const stillText = position.unpaid > 0 ? t('activity.summary.stillToCome', { amount: fmt(position.unpaid) }) : null;
  // undefined = not the balance view (show In/Out); null = balance view with nothing to say.
  const note =
    balanceNote === undefined
      ? undefined
      : balanceNote.inexact
        ? t('activity.balance.waiting')
        : balanceNote.allAccounts
          ? t('activity.balance.allAccounts')
          : null;

  let label =
    note === undefined
      ? t('activity.summary.a11y', {
          figure,
          entries,
          in: fmt(position.paidIn),
          out: fmt(Math.abs(position.paidOut)),
        })
      : t('activity.summary.a11yBalance', {
          figure,
          entries,
          note: note === null ? t('activity.view.balance') : note,
        });
  if (stillText !== null) {
    label += ' ' + t('activity.summary.a11yStillToCome', { amount: fmt(position.unpaid) });
  }

  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };

  return (
    <View testID="activity-summary-card" accessible accessibilityLabel={label} style={container}>
      <View style={[styles.top, { flexDirection: stacked ? 'column' : 'row' }]}>
        <View>
          <Text scale="capped" style={{ ...textRole(pairing, 'heading'), color: figureColor }}>
            {figure}
          </Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{caption}</Text>
        </View>
        {stillText !== null ? (
          <Text testID="activity-summary-still" style={{ ...small, color: colors.warn1 }}>
            {stillText}
          </Text>
        ) : null}
      </View>
      {note === undefined ? (
        <Text testID="activity-summary-inout" style={[small, { color: colors.inkMuted, marginTop: space.gapSm }]}>
          {t('activity.totals.in')} <Text style={{ color: colors.ink }}>{fmt(position.paidIn)}</Text>
          {' · '}
          {t('activity.totals.out')} <Text style={{ color: colors.ink }}>{fmt(Math.abs(position.paidOut))}</Text>
        </Text>
      ) : note !== null ? (
        <Text
          testID="activity-summary-note"
          style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, marginTop: space.gapSm }}
        >
          {note}
        </Text>
      ) : null}
      {unconvertedCount > 0 ? (
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, marginTop: space.gapSm }}>
          {t('activity.totals.unconverted', { count: unconvertedCount })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.cardPad, borderRadius: radii.card },
  top: {
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.gapSm,
    flexWrap: 'wrap',
  },
});
