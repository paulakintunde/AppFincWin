// 06-17 (G07, D-15, D-28): Add a debt, and edit one. Grow owns debt forms (ARC-14). A credit card first asks whether it is paid in
// full each month: Yes lists it under "Cards paid in full" and asks only the statement due day; No or Not sure asks the rate, the
// minimum and the due day, and a blank minimum shows the engine's estimate so the user can replace it. The live line shows the
// debt payments against the user's rule; crossing it shows a warning badge (shape and word) and a warning haptic, and the save
// still works because the choice is the user's.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { useSaveGrowDebt, type EditGrowDebtFields, type GrowPaysInFull } from '@/data/mutations/growDebts';
import type { DebtRow } from '@/db/debts';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { hapticLight, hapticSelection, hapticWarning } from '@/ui/haptics';
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

const TYPES: readonly { value: TypeChoice; labelKey: string }[] = [
  { value: 'loan', labelKey: 'grow.debts.add.typeLoan' },
  { value: 'card', labelKey: 'grow.debts.add.typeCard' },
  { value: 'line', labelKey: 'grow.debts.add.typeLine' },
  { value: 'owed', labelKey: 'grow.debts.add.typeOwed' },
];
const ANSWERS: readonly { value: FullAnswer; labelKey: string }[] = [
  { value: 'yes', labelKey: 'grow.debts.add.fullYes' },
  { value: 'no', labelKey: 'grow.debts.add.fullNo' },
  { value: 'unsure', labelKey: 'grow.debts.add.fullUnsure' },
];

/** '6.9' -> '6.9'; '' -> null (no rate); anything outside 0..100 with two decimals -> 'invalid'. */
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

const validMinor = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n >= 0 && n <= MAX_INPUT_MINOR;

interface Fields {
  type: TypeChoice;
  name: string;
  balance: number | null;
  rate: string;
  minimum: number | null;
  day: string;
  full: FullAnswer | null;
  accountId: string | null;
}

export interface AddDebtSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Edit this debt instead of adding one. */
  debt?: DebtRow;
}

function initialOf(debt: DebtRow | undefined): Fields {
  if (debt === undefined) return { type: 'loan', name: '', balance: null, rate: '', minimum: null, day: '', full: null, accountId: null };
  return {
    type: debt.kind === 'card' ? 'card' : debt.kind === 'loan' ? 'loan' : 'line',
    name: debt.name,
    balance: debt.balance,
    rate: debt.apr ?? '',
    minimum: debt.minimum_payment,
    day: debt.due_day != null ? String(debt.due_day) : '',
    full: debt.kind === 'card' ? (debt.pays_in_full === 'yes' ? 'yes' : debt.pays_in_full === 'no' ? 'no' : 'unsure') : null,
    accountId: debt.account_id,
  };
}

export function AddDebtSheet({ visible, onClose, debt }: AddDebtSheetProps) {
  const t = useT() as (key: string, options?: Record<string, string | number>) => string;
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

  const isCard = value.type === 'card';
  const asked = !isCard || value.full !== null;
  const paidInFull = isCard && value.full === 'yes';
  const carried = !paidInFull;
  const currency = debt?.currency ?? rc.homeCurrency;

  const name = value.name.trim();
  const nameOk = name.length >= 1 && name.length <= NAME_MAX;
  const rate = parseRate(value.rate);
  const day = parseDay(value.day);
  const balanceOk = paidInFull ? value.balance === null || validMinor(value.balance) : validMinor(value.balance) && value.balance > 0;
  const minimumOk = value.minimum === null || validMinor(value.minimum);
  const rateOk = rate !== 'invalid';
  const dayOk = day !== 'invalid';

  // D-28: a carried card with no typed minimum.
  const estimate = isCard && carried && value.minimum === null && rateOk ? estimatedMinimumOf(value.balance, value.rate) : null;
  const newMinimum = paidInFull ? 0 : value.minimum ?? estimate ?? 0;

  // The live line: what other open debts pay now, plus this one (an edit swaps its own minimum out).
  const others = read.model.debts
    .filter((d) => d.inPlan && d.id !== debt?.id)
    .reduce((s, d) => s + d.point.minimum + d.extra, 0);
  const lineModel = month.usualPay === null ? null : debtLineModel(others + newMinimum, month.usualPay, month.rule ?? '100');
  const over = month.rule !== null && lineModel !== null && lineModel.over;
  const warned = useRef(false);
  useEffect(() => {
    if (over && !warned.current) {
      warned.current = true;
      hapticWarning();
    }
    if (!over) warned.current = false;
  }, [over]);

  const formOk = asked && nameOk && balanceOk && minimumOk && rateOk && dayOk;
  const canSave = formOk && rc.userId !== null && rc.householdId !== null && (debt === undefined || dirty);

  const title = debt === undefined ? t('grow.debts.add.title') : t('grow.debts.add.saveEdit');

  const onSave = (): void => {
    if (!canSave || rc.userId === null || rc.householdId === null || rate === 'invalid') return;
    const pays: GrowPaysInFull = !isCard ? null : value.full === 'yes' ? 'yes' : value.full === 'no' ? 'no' : null;
    try {
      if (debt === undefined) {
        const { id, stepId } = save({
          ownerId: rc.userId,
          householdId: rc.householdId,
          fields: {
            name,
            kind: value.type === 'card' ? 'card' : value.type === 'loan' ? 'loan' : 'other',
            currency,
            balance: value.balance ?? 0,
            apr: paidInFull ? null : rate,
            minimum_payment: paidInFull ? 0 : value.minimum ?? 0,
            due_day: day,
            pays_in_full: pays,
            account_id: value.accountId,
          },
        });
        hapticLight();
        showToast({ kind: 'ordinary', text: { key: 'grow.debts.add.addedToast' }, stepId });
        onClose();
        pushOnce(debtHref(id));
      } else {
        const fields: EditGrowDebtFields = {};
        if (name !== debt.name) fields.name = name;
        if (value.balance !== null && value.balance !== debt.balance) fields.balance = value.balance;
        if (!paidInFull && rate !== (debt.apr ?? null)) fields.apr = rate;
        if (!paidInFull && value.minimum !== null && value.minimum !== debt.minimum_payment) fields.minimum_payment = value.minimum;
        if (day !== (debt.due_day ?? null)) fields.due_day = day;
        if (isCard && pays !== (debt.pays_in_full ?? null)) fields.pays_in_full = pays;
        if (Object.keys(fields).length > 0) {
          const { stepId } = save({ ownerId: rc.userId, existing: debt, fields });
          hapticLight();
          showToast({ kind: 'ordinary', text: undoLabelText('debtEdited', { name }), stepId });
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

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('grow.common.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        {debt === undefined ? (
          <ChipRow label={t('grow.debts.add.title')}>
            {TYPES.map((x) => (
              <Chip
                key={x.value}
                label={t(x.labelKey)}
                selected={value.type === x.value}
                onPress={() => {
                  hapticSelection();
                  set({ type: x.value, full: x.value === 'card' ? value.full : null });
                }}
              />
            ))}
          </ChipRow>
        ) : null}

        {isCard ? (
          <View accessibilityRole="radiogroup" accessibilityLabel={t('grow.debts.add.fullQuestion')} style={styles.group}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('grow.debts.add.fullQuestion')}</Text>
            {ANSWERS.map((a) => {
              const selected = value.full === a.value;
              return (
                <Pressable
                  key={a.value}
                  testID={`add-debt-full-${a.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(a.labelKey)}
                  onPress={() => {
                    hapticSelection();
                    set({ full: a.value });
                  }}
                  style={({ pressed }) => [styles.radio, { borderColor: selected ? colors.ink : colors.line1, opacity: pressed ? PRESSED_OPACITY : 1 }]}
                >
                  <RadioDot selected={selected} />
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t(a.labelKey)}</Text>
                </Pressable>
              );
            })}
          </View>
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
            <MoneyInput
              boxed
              value={value.balance}
              currency={currency}
              onChange={(balance) => set({ balance })}
              label={paidInFull ? t('grow.debts.add.balanceOptional') : t('grow.debts.add.owedNow')}
              accessibilityLabel={paidInFull ? t('grow.debts.add.balanceOptional') : t('grow.debts.add.owedNow')}
            />
            {carried ? (
              <>
                <Label>{t('grow.debts.add.rate')}</Label>
                <View style={box}>
                  <TextInput
                    value={value.rate}
                    onChangeText={(next) => set({ rate: next })}
                    accessibilityLabel={t('grow.debts.add.rate')}
                    keyboardType="decimal-pad"
                    maxLength={6}
                    placeholderTextColor={colors.inkFaint}
                    style={input}
                  />
                </View>
                <Meta tone={rateOk ? 'muted' : 'danger'}>{t('grow.debts.add.rateHelp')}</Meta>
                <MoneyInput
                  boxed
                  value={value.minimum}
                  currency={currency}
                  onChange={(minimum) => set({ minimum })}
                  label={t('grow.debts.add.minimum')}
                  accessibilityLabel={t('grow.debts.add.minimum')}
                />
                {estimate !== null ? (
                  <Text testID="add-debt-estimate" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                    {t('grow.debts.add.minimumEstimate', { amount: fmt.cents(estimate, currency) })}
                  </Text>
                ) : null}
              </>
            ) : null}
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
            {openAccounts.length > 0 ? (
              <>
                <Label>{t('grow.debts.add.paidFrom')}</Label>
                <ChipRow label={t('grow.debts.add.paidFrom')}>
                  {openAccounts.map((a) => (
                    <Chip
                      key={a.id}
                      label={a.name}
                      selected={value.accountId === a.id}
                      onPress={() => {
                        hapticSelection();
                        set({ accountId: value.accountId === a.id ? null : a.id });
                      }}
                    />
                  ))}
                </ChipRow>
              </>
            ) : null}

            {lineModel === null || paidInFull ? null : (
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
            <Pill label={debt === undefined ? t('grow.debts.add.save') : t('grow.debts.add.saveEdit')} variant="primary" disabled={!canSave} onPress={onSave} />
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

const chipStyles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm } });
