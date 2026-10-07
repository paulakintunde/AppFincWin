// Create / edit an account (REC-08, D-48, D-49). The opening balance is typed unsigned and the
// sign comes from an explicit, defaulted control per account kind, so the strict amount parser
// never has to accept a minus sign. Limits are optional and per kind. Archive / Restore is an
// edit with undo. Copy is declarative, never advice.
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { currencyExponent } from '@/engine/money';
import type { AccountPatch, AccountRow } from '@/db/rows';
import { useAddAccount, useEditAccount } from '@/data/mutations/accounts';
import { newStepId } from '@/data/mutations/undoCapture';
import { useCurrencyOptions } from '@/data/queries/currencyOptions';
import { OptionPicker } from '@/features/record/entry/pickers/OptionPicker';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { getAnalytics } from '@/services/analytics';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useAmountParser, type AmountParseFailure } from '@/ui/money/useAmountParser';

export type AccountKind = AccountRow['kind'];
export type AccountSheetMode =
  | { kind: 'new'; context: 'onboarding' | 'later' }
  | { kind: 'edit'; account: AccountRow };

export interface AccountSheetProps {
  visible: boolean;
  mode: AccountSheetMode;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

const KINDS: readonly AccountKind[] = ['cash', 'checking', 'savings', 'credit', 'investment', 'loan', 'other'];
const NAME_MAX = 60;

type SignChoice = 'default' | 'other';

/** Loan is always owed; a card defaults to owing; every other kind defaults to in credit. */
function isNegative(kind: AccountKind, choice: SignChoice): boolean {
  if (kind === 'loan') return true;
  if (kind === 'credit') return choice === 'default';
  return choice === 'other';
}

/** S-WR-12: the sign control choice under `kind` that keeps the balance owed (or in credit). */
function choiceFor(kind: AccountKind, negative: boolean): SignChoice {
  if (kind === 'credit') return negative ? 'default' : 'other';
  return negative ? 'other' : 'default';
}

function limitKind(kind: AccountKind): 'overdraft' | 'credit' | null {
  if (kind === 'checking' || kind === 'savings') return 'overdraft';
  if (kind === 'credit') return 'credit';
  return null;
}

export function AccountSheet({ visible, mode, onClose, onSaved }: AccountSheetProps) {
  if (!visible) return null;
  return <SheetBody key={mode.kind === 'edit' ? mode.account.id : 'new'} mode={mode} onClose={onClose} onSaved={onSaved} />;
}

type PickerKey = 'kind' | 'currency' | null;

function SheetBody({ mode, onClose, onSaved }: Omit<AccountSheetProps, 'visible'>) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const { options } = useCurrencyOptions(rc.userId ?? undefined);
  const parser = useAmountParser(rc.region);
  const { add } = useAddAccount();
  const { edit } = useEditAccount();
  const account = mode.kind === 'edit' ? mode.account : null;

  const exponentFor = (code: string): number => options.find((o) => o.code === code)?.exponent ?? currencyExponent(code);
  const magnitude = (minor: number, code: string): string =>
    minor === 0 ? '' : parser.toInputText(minor, code, exponentFor(code));

  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'checking');
  // S-WR-09: until the user picks one, a new account's currency follows the home currency, which
  // the device default can set a moment after the onboarding sheet has mounted.
  const [pickedCurrency, setCurrency] = useState<string | null>(account?.currency ?? null);
  const currency = pickedCurrency ?? rc.homeCurrency;
  const [openingText, setOpeningText] = useState(account ? magnitude(account.opening_balance, account.currency) : '');
  const [signChoice, setSignChoice] = useState<SignChoice>(() => {
    if (!account) return 'default';
    const neg = account.opening_balance < 0;
    if (account.kind === 'credit') return neg || account.opening_balance === 0 ? 'default' : 'other';
    return neg ? 'other' : 'default';
  });
  const initialLimit = account
    ? limitKind(account.kind) === 'overdraft'
      ? account.overdraft_limit
      : limitKind(account.kind) === 'credit'
        ? account.credit_limit
        : null
    : null;
  const [limitText, setLimitText] = useState(initialLimit !== null ? magnitude(initialLimit, account?.currency ?? '') : '');
  const [picker, setPicker] = useState<PickerKey>(null);
  const [submitted, setSubmitted] = useState(false);

  const parse = (text: string) => parser.parse(text, currency, exponentFor(currency));
  const limits = limitKind(kind);
  const nameTrimmed = name.trim();
  const nameError = submitted && (nameTrimmed === '' || nameTrimmed.length > NAME_MAX);

  const openingParsed = openingText.trim() === '' ? null : parse(openingText);
  const openingFailure: AmountParseFailure | null = openingParsed && !openingParsed.ok ? openingParsed : null;
  const limitParsed = limitText.trim() === '' ? null : parse(limitText);
  const limitFailure: AmountParseFailure | null = limits && limitParsed && !limitParsed.ok ? limitParsed : null;

  const kindLabel = (k: AccountKind): string => t(`accounts.kind.${k}`);
  const negative = isNegative(kind, signChoice);
  const openingMinor = openingParsed && openingParsed.ok ? openingParsed.value : 0;
  const signedOpening = negative ? -openingMinor : openingMinor;
  const limitMinor = limitParsed && limitParsed.ok ? limitParsed.value : null;

  const canSubmit = rc.ready && rc.householdId !== null;

  const save = () => {
    setSubmitted(true);
    if (!canSubmit || nameTrimmed === '' || nameTrimmed.length > NAME_MAX) return;
    if (openingFailure || limitFailure) return;
    const ownerId = rc.userId;
    if (account === null) {
      if (rc.householdId === null || ownerId === null) return;
      const stepId = newStepId();
      const id = add(
        {
          household_id: rc.householdId,
          name: nameTrimmed,
          kind,
          currency,
          opening_balance: signedOpening,
          ...(limits === 'overdraft' ? { overdraft_limit: limitMinor } : {}),
          ...(limits === 'credit' ? { credit_limit: limitMinor } : {}),
        },
        { stepId, ownerId }
      );
      showToast({ kind: 'ordinary', text: undoLabelText('accountAdded', { name: nameTrimmed }), stepId });
      getAnalytics().track('account_created', { context: mode.kind === 'new' ? mode.context : 'later' });
      onSaved?.(id);
      onClose();
      return;
    }
    const patch: AccountPatch = {};
    if (nameTrimmed !== account.name) patch.name = nameTrimmed;
    if (kind !== account.kind) patch.kind = kind;
    if (signedOpening !== account.opening_balance) patch.opening_balance = signedOpening;
    if (limits === 'overdraft' && limitMinor !== account.overdraft_limit) patch.overdraft_limit = limitMinor;
    if (limits === 'credit' && limitMinor !== account.credit_limit) patch.credit_limit = limitMinor;
    // S-WR-12: a limit the new kind no longer has is cleared, not left behind on the row.
    if (limits !== 'overdraft' && account.overdraft_limit !== null) patch.overdraft_limit = null;
    if (limits !== 'credit' && account.credit_limit !== null) patch.credit_limit = null;
    if (Object.keys(patch).length > 0) {
      sendEdit(account, patch, ownerId);
    }
    onSaved?.(account.id);
    onClose();
  };

  // REC-11 / follow-up item 7: Undo is offered only when the hook records a step.
  const sendEdit = (acc: AccountRow, patch: AccountPatch, ownerId: string | null) => {
    const vars = { id: acc.id, householdId: acc.household_id, expectedVersion: acc.version, patch };
    if (ownerId === null) {
      edit(vars);
      return;
    }
    const stepId = newStepId();
    const recorded = edit(vars, { stepId, ownerId });
    showToast({
      kind: 'ordinary',
      text: undoLabelText('accountEdited', { name: patch.name ?? acc.name }),
      stepId: recorded ? stepId : null,
    });
  };

  const toggleArchive = () => {
    if (!account) return;
    sendEdit(account, { archived_at: account.archived_at === null ? new Date().toISOString() : null }, rc.userId);
    onClose();
  };

  const inputStyle = [
    textRole(pairing, 'body'),
    styles.input,
    { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 },
  ];
  const errorStyle = [textRole(pairing, 'label'), { color: colors.danger }];
  const helpStyle = [textRole(pairing, 'label'), { color: colors.inkMuted }];
  const labelStyle = [textRole(pairing, 'label'), { color: colors.inkMuted }];
  const title = t(account ? 'accounts.sheet.titleEdit' : 'accounts.sheet.titleNew');
  const signKeys =
    kind === 'credit'
      ? (['accounts.sheet.signIOwe', 'accounts.sheet.signImInCredit'] as const)
      : (['accounts.sheet.signInCredit', 'accounts.sheet.signOverdrawn'] as const);

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={labelStyle}>{t('accounts.sheet.name')}</Text>
        <TextInput
          accessibilityLabel={t('accounts.sheet.name')}
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX}
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />
        {nameError ? <Text style={errorStyle}>{t('accounts.sheet.nameRequired')}</Text> : null}

        <Row label={t('accounts.sheet.kind')} value={kindLabel(kind)} chevron dense onPress={() => setPicker('kind')} />
        {account ? (
          <>
            <Row label={t('accounts.sheet.currency')} value={currency} dense />
            <Text style={helpStyle}>{t('accounts.sheet.currencyFixed')}</Text>
          </>
        ) : (
          <Row label={t('accounts.sheet.currency')} value={currency} chevron dense onPress={() => setPicker('currency')} />
        )}

        <Text style={labelStyle}>{t(kind === 'loan' ? 'accounts.sheet.amountOwed' : 'accounts.sheet.openingBalance')}</Text>
        <TextInput
          accessibilityLabel={t(kind === 'loan' ? 'accounts.sheet.amountOwed' : 'accounts.sheet.openingBalance')}
          keyboardType="decimal-pad"
          value={openingText}
          onChangeText={setOpeningText}
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />
        {openingFailure ? <Text style={errorStyle}>{parser.errorMessage(openingFailure)}</Text> : null}
        {kind === 'loan' ? null : (
          <View style={styles.chips}>
            <Chip label={t(signKeys[0])} selected={signChoice === 'default'} onPress={() => setSignChoice('default')} />
            <Chip label={t(signKeys[1])} selected={signChoice === 'other'} onPress={() => setSignChoice('other')} />
          </View>
        )}

        {limits ? (
          <>
            <Text style={labelStyle}>{t(limits === 'overdraft' ? 'accounts.sheet.overdraftLimit' : 'accounts.sheet.creditLimit')}</Text>
            <TextInput
              accessibilityLabel={t(limits === 'overdraft' ? 'accounts.sheet.overdraftLimit' : 'accounts.sheet.creditLimit')}
              keyboardType="decimal-pad"
              value={limitText}
              onChangeText={setLimitText}
              style={inputStyle}
              placeholderTextColor={colors.inkFaint}
            />
            {limitFailure ? <Text style={errorStyle}>{parser.errorMessage(limitFailure)}</Text> : null}
            <Text style={helpStyle}>
              {t(limits === 'overdraft' ? 'accounts.sheet.overdraftLimitHelp' : 'accounts.sheet.creditLimitHelp')}
            </Text>
          </>
        ) : null}

        {canSubmit ? null : <Text style={helpStyle}>{t('accounts.sheet.notReady')}</Text>}
        <Pill
          label={t(account ? 'accounts.sheet.saveChanges' : 'accounts.sheet.save')}
          variant="primary"
          onPress={save}
          disabled={!canSubmit}
          accessibilityHint={canSubmit ? undefined : t('accounts.sheet.notReady')}
        />
        {account ? (
          <Pill
            label={t(account.archived_at === null ? 'accounts.sheet.archive' : 'accounts.sheet.restore')}
            variant="secondary"
            onPress={toggleArchive}
          />
        ) : null}
      </SheetScroll>
      <OptionPicker<AccountKind>
        visible={picker === 'kind'}
        title={t('accounts.sheet.kind')}
        options={KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
        selected={kind}
        onSelect={(k) => {
          // S-WR-12: on an existing account keep what its balance means (owed stays owed); a new
          // one takes the new kind's default (a card defaults to owing). Never carry a limit
          // typed for one kind of limit into the other.
          setSignChoice(account ? choiceFor(k, isNegative(kind, signChoice)) : 'default');
          if (limitKind(k) !== limitKind(kind)) setLimitText('');
          setKind(k);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <OptionPicker<string>
        visible={picker === 'currency'}
        title={t('accounts.sheet.currency')}
        options={options.map((o) => ({ value: o.code, label: `${o.code} · ${o.name}` }))}
        selected={currency}
        onSelect={(code) => {
          setCurrency(code);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
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
