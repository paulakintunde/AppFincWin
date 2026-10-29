// 05.2-30 (DSU-16, D-10): the two-way refund tag in Activity. The refund row says "Refund of {payee} · {date}", the
// purchase row says "Refunded {x}" (the total of every linked refund); each opens the other row. Balances and the row
// amounts are not changed. Pure model first, then the tag.
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { TransactionRow } from '@/db/rows';
import { money } from '@/engine/money';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';

export type RefundTagModel =
  | { kind: 'refundOf'; purchase: TransactionRow }
  | { kind: 'refunded'; total: number; currency: string; purchase: TransactionRow };

/**
 * What a row's refund tag is, from the rows on screen. A refund whose purchase is not among them gets no tag (the
 * purchase cannot be opened); a purchase gets the tag only while it has live refunds.
 */
export function refundTagFor<R extends TransactionRow>(
  row: R,
  rowsById: ReadonlyMap<string, R>,
  totals: ReadonlyMap<string, number>
): RefundTagModel | null {
  if (row.deleted_at !== null) return null;
  const purchaseId = row.refund_of ?? null;
  if (purchaseId !== null) {
    const purchase = rowsById.get(purchaseId);
    return purchase === undefined ? null : { kind: 'refundOf', purchase };
  }
  const total = totals.get(row.id) ?? 0;
  return total > 0 ? { kind: 'refunded', total, currency: row.original_currency, purchase: row } : null;
}

export interface RefundTagProps {
  model: RefundTagModel;
  /** The refund row, for its date. */
  row: Pick<TransactionRow, 'local_date'>;
  formatter: MoneyFormatter;
  /** Opens the purchase's detail (both directions open the purchase, or its refund, via the caller). */
  onPress: () => void;
}

export function RefundTag({ model, row, formatter, onPress }: RefundTagProps) {
  const t = useT();
  const { colors, pairing } = useTheme();

  let label: string;
  let a11y: string;
  if (model.kind === 'refundOf') {
    const payee = model.purchase.name ?? '';
    const date = formatter.formatDate(row.local_date, 'medium');
    label = t('activity.refund.tagRefundOf', { payee, date });
    a11y = t('activity.refund.a11yRefundOf', { payee, date });
  } else {
    const amount = formatter.formatMoney(money(model.total, model.currency));
    label = t('activity.refund.tagRefunded', { amount });
    a11y = t('activity.refund.a11yRefunded', { amount });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={[styles.tag, { backgroundColor: colors.fill1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: colors.inkDim }}>{label}</Text>
    </Pressable>
  );
}

const HIT_SLOP = { top: 10, bottom: 10, left: 4, right: 4 };

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    borderRadius: radii.pill,
    paddingHorizontal: space.gapSm,
    paddingVertical: 3,
  },
});
