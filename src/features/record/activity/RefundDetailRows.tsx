// 05.2-33 (DSU-15, DSU-16, D-10): the transaction-detail rows that open another sheet. A money-in row gets "Refund of..."
// (opens the refund picker) and "Income type" (opens the income tag sheet); a purchase gets a "Refunds" group with one
// row per linked refund and "+ Link a refund". They exist only with the Decide switch on (the sheet decides). The
// linked data comes from useRefundLinks, so a refund in another month is still found.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { TransactionRow } from '@/db/rows';
import { money } from '@/engine/money';
import { useRefundLinks } from '@/data/queries/refundLinks';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import type { PickerDirection } from './refundPickerModel';

export interface RefundDetailCallbacks {
  onRefundPicker: (row: TransactionRow, direction: PickerDirection) => void;
  onIncomeType: (row: TransactionRow) => void;
  /** Opens another row's detail (a linked refund, or the purchase). */
  onOpenRow: (row: TransactionRow) => void;
}

function Chevron({ color }: { color: string }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.chevron, { borderColor: color }]} />;
}

interface LinkRowProps {
  label: string;
  value: string | null;
  a11y: string;
  onPress: () => void;
}

/** A detail row that can be pressed: label above value when the line is tight, chevron at the end. */
export function LinkRow({ label, value, a11y, onPress }: LinkRowProps) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.fill1, opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <Text style={[styles.label, { ...textRole(pairing, 'label'), color: colors.inkMuted }]}>{label}</Text>
      <Text style={[styles.value, { ...textRole(pairing, 'body'), color: colors.ink }]}>{value ?? ''}</Text>
      <Chevron color={colors.inkFaint} />
    </Pressable>
  );
}

export function RefundOfRow({
  row,
  formatter,
  callbacks,
  label,
}: {
  row: TransactionRow;
  formatter: MoneyFormatter;
  callbacks: RefundDetailCallbacks;
  label: string;
}) {
  const t = useT();
  const rc = useRecordContext();
  const { rowsById } = useRefundLinks(rc.householdId, [row], true);
  const purchase = row.refund_of ? rowsById.get(row.refund_of) : undefined;
  const value =
    row.refund_of === null || row.refund_of === undefined
      ? t('activity.refund.notLinked')
      : purchase !== undefined
        ? t('activity.refund.linkedValue', { payee: purchase.name ?? '', date: formatter.formatDate(purchase.local_date, 'short') })
        : '';
  return (
    <LinkRow
      label={label}
      value={value}
      a11y={value === '' ? label : `${label}, ${value}`}
      onPress={() => callbacks.onRefundPicker(row, 'refund->purchase')}
    />
  );
}

export function RefundsGroup({
  row,
  formatter,
  callbacks,
}: {
  row: TransactionRow;
  formatter: MoneyFormatter;
  callbacks: RefundDetailCallbacks;
}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const { refunds } = useRefundLinks(rc.householdId, [row], true);
  const mine = refunds.filter((r) => r.refund_of === row.id);
  const group = t('activity.refund.group');
  return (
    <View accessibilityRole="summary" accessibilityLabel={group}>
      <Text style={[styles.groupTitle, { ...textRole(pairing, 'label'), color: colors.inkMuted }]}>{group}</Text>
      {mine.map((r) => {
        const date = formatter.formatDate(r.local_date, 'short');
        const amount = `+${formatter.formatMoney(money(r.original_amount, r.original_currency))}`;
        return (
          <LinkRow
            key={r.id}
            label={r.name ?? ''}
            value={t('activity.refund.refundRowValue', { date, amount })}
            a11y={t('activity.refund.refundRowA11y', { payer: r.name ?? '', date, amount })}
            onPress={() => callbacks.onOpenRow(r)}
          />
        );
      })}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('activity.refund.linkAdd')}
        onPress={() => callbacks.onRefundPicker(row, 'purchase->refund')}
        style={styles.add}
      >
        <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>
          {t('activity.refund.linkAdd')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: space.touchMin,
    paddingVertical: space.rowPadDense,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.gapSm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { flexShrink: 1 },
  value: { flexShrink: 1, flexGrow: 1, textAlign: 'right' },
  groupTitle: { paddingTop: space.rowPadDense },
  add: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  chevron: { width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
});
