// Recurring review (ACT-11, CONTEXT D-19, UI-SPEC 3): one line per offer with Monthly / One-off.
// Monthly creates that series (one undo step); One-off dismisses the offer for good. The footer
// marks everything left as monthly or leaves them all (dismissing them).
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TransactionRow } from '@/db/rows';
import { useCategoryLookup } from '@/data/queries/categories';
import { useDismissOffers } from '@/data/mutations/dismissedOffers';
import { useMarkMonthly } from '@/data/mutations/markMonthly';
import { money } from '@/engine/money';
import type { SeriesOffer } from '@/engine/recurring';
import { categoryName } from '@/features/record/categoryName';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { OutlinedButton, commonPreviousMonth, shortMonthName } from './SeriesOfferCard';

export interface RecurringReviewSheetProps {
  visible: boolean;
  offers: readonly SeriesOffer[];
  rowsById: ReadonlyMap<string, TransactionRow>;
  onClose: () => void;
}

export function RecurringReviewSheet({ visible, offers, rowsById, onClose }: RecurringReviewSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const categories = useCategoryLookup(rc.userId ?? undefined);
  const { markAll, markOne } = useMarkMonthly();
  const { dismiss } = useDismissOffers(rc.userId ?? '');
  // Keys handled here; the offers prop shrinks once the cache catches up, and a handled key stays handled.
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const remaining = offers.filter((o) => !handled.has(o.key));
  const close = onClose;

  const ids = rc.householdId !== null && rc.userId !== null ? { householdId: rc.householdId, ownerId: rc.userId } : null;
  const without = (key: string) => setHandled((s) => new Set([...s, key]));

  const onMonthly = (offer: SeriesOffer) => {
    if (ids === null) return;
    markOne({ offer, rowsById, ...ids, timeZone: rc.timeZone });
    without(offer.key);
  };
  const onOneOff = (offer: SeriesOffer) => {
    if (rc.userId === null) return;
    dismiss([offer.key]);
    without(offer.key);
  };
  const onMarkAll = () => {
    if (ids === null || remaining.length === 0) return;
    markAll({ offers: remaining, rowsById, ...ids, timeZone: rc.timeZone });
    setHandled(new Set(offers.map((o) => o.key)));
    close();
  };
  const onLeaveAll = () => {
    if (rc.userId !== null && remaining.length > 0) dismiss(remaining.map((o) => o.key));
    setHandled(new Set(offers.map((o) => o.key)));
    close();
  };

  // Nothing to review (every new user): render nothing rather than an empty sheet.
  if (offers.length === 0) return null;

  const month = shortMonthName(commonPreviousMonth(offers), formatter.locale);
  const title = t('activity.review.title');

  return (
    <Sheet visible={visible} onDismiss={close} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('a11y.close')} onCancel={close} />
      <SheetScroll contentContainerStyle={styles.body}>
        {remaining.length === 0 ? (
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('activity.review.empty')}</Text>
        ) : (
          <>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('activity.review.body', { month })}</Text>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('activity.review.group', { month })}</Text>
            {remaining.map((offer) => {
              const latest = rowsById.get(offer.latestRowId);
              const category = latest?.category_id != null ? categories.byId.get(latest.category_id) : undefined;
              const detail = t('activity.review.row', {
                amount: formatter.formatMoney(money(offer.suggestion.amount, offer.suggestion.currency)),
                category: category !== undefined ? categoryName(category, t) : t('record.sheet.uncategorised'),
                day: latest !== undefined ? Number(latest.local_date.slice(8, 10)) : '',
              });
              return (
                <View key={offer.key} style={[styles.line, { backgroundColor: colors.fill1 }]}>
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{offer.suggestion.name}</Text>
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{detail}</Text>
                  <View style={styles.pills}>
                    <Pill
                      label={t('activity.review.monthly')}
                      variant="secondary"
                      accessibilityLabel={`${t('activity.review.monthly')}, ${offer.suggestion.name}`}
                      onPress={() => onMonthly(offer)}
                    />
                    <Pill
                      label={t('activity.review.oneOff')}
                      variant="secondary"
                      accessibilityLabel={`${t('activity.review.oneOff')}, ${offer.suggestion.name}`}
                      onPress={() => onOneOff(offer)}
                    />
                  </View>
                </View>
              );
            })}
          </>
        )}
      </SheetScroll>
      {remaining.length > 0 ? (
        <View style={styles.footer}>
          <Pill label={t('activity.review.markAll')} variant="primary" onPress={onMarkAll} />
          <OutlinedButton label={t('activity.review.leaveAll')} onPress={onLeaveAll} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingBottom: space.groupGap },
  line: { borderRadius: radii.card, padding: space.cardPad, gap: 6 },
  pills: { flexDirection: 'row', gap: 8, marginTop: 6 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 },
});
