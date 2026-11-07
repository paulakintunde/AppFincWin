// 06-17 (G06, D-16): "Close the loan from a sale". What it sold for, the date, and what pays the loan (prefilled with the whole
// balance). One save records the sale and the final payment together (useRecordDebtSale, one call); a payment that covers the
// balance closes the loan, a smaller one leaves the rest owed. The preview says which, in plain words.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { useRecordDebtSale } from '@/data/mutations/growDebts';
import type { DebtRow } from '@/db/debts';
import { DateField } from '@/features/record/entry/pickers/DateField';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { hapticLight, hapticSelection } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useIsDirty } from '@/ui/useIsDirty';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { saleOutcome } from './debtLineModel';
import { useDebtFormat } from './debtScreenData';

export interface SaleSheetProps {
  visible: boolean;
  debt: DebtRow;
  onClose: () => void;
}

interface Fields {
  soldFor: number | null;
  date: string;
  paidWith: number | null;
  accountId: string | null;
}

export function SaleSheet({ visible, debt, onClose }: SaleSheetProps) {
  const t = useT() as (key: string, options?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const fmt = useDebtFormat();
  const dates = useMoneyFormatter(false);
  const accounts = (useAccounts(rc.householdId ?? undefined).data ?? []).filter((a) => a.archived_at === null);
  const { record } = useRecordDebtSale();

  const defaultAccount = debt.account_id ?? (accounts.find((a) => a.kind === 'checking') ?? accounts[0])?.id ?? null;
  const [initial] = useState<Fields>({ soldFor: null, date: rc.today, paidWith: debt.balance, accountId: defaultAccount });
  const [value, setValue] = useState<Fields>(initial);
  const set = (patch: Partial<Fields>) => setValue((v) => ({ ...v, ...patch }));
  const dirty = useIsDirty(initial, value);

  const soldOk = value.soldFor !== null && value.soldFor >= 1 && value.soldFor <= MAX_INPUT_MINOR;
  const paidOk = value.paidWith !== null && value.paidWith >= 0 && value.paidWith <= MAX_INPUT_MINOR;
  const outcome = soldOk && paidOk ? saleOutcome(debt.balance, value.soldFor as number, value.paidWith as number) : null;
  const account = accounts.find((a) => a.id === value.accountId) ?? null;
  const canSave = outcome !== null && !outcome.exceeds && account !== null && value.date <= rc.today && rc.userId !== null;

  const onSave = (): void => {
    if (!canSave || outcome === null || account === null || rc.userId === null) return;
    try {
      const { stepId } = record({
        ownerId: rc.userId,
        debt,
        soldFor: value.soldFor as number,
        paidToLoan: value.paidWith as number,
        saleAccountId: account.id,
        paymentAccountId: account.id,
        saleName: t('grow.debts.sale.soldLineName', { name: debt.name }),
        paymentName: t('grow.debts.sale.finalPaymentLineName', { name: debt.name }),
        date: value.date,
      });
      hapticLight();
      showToast({ kind: 'ordinary', text: { key: 'grow.debts.sale.toast' }, stepId });
      onClose();
    } catch {
      showToast({ kind: 'refusal', text: { key: 'grow.common.saveFailed' } });
    }
  };

  const label = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const title = t('grow.debts.sale.title');

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('grow.common.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <MoneyInput
          boxed
          value={value.soldFor}
          currency={debt.currency}
          onChange={(soldFor) => set({ soldFor })}
          label={t('grow.debts.sale.soldFor')}
          accessibilityLabel={t('grow.debts.sale.soldFor')}
        />
        <DateField label={t('grow.debts.sale.date')} value={value.date} display={dates.formatDate(value.date)} onChange={(date) => set({ date })} />
        <MoneyInput
          boxed
          value={value.paidWith}
          currency={debt.currency}
          onChange={(paidWith) => set({ paidWith })}
          label={t('grow.debts.sale.paidOffWith')}
          accessibilityLabel={t('grow.debts.sale.paidOffWith')}
        />
        {outcome === null ? null : (
          <View testID="sale-preview" style={styles.group}>
            {outcome.exceeds ? (
              <Text style={{ ...body, color: colors.danger }}>{t('grow.debts.sale.paymentExceedsBalance', { owed: fmt.money(debt.balance, debt.currency) })}</Text>
            ) : outcome.paidOff ? (
              <Text style={body}>
                {t('grow.debts.sale.previewLeftover', { owed: fmt.money(value.paidWith as number, debt.currency), leftover: fmt.money(outcome.leftOver, debt.currency) })}
              </Text>
            ) : (
              <Text style={body}>{t('grow.debts.sale.previewOwed', { amount: fmt.money(outcome.stillOwed, debt.currency) })}</Text>
            )}
            {outcome.exceeds || account === null ? null : (
              <Text style={label}>{`${t('grow.debts.sale.leftoverTo')}: ${account.name}`}</Text>
            )}
          </View>
        )}
        {accounts.length > 1 ? (
          <View accessibilityRole="radiogroup" accessibilityLabel={t('grow.debts.sale.leftoverTo')} style={styles.chips}>
            {accounts.map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                selected={value.accountId === a.id}
                onPress={() => {
                  hapticSelection();
                  set({ accountId: a.id });
                }}
              />
            ))}
          </View>
        ) : null}
        <Pill label={t('grow.debts.sale.save')} variant="primary" disabled={!canSave} onPress={onSave} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  group: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
