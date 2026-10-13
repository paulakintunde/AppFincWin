// The add/edit transaction sheet (REC-01..04, REC-18): expense, income and transfer in one
// component. Every write goes through the queued mutation hooks and records its own undo
// step, then shows the Undo toast tied to that step (D-31). Form rules live in
// transactionForm.ts (pure). Copy is declarative, never advice.
import * as Crypto from 'expo-crypto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { AccessibilityInfo, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { currencyExponent, money } from '@/engine/money';
import { monthOf } from '@/engine/time';
import type { MinorUnits } from '@/engine/money';
import type { PaymentType, TransactionPatch, TransactionRow } from '@/db/rows';
import { PAYMENT_TYPES } from '@/db/rows';
import { useAccounts } from '@/data/queries/accounts';
import { useTransferLegs } from '@/data/queries/activity';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useCategoryLookup } from '@/data/queries/categories';
import { useMoneyPrefs } from '@/data/queries/moneyPrefs';
import { useFxLatest } from '@/data/queries/fxLatest';
import { useCategoryMonthUsage } from '@/features/record/categories/useCategoryMonthUsage';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { useCurrencyOptions } from '@/data/queries/currencyOptions';
import { useAddTransaction, useDeleteTransaction, useEditTransaction } from '@/data/mutations/transactions';
import {
  seriesInputFromRow,
  seriesPatchFromOccurrenceEdit,
  useCreateSeries,
  useEditSeriesFrom,
  type ScheduleInput,
} from '@/data/mutations/recurringSeries';
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
import { Chip } from '@/ui/Chip';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Keypad } from '@/ui/Keypad';
import { ToggleRow } from '@/ui/ToggleRow';
import { Pill } from '@/ui/Pill';
import { RateAttribution } from '@/ui/RateAttribution';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useAmountParser, type AmountParseFailure } from '@/ui/money/useAmountParser';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { AccountSheet } from '@/features/record/accounts/AccountSheet';
import { AccountPicker } from './pickers/AccountPicker';
import { AmountField } from './AmountField';
import { CategoryPicker } from './pickers/CategoryPicker';
import { DateField } from './pickers/DateField';
import { EntryNotes } from './EntryNotes';
import { prefillAmountInText } from './receivedPrefill';
import { useCapCrossing } from './useCapCrossing';
import { applyGuess, initialOrigin, ruleOfferFor, type CategoryOrigin, type RuleOffer } from './categorySuggest';
import { RuleOfferCard } from './RuleOfferCard';
import { guessCategory } from '@/engine/categorize';
import { useGuessContext } from '@/features/record/useGuessContext';
import { useAddRule } from '@/data/mutations/categoryRules';
import { hapticLight, hapticSuccess } from '@/ui/haptics';
import { useBulkAdd } from '@/data/mutations/bulkAdd';
import { saveCount, summarise, type ListItem } from '@/engine/entryList';
import { EntryList } from './EntryList';
import { EntryListFooter, listSummaryText } from './EntryListFooter';
import { clearedAfterAdd, formFromItem, formHasContent, itemFromForm } from './listForm';
import { useEntryList } from './useEntryList';
import { OptionPicker } from './pickers/OptionPicker';
import { CurrencyPicker } from './pickers/CurrencyPicker';
import { EditScopePrompt } from './EditScopePrompt';
import { OccurrenceActions } from './OccurrenceActions';
import { RepeatsField } from './RepeatsField';
import { needsScopePrompt, repeatsProblem, repeatsToSchedule, thisAndFuturePlan, type RepeatsValue } from './recurringForm';
import {
  initialFormState,
  toAddInput,
  toPatch,
  toTransferAfter,
  toTransferInput,
  validateForm,
  validateTransfer,
  withAccount,
  withAutomatic,
  withDate,
  withDirection,
  withRefund,
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
  const legsRead = useTransferLegs(rc.householdId, transferId ? [transferId] : []);
  const { legs } = legsRead;

  if (!visible) return null;

  // D-51: opening either leg of a transfer edits the pair, so wait for both legs.
  let resolved: EntryMode = mode;
  if (transferId) {
    const out = legs.find((l) => l.transfer_id === transferId && l.original_amount < 0);
    const inn = legs.find((l) => l.transfer_id === transferId && l.original_amount > 0);
    if (!out || !inn) {
      // S-WR-01: without both legs the sheet stays read-only; editing or deleting one leg alone
      // would break the pair. I-03: say why -- still loading, offline, a failed read, or a read
      // that succeeded without the partner (a pair the server has not received yet).
      let text: string = t('record.sheet.transferNeedsBothSides');
      if (legsRead.isPending && legsRead.fetchStatus === 'paused') text = t('record.sheet.transferLegsOffline');
      else if (legsRead.isPending) text = t('record.sheet.transferLegsLoading');
      else if (legsRead.isError) text = t('record.sheet.transferLegsFailed');
      else if (legsRead.isSuccess) text = t('record.sheet.transferPartnerMissing');
      return (
        <Sheet visible onDismiss={onClose} accessibilityLabel={t('record.sheet.titleEdit')}>
          <SheetHeader title={t('record.sheet.titleEdit')} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
          <TransferUnavailable text={text} />
        </Sheet>
      );
    }
    resolved = { kind: 'edit-transfer', out, in: inn };
  }

  return <SheetBody key={resolved.kind} mode={resolved} onClose={onClose} />;
}

function TransferUnavailable({ text }: { text: string }) {
  const { colors, pairing } = useTheme();
  return (
    <Text accessibilityRole="text" style={[textRole(pairing, 'body'), { color: colors.inkMuted }]}>
      {text}
    </Text>
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
  const { separators } = useDeviceLocale(rc.region);
  const autoConvert = useMoneyPrefs(rc.userId ?? undefined).prefs.lead_figure === 'home';
  const { usage } = useCategoryMonthUsage();
  const { check: checkCap } = useCapCrossing();
  const { add } = useAddTransaction();
  const { edit } = useEditTransaction();
  const { remove } = useDeleteTransaction();
  const { add: addTransfer } = useAddTransfer();
  const { edit: editTransfer } = useEditTransfer();
  const { remove: removeTransfer } = useDeleteTransfer();
  const { create: createSeries } = useCreateSeries();
  const { editFrom } = useEditSeriesFrom();
  const seriesList = useRecurringSeries(rc.householdId ?? undefined).data;
  const { save: saveList } = useBulkAdd();

  const activeAccounts = useMemo(() => accounts.filter((a) => a.archived_at === null), [accounts]);
  const exponentFor = (code: string): number => options.find((o) => o.code === code)?.exponent ?? currencyExponent(code);
  const formCtx: FormContext = {
    today: rc.today,
    defaultAccount: activeAccounts[0] ? { id: activeAccounts[0].id, currency: activeAccounts[0].currency } : null,
    amountInputText: (minor, code) => parser.toInputText(minor, code, exponentFor(code)),
    accountCurrency: (id) => accounts.find((a) => a.id === id)?.currency,
  };

  const [state, setState] = useState<FormState>(() => initialFormState(mode, formCtx));
  // The received amount follows the sent amount at the stored rate until the user keys into it;
  // a saved or restored value counts as already keyed in, so it is never recomputed.
  const [amountInManual, setAmountInManual] = useState(() => state.amountInText !== '');
  const rates = useFxLatest().data ?? [];
  const [picker, setPicker] = useState<PickerKey>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [repeats, setRepeats] = useState<RepeatsValue>({ freq: 'never' });
  const [scopePatch, setScopePatch] = useState<TransactionPatch | null>(null);
  // UI-SPEC 8: the keypad types into whichever amount is active; a text field hides it.
  const [activeAmount, setActiveAmount] = useState<'out' | 'in'>('out');
  // Keypad vs keyboard is driven by an explicit active field (261010-kpe): blur is unreliable on Android with keyboardShouldPersistTaps='handled'.
  // 02.3 D-12: it starts 'none' -- the pad opens only when an amount field is tapped.
  const [activeField, setActiveField] = useState<'amount' | 'text' | 'none'>('none');
  // 02.3 D-13: create an account without leaving the entry (ImportScreen precedent).
  const [accountSheetFor, setAccountSheetFor] = useState<'from' | 'to' | null>(null);
  const [awaitingAccount, setAwaitingAccount] = useState<{ id: string; side: 'from' | 'to' } | null>(null);
  const nameRef = useRef<TextInput>(null);
  const noteRef = useRef<TextInput>(null);
  // 02.3 REC-27 (D-06..D-08): guess the category from the description; a hand pick or a stored
  // category is never overwritten; correcting a suggestion offers a Just me rule.
  const guessCtx = useGuessContext();
  const { add: addRule } = useAddRule();
  const [origin, setOrigin] = useState<CategoryOrigin>(() => initialOrigin(mode));
  const [offer, setOffer] = useState<RuleOffer | null>(null);
  const offered = useRef(new Set<string>());
  const isTransferNow = state.direction === 'transfer';
  useEffect(() => {
    if (isTransferNow || (origin !== 'empty' && origin !== 'suggested')) return;
    const handle = setTimeout(() => {
      const g =
        state.name.trim() === ''
          ? { categoryId: null }
          : guessCategory({ name: state.name, amount: state.direction === 'in' ? 1 : -1 }, guessCtx.guess);
      const next = applyGuess(state.categoryId, origin, g.categoryId);
      if (next.categoryId !== state.categoryId) setState((s) => ({ ...s, categoryId: next.categoryId }));
      if (next.origin !== origin) setOrigin(next.origin);
    }, 250);
    return () => clearTimeout(handle);
  }, [state.name, state.direction, state.categoryId, isTransferNow, origin, guessCtx.guess]);
  useEffect(() => {
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      nameRef.current?.blur();
      noteRef.current?.blur();
      // 02.3 D-12 / RESEARCH Pitfall 3: the pad opens only on tap, never on keyboard hide.
      setActiveField((f) => (f === 'text' ? 'none' : f));
    });
    const show = Keyboard.addListener('keyboardDidShow', () => setActiveField('text'));
    return () => {
      hide.remove();
      show.remove();
    };
  }, []);

  useEffect(() => {
    if (awaitingAccount === null) return;
    const acc = accounts.find((a) => a.id === awaitingAccount.id);
    if (!acc) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- applies the new account once its row reaches the cache (D-13)
    setState((s) => (awaitingAccount.side === 'to' ? withToAccount(s, acc) : withAccount(s, acc)));
    setAwaitingAccount(null);
  }, [accounts, awaitingAccount]);

  const editRow: TransactionRow | null = mode.kind === 'edit' ? mode.row : null;
  const pair = mode.kind === 'edit-transfer' ? mode : null;
  const isNew = mode.kind === 'new';
  // 02.3 REC-30: the entry list (new entries only). finishFor holds the form state the
  // finish-current error was raised for, so any later edit to the form clears it.
  const activeAccountIds = useMemo(() => new Set(activeAccounts.map((a) => a.id)), [activeAccounts]);
  const list = useEntryList({ userId: rc.userId, householdId: rc.householdId, enabled: isNew, activeAccountIds });
  const [finishFor, setFinishFor] = useState<FormState | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const series = editRow?.recurring_series_id ? seriesList?.find((x) => x.id === editRow.recurring_series_id) : undefined;
  const repeatsError = submitted ? repeatsProblem(repeats, state.localDate) : null;
  const isTransfer = state.direction === 'transfer';
  const parse = (text: string, currency: string) => parser.parse(text, currency, exponentFor(currency));
  const nameOf = (id: string | null): string => accounts.find((a) => a.id === id)?.name ?? '';
  const crossCurrency = isTransfer && state.toCurrency !== null && state.toCurrency !== state.currency;

  useEffect(() => {
    if (!crossCurrency || amountInManual) return;
    const next = prefillAmountInText({
      amountText: state.amountText,
      currency: state.currency,
      toCurrency: state.toCurrency,
      rates,
      parse,
      exponentFor,
      toInputText: formCtx.amountInputText,
    });
    // The no-op guard below stops a loop; the figure must live in form state because Save reads it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => (s.amountInText === next ? s : { ...s, amountInText: next }));
    // parse, exponentFor and formCtx are re-created each render; the fields they read are in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossCurrency, amountInManual, state.amountText, state.currency, state.toCurrency, rates]);

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

  /** UI-SPEC 10: warn once when this save takes a category from under its cap to at or over it. */
  const runCapCheck = (stepId: string | null, previous?: TransactionRow) => {
    if (isTransfer) return;
    const parsed = parse(state.amountText, state.currency);
    if (!parsed.ok) return;
    const positive = state.direction === 'in' || state.refund;
    checkCap({
      categoryId: state.categoryId,
      localDate: state.localDate,
      amountMinor: positive ? parsed.value : -parsed.value,
      currency: state.currency,
      previous:
        previous && previous.status !== 'skipped'
          ? {
              categoryId: previous.category_id,
              localDate: previous.local_date,
              amountMinor: previous.original_amount,
              currency: previous.original_currency,
            }
          : undefined,
      stepId,
    });
  };

  /** The checks save() runs, shared with Add to list; sets `submitted` so errors show. */
  const validateCurrent = (): boolean => {
    setSubmitted(true);
    if (isTransfer) return validateTransfer(state, parse).length === 0 && !transferSaveBlocked;
    return validateForm(state, parse).length === 0 && repeatsProblem(repeats, state.localDate) === null;
  };

  const addCurrentToList = (): ListItem | null => {
    if (!validateCurrent()) return null;
    const item = itemFromForm(state, isTransfer ? { freq: 'never' } : repeats, parse, Crypto.randomUUID());
    if (!item || !list.add(item)) return null;
    setState(clearedAfterAdd);
    setAmountInManual(false);
    setRepeats({ freq: 'never' });
    setOrigin('empty');
    setOffer(null);
    setSubmitted(false);
    setFinishFor(null);
    setActiveField('none');
    return item;
  };

  const addToList = () => {
    const item = addCurrentToList();
    if (!item) return;
    hapticLight();
    const name =
      item.type === 'transfer'
        ? t('record.sheet.list.transferName', { from: nameOf(item.accountId), to: nameOf(item.toAccountId ?? '') })
        : item.name;
    const summary = listSummaryText(t, summarise([item, ...list.items]), formatIn);
    void AccessibilityInfo.announceForAccessibility(t('record.sheet.list.addedA11y', { name, summary }));
  };

  /** One-step save of the listed entries plus the form entry when it has content (D-14, D-28). */
  const saveWithList = () => {
    setOffer(null);
    if (!rc.householdId || !rc.userId) return;
    let current: ListItem | null = null;
    if (formHasContent(state)) {
      if (validateCurrent()) current = itemFromForm(state, isTransfer ? { freq: 'never' } : repeats, parse, Crypto.randomUUID());
      if (!current) {
        setFinishFor(state);
        return;
      }
    }
    const items = [...list.items].reverse();
    if (current) items.push(current);
    const stepId = saveList(items, {
      householdId: rc.householdId,
      ownerId: rc.userId,
      homeCurrency: rc.homeCurrency,
      timeZone: rc.timeZone,
      transferCategoryId: categories.transferCategoryId,
    });
    showToast({ kind: 'ordinary', text: undoLabelText('addedMany', { n: items.length }), stepId });
    hapticSuccess();
    list.clearAll();
    onClose();
  };

  const loadItem = (id: string) => {
    const taken = list.take(id);
    if (!taken) return;
    const loaded = formFromItem(taken, { amountInputText: formCtx.amountInputText });
    setState(loaded.state);
    setAmountInManual(loaded.state.amountInText !== '');
    setRepeats(loaded.repeats);
    setOrigin(loaded.state.categoryId ? 'picked' : 'empty');
    setOffer(null);
    setSubmitted(false);
    setFinishFor(null);
    setActiveField('none');
  };

  const editItem = (id: string) => {
    if (formHasContent(state)) {
      if (!validateCurrent()) {
        setReplaceTarget(id);
        return;
      }
      if (!addCurrentToList()) return;
    }
    loadItem(id);
  };

  const requestCancel = () => (isNew && list.items.length > 0 ? setConfirmCancel(true) : onClose());

  const save = () => {
    if (isNew && list.items.length > 0) {
      saveWithList();
      return;
    }
    setOffer(null);
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
    // Repeats is only offered on rows that are not already in a series.
    const schedule = editRow?.recurring_series_id ? null : repeatsToSchedule(repeats, state.localDate);
    if (schedule === 'invalid') return;

    if (editRow) {
      const patch = toPatch(editRow, state, amountMinor);
      // D-06/D-07: a template change on an occurrence asks which occurrences it applies to.
      // Automatic is a template flag too (D-02): changing it on an occurrence asks the same question.
      if (needsScopePrompt(editRow, patch) || (editRow.recurring_series_id && patch.is_automatic !== undefined)) {
        setScopePatch(patch);
        return;
      }
      commitEdit(editRow, patch, name, schedule);
      return;
    }

    const input = toAddInput(state, amountMinor, {
      householdId: rc.householdId,
      userId: rc.userId,
      homeCurrency: rc.homeCurrency,
      timeZone: rc.timeZone,
    });
    if (schedule) {
      // One Undo removes the entry and its series together (D-24 amendment): the entry is
      // added without its own step and the series step carries it (anchorIsNew).
      const newId = add(input);
      const seriesStep = createSeries({
        series: seriesInputFromRow(
          {
            household_id: input.householdId,
            account_id: input.accountId,
            original_amount: input.amount,
            original_currency: input.currency,
            category_id: input.categoryId ?? null,
            payment_type: input.paymentType ?? null,
            time_zone: rc.timeZone,
            local_date: state.localDate,
            name,
          },
          schedule,
          Crypto.randomUUID()
        ),
        anchorTransactionId: newId,
        anchorIsNew: true,
        ownerId: rc.userId,
      });
      showToast({ kind: 'ordinary', text: undoLabelText('seriesCreated', { name }), stepId: seriesStep });
      runCapCheck(seriesStep);
      trackAdded({ kind: state.direction === 'in' ? 'income' : 'expense', recurring: true });
      onClose();
      return;
    }

    const stepId = newStepId();
    add({ ...input, undo: { stepId, labelKey: 'added', labelParams: { name } } });
    showToast({ kind: 'ordinary', text: undoLabelText('added', { name }), stepId });
    runCapCheck(stepId);
    trackAdded({ kind: state.direction === 'in' ? 'income' : 'expense', recurring: false });
    onClose();
  };

  /** Sends the edit of this one row; returns the step id when an Undo step will be recorded. */
  const sendRowEdit = (row: TransactionRow, patch: TransactionPatch, name: string): string | null => {
    const keys = Object.keys(patch) as (keyof TransactionPatch)[];
    if (keys.length === 0) return null;
    const before: Record<string, string | number | null> = {};
    for (const key of keys) before[key] = (row as unknown as Record<string, string | number | null>)[key] ?? null;
    const stepId = newStepId();
    const recorded = edit(
      { id: row.id, householdId: row.household_id, month: monthOf(row.local_date), expectedVersion: row.version, patch },
      { stepId, ownerId: rc.userId as string, labelKey: 'edited', labelParams: { name }, before }
    );
    return recorded ? stepId : null;
  };

  const commitEdit = (row: TransactionRow, patch: TransactionPatch, name: string, schedule: ScheduleInput | null) => {
    if (!rc.userId) return;
    if (Object.keys(patch).length === 0 && !schedule) {
      onClose();
      return;
    }
    const editStep = sendRowEdit(row, patch, name);
    if (schedule) {
      // D-09: an existing entry becomes the first occurrence and survives an Undo (anchorIsNew false).
      const seriesStep = createSeries({
        series: seriesInputFromRow({ ...row, ...patch, name: patch.name ?? row.name } as TransactionRow, schedule, Crypto.randomUUID()),
        anchorTransactionId: row.id,
        anchorIsNew: false,
        ownerId: rc.userId,
      });
      showToast({ kind: 'ordinary', text: undoLabelText('seriesCreated', { name }), stepId: seriesStep });
      runCapCheck(seriesStep, row);
    } else {
      showToast({ kind: 'ordinary', text: undoLabelText('edited', { name }), stepId: editStep });
      runCapCheck(editStep, row);
    }
    onClose();
  };

  const applyThisAndFuture = () => {
    const patch = scopePatch;
    setScopePatch(null);
    if (!patch || !editRow || !series || !rc.userId) return;
    // S-CR-02 (D-07): the opened row always ends up with the user's whole edit -- either the
    // series RPC rewrites it (pending, template-only) or it is patched directly and the
    // series change starts after it (see thisAndFuturePlan).
    const plan = thisAndFuturePlan(editRow, patch);
    const seriesName = patch.name ?? series.name;
    if (plan.rowPatch) sendRowEdit(editRow, plan.rowPatch, seriesName);
    const stepId = editFrom({
      id: series.id,
      householdId: editRow.household_id,
      expectedVersion: series.version,
      patch: seriesPatchFromOccurrenceEdit(patch),
      effectiveFrom: plan.effectiveFrom,
      ownerId: rc.userId,
      name: seriesName,
    });
    showToast({ kind: 'ordinary', text: undoLabelText('seriesEdited', { name: seriesName }), stepId });
    onClose();
  };

  const applyThisOne = () => {
    const patch = scopePatch;
    setScopePatch(null);
    if (!patch || !editRow) return;
    commitEdit(editRow, patch, state.name.trim(), null);
  };

  const doDelete = () => {
    if (!rc.userId) return;
    setConfirmDelete(false);
    if (pair) {
      const labelName = nameOf(pair.in.account_id);
      // I-04 (data IN-03): both legs are in hand, so pass the partner and its observed version
      // is checked too -- a concurrent edit to the other side is refused, not deleted silently.
      const stepId = removeTransfer(pair.out as TransferLegRow, { ownerId: rc.userId, labelName }, pair.in as TransferLegRow);
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
  const categoryNameOf = (id: string): string => {
    const c = categories.byId.get(id) ?? categories.active.find((x) => x.id === id);
    return c ? categoryName(c, t) : '';
  };
  const acceptOffer = () => {
    if (!offer || !rc.userId || !rc.householdId) return;
    const target = categories.byId.get(offer.categoryId);
    if (!target) return;
    const { stepId } = addRule({
      ownerId: rc.userId,
      householdId: rc.householdId,
      scope: 'personal',
      keyword: offer.keyword,
      category: target,
    });
    showToast({ kind: 'ordinary', text: undoLabelText('ruleAdded', { name: offer.keyword }), stepId });
    hapticLight();
    setOffer(null);
  };
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
  const formatHome = (minor: number): string => formatter.formatMoney(money(minor, rc.homeCurrency));
  const formatIn = (minor: number, code: string): string => {
    const option = options.find((o) => o.code === code);
    return formatter.formatMoney(money(minor, code), {
      exponent: exponentFor(code),
      customSymbol: option?.kind === 'custom' ? (option.symbol ?? undefined) : undefined,
    });
  };
  const typedAmount = parse(state.amountText, state.currency);
  const income = state.direction === 'in';
  const inActive = crossCurrency && activeAmount === 'in';
  const activeCurrency = inActive ? (state.toCurrency as string) : state.currency;
  const keypadVisible = activeField === 'amount';
  const textFocusProps = {
    onFocus: () => setActiveField('text'),
    onBlur: () => setActiveField((f) => (f === 'text' ? 'none' : f)),
  };
  const closePad = (): void => setActiveField((f) => (f === 'amount' ? 'none' : f));
  const focusAmount = (which: 'out' | 'in'): void => {
    Keyboard.dismiss();
    nameRef.current?.blur();
    noteRef.current?.blur();
    setActiveAmount(which);
    setActiveField('amount');
  };
  const openPicker = (key: Exclude<PickerKey, null>): void => {
    Keyboard.dismiss();
    closePad();
    setPicker(key);
  };
  // Sibling-modal rule: close the picker first, present the AccountSheet on the next frame.
  const requestAddAccount = (side: 'from' | 'to'): void => {
    setPicker(null);
    requestAnimationFrame(() => setAccountSheetFor(side));
  };
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
  // S-WR-10: a new transfer needs the transfer category; the disabled Save says why.
  const transferSaveBlocked = isNew && isTransfer && categories.transferCategoryId === null;
  const listHasTransfer = list.items.some((i) => i.type === 'transfer');
  let capNote: string | null = null;
  if (!list.canAdd(state.direction)) {
    capNote = t(
      state.direction === 'out'
        ? 'record.sheet.list.capOut'
        : state.direction === 'in'
          ? 'record.sheet.list.capIn'
          : 'record.sheet.list.capTransfer'
    );
  }
  const deleteBody = pair
    ? t('record.sheet.transferDeleteConfirm', { from: nameOf(pair.out.account_id), to: nameOf(pair.in.account_id) })
    : t('record.sheet.confirmDelete');

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={titleText}>
      <SheetHeader title={titleText} cancelLabel={t('record.sheet.cancel')} onCancel={requestCancel} />
      <SheetScroll contentContainerStyle={styles.column}>
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
                onPress={() => {
                  closePad();
                  setState((s) => withDirection(s, d, formCtx.accountCurrency));
                }}
              />
            ))}
          </View>
        ) : null}

        <AmountField
          text={outFigure ?? (state.amountText === '' ? null : state.amountText)}
          currency={state.currency}
          open={activeField === 'amount' && !inActive}
          transfer={isTransfer}
          hint={t(crossCurrency ? 'record.sheet.field.amountOut' : 'record.sheet.field.amount')}
          onPress={() => focusAmount('out')}
        />
        {amountFailure ? <Text style={errorStyle}>{parser.errorMessage(amountFailure)}</Text> : null}
        {crossCurrency ? (
          <>
            <AmountField
              text={inFigure ?? (state.amountInText === '' ? null : state.amountInText)}
              currency={state.toCurrency as string}
              open={activeField === 'amount' && inActive}
              transfer
              hint={t('record.sheet.field.amountIn')}
              onPress={() => focusAmount('in')}
            />
            {amountInFailure ? <Text style={errorStyle}>{parser.errorMessage(amountInFailure)}</Text> : null}
            {crossNote ? <Text style={noteStyle}>{crossNote}</Text> : null}
          </>
        ) : null}
        {hasError('transferAmountsMatch') ? <Text style={errorStyle}>{t('record.sheet.transferAmountsMatch')}</Text> : null}
        {keypadVisible ? (
          <Keypad
            value={inActive ? (amountInManual ? state.amountInText : '') : state.amountText}
            onKeyPress={(key) => {
              if (!inActive || amountInManual) return;
              // First key on a prefilled figure replaces it; backspace or clear empties it.
              setAmountInManual(true);
              if (key === 'backspace' || key === 'clear') set({ amountInText: '' });
            }}
            onChange={(next) => set(inActive ? { amountInText: next } : { amountText: next })}
            exponent={exponentFor(activeCurrency)}
            decimalSeparator={separators?.decimal ?? '.'}
          />
        ) : null}
        {keypadVisible ? (
          <View style={styles.doneRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('record.sheet.keypad.done')}
              hitSlop={space.gapSm}
              onPress={() => setActiveField('none')}
              style={styles.done}
            >
              <Text style={[textRole(pairing, 'label'), { color: colors.ink }]}>{t('record.sheet.keypad.done')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View onTouchStart={closePad} style={styles.column}>

        {isTransfer ? null : (
          <>
            <TextInput
              accessibilityLabel={t('record.sheet.namePlaceholder')}
              placeholder={t('record.sheet.namePlaceholder')}
              placeholderTextColor={colors.inkFaint}
              value={state.name}
              onChangeText={(text) => set({ name: text })}
              ref={nameRef}
              style={inputStyle}
              {...textFocusProps}
            />
            {hasError('nameRequired') ? <Text style={errorStyle}>{t('record.sheet.nameRequired')}</Text> : null}
            <Row
              label={t('record.sheet.field.category')}
              value={categoryLabel}
              sublabel={origin === 'suggested' ? t('record.sheet.suggested') : undefined}
              accessibilityLabel={origin === 'suggested' ? t('record.sheet.suggestedA11y', { category: categoryLabel }) : undefined}
              dense
              chevron
              onPress={() => openPicker('category')}
            />
            {offer ? (
              <RuleOfferCard
                categoryName={categoryNameOf(offer.categoryId)}
                keyword={offer.keyword}
                onAccept={acceptOffer}
                onDismiss={() => setOffer(null)}
              />
            ) : null}
          </>
        )}

        {isTransfer ? (
          <>
            <Row label={t('record.sheet.field.fromAccount')} value={nameOf(state.accountId)} dense chevron onPress={() => openPicker('account')} />
            <Row label={t('record.sheet.field.toAccount')} value={nameOf(state.toAccountId)} dense chevron onPress={() => openPicker('toAccount')} />
            {hasError('transferSameAccount') ? <Text style={errorStyle}>{t('record.sheet.transferSameAccount')}</Text> : null}
          </>
        ) : (
          <Row label={t('record.sheet.field.account')} value={nameOf(state.accountId)} dense chevron onPress={() => openPicker('account')} />
        )}
        {hasError('accountRequired') ? <Text style={errorStyle}>{t('record.sheet.accountRequired')}</Text> : null}

        <DateField
          label={t('record.sheet.field.date')}
          value={state.localDate}
          display={formatter.formatDate(state.localDate)}
          onChange={(d) => setState((s) => withDate(s, d, rc.today))}
        />

        {isTransfer ? (
          pair ? <Text style={noteStyle}>{t('record.sheet.transferEditBoth')}</Text> : null
        ) : (
          <>
            <Row
              label={t('record.sheet.field.paymentType')}
              value={state.paymentType ? t(`record.paymentType.${state.paymentType}`) : t('record.sheet.none')}
              dense
              chevron
              onPress={() => openPicker('payment')}
            />
            <Row label={t('record.sheet.field.currency')} value={state.currency} dense chevron onPress={() => openPicker('currency')} />

            <View style={styles.chips}>
              <Pill
                label={t(income ? 'record.sheet.status.received' : 'record.sheet.status.paid')}
                accessibilityHint={t(income ? 'record.sheet.status.receivedSub' : 'record.sheet.status.paidSub')}
                variant={state.status === 'paid' ? 'primary' : 'secondary'}
                selected={state.status === 'paid'}
                onPress={() => {
                  closePad();
                  setState((s) => withStatus(s, 'paid'));
                }}
              />
              <Pill
                label={t(income ? 'record.sheet.status.expected' : 'record.sheet.status.pending')}
                accessibilityHint={t(income ? 'record.sheet.status.expectedSub' : 'record.sheet.status.pendingSub')}
                variant={state.status === 'pending' ? 'primary' : 'secondary'}
                selected={state.status === 'pending'}
                onPress={() => {
                  closePad();
                  setState((s) => withStatus(s, 'pending'));
                }}
              />
            </View>

            {editRow ? (
              <OccurrenceActions
                row={editRow}
                series={series}
                onAdjust={() => setState((s) => withStatus(s, 'paid'))}
                onDone={onClose}
              />
            ) : null}
            {editRow?.recurring_series_id ? null : (
              <RepeatsField
                value={repeats}
                onChange={(v) => {
                  closePad();
                  setRepeats(v);
                }}
                formatDate={(d) => formatter.formatDate(d)}
                today={rc.today}
                entryDate={state.localDate}
              />
            )}
            {repeatsError ? <Text style={errorStyle}>{t(`record.repeats.${repeatsError}`)}</Text> : null}
            <ToggleRow
              label={t('record.sheet.toggle.automatic')}
              value={state.automatic}
              onChange={(on) => {
                closePad();
                setState((s) => withAutomatic(s, on));
              }}
            />
            {state.direction === 'out' ? (
              <ToggleRow
                label={t('record.sheet.toggle.refund')}
                value={state.refund}
                onChange={(on) => {
                  closePad();
                  setState((s) => withRefund(s, on));
                }}
              />
            ) : null}
          </>
        )}

        <TextInput
          accessibilityLabel={t('record.sheet.field.note')}
          placeholder={t('record.sheet.field.note')}
          placeholderTextColor={colors.inkFaint}
          value={state.note}
          onChangeText={(text) => set({ note: text })}
          style={inputStyle}
          ref={noteRef}
          multiline
          {...textFocusProps}
        />

        <EntryNotes
          direction={state.direction}
          refund={state.refund}
          status={state.status}
          hasAccount={state.accountId !== null}
          categoryLabel={categoryLabel}
          accountName={nameOf(state.accountId)}
          amountMinor={typedAmount.ok ? typedAmount.value : null}
          currency={state.currency}
          homeCurrency={rc.homeCurrency}
          autoConvert={autoConvert}
          formatMinor={formatIn}
          exponentFor={exponentFor}
          showAttribution={!editRow}
        />

        {editRow && editRow.original_currency !== editRow.home_currency ? (
          <RateAttribution rateDate={editRow.rate_date} rateSource={editRow.rate_source} ratePending={editRow.rate_pending} />
        ) : null}

        {transferSaveBlocked ? <Text style={noteStyle}>{t('record.sheet.transferCategoryLoading')}</Text> : null}
        {isNew ? (
          <EntryListFooter
            saveLabel={
              list.items.length > 0
                ? t('record.sheet.list.save', { count: saveCount(list.items, state.amountText.trim() !== '') })
                : saveText
            }
            onSave={save}
            saveDisabled={transferSaveBlocked || (list.items.length > 0 && listHasTransfer && categories.transferCategoryId === null)}
            saveHint={transferSaveBlocked ? t('record.sheet.transferCategoryLoading') : undefined}
            onAddToList={addToList}
            addDisabled={!list.canAdd(state.direction)}
            capNote={capNote}
            finishError={finishFor === state}
          />
        ) : (
          <Pill
            label={saveText}
            variant="primary"
            disabled={transferSaveBlocked}
            accessibilityHint={transferSaveBlocked ? t('record.sheet.transferCategoryLoading') : undefined}
            onPress={save}
          />
        )}
        {editRow || pair ? <Pill label={t('record.sheet.delete')} variant="danger" onPress={() => setConfirmDelete(true)} /> : null}
        {isNew ? (
          <EntryList
            items={list.items}
            summary={list.summary}
            dropped={list.dropped}
            formatAmount={formatIn}
            formatDate={(d) => formatter.formatDate(d)}
            accountName={nameOf}
            categoryLabel={(id) => (id === null ? '' : categoryNameOf(id))}
            onEdit={editItem}
            onRemove={list.remove}
          />
        ) : null}
        </View>
      </SheetScroll>

      <CategoryPicker
        visible={picker === 'category'}
        categories={categories.active}
        selectedId={state.categoryId}
        onSelect={(id) => {
          const o = ruleOfferFor({
            previousOrigin: origin,
            previousCategoryId: state.categoryId,
            pickedCategoryId: id,
            description: state.name,
            direction: state.direction,
            personalRules: guessCtx.resolved.personal,
            offered: offered.current,
          });
          set({ categoryId: id });
          setOrigin('picked');
          setOffer(o);
          if (o) offered.current.add(o.keywordNorm);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        usage={usage}
        formatMinor={formatHome}
        onManage={() => {
          setPicker(null);
          onClose();
          router.push('/categories');
        }}
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
        onAddAccount={() => requestAddAccount('from')}
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
        onAddAccount={() => requestAddAccount('to')}
      />
      <AccountSheet
        visible={accountSheetFor !== null}
        mode={{ kind: 'new', context: 'later' }}
        onClose={() => setAccountSheetFor(null)}
        onSaved={(id) => {
          if (accountSheetFor) setAwaitingAccount({ id, side: accountSheetFor });
        }}
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
      <CurrencyPicker
        visible={picker === 'currency'}
        title={t('record.sheet.field.currency')}
        options={options}
        homeCurrency={rc.homeCurrency}
        selected={state.currency}
        onSelect={(code) => {
          set({ currency: code });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <EditScopePrompt
        visible={scopePatch !== null}
        onThisOne={applyThisOne}
        onThisAndFuture={applyThisAndFuture}
        onCancel={() => setScopePatch(null)}
        futureDisabled={series === undefined}
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
      <ConfirmSheet
        visible={replaceTarget !== null}
        body={t('record.sheet.list.replaceBody')}
        cancelLabel={t('record.sheet.list.replaceKeep')}
        confirmLabel={t('record.sheet.list.replaceProceed')}
        onCancel={() => setReplaceTarget(null)}
        onConfirm={() => {
          const id = replaceTarget;
          setReplaceTarget(null);
          if (id !== null) loadItem(id);
        }}
      />
      <ConfirmSheet
        visible={isNew && list.resumeCount > 0}
        title={t('record.sheet.draft.title', { count: list.resumeCount })}
        body={t('record.sheet.draft.body')}
        cancelLabel={t('record.sheet.draft.discard')}
        confirmLabel={t('record.sheet.draft.continue')}
        onConfirm={list.continueDraft}
        onCancel={list.discardDraft}
        onDismiss={list.continueDraft}
      />
      <ConfirmSheet
        visible={confirmCancel}
        title={t('record.sheet.draft.cancelTitle', { count: list.items.length })}
        body={t('record.sheet.draft.cancelBody')}
        cancelLabel={t('record.sheet.draft.keep')}
        confirmLabel={t('record.sheet.draft.discardList')}
        destructive
        onCancel={() => {
          setConfirmCancel(false);
          onClose();
        }}
        onConfirm={() => {
          list.clearAll();
          setConfirmCancel(false);
          onClose();
        }}
        onDismiss={() => setConfirmCancel(false)}
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
  doneRow: {
    alignItems: 'flex-end',
  },
  done: {
    minWidth: space.touchMin,
    minHeight: space.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: space.touchMin,
    paddingHorizontal: space.cardPad,
    paddingVertical: space.gapSm,
  },
});
