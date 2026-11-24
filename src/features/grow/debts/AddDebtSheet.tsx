// 06-17 (G07, D-15, D-28): Add a debt, and edit one. Grow owns debt forms (ARC-14). A credit card first asks whether it is paid in
// full each month: Yes lists it under "Cards paid in full" and asks no rate and no minimum; No or Not sure asks the rate, the
// minimum and the due day, and a blank minimum shows the engine's estimate so the user can replace it. The live line shows the
// debt payments against the user's rule; crossing it shows a warning badge (shape and word) and a warning haptic, and the save
// still works because the choice is the user's.
//
// Quick 261123 (owner decisions DD-01..DD-04, 2026-11-23):
//   DD-01 the rate is required (0 is a real answer: no interest), or "I don't know the rate" (saved as no rate, shown as
//         unknown, never as interest-free). A card paid in full each month is exempt (D-15).
//   DD-02 a fixed loan (Loan, Money owed to someone) asks its original amount and start date; required on a new debt.
//   DD-03 revolving debt (Credit card, Line of credit) asks its credit limit and its balance now; required on a new debt.
//   DD-04 "Already paid off" adds a debt at 0 with its paid-off date; a fixed loan still needs its original amount and start
//         date, and the form says why.
// On an edit nothing new is required beyond the rate (DD-05: never block an older debt); the quiet ask names what is missing.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { useSaveGrowDebt, type EditGrowDebtFields, type GrowPaysInFull } from '@/data/mutations/growDebts';
import { debtIsFixed, type DebtRow } from '@/db/debts';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { validDateText } from '@/features/grow/investing/investingFormat';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { hapticTap, hapticTick, hapticWarn } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useIsDirty } from '@/ui/useIsDirty';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';

import { debtLineModel, estimatedMinimumOf } from './debtLineModel';
import { debtHref, useDebtFormat, useDebtMonth } from './debtScreenData';
import { useDebtsRead } from './useDebtsRead';

const NAME_MAX = 80;

type TypeChoice = 'loan' | 'card' | 'line' | 'owed';
type FullAnswer = 'yes' | 'no' | 'unsure';
type Status = 'open' | 'paidOff';

const TYPES: readonly { value: TypeChoice; textKey: string }[] = [
  { value: 'loan', textKey: 'grow.debts.add.typeLoan' },
  { value: 'card', textKey: 'grow.debts.add.typeCard' },
  { value: 'line', textKey: 'grow.debts.add.typeLine' },
  { value: 'owed', textKey: 'grow.debts.add.typeOwed' },
];
const ANSWERS: readonly { value: FullAnswer; textKey: string }[] = [
  { value: 'yes', textKey: 'grow.debts.add.fullYes' },
  { value: 'no', textKey: 'grow.debts.add.fullNo' },
  { value: 'unsure', textKey: 'grow.debts.add.fullUnsure' },
];
const STATUSES: readonly { value: Status; textKey: string }[] = [
  { value: 'open', textKey: 'grow.debts.add.statusOpen' },
  { value: 'paidOff', textKey: 'grow.debts.add.statusPaidOff' },
];

/** '6.9' -> '6.9'; '' -> null (no rate typed); anything outside 0..100 with two decimals -> 'invalid'. */
export function parseRate(text: string): string | null | 'invalid' {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return 'invalid';
  return Number(t) <= 100 ? t : 'invalid';
}

function parseDay(text: string): number | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d{1,2}$/.test(t)) return 'invalid';
  const n = Number(t);
  return n >= 1 && n <= 31 ? n : 'invalid';
}

/** 261123: '' -> null; a real calendar day no later than today -> the date; anything else -> 'invalid'. */
export function parseDate(text: string, today: string): string | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  return validDateText(t) && t <= today ? t : 'invalid';
}

/** 261123 (DD-02, DD-03): a loan or money owed is a fixed loan; a card or line of credit revolves. */
export const isRevolvingType = (type: TypeChoice): boolean => type === 'card' || type === 'line';

const validMinor = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n >= 0 && n <= MAX_INPUT_MINOR;

interface Fields {
  type: TypeChoice;
  status: Status;
  name: string;
  balance: number | null;
  rate: string;
  /** DD-01: "I don't know the rate". */
  rateUnknown: boolean;
  minimum: number | null;
  day: string;
  full: FullAnswer | null;
  accountId: string | null;
  /** DD-02: a fixed loan's original amount and start date. */
  original: number | null;
  startDate: string;
  /** DD-03: a revolving debt's credit limit. */
  limit: number | null;
  /** DD-04: the date an already paid-off debt was cleared. */
  paidOffOn: string;
}

export interface AddDebtSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Edit this debt instead of adding one. */
  debt?: DebtRow;
}

function typeOf(debt: DebtRow): TypeChoice {
  if (debt.kind === 'card') return 'card';
  if (debt.kind === 'loan') return 'loan';
  return debt.revolving === false ? 'owed' : 'line';
}

function initialOf(debt: DebtRow | undefined): Fields {
  if (debt === undefined) {
    return {
      type: 'loan',
      status: 'open',
      name: '',
      balance: null,
      rate: '',
      rateUnknown: false,
      minimum: null,
      day: '',
      full: null,
      accountId: null,
      original: null,
      startDate: '',
      limit: null,
      paidOffOn: '',
    };
  }
  const full: FullAnswer | null = debt.kind === 'card' ? (debt.pays_in_full === 'yes' ? 'yes' : debt.pays_in_full === 'no' ? 'no' : 'unsure') : null;
  const paysFull = full === 'yes';
  return {
    type: typeOf(debt),
    status: debt.paid_off_on != null ? 'paidOff' : 'open',
    name: debt.name,
    balance: debt.balance,
    rate: debt.apr ?? '',
    // DD-01: a carried debt stored with no rate is "rate unknown" (D-07), so the edit opens with that answer chosen.
    rateUnknown: !paysFull && debt.apr == null,
    minimum: debt.minimum_payment,
    day: debt.due_day != null ? String(debt.due_day) : '',
    full,
    accountId: debt.account_id,
    original: debtIsFixed(debt) ? debt.started_balance ?? null : null,
    startDate: debt.start_date ?? '',
    limit: debt.credit_limit ?? null,
    paidOffOn: debt.paid_off_on ?? '',
  };
}

export function AddDebtSheet({ visible, onClose, debt }: AddDebtSheetProps) {
  const t = useT() as unknown as (key: string, options?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const fmt = useDebtFormat();
  const read = useDebtsRead();
  const month = useDebtMonth();
  const accounts = useAccounts(rc.householdId ?? undefined).data ?? [];
  const { save } = useSaveGrowDebt();

  const [initial] = useState<Fields>(() => initialOf(debt));
  const [value, setValue] = useState<Fields>(initial);
  const set = (patch: Partial<Fields>) => setValue((v) => ({ ...v, ...patch }));
  const dirty = useIsDirty(initial, value);

  const adding = debt === undefined;
  const isCard = value.type === 'card';
  const revolving = isRevolvingType(value.type);
  const fixed = !revolving;
  const asked = !isCard || value.full !== null;
  const paidInFull = isCard && value.full === 'yes';
  const paidOff = value.status === 'paidOff';
  const carried = !paidInFull;
  const open = !paidOff;
  const currency = debt?.currency ?? rc.homeCurrency;
  const today = read.today;

  const name = value.name.trim();
  const nameOk = name.length >= 1 && name.length <= NAME_MAX;
  const rate = value.rateUnknown ? null : parseRate(value.rate);
  const day = parseDay(value.day);
  const startDate = parseDate(value.startDate, today);
  const paidOffOn = parseDate(value.paidOffOn, today);

  // A paid-off debt owes 0 (the field is not shown); a card paid in full may owe 0 now; anything else owes more than 0.
  const balanceOk = paidOff ? true : paidInFull ? validMinor(value.balance) : validMinor(value.balance) && value.balance > 0;
  // P3-CR-02: a loan, line or money owed needs its monthly payment typed, as Decide's own debt sheet asks. A blank would save
  // as 0 a month and Decide would leave the payment out. Only a carried card may stay blank (D-28: the estimate stands in).
  // A paid-off debt has no payment left.
  const minimumOk = paidOff || paidInFull ? true : isCard ? value.minimum === null || validMinor(value.minimum) : validMinor(value.minimum);
  const minimumMissing = open && !isCard && value.minimum === null;
  // DD-01: a typed rate (0 counts) or "I don't know"; a card paid in full needs neither.
  const rateMissing = carried && !value.rateUnknown && rate === null;
  const rateOk = paidInFull || (rate !== 'invalid' && !rateMissing);
  const dayOk = day !== 'invalid';
  // DD-02 / DD-03: required on a new debt; on an edit only checked when typed (DD-05: never block an older debt).
  const originalOk = !fixed || (value.original === null ? !adding : validMinor(value.original) && value.original > 0);
  const startOk = !fixed || (startDate !== 'invalid' && (startDate !== null || !adding));
  const limitOk = !revolving || (value.limit === null ? !adding : validMinor(value.limit));
  // DD-04: the paid-off date is a real day, not after today and not before the start date.
  const paidOffBeforeStart = paidOff && typeof paidOffOn === 'string' && typeof startDate === 'string' && paidOffOn !== 'invalid' && startDate !== 'invalid' && paidOffOn < startDate;
  const paidOffOk = !paidOff || (typeof paidOffOn === 'string' && paidOffOn !== 'invalid' && !paidOffBeforeStart);

  // D-28: a carried card with no typed minimum.
  const estimate = open && isCard && carried && value.minimum === null && rate !== 'invalid' ? estimatedMinimumOf(value.balance, value.rateUnknown ? '' : value.rate, currency) : null;
  const newMinimum = paidInFull || paidOff ? 0 : value.minimum ?? estimate ?? 0;

  // The live line: what other open debts pay now, plus this one (an edit swaps its own minimum out).
  const others = read.model.debts
    .filter((d) => d.inPlan && d.id !== debt?.id)
    .reduce((s, d) => s + d.point.minimum + d.extra, 0);
  // P3-WR-05: the plan's payments, this debt's minimum and Decide's pay are compared only when all are in one currency.
  const sameCurrency = currency === month.currency && (read.model.planCurrency ?? currency) === month.currency;
  const lineModel = month.usualPay === null || !sameCurrency ? null : debtLineModel(others + newMinimum, month.usualPay, month.rule ?? '100');
  const over = month.rule !== null && lineModel !== null && lineModel.over;
  const warned = useRef(false);
  useEffect(() => {
    if (over && !warned.current) {
      warned.current = true;
      hapticWarn();
    }
    if (!over) warned.current = false;
  }, [over]);

  const formOk = asked && nameOk && balanceOk && minimumOk && rateOk && dayOk && originalOk && startOk && limitOk && paidOffOk;
  const canSave = formOk && rc.userId !== null && rc.householdId !== null && (adding || dirty);

  const title = adding ? t('grow.debts.add.title') : t('grow.debts.add.saveEdit');

  const onSave = (): void => {
    if (!canSave || rc.userId === null || rc.householdId === null || rate === 'invalid' || startDate === 'invalid' || paidOffOn === 'invalid') return;
    const pays: GrowPaysInFull = !isCard ? null : value.full === 'yes' ? 'yes' : value.full === 'no' ? 'no' : null;
    // DD-01: "I don't know" and a card paid in full both store no rate; only the first reads as "rate unknown".
    const apr = paidInFull ? null : rate;
    const original = fixed ? value.original : null;
    const limit = revolving ? value.limit : null;
    try {
      if (debt === undefined) {
        const { id, stepId } = save({
          ownerId: rc.userId,
          householdId: rc.householdId,
          fields: {
            name,
            kind: value.type === 'card' ? 'card' : value.type === 'loan' ? 'loan' : 'other',
            currency,
            balance: paidOff ? 0 : value.balance ?? 0,
            apr,
            minimum_payment: paidInFull || paidOff ? 0 : value.minimum ?? 0,
            due_day: paidOff ? null : day,
            pays_in_full: pays,
            account_id: value.accountId,
            started_balance: original,
            start_date: fixed ? startDate : null,
            credit_limit: limit,
            revolving,
            paid_off_on: paidOff ? paidOffOn : null,
          },
        });
        hapticTap();
        showToast({ kind: 'ordinary', text: { key: 'grow.debts.add.addedToast' }, stepId });
        onClose();
        pushOnce(debtHref(id));
      } else {
        const fields: EditGrowDebtFields = {};
        if (name !== debt.name) fields.name = name;
        if (open) {
          if (value.balance !== null && value.balance !== debt.balance) fields.balance = value.balance;
          // P3-WR-06: a cleared balance on a card paid in full is stored as 0, as the add path does.
          if (value.balance === null && paidInFull && debt.balance !== 0) fields.balance = 0;
        }
        if (!paidInFull && apr !== (debt.apr ?? null)) fields.apr = apr;
        if (open && !paidInFull && value.minimum !== null && value.minimum !== debt.minimum_payment) fields.minimum_payment = value.minimum;
        // P3-WR-06: a carried card's minimum cleared goes back to the estimate (stored as 0, D-28).
        if (open && isCard && carried && value.minimum === null && debt.minimum_payment !== 0) fields.minimum_payment = 0;
        // P3-WR-06: a card switched to paid in full keeps no rate and no minimum, as the add path saves it.
        if (paidInFull) {
          if (debt.apr != null) fields.apr = null;
          if (debt.minimum_payment !== 0) fields.minimum_payment = 0;
        }
        if (open && day !== (debt.due_day ?? null)) fields.due_day = day;
        if (isCard && pays !== (debt.pays_in_full ?? null)) fields.pays_in_full = pays;
        // DD-02 / DD-03: only what was typed or changed; a value left blank on an older debt stays as it is.
        if (fixed && original !== null && original !== (debt.started_balance ?? null)) fields.started_balance = original;
        if (fixed && startDate !== null && startDate !== (debt.start_date ?? null)) fields.start_date = startDate;
        if (revolving && limit !== null && limit !== (debt.credit_limit ?? null)) fields.credit_limit = limit;
        if (debt.kind === 'other' && revolving !== (debt.revolving ?? null)) fields.revolving = revolving;
        if (Object.keys(fields).length > 0) {
          const { stepId } = save({ ownerId: rc.userId, existing: debt, fields });
          hapticTap();
          showToast({ kind: 'ordinary', text: { key: 'grow.debts.add.editedToast' }, stepId });
        }
        onClose();
      }
    } catch {
      showToast({ kind: 'refusal', text: { key: 'grow.common.saveFailed' } });
    }
  };

  const box = [styles.box, { backgroundColor: colors.fill6 }];
  const input = [styles.input, { ...textRole(pairing, 'body'), color: colors.ink }];
  const openAccounts = accounts.filter((a) => a.archived_at === null);
  // An edit of an older 'other' debt may say whether it is a line of credit or money owed (DD-03).
  const editTypes = debt !== undefined && debt.kind === 'other' ? TYPES.filter((x) => x.value === 'line' || x.value === 'owed') : null;

  const dateField = (labelKey: string, text: string, parsed: string | null | 'invalid', onChange: (next: string) => void, testID: string) => (
    <>
      <Label>{t(labelKey)}</Label>
      <View style={box}>
        <TextInput
          testID={testID}
          value={text}
          onChangeText={onChange}
          accessibilityLabel={`${t(labelKey)}, ${t('grow.debts.add.dateHelp')}`}
          placeholder={t('grow.debts.add.dateHelp')}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          placeholderTextColor={colors.inkMuted}
          style={input}
        />
      </View>
      {parsed === 'invalid' ? <Meta tone="danger">{t('grow.debts.add.dateInvalid')}</Meta> : null}
    </>
  );

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('grow.common.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        {adding || editTypes !== null ? (
          <ChipRow label={t('grow.debts.add.title')}>
            {(editTypes ?? TYPES).map((x) => (
              <Chip
                key={x.value}
                label={t(x.textKey)}
                selected={value.type === x.value}
                onPress={() => {
                  hapticTick();
                  set({ type: x.value, full: x.value === 'card' ? value.full : null });
                }}
              />
            ))}
          </ChipRow>
        ) : null}

        {isCard ? (
          <RadioGroup
            label={t('grow.debts.add.fullQuestion')}
            options={ANSWERS}
            selected={value.full}
            testPrefix="add-debt-full"
            onSelect={(full) => set({ full })}
          />
        ) : null}

        {asked && adding ? (
          <RadioGroup
            label={t('grow.debts.add.statusQuestion')}
            options={STATUSES}
            selected={value.status}
            testPrefix="add-debt-status"
            onSelect={(status) => set({ status })}
          />
        ) : null}

        {asked ? (
          <>
            <Label>{t('grow.debts.add.name')}</Label>
            <View style={box}>
              <TextInput
                value={value.name}
                onChangeText={(next) => set({ name: next })}
                accessibilityLabel={t('grow.debts.add.name')}
                maxLength={NAME_MAX}
                placeholderTextColor={colors.inkFaint}
                style={input}
              />
            </View>

            {/* DD-02: a fixed loan's original amount and start date. */}
            {fixed ? (
              <>
                <MoneyInput
                  boxed
                  value={value.original}
                  currency={currency}
                  onChange={(original) => set({ original })}
                  label={t('grow.debts.add.original')}
                  accessibilityLabel={t('grow.debts.add.original')}

                />
                {adding && value.original === null ? <Meta>{t('grow.debts.add.originalNeeded')}</Meta> : null}
                {dateField('grow.debts.add.startDate', value.startDate, startDate, (next) => set({ startDate: next }), 'add-debt-start')}
              </>
            ) : null}

            {/* DD-03: a revolving debt's credit limit. */}
            {revolving ? (
              <>
                <MoneyInput
                  boxed
                  value={value.limit}
                  currency={currency}
                  onChange={(limit) => set({ limit })}
                  label={t('grow.debts.add.limit')}
                  accessibilityLabel={t('grow.debts.add.limit')}

                />
                {adding && value.limit === null ? <Meta>{t('grow.debts.add.limitNeeded')}</Meta> : null}
              </>
            ) : null}

            {paidOff ? (
              <>
                {dateField('grow.debts.add.paidOffOn', value.paidOffOn, paidOffOn, (next) => set({ paidOffOn: next }), 'add-debt-paid-off-on')}
                {paidOffBeforeStart ? <Meta tone="danger">{t('grow.debts.add.paidOffBeforeStart')}</Meta> : null}
                {fixed ? <Meta>{t('grow.debts.add.whyHistory')}</Meta> : null}
              </>
            ) : (
              <MoneyInput
                boxed
                value={value.balance}
                currency={currency}
                onChange={(balance) => set({ balance })}
                label={t('grow.debts.add.owedNow')}
                accessibilityLabel={t('grow.debts.add.owedNow')}
              />
            )}

            {carried ? (
              <>
                <Label>{t('grow.debts.add.rate')}</Label>
                {value.rateUnknown ? null : (
                  <View style={box}>
                    <TextInput
                      testID="add-debt-rate"
                      value={value.rate}
                      onChangeText={(next) => set({ rate: next })}
                      accessibilityLabel={`${t('grow.debts.add.rate')}, ${t('grow.debts.add.rateHelp')}`}
                      keyboardType="decimal-pad"
                      maxLength={6}
                      placeholderTextColor={colors.inkFaint}
                      style={input}
                    />
                  </View>
                )}
                {value.rateUnknown ? null : <Meta tone={rate === 'invalid' ? 'danger' : 'muted'}>{t('grow.debts.add.rateHelp')}</Meta>}
                <Pressable
                  testID="add-debt-rate-unknown"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: value.rateUnknown }}
                  accessibilityLabel={t('grow.debts.add.rateUnknown')}
                  onPress={() => {
                    hapticTick();
                    set({ rateUnknown: !value.rateUnknown });
                  }}
                  style={({ pressed }) => [styles.radio, { borderColor: value.rateUnknown ? colors.ink : colors.line1, opacity: pressed ? PRESSED_OPACITY : 1 }]}
                >
                  <RadioDot selected={value.rateUnknown} />
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('grow.debts.add.rateUnknown')}</Text>
                </Pressable>
                {value.rateUnknown ? <Meta>{t('grow.debts.add.rateUnknownNote')}</Meta> : null}
                {rateMissing && dirty ? <Meta>{t('grow.debts.add.rateNeeded')}</Meta> : null}
                {open ? (
                  <>
                    <MoneyInput
                      boxed
                      value={value.minimum}
                      currency={currency}
                      onChange={(minimum) => set({ minimum })}
                      label={t('grow.debts.add.minimum')}
                      accessibilityLabel={t('grow.debts.add.minimum')}
                    />
                    {minimumMissing ? <Meta>{t('grow.debts.add.minimumNeeded')}</Meta> : null}
                    {estimate !== null ? (
                      <Text testID="add-debt-estimate" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                        {t('grow.debts.add.minimumEstimate', { amount: fmt.cents(estimate, currency) })}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
            {open ? (
              <>
                <Label>{paidInFull ? t('grow.debts.add.statementDay') : t('grow.debts.add.dueDay')}</Label>
                <View style={box}>
                  <TextInput
                    value={value.day}
                    onChangeText={(next) => set({ day: next })}
                    accessibilityLabel={paidInFull ? t('grow.debts.add.statementDay') : t('grow.debts.add.dueDay')}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholderTextColor={colors.inkFaint}
                    style={input}
                  />
                </View>
              </>
            ) : null}
            {openAccounts.length > 0 && open ? (
              <>
                <Label>{t('grow.debts.add.paidFrom')}</Label>
                <ChipRow label={t('grow.debts.add.paidFrom')}>
                  {openAccounts.map((a) => (
                    <Chip
                      key={a.id}
                      label={a.name}
                      selected={value.accountId === a.id}
                      onPress={() => {
                        hapticTick();
                        set({ accountId: value.accountId === a.id ? null : a.id });
                      }}
                    />
                  ))}
                </ChipRow>
              </>
            ) : null}

            {lineModel === null || paidInFull || paidOff ? null : (
              <View testID="add-debt-line" style={styles.group}>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                  {month.rule === null
                    ? t('grow.debts.add.liveLineNoRule', { percent: lineModel.sharePercent })
                    : t('grow.debts.add.liveLine', { percent: lineModel.sharePercent, rule: Number(month.rule) })}
                </Text>
                {over ? (
                  <>
                    <StateBadge tone="warn" shape="sOver" label={t('grow.debts.add.overBadge')} />
                    <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                      {t('grow.debts.add.overLine', { percent: lineModel.sharePercent, rule: Number(month.rule) })}
                    </Text>
                  </>
                ) : null}
              </View>
            )}
            <Pill label={adding ? t('grow.debts.add.save') : t('grow.debts.add.saveEdit')} variant="primary" disabled={!canSave} onPress={onSave} />
          </>
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  group: { gap: space.gapSm },
  box: { borderRadius: space.cardPad, paddingHorizontal: space.cardPad, justifyContent: 'center' },
  input: { minHeight: space.touchMin, padding: 0 },
  radio: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, borderWidth: 1, borderRadius: radii.card, paddingHorizontal: space.cardPad, minHeight: space.touchMin },
});

// Small local pieces (the Decide sheet's versions pull in the whole Decide and sign-in tree).
function Label({ children }: { children: React.ReactNode }) {
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{children}</Text>;
}

function Meta({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'danger' }) {
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'label'), color: tone === 'danger' ? colors.danger : colors.inkMuted }}>{children}</Text>;
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={chipStyles.row}>
      {children}
    </View>
  );
}

function RadioGroup<V extends string>({
  label,
  options,
  selected,
  testPrefix,
  onSelect,
}: {
  label: string;
  options: readonly { value: V; textKey: string }[];
  selected: V | null;
  testPrefix: string;
  onSelect: (value: V) => void;
}) {
  const t = useT() as unknown as (key: string) => string;
  const { colors, pairing } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{label}</Text>
      {options.map((a) => {
        const on = selected === a.value;
        return (
          <Pressable
            key={a.value}
            testID={`${testPrefix}-${a.value}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(a.textKey)}
            onPress={() => {
              hapticTick();
              onSelect(a.value);
            }}
            style={({ pressed }) => [styles.radio, { borderColor: on ? colors.ink : colors.line1, opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <RadioDot selected={on} />
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t(a.textKey)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm } });
