// The recurring-from-history offer (ACT-11, CONTEXT D-18, D-19): a card above the month's list
// when lines also ran last month at about the same amount. Review each opens the review sheet,
// Mark all monthly creates the series as one undo step, Not now stores the offer keys on the
// server so they never return on any device. Declarative question, never advice.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TransactionRow } from '@/db/rows';
import { useDismissOffers } from '@/data/mutations/dismissedOffers';
import { useMarkMonthly } from '@/data/mutations/markMonthly';
import type { SeriesOffer } from '@/engine/recurring';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';

export interface SeriesOfferCardProps {
  offers: readonly SeriesOffer[];
  rowsById: ReadonlyMap<string, TransactionRow>;
  onReview: () => void;
}

/** The most common previousMonth among offers (ties go to the latest month). */
export function commonPreviousMonth(offers: readonly SeriesOffer[]): string {
  const counts = new Map<string, number>();
  for (const o of offers) counts.set(o.previousMonth, (counts.get(o.previousMonth) ?? 0) + 1);
  let best = '';
  let bestCount = -1;
  for (const [month, n] of counts) {
    if (n > bestCount || (n === bestCount && month > best)) {
      best = month;
      bestCount = n;
    }
  }
  return best;
}

export function shortMonthName(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1));
}

/** A 44px outlined button in ink (Mark all monthly on the card, Leave them all in the sheet). */
export function OutlinedButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.outlined, { borderColor: colors.ink }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}

export function SeriesOfferCard({ offers, rowsById, onReview }: SeriesOfferCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const { markAll } = useMarkMonthly();
  const { dismiss } = useDismissOffers(rc.userId ?? '');

  if (offers.length === 0) return null;

  const onMarkAll = () => {
    if (rc.householdId === null || rc.userId === null) return;
    markAll({ offers, rowsById, householdId: rc.householdId, ownerId: rc.userId, timeZone: rc.timeZone });
  };
  const onNotNow = () => {
    if (rc.userId === null) return;
    dismiss(offers.map((o) => o.key));
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.fill1 }]}>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
        {t('activity.offer.body', {
          count: offers.length,
          month: shortMonthName(commonPreviousMonth(offers), formatter.locale),
        })}
      </Text>
      <View style={styles.actions}>
        <Pill label={t('activity.offer.review')} variant="primary" onPress={onReview} />
        <OutlinedButton label={t('activity.offer.markAll')} onPress={onMarkAll} />
        <Pressable accessibilityRole="button" accessibilityLabel={t('activity.offer.notNow')} onPress={onNotNow} style={styles.text}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('activity.offer.notNow')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  outlined: {
    minHeight: space.touchMin,
    paddingVertical: space.pillPadV,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { minHeight: space.touchMin, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
});
