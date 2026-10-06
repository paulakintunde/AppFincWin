// The add/edit transaction sheet (REC-01..04). One component for expense and income; every
// write goes through the queued mutation hooks and records its own undo step, then shows
// the Undo toast tied to that step (D-31). Form rules live in transactionForm.ts (pure).
// Copy is declarative, never advice.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { currencyExponent, money } from '@/engine/money';
import { monthOf } from '@/engine/time';
import type { MinorUnits } from '@/engine/money';
import type { PaymentType, TransactionRow } from '@/db/rows';
import { PAYMENT_TYPES } from '@/db/rows';
import { useAccounts } from '@/data/queries/accounts';
import { useCategoryLookup } from '@/data/queries/categories';
import { useCurrencyOptions } from '@/data/queries/currencyOptions';
import { useAddTransaction, useDeleteTransaction, useEditTransaction } from '@/data/mutations/transactions';
import { newStepId } from '@/data/mutations/undoCapture';
import { useRecordContext } from '@/features/record/useRecordContext';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { getAnalytics } from '@/services/analytics';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { AmountDisplay } from '@/ui/AmountDisplay';
import { Chip } from '@/ui/Chip';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';
import { RateAttribution } from '@/ui/RateAttribution';
import { Row } from '@/ui/Row';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useAmountParser } from '@/ui/money/useAmountParser';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { AccountPicker } from './pickers/AccountPicker';
import { CategoryPicker } from './pickers/CategoryPicker';
import { DateField } from './pickers/DateField';
import { OptionPicker } from './pickers/OptionPicker';
import {
  initialFormState,
  toAddInput,
  toPatch,
  validateForm,
  withAccount,
  withDate,
  withDirection,
  withStatus,
  type Direction,
  type EntryMode,
  type FormContext,
  type FormState,
} from './transactionForm';

export interface TransactionSheetProps {
  visible: boolean;
  mode: EntryMode;
  onClose: () => void;
}

type PickerKey = 'category' | 'account' | 'payment' | 'currency' | null;

export function TransactionSheet({ visible, mode, onClose }: TransactionSheetProps) {
  const t = useT();
  const title =
    mode.kind === 'new'
      ? t(mode.direction === 'in' ? 'record.sheet.titleNewIncome' : 'record.sheet.titleNewExpense')
      : t('record.sheet.titleEdit');

  if (!visible) return null;

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      <SheetBody mode={mode} onClose={onClose} />
    </Sheet>
  );
}

function SheetBody({ mode, onClose }: { mode: EntryMode; onClose: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const accountsData = useAccounts(rc.householdId ?? undefined).data;
  const accounts = useMemo(() => accountsData ?? [], [accountsData]);
  const categories = useCategoryLookup(rc.userId ?? undefined);
  const { options } = useCurrencyOptions(rc.userId ?? undefined);
  const parser = useAmountParser(rc.region);
  const formatter = useMoneyFormatter(rc.showCents);
  const { add } = useAddTransaction();
  const { edit } = useEditTransaction();
  const { remove } = useDeleteTransaction();

  const activeAccounts = useMemo(() => accounts.filter((a) => a.archived_at === null), [accounts]);
  const exponentFor = (code: string): number => options.find((o) => o.code === code)?.exponent ?? currencyExponent(code);
  const formCtx: FormContext = {
    today: rc.today,
    defaultAccount: activeAccounts[0] ? { id: activeAccounts[0].id, currency: activeAccounts[0].currency } : null,
    exponentFor,
    accountCurrency: (id) => accounts.find((a) => a.id === id)?.currency,
  };

  const [state, setState] = useState<FormState>(() => initialFormState(mode, formCtx));
  const [picker, setPicker] = useState<PickerKey>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editRow: TransactionRow | null = mode.kind === 'edit' ? mode.row : null;
  const isNew = mode.kind === 'new';
  const parse = (text: string, currency: string) => parser.parse(text, currency, exponentFor(currency));
  const errors = submitted ? validateForm(state, parse) : [];
  const amountError = errors.find((e): e is { amount: Extract<ReturnType<typeof parse>, { ok: false }> } => typeof e === 'object');

  const titleText = isNew
    ? t(state.direction === 'in' ? 'record.sheet.titleNewIncome' : 'record.sheet.titleNewExpense')
    : t('record.sheet.titleEdit');
  let saveText: string = t('record.sheet.saveExpense');
  if (!isNew) saveText = t('record.sheet.saveChanges');
  else if (state.direction === 'in') saveText = t('record.sheet.saveIncome');

  const set = (patch: Partial<FormState>) => setState((s) => ({ ...s, ...patch }));

  const parsedAmount = parse(state.amountText, state.currency);
  const option = options.find((o) => o.code === state.currency);
  const amountFigure = parsedAmount.ok
    ? formatter.formatMoney(money(parsedAmount.value, state.currency), {
        exponent: exponentFor(state.currency),
        customSymbol: option?.kind === 'custom' ? (option.symbol ?? undefined) : undefined,
      })
    : state.amountText;

  const save = () => {
    setSubmitted(true);
    if (validateForm(state, parse).length > 0 || !rc.householdId || !rc.userId) return;
    const amountMinor = (parse(state.amountText, state.currency) as { value: MinorUnits }).value;
    const name = state.name.trim();

    if (editRow) {
      const patch = toPatch(editRow, state, amountMinor);
      const keys = Object.keys(patch) as (keyof typeof patch)[];
      if (keys.length === 0) {
        onClose();
        return;
      }
      const before: Record<string, string | number | null> = {};
      for (const key of keys) before[key] = (editRow as unknown as Record<string, string | number | null>)[key] ?? null;
      const stepId = newStepId();
      const recorded = edit(
        { id: editRow.id, householdId: editRow.household_id, month: monthOf(editRow.local_date), expectedVersion: editRow.version, patch },
        { stepId, ownerId: rc.userId, labelKey: 'edited', labelParams: { name }, before }
      );
      showToast({ kind: 'ordinary', text: undoLabelText('edited', { name }), stepId: recorded ? stepId : null });
      onClose();
      return;
    }

    const stepId = newStepId();
    add({
      ...toAddInput(state, amountMinor, {
        householdId: rc.householdId,
        userId: rc.userId,
        homeCurrency: rc.homeCurrency,
        timeZone: rc.timeZone,
      }),
      undo: { stepId, labelKey: 'added', labelParams: { name } },
    });
    showToast({ kind: 'ordinary', text: undoLabelText('added', { name }), stepId });
    getAnalytics().track('transaction_added', { kind: state.direction === 'in' ? 'income' : 'expense', recurring: false });
    onClose();
  };

  const doDelete = () => {
    if (!editRow || !rc.userId) return;
    setConfirmDelete(false);
    const stepId = remove(editRow, rc.userId);
    showToast({ kind: 'destructive', text: undoLabelText('deleted', { name: editRow.name ?? undefined }), stepId });
    onClose();
  };

  const accountName = accounts.find((a) => a.id === state.accountId)?.name ?? '';
  const category = state.categoryId ? categories.active.find((c) => c.id === state.categoryId) : undefined;
  const categoryLabel = category ? categoryName(category, t) : t('record.sheet.uncategorised');
  const paymentOptions = (PAYMENT_TYPES[state.direction === 'in' ? 'in' : 'out'] as readonly PaymentType[]).map((value) => ({
    value,
    label: t(`record.paymentType.${value}`),
  }));
  const inputStyle = [
    textRole(pairing, 'body'),
    styles.input,
    { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 },
  ];

  return (
    <>
      <SheetHeader title={titleText} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.column}>
        {isNew ? (
          <View style={styles.chips}>
            {(['out', 'in'] as Direction[]).map((d) => (
              <Chip
                key={d}
                label={t(d === 'out' ? 'record.sheet.directionOut' : 'record.sheet.directionIn')}
                selected={state.direction === d}
                onPress={() => setState((s) => withDirection(s, d))}
              />
            ))}
          </View>
        ) : null}

        <AmountDisplay text={amountFigure === '' ? formatter.formatMoney(money(0, state.currency || 'GBP')) : amountFigure} tone="default" />
        <TextInput
          accessibilityLabel={t('record.sheet.field.amount')}
          keyboardType="decimal-pad"
          value={state.amountText}
          onChangeText={(text) => set({ amountText: text })}
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />
        {amountError ? <Text style={[textRole(pairing, 'label'), { color: colors.danger }]}>{parser.errorMessage(amountError.amount)}</Text> : null}

        <TextInput
          accessibilityLabel={t('record.sheet.namePlaceholder')}
          placeholder={t('record.sheet.namePlaceholder')}
          placeholderTextColor={colors.inkFaint}
          value={state.name}
          onChangeText={(text) => set({ name: text })}
          style={inputStyle}
        />
        {errors.includes('nameRequired') ? <Text style={[textRole(pairing, 'label'), { color: colors.danger }]}>{t('record.sheet.nameRequired')}</Text> : null}

        <Row label={t('record.sheet.field.category')} value={categoryLabel} dense chevron onPress={() => setPicker('category')} />
        <Row label={t('record.sheet.field.account')} value={accountName} dense chevron onPress={() => setPicker('account')} />
        {errors.includes('accountRequired') ? <Text style={[textRole(pairing, 'label'), { color: colors.danger }]}>{t('record.sheet.accountRequired')}</Text> : null}
        <DateField
          label={t('record.sheet.field.date')}
          value={state.localDate}
          display={formatter.formatDate(state.localDate)}
          onChange={(d) => setState((s) => withDate(s, d, rc.today))}
        />
        <Row
          label={t('record.sheet.field.paymentType')}
          value={state.paymentType ? t(`record.paymentType.${state.paymentType}`) : t('record.sheet.none')}
          dense
          chevron
          onPress={() => setPicker('payment')}
        />
        <Row label={t('record.sheet.field.currency')} value={state.currency} dense chevron onPress={() => setPicker('currency')} />

        <View style={styles.chips}>
          <Pill
            label={t('record.sheet.status.paid')}
            variant={state.status === 'paid' ? 'primary' : 'secondary'}
            selected={state.status === 'paid'}
            onPress={() => setState((s) => withStatus(s, 'paid'))}
          />
          <Pill
            label={t('record.sheet.status.pending')}
            variant={state.status === 'pending' ? 'primary' : 'secondary'}
            selected={state.status === 'pending'}
            onPress={() => setState((s) => withStatus(s, 'pending'))}
          />
        </View>

        {/* 02-21: recurring controls mount here */}

        <TextInput
          accessibilityLabel={t('record.sheet.field.note')}
          placeholder={t('record.sheet.field.note')}
          placeholderTextColor={colors.inkFaint}
          value={state.note}
          onChangeText={(text) => set({ note: text })}
          style={inputStyle}
          multiline
        />

        {editRow && editRow.original_currency !== editRow.home_currency ? (
          <RateAttribution rateDate={editRow.rate_date} rateSource={editRow.rate_source} ratePending={editRow.rate_pending} />
        ) : null}

        <Pill label={saveText} variant="primary" onPress={save} />
        {editRow ? <Pill label={t('record.sheet.delete')} variant="danger" onPress={() => setConfirmDelete(true)} /> : null}
      </ScrollView>

      <CategoryPicker
        visible={picker === 'category'}
        categories={categories.active}
        selectedId={state.categoryId}
        onSelect={(id) => {
          set({ categoryId: id });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <AccountPicker
        visible={picker === 'account'}
        title={t('record.sheet.field.account')}
        accounts={accounts}
        selectedId={state.accountId}
        onSelect={(a) => {
          setState((s) => withAccount(s, a));
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <OptionPicker<PaymentType | 'none'>
        visible={picker === 'payment'}
        title={t('record.sheet.field.paymentType')}
        options={[{ value: 'none', label: t('record.sheet.none') }, ...paymentOptions]}
        selected={state.paymentType ?? 'none'}
        onSelect={(value) => {
          set({ paymentType: value === 'none' ? null : value });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <OptionPicker<string>
        visible={picker === 'currency'}
        title={t('record.sheet.field.currency')}
        options={options.map((o) => ({ value: o.code, label: `${o.code} · ${o.name}` }))}
        selected={state.currency}
        onSelect={(code) => {
          set({ currency: code });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <ConfirmSheet
        visible={confirmDelete}
        body={t('record.sheet.confirmDelete')}
        cancelLabel={t('record.sheet.confirmDeleteCancel')}
        confirmLabel={t('record.sheet.confirmDeleteProceed')}
        destructive
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: space.gapSm,
    paddingBottom: space.gapMd,
  },
  chips: {
    flexDirection: 'row',
    gap: space.gapSm,
  },
  input: {
    minHeight: space.touchMin,
    paddingHorizontal: space.cardPad,
    paddingVertical: space.gapSm,
  },
});
