// Read-only transaction detail sheet (ACT-13, CONTEXT D-01, UI-SPEC section 5). It never
// writes: every button hands back to the screen, which owns the mutations and the
// confirm / scope prompts.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import type { ActivityRowView } from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { flowOf, rowTag } from '@/engine/activity';
import { money } from '@/engine/money';
import { categoryName } from '@/features/record/categoryName';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { CategorySwatchKey } from '@/theme/tokens';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { DetailRow, DetailSheet } from '@/ui/DetailSheet';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { RateAttribution } from '@/ui/RateAttribution';
import { detailRowsFor, statusActionFor } from './detailRows';

export interface TransactionDetailSheetProps {
  row: ActivityRowView | null;
  visible: boolean;
  today: string;
  onDismiss: () => void;
  onStatus: (next: 'paid' | 'pending') => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
}

export function TransactionDetailSheet({ row, visible, today, onDismiss, onStatus, onEdit, onClone, onDelete }: TransactionDetailSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const ctx = useRecordContext();
  const formatter = useMoneyFormatter(ctx.showCents);
  const accounts = useAccounts(ctx.householdId ?? undefined);
  const categories = useCategoryLookup(ctx.userId ?? undefined);
  const series = useRecurringSeries(ctx.householdId ?? undefined);

  if (row === null) return null;

  const accountName = (id: string | null) => (id === null ? null : (accounts.data?.find((a) => a.id === id)?.name ?? null));
  const isTransfer = row.transfer_id !== null;
  const category = isTransfer
    ? categories.all.find((c) => c.id === categories.transferCategoryId)
    : row.category_id !== null
      ? categories.byId.get(row.category_id)
      : undefined;
  const categoryLabel = category ? categoryName(category, t) : null;
  const seriesRow = row.recurring_series_id !== null ? series.data?.find((s) => s.id === row.recurring_series_id) : undefined;
  const repeatsLabel = seriesRow ? t(`record.repeats.${seriesRow.freq}`) : null;
  const paymentTypeLabel = row.payment_type !== null ? t(`record.paymentType.${row.payment_type}`) : null;
  const name = row.name ?? categoryLabel ?? '';

  const specs = detailRowsFor({
    row,
    today,
    accountName: accountName(row.account_id),
    counterpartName: accountName(row.counterpartAccountId),
    categoryName: categoryLabel,
    paymentTypeLabel,
    repeatsLabel,
    t: (key, params) => String(t(key as never, params as never)),
  });

  const tag = rowTag(row, today);
  const flow = flowOf(row);
  const amountText = formatter.formatMoney(money(row.original_amount, row.original_currency));
  const amountShown = !isTransfer && row.original_amount > 0 ? `+${amountText}` : amountText;
  const amountColor = isTransfer ? colors.inkDim : flow === 'in' || tag.refund ? colors.accent : colors.ink;
  const swatchKey: CategorySwatchKey = (category?.color_key as CategorySwatchKey | undefined) ?? 'slate';

  const foreign = !isTransfer && row.original_currency !== row.home_currency;
  const fxNote =
    foreign && row.rate !== null
      ? t('activity.detail.fxNote', {
          native: amountText,
          unit: `1 ${row.original_currency}`,
          rate: `${row.rate} ${row.home_currency}`,
        })
      : null;

  const action = statusActionFor(row);

  return (
    <DetailSheet
      visible={visible}
      onDismiss={onDismiss}
      accessibilityLabel={name}
      leading={<CategoryGlyph colorKey={swatchKey} letter={(name.trim().charAt(0) || '?').toUpperCase()} />}
      title={name}
      subtitle={[categoryLabel, formatter.formatDate(row.local_date, 'short')].filter((p) => p !== null && p !== '').join(' · ')}
      trailing={<Text style={{ ...textRole(pairing, 'body'), color: amountColor }}>{amountShown}</Text>}
      note={
        fxNote !== null ? (
          <View style={styles.fx}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{fxNote}</Text>
            <RateAttribution rateDate={row.rate_date} rateSource={row.rate_source} ratePending={row.rate_pending} />
          </View>
        ) : undefined
      }
      actions={
        <>
          {action !== null ? <Pill label={t(`activity.detail.${action.key}`)} variant="primary" onPress={() => onStatus(action.next)} /> : null}
          <Pill label={t('activity.detail.edit')} variant="secondary" onPress={onEdit} />
          {!isTransfer ? <Pill label={t('activity.detail.clone')} variant="secondary" onPress={onClone} /> : null}
          <Pill label={t('activity.detail.delete')} variant="danger" onPress={onDelete} />
        </>
      }
    >
      {specs.map((spec) => (
        <DetailRow key={spec.key} label={t(spec.labelKey as never)} value={spec.value} tone={spec.tone} emptyText={t('activity.detail.empty')} />
      ))}
    </DetailSheet>
  );
}

const styles = StyleSheet.create({
  fx: { gap: 2, paddingBottom: space.gapMd },
});
