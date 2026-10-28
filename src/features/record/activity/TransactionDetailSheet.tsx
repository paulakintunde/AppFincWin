// Read-only transaction detail sheet (ACT-13, CONTEXT D-01, UI-SPEC section 5). It never
// writes: every button hands back to the screen, which owns the mutations and the
// confirm / scope prompts.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAccounts } from '@/data/queries/accounts';
import type { ActivityRowView } from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useLinkedFees } from '@/data/queries/transactions';
import { flowOf, rowTag } from '@/engine/activity';
import { currencyExponent, knownCurrencyExponent, money } from '@/engine/money';
import { impliedRate } from '@/engine/statement';
import { categoryName } from '@/features/record/categoryName';
import { useDecideAccess } from '@/features/decide/useDecideAccess';
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
import { kindNameKey } from './IncomeTagChip';
import { LinkRow, RefundOfRow, RefundsGroup, type RefundDetailCallbacks } from './RefundDetailRows';
import { formatStatementMoney } from './statementMoney';

export interface TransactionDetailSheetProps {
  row: ActivityRowView | null;
  visible: boolean;
  today: string;
  onDismiss: () => void;
  onStatus: (next: 'paid' | 'pending') => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  /** 05.2-33: opens the refund picker / income tag sheet / another row. Without it (or with the Decide switch off) the rows do not exist. */
  refundCallbacks?: RefundDetailCallbacks;
}

export function TransactionDetailSheet({ row, visible, today, onDismiss, onStatus, onEdit, onClone, onDelete, refundCallbacks }: TransactionDetailSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const ctx = useRecordContext();
  const formatter = useMoneyFormatter(ctx.showCents);
  const accounts = useAccounts(ctx.householdId ?? undefined);
  const categories = useCategoryLookup(ctx.userId ?? undefined);
  const series = useRecurringSeries(ctx.householdId ?? undefined);
  const linkedFees = useLinkedFees(ctx.householdId, row);
  const { v3 } = useDecideAccess();

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
    decideV3: v3 && refundCallbacks !== undefined,
    incomeTypeLabel: row.income_kind ? t(kindNameKey(row.income_kind)) : null,
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

  // D-33 / D-32: the bank's own conversion, from stored figures only. No market rate is read or
  // compared here (D-31).
  const hasStatement = !isTransfer && row.stmt_orig_amount != null && row.stmt_orig_currency != null;
  let statementLine: string | null = null;
  if (hasStatement) {
    const origMag = Math.abs(row.stmt_orig_amount as number);
    const original = formatStatementMoney(formatter, origMag, row.stmt_orig_currency as string);
    const chargedMag = Math.abs(row.original_amount);
    const charged = formatter.formatMoney(money(chargedMag, row.original_currency));
    // Review IN-01: the account currency is always one the app holds; the statement's code gets an
    // implied rate only when it is a currency the app knows, never a guessed scale.
    const chargedExp = knownCurrencyExponent(row.original_currency) ?? currencyExponent(row.original_currency);
    const foreignExp = knownCurrencyExponent(row.stmt_orig_currency as string);
    statementLine =
      chargedExp === null || foreignExp === null
        ? t('activity.detail.statementConversionNoRate', { original, charged })
        : t('activity.detail.statementConversion', {
            original,
            charged,
            rate: impliedRate({ magnitude: chargedMag, exponent: chargedExp }, { magnitude: origMag, exponent: foreignExp }),
          });
  }
  const feeLines = hasStatement
    ? (linkedFees.data ?? []).map((fee) => ({
        id: fee.id,
        text: t('activity.detail.statementFee', { fee: formatter.formatMoney(money(Math.abs(fee.original_amount), fee.original_currency)) }),
      }))
    : [];

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
        statementLine !== null || fxNote !== null ? (
          <View>
            {statementLine !== null ? (
              <View style={styles.fx}>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{statementLine}</Text>
                {feeLines.map((fee) => (
                  <Text key={fee.id} style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{fee.text}</Text>
                ))}
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('activity.detail.statementConversionNote')}</Text>
              </View>
            ) : null}
            {fxNote !== null ? (
              <View style={styles.fx}>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{fxNote}</Text>
                <RateAttribution rateDate={row.rate_date} rateSource={row.rate_source} ratePending={row.rate_pending} />
              </View>
            ) : null}
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
      {specs.map((spec) => {
        const label = t(spec.labelKey as never);
        if (spec.action !== undefined && refundCallbacks !== undefined) {
          if (spec.action === 'refundOf') {
            return <RefundOfRow key={spec.key} row={row} formatter={formatter} callbacks={refundCallbacks} label={label} />;
          }
          if (spec.action === 'refundsGroup') {
            return <RefundsGroup key={spec.key} row={row} formatter={formatter} callbacks={refundCallbacks} />;
          }
          return (
            <LinkRow
              key={spec.key}
              label={label}
              value={spec.value}
              a11y={`${label}, ${spec.value ?? ''}`}
              onPress={() => refundCallbacks.onIncomeType(row)}
            />
          );
        }
        return <DetailRow key={spec.key} label={label} value={spec.value} tone={spec.tone} emptyText={t('activity.detail.empty')} />;
      })}
    </DetailSheet>
  );
}

const styles = StyleSheet.create({
  fx: { gap: 2, paddingBottom: space.gapMd },
});
