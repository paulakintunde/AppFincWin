// The add/edit transaction sheet (REC-01..04, REC-18): expense, income and transfer in one
// component. Every write goes through the queued mutation hooks and records its own undo
// step, then shows the Undo toast tied to that step (D-31). Form rules live in
// transactionForm.ts (pure). Copy is declarative, never advice.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { currencyExponent, money } from '@/engine/money';
import { monthOf } from '@/engine/time';
import type { MinorUnits } from '@/engine/money';
import type { PaymentType, TransactionRow } from '@/db/rows';
import { PAYMENT_TYPES } from '@/db/rows';
import { useAccounts } from '@/data/queries/accounts';
import { useTransferLegs } from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { useCurrencyOptions } from '@/data/queries/currencyOptions';
import { useAddTransaction, useDeleteTransaction, useEditTransaction } from '@/data/mutations/transactions';
import { useAddTransfer, useDeleteTransfer, useEditTransfer, type TransferLegRow } from '@/data/mutations/transfers';
import { newStepId } from '@/data/mutations/undoCapture';
import { useRecordContext } from '@/features/record/useRecordContext';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { getAnalytics } from '@/services/analytics';
import type { EventProps } from '@/services/analytics';
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
import { useAmountParser, type AmountParseFailure } from '@/ui/money/useAmountParser';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { AccountPicker } from './pickers/AccountPicker';
import { CategoryPicker } from './pickers/CategoryPicker';
import { DateField } from './pickers/DateField';
import { OptionPicker } from './pickers/OptionPicker';
import {
  initialFormState,
  toAddInput,
  toPatch,
  toTransferAfter,
  toTransferInput,
  validateForm,
  validateTransfer,
  withAccount,
  withDate,
  withDirection,
  withStatus,
  withToAccount,
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

type PickerKey = 'category' | 'account' | 'toAccount' | 'payment' | 'currency' | null;

function trackAdded(props: EventProps<'transaction_added'>): void {
  getAnalytics().track('transaction_added', props);
}

export function TransactionSheet({ visible, mode, onClose }: TransactionSheetProps) {
  const t = useT();
  const rc = useRecordContext();
  const transferId = mode.kind === 'edit' ? mode.row.transfer_id : null;
  const { legs, isLoading } = useTransferLegs(rc.householdId, transferId ? [transferId] : []);

  if (!visible) return null;

  // D-51: opening either leg of a transfer edits the pair, so wait for both legs.
  let resolved: EntryMode = mode;
  if (transferId) {
    if (isLoading) {
      return (
        <Sheet visible onDismiss={onClose} accessibilityLabel={t('record.sheet.titleEdit')}>
          <SheetHeader title={t('record.sheet.titleEdit')} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
        </Sheet>
      );
    }
    const out = legs.find((l) => l.transfer_id === transferId && l.original_amount < 0);
    const inn = legs.find((l) => l.transfer_id === transferId && l.original_amount > 0);
    if (out && inn) resolved = { kind: 'edit-transfer', out, in: inn };
  }

  return <SheetBody key={resolved.kind} mode={resolved} onClose={onClose} />;
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
  const { add: addTransfer } = useAddTransfer();
  const { edit: editTransfer } = useEditTransfer();
  const { remove: removeTransfer } = useDeleteTransfer();

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
  const pair = mode.kind === 'edit-transfer' ? mode : null;
  const isNew = mode.kind === 'new';
  const isTransfer = state.direction === 'transfer';
  const parse = (text: string, currency: string) => parser.parse(text, currency, exponentFor(currency));
  const nameOf = (id: string | null): string => accounts.find((a) => a.id === id)?.name ?? '';
  const crossCurrency = isTransfer && state.toCurrency !== null && state.toCurrency !== state.currency;

  const errorList = submitted ? (isTransfer ? validateTransfer(state, parse) : validateForm(state, parse)) : [];
  const hasError = (code: string): boolean => (errorList as readonly unknown[]).includes(code);
  const failureOf = (key: 'amount' | 'amountIn'): AmountParseFailure | undefined => {
    for (const e of errorList as readonly unknown[]) {
      if (typeof e === 'object' && e !== null && key in e) return (e as Record<string, AmountParseFailure>)[key];
    }
    return undefined;
  };

  let titleText: string = t('record.sheet.titleEdit');
  if (isNew) titleText = t(state.direction === 'in' ? 'record.sheet.titleNewIncome' : 'record.sheet.titleNewExpense');
  if (isNew && isTransfer) titleText = t('record.sheet.titleNewTransfer');
  let saveText: string = t('record.sheet.saveExpense');
  if (!isNew) saveText = t('record.sheet.saveChanges');
  else if (isTransfer) saveText = t('record.sheet.saveTransfer');
  else if (state.direction === 'in') saveText = t('record.sheet.saveIncome');

  const set = (patch: Partial<FormState>) => setState((s) => ({ ...s, ...patch }));

  const showMoney = (text: string, currency: string): string | null => {
    const parsed = parse(text, currency);
    if (!parsed.ok) return null;
    const option = options.find((o) => o.code === currency);
    return formatter.formatMoney(money(parsed.value, currency), {
      exponent: exponentFor(currency),
      customSymbol: option?.kind === 'custom' ? (option.symbol ?? undefined) : undefined,
    });
  };
  const outFigure = showMoney(state.amountText, state.currency);
  const inFigure = showMoney(state.amountInText, state.toCurrency ?? state.currency);
  const figureText = outFigure ?? (state.amountText === '' ? (showMoney('0', state.currency || 'GBP') ?? '') : state.amountText);

  const amountsFor = (): { out: number; inn: number } => {
    const out = (parse(state.amountText, state.currency) as { value: MinorUnits }).value;
    const inn = crossCurrency ? (parse(state.amountInText, state.toCurrency as string) as { value: MinorUnits }).value : out;
    return { out, inn };
  };

  const saveTransfer = () => {
    if (!rc.householdId || !rc.userId) return;
    const { out, inn } = amountsFor();
    const toName = nameOf(state.toAccountId);

    if (pair) {
      const stepId = editTransfer(
        { out: pair.out as TransferLegRow, in: pair.in as TransferLegRow },
        toTransferAfter(state, out, inn),
        { ownerId: rc.userId, labelName: toName }
      );
      if (stepId !== null) showToast({ kind: 'ordinary', text: undoLabelText('transferEdited', { name: toName }), stepId });
      onClose();
      return;
    }

    const { stepId } = addTransfer(
      toTransferInput(state, out, inn, {
        householdId: rc.householdId,
        userId: rc.userId,
        timeZone: rc.timeZone,
        transferCategoryId: categories.transferCategoryId,
        homeCurrency: rc.homeCurrency,
        toName,
      })
    );
    showToast({ kind: 'ordinary', text: undoLabelText('transferAdded', { name: toName }), stepId });
    trackAdded({ kind: 'transfer', recurring: false });
    onClose();
  };

  const save = () => {
    setSubmitted(true);
    if (!rc.householdId || !rc.userId) return;
    if (isTransfer) {
      if (validateTransfer(state, parse).length > 0) return;
      saveTransfer();
      return;
    }
    if (validateForm(state, parse).length > 0) return;
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
    trackAdded({ kind: state.direction === 'in' ? 'income' : 'expense', recurring: false });
    onClose();
  };

  const doDelete = () => {
    if (!rc.userId) return;
    setConfirmDelete(false);
    if (pair) {
      const labelName = nameOf(pair.in.account_id);
      const stepId = removeTransfer(pair.out as TransferLegRow, { ownerId: rc.userId, labelName });
      showToast({ kind: 'destructive', text: undoLabelText('transferDeleted', { name: labelName }), stepId });
      onClose();
      return;
    }
    if (!editRow) return;
    const stepId = remove(editRow, rc.userId);
    showToast({ kind: 'destructive', text: undoLabelText('deleted', { name: editRow.name ?? undefined }), stepId });
    onClose();
  };

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
  const errorStyle = [textRole(pairing, 'label'), { color: colors.danger }];
  const noteStyle = [textRole(pairing, 'label'), { color: colors.inkMuted }];
  const amountFailure = failureOf('amount');
  const amountInFailure = failureOf('amountIn');
  const crossNote =
    crossCurrency && outFigure !== null && inFigure !== null
      ? t('record.sheet.transferCrossCurrency', {
          amountA: outFigure,
          accountA: nameOf(state.accountId),
          amountB: inFigure,
          accountB: nameOf(state.toAccountId),
        })
      : null;
  const deleteBody = pair
    ? t('record.sheet.transferDeleteConfirm', { from: nameOf(pair.out.account_id), to: nameOf(pair.in.account_id) })
    : t('record.sheet.confirmDelete');

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={titleText}>
      <SheetHeader title={titleText} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.column}>
        {isNew ? (
          <View style={styles.chips}>
            {(['out', 'in', 'transfer'] as Direction[]).map((d) => (
              <Chip
                key={d}
                label={t(
                  d === 'out'
                    ? 'record.sheet.directionOut'
                    : d === 'in'
                      ? 'record.sheet.directionIn'
                      : 'record.sheet.directionTransfer'
                )}
                selected={state.direction === d}
                onPress={() => setState((s) => withDirection(s, d))}
              />
            ))}
          </View>
        ) : null}

        <AmountDisplay text={isTransfer ? `↔ ${figureText}` : figureText} tone={isTransfer ? 'dim' : 'default'} />
        <TextInput
          accessibilityLabel={t(crossCurrency ? 'record.sheet.field.amountOut' : 'record.sheet.field.amount')}
          keyboardType="decimal-pad"
          value={state.amountText}
          onChangeText={(text) => set({ amountText: text })}
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />
        {amountFailure ? <Text style={errorStyle}>{parser.errorMessage(amountFailure)}</Text> : null}
        {crossCurrency ? (
          <>
            <TextInput
              accessibilityLabel={t('record.sheet.field.amountIn')}
              keyboardType="decimal-pad"
              value={state.amountInText}
              onChangeText={(text) => set({ amountInText: text })}
              style={inputStyle}
              placeholderTextColor={colors.inkFaint}
            />
            {amountInFailure ? <Text style={errorStyle}>{parser.errorMessage(amountInFailure)}</Text> : null}
            {crossNote ? <Text style={noteStyle}>{crossNote}</Text> : null}
          </>
        ) : null}
        {hasError('transferAmountsMatch') ? <Text style={errorStyle}>{t('record.sheet.transferAmountsMatch')}</Text> : null}

        {isTransfer ? null : (
          <>
            <TextInput
              accessibilityLabel={t('record.sheet.namePlaceholder')}
              placeholder={t('record.sheet.namePlaceholder')}
              placeholderTextColor={colors.inkFaint}
              value={state.name}
              onChangeText={(text) => set({ name: text })}
              style={inputStyle}
            />
            {hasError('nameRequired') ? <Text style={errorStyle}>{t('record.sheet.nameRequired')}</Text> : null}
            <Row label={t('record.sheet.field.category')} value={categoryLabel} dense chevron onPress={() => setPicker('category')} />
          </>
        )}

        {isTransfer ? (
          <>
            <Row label={t('record.sheet.field.fromAccount')} value={nameOf(state.accountId)} dense chevron onPress={() => setPicker('account')} />
            <Row label={t('record.sheet.field.toAccount')} value={nameOf(state.toAccountId)} dense chevron onPress={() => setPicker('toAccount')} />
            {hasError('transferSameAccount') ? <Text style={errorStyle}>{t('record.sheet.transferSameAccount')}</Text> : null}
          </>
        ) : (
          <Row label={t('record.sheet.field.account')} value={nameOf(state.accountId)} dense chevron onPress={() => setPicker('account')} />
        )}
        {hasError('accountRequired') ? <Text style={errorStyle}>{t('record.sheet.accountRequired')}</Text> : null}

        <DateField
          label={t('record.sheet.field.date')}
          value={state.localDate}
          display={formatter.formatDate(state.localDate)}
          onChange={(d) => setState((s) => withDate(s, d, rc.today))}
        />

        {isTransfer ? (
          <Text style={noteStyle}>{t(pair ? 'record.sheet.transferEditBoth' : 'record.sheet.transferNote')}</Text>
        ) : (
          <>
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
          </>
        )}

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

        <Pill label={saveText} variant="primary" disabled={isNew && isTransfer && categories.transferCategoryId === null} onPress={save} />
        {editRow || pair ? <Pill label={t('record.sheet.delete')} variant="danger" onPress={() => setConfirmDelete(true)} /> : null}
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
        title={t(isTransfer ? 'record.sheet.field.fromAccount' : 'record.sheet.field.account')}
        accounts={accounts}
        selectedId={state.accountId}
        excludeId={isTransfer ? state.toAccountId : null}
        onSelect={(a) => {
          setState((s) => withAccount(s, a));
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <AccountPicker
        visible={picker === 'toAccount'}
        title={t('record.sheet.field.toAccount')}
        accounts={accounts}
        selectedId={state.toAccountId}
        excludeId={state.accountId}
        onSelect={(a) => {
          setState((s) => withToAccount(s, a));
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
        body={deleteBody}
        cancelLabel={t('record.sheet.confirmDeleteCancel')}
        confirmLabel={t('record.sheet.confirmDeleteProceed')}
        destructive
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Sheet>
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
