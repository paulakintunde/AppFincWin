/**
 * Plan 05.2-43 (DSU-06): the loan and card sheet behind the Loans step's "Edit" and "Add a loan or card".
 *
 * Edit: name, balance, rate, minimum payment and (cards only) how the card is paid, prefilled from the debt. Save writes
 * only what changed, with one Undo. Add: the same fields for the chosen kind, name prefilled with the kind's label.
 * Paid off (edit only, owner 2026-10-28): a date (today by default, never after today) that stops Decide counting the
 * debt's minimum payment from that date; past months stay as recorded. One Undo puts it back. A debt already paid off
 * shows "Paid off {date}" instead of the action.
 *
 * Mounted per opening so every field starts from the debt. Nothing renders without the new Decide (D-01).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useIsDirty } from '@/ui/useIsDirty';
import { hapticSelection } from '@/ui/haptics';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { showToast } from '@/state/undoToast';
import { useAddDebt, useEditDebt, useSetDebtPaidOff, type EditableDebtPatch, type PaysInFull } from '@/data/mutations/debts';
import type { DebtRow } from '@/db/debts';
import { DateField } from '@/features/record/entry/pickers/DateField';
import { useRecordContext } from '@/features/record/useRecordContext';
import { Label, Meta } from '@/features/decide/check/steps/stepUi';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { ChipRow } from '@/features/income/steps/shared';
import { useDecideAccess } from '../useDecideAccess';
import { closeDebtSheet, useDebtSheetRequest, type DebtSheetRequest } from './debtSheetHost';
import type { DebtKindChoice } from './steps/setupSheetHost';

const NAME_MAX = 80;

const KIND_LABEL_KEY: Record<DebtKindChoice, string> = {
  card: 'decide.setup.loans.kindCard',
  car: 'decide.setup.loans.kindCar',
  student: 'decide.setup.loans.kindStudent',
  personal: 'decide.setup.loans.kindPersonal',
  mortgage: 'decide.setup.loans.kindMortgage',
  bnpl: 'decide.setup.loans.kindBnpl',
  other: 'decide.setup.loans.kindOther',
};

/** The stored kind for each choice: card -> card; car, student, personal, mortgage -> loan; bnpl, other -> other. */
export function storedKindOf(choice: DebtKindChoice): DebtRow['kind'] {
  if (choice === 'card') return 'card';
  if (choice === 'bnpl' || choice === 'other') return 'other';
  return 'loan';
}

const ANSWERS: readonly { value: Exclude<PaysInFull, null>; labelKey: string }[] = [
  { value: 'yes', labelKey: 'decide.setup.loans.paysFullYes' },
  { value: 'sometimes', labelKey: 'decide.setup.loans.paysFullSometimes' },
  { value: 'no', labelKey: 'decide.setup.loans.paysFullNo' },
];

/** '19.99' -> '19.99'; '' -> null (no rate); anything else outside 0..100 with two decimals -> 'invalid'. */
export function parseRate(text: string): string | null | 'invalid' {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return 'invalid';
  return Number(t) <= 100 ? t : 'invalid';
}

const validMinor = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n >= 0 && n <= MAX_INPUT_MINOR;

interface Fields {
  name: string;
  balance: number | null;
  rate: string;
  minimum: number | null;
  pays: PaysInFull;
}

export function DebtSheetHost(): React.JSX.Element | null {
  const request = useDebtSheetRequest();
  const { v3 } = useDecideAccess();
  if (!v3 || request === null) return null;
  const key = request.mode === 'edit' ? `edit:${request.debt.id}` : `add:${request.kind}`;
  return <DebtForm key={key} request={request} onClose={closeDebtSheet} />;
}

function DebtForm({ request, onClose }: { request: DebtSheetRequest; onClose: () => void }) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const fmt = useMoneyFormatter(false);
  const { add } = useAddDebt();
  const { edit } = useEditDebt();
  const { setPaidOff } = useSetDebtPaidOff();

  const debt = request.mode === 'edit' ? request.debt : null;
  const addKind = request.mode === 'add' ? request.kind : null;
  const isCard = debt !== null ? debt.kind === 'card' : addKind === 'card';
  const currency = debt?.currency ?? rc.homeCurrency;

  const [initial] = useState<Fields>(() =>
    debt !== null
      ? { name: debt.name, balance: debt.balance, rate: debt.apr ?? '', minimum: debt.minimum_payment, pays: debt.pays_in_full ?? null }
      : { name: t(KIND_LABEL_KEY[addKind as DebtKindChoice]), balance: null, rate: '', minimum: null, pays: null }
  );
  const [value, setValue] = useState<Fields>(initial);
  const set = (patch: Partial<Fields>) => setValue((v) => ({ ...v, ...patch }));
  const dirty = useIsDirty(initial, value);

  const [paidOpen, setPaidOpen] = useState(false);
  const [paidDate, setPaidDate] = useState(rc.today);

  const trimmed = value.name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= NAME_MAX;
  const rate = parseRate(value.rate);
  const rateOk = rate !== 'invalid';
  const balanceOk = validMinor(value.balance);
  const minimumOk = validMinor(value.minimum);
  const formOk = nameOk && rateOk && balanceOk && minimumOk;
  const canSave = formOk && rc.userId !== null && rc.householdId !== null && (debt === null || dirty);

  const title = debt !== null ? t('decide.setup.debtSheet.titleEdit', { name: debt.name }) : t('decide.setup.debtSheet.titleAdd');

  const save = (): void => {
    if (!canSave || rc.userId === null || rc.householdId === null || !validMinor(value.balance) || !validMinor(value.minimum) || rate === 'invalid') return;
    if (debt === null) {
      const kind = storedKindOf(addKind as DebtKindChoice);
      const { stepId } = add({
        householdId: rc.householdId,
        ownerId: rc.userId,
        row: {
          account_id: null,
          series_id: null,
          name: trimmed,
          kind,
          currency,
          balance: value.balance,
          apr: rate,
          minimum_payment: value.minimum,
          secured: addKind === 'car' || addKind === 'mortgage',
          term_months: null,
          start_date: null,
          min_percent: null,
          min_interest_added: null,
          min_floor: null,
          paid_in_full: false,
          pays_in_full: kind === 'card' ? value.pays : null,
        },
      });
      showToast({ kind: 'destructive', text: { key: 'decide.setup.debtSheet.savedToast', params: { undoLabel: 'debtAdded', name: trimmed } }, stepId });
    } else {
      const patch: EditableDebtPatch = {};
      if (trimmed !== debt.name) patch.name = trimmed;
      if (value.balance !== debt.balance) patch.balance = value.balance;
      if (rate !== (debt.apr ?? null)) patch.apr = rate;
      if (value.minimum !== debt.minimum_payment) patch.minimum_payment = value.minimum;
      if (isCard && value.pays !== (debt.pays_in_full ?? null)) patch.pays_in_full = value.pays;
      if (Object.keys(patch).length > 0) {
        const stepId = edit(debt, patch, rc.userId);
        showToast({ kind: 'destructive', text: { key: 'decide.setup.debtSheet.savedToast', params: { undoLabel: 'debtEdited', name: trimmed } }, stepId });
      }
    }
    onClose();
  };

  const paidFuture = paidDate > rc.today;
  const savePaidOff = (): void => {
    if (debt === null || rc.userId === null || paidFuture) return;
    const stepId = setPaidOff(debt, paidDate, rc.userId);
    showToast({ kind: 'destructive', text: { key: 'decide.setup.debtSheet.paidOffToast', params: { undoLabel: 'debtPaidOff', name: debt.name } }, stepId });
    onClose();
  };

  const paidOffOn = debt?.paid_off_on ?? null;
  const nbsp = (text: string): string => text.replace(/ /g, ' ');
  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Label>{t('decide.setup.debtSheet.name')}</Label>
        <View style={[styles.box, { backgroundColor: colors.fill6 }]}>
          <TextInput
            value={value.name}
            onChangeText={(name) => set({ name })}
            accessibilityLabel={t('decide.setup.debtSheet.name')}
            maxLength={NAME_MAX}
            placeholderTextColor={colors.inkFaint}
            style={[styles.input, { ...textRole(pairing, 'body'), color: colors.ink }]}
          />
        </View>
        {!nameOk && value.name !== initial.name ? <Meta tone="danger">{t('decide.setup.debtSheet.nameRequired')}</Meta> : null}
        <MoneyInput
          boxed
          value={value.balance}
          currency={currency}
          onChange={(balance) => set({ balance })}
          label={t('decide.setup.debtSheet.balance')}
          accessibilityLabel={t('decide.setup.debtSheet.balance')}
        />
        <Label>{t('decide.setup.debtSheet.rate')}</Label>
        <View style={[styles.box, { backgroundColor: colors.fill6 }]}>
          <TextInput
            value={value.rate}
            onChangeText={(rateText) => set({ rate: rateText })}
            accessibilityLabel={t('decide.setup.debtSheet.a11yRate')}
            keyboardType="decimal-pad"
            placeholder={t('decide.setup.debtSheet.rateHint')}
            placeholderTextColor={colors.inkFaint}
            maxLength={6}
            style={[styles.input, { ...textRole(pairing, 'body'), color: colors.ink }]}
          />
        </View>
        {!rateOk ? <Meta tone="danger">{t('decide.setup.debtSheet.rateOutOfRange')}</Meta> : null}
        <MoneyInput
          boxed
          value={value.minimum}
          currency={currency}
          onChange={(minimum) => set({ minimum })}
          label={t('decide.setup.debtSheet.minimum')}
          accessibilityLabel={t('decide.setup.debtSheet.minimum')}
        />
        {isCard ? (
          <View style={{ gap: space.gapSm }}>
            <Text style={label}>{t('decide.setup.loans.paysFull')}</Text>
            <ChipRow label={t('decide.setup.loans.paysFull')}>
              {ANSWERS.map((a) => (
                <Chip
                  key={a.value}
                  label={t(a.labelKey)}
                  selected={value.pays === a.value}
                  onPress={() => {
                    hapticSelection();
                    set({ pays: a.value });
                  }}
                />
              ))}
            </ChipRow>
          </View>
        ) : null}
        <Pill label={t('decide.setup.debtSheet.save')} variant="primary" disabled={!canSave} onPress={save} />

        {debt !== null && paidOffOn !== null ? (
          <Text
            accessible
            accessibilityLabel={t('decide.setup.debtSheet.a11yPaidOff', { name: debt.name, date: fmt.formatDate(paidOffOn) })}
            style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}
          >
            {t('decide.setup.debtSheet.statusPaidOff', { date: nbsp(fmt.formatDate(paidOffOn)) })}
          </Text>
        ) : null}

        {debt !== null && paidOffOn === null ? (
          paidOpen ? (
            <View style={styles.paidBlock}>
              <DateField
                label={t('decide.setup.debtSheet.paidOffDate')}
                value={paidDate}
                display={fmt.formatDate(paidDate)}
                onChange={setPaidDate}
              />
              <Meta tone="muted">{t('decide.setup.debtSheet.paidOffBody')}</Meta>
              {paidFuture ? <Meta tone="danger">{t('decide.setup.debtSheet.paidOffFuture')}</Meta> : null}
              <Pill label={t('decide.setup.debtSheet.paidOffSave')} variant="primary" disabled={paidFuture} onPress={savePaidOff} accessibilityLabel={t('decide.setup.debtSheet.paidOff')} />
            </View>
          ) : (
            <Pill label={t('decide.setup.debtSheet.paidOff')} variant="secondary" onPress={() => setPaidOpen(true)} />
          )
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  box: { borderRadius: space.cardPad, paddingHorizontal: space.cardPad, justifyContent: 'center' },
  input: { minHeight: space.touchMin, padding: 0 },
  paidBlock: { gap: space.gapSm, marginTop: space.gapSm },
});
