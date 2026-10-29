/**
 * Plan 05.2-27 (D-04): the emergency fund body shared by the setup step and the sheet. The fund is an amount, or the
 * account that holds it (the amount then follows that account's balance), or not set with an optional goal. Choosing an
 * account asks once, inline, whether it also holds money you spend, unless its use already settles that (kept for the
 * emergency fund, or a mix); a preview line says what the account will become before anything is saved.
 *
 * `useEmergencyFundForm` owns the draft and the save/remove (plan 14's useSaveEmergencyFund); `EmergencyFundFields`
 * only draws it. The step and the sheet differ only in how the three states are offered.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { RadioDot } from '@/ui/RadioDot';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import type { AccountUse } from '@/engine/decide/v3';
import type { AccountRow } from '@/db/rows';
import { useAccounts } from '@/data/queries/accounts';
import { useAccountBalances } from '@/data/queries/activity';
import { useDecideSettings } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useSaveEmergencyFund } from '@/data/mutations/accountUse';
import { accountUseOfRow, emergencyLinkUse } from '@/data/mutations/accountUseModel';
import { useRecordContext } from '@/features/record/useRecordContext';
import { ChoiceCard } from '@/features/decide/ui/ChoiceCard';
import { InfoGlyph } from '@/features/decide/ui/InfoButton';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { SegmentedToggle } from '@/features/decide/ui/SegmentedToggle';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { Meta, useCopy, useNoWrapMoney } from '@/features/income/steps/shared';
import { holdsMoney } from './accountUseSuggest';

export type FundMode = 'amount' | 'account' | 'notSet';

export interface FundValue {
  /** null: not answered yet (the step before a choice). */
  mode: FundMode | null;
  amount: number | null;
  accountId: string | null;
  goal: number | null;
  /** The D-04 answer to "Does this account also hold money you spend?". Starts at No (kept for the emergency fund). */
  holdsSpending: boolean;
}

const EMPTY: FundValue = { mode: null, amount: null, accountId: null, goal: null, holdsSpending: false };
const clamp = (minor: number | null): number | null => (minor !== null && minor >= 0 && minor <= MAX_INPUT_MINOR ? minor : null);

/** The use an account has now, or null when it has none stated. */
export function currentUseOf(account: AccountRow): AccountUse | null {
  return accountUseOfRow({
    use: account.use ?? null,
    use_purpose: account.use_purpose ?? null,
    use_envelope_id: account.use_envelope_id ?? null,
    use_extra_set_aside: account.use_extra_set_aside ?? null,
  });
}

/** True when the account's use already settles D-04 (kept for the emergency fund, or a mix): nothing is asked. */
export function alreadySettled(account: AccountRow): boolean {
  return emergencyLinkUse(currentUseOf(account), false) === null;
}

export interface EmergencyFundForm {
  variant: 'step' | 'sheet';
  value: FundValue;
  set(patch: Partial<FundValue>): void;
  /** Accounts that can hold the fund, with balances (null when unknown). */
  accounts: readonly { account: AccountRow; balance: number | null }[];
  chosen: AccountRow | null;
  chosenBalance: number | null;
  /** The inline question applies to the chosen account. */
  asks: boolean;
  /** What the account's use becomes on save (D-04), or null when unchanged. */
  linkUse: AccountUse | null;
  /** 05.2-37 (e): the chosen account ends up as a mix, so the fund is a stated amount (capped at the live balance by the engine). */
  mixed: boolean;
  /** The stated amount for a mixed account, prefilled with the balance until the user types. */
  mixedAmount: number | null;
  setMixedAmount(minor: number | null): void;
  /** The step found an account already kept for the emergency fund and pre-filled it. */
  prefilled: AccountRow | null;
  /** About three months of regular payments and everyday spending, or null when unknown. */
  threeMonths: number | null;
  currency: string;
  /** What the user has typed differs from what is stored. */
  dirty: boolean;
  /** Valid to save. */
  valid: boolean;
  /** True when a fund (amount or account) is stored now. */
  hasStored: boolean;
  storedGoal: number | null;
  save(): { stepId: string; linked: AccountRow | null } | null;
  remove(): { stepId: string };
}

export function useEmergencyFundForm(variant: 'step' | 'sheet'): EmergencyFundForm {
  const rc = useRecordContext();
  const userId = rc.userId ?? '';
  const householdId = rc.householdId ?? undefined;
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const accountsQuery = useAccounts(householdId);
  const balances = useAccountBalances(rc.householdId, accountsQuery.data ?? []).balances;
  const v3 = useDecideV3();
  const saver = useSaveEmergencyFund(userId, userId);

  const accounts = useMemo(
    () =>
      (accountsQuery.data ?? [])
        .filter((a) => a.deleted_at === null && a.archived_at === null && holdsMoney(a.kind))
        .map((account) => {
          const b = balances.get(account.id);
          return { account, balance: b && !b.overflow ? b.balance : null };
        }),
    [accountsQuery.data, balances]
  );

  const storedAccountId = settings?.reserve_account_id ?? null;
  const storedAmount = settings?.reserve ?? null;
  const storedGoal = settings?.reserve_goal ?? null;
  const hasStored = storedAmount !== null || storedAccountId !== null;

  // What is stored, as a form value.
  const stored: FundValue = useMemo(() => {
    if (storedAccountId !== null) return { ...EMPTY, mode: 'account', accountId: storedAccountId, amount: storedAmount, goal: storedGoal };
    if (storedAmount !== null) return { ...EMPTY, mode: 'amount', amount: storedAmount, goal: storedGoal };
    return { ...EMPTY, mode: variant === 'sheet' || storedGoal !== null ? 'notSet' : null, goal: storedGoal };
  }, [storedAccountId, storedAmount, storedGoal, variant]);

  // The step pre-fills an account already kept for the emergency fund when the fund itself is not set.
  const prefilled = useMemo(() => {
    if (variant !== 'step' || hasStored) return null;
    return accounts.find(({ account }) => {
      const u = currentUseOf(account);
      return u !== null && u.kind === 'dedicated' && u.purpose.kind === 'emergency';
    })?.account ?? null;
  }, [variant, hasStored, accounts]);

  const [draft, setDraft] = useState<FundValue | null>(null);
  const [mixedTyped, setMixedTyped] = useState(false);
  const base: FundValue = prefilled !== null ? { ...EMPTY, mode: 'account', accountId: prefilled.id, goal: storedGoal } : stored;
  const value = draft ?? base;
  const set = (patch: Partial<FundValue>): void => {
    // Another account starts the mixed amount over from that account's balance.
    if (patch.accountId !== undefined) setMixedTyped(false);
    setDraft({ ...value, ...patch });
  };

  const chosenEntry = value.mode === 'account' ? (accounts.find((a) => a.account.id === value.accountId) ?? null) : null;
  const chosen = chosenEntry?.account ?? null;
  const chosenBalance = chosenEntry?.balance ?? null;
  const asks = chosen !== null && !alreadySettled(chosen);
  const linkUse = chosen !== null && asks ? emergencyLinkUse(currentUseOf(chosen), value.holdsSpending) : null;

  // 05.2-37 (e): in a mixed account the fund is a stated amount; any other linked account follows its whole balance.
  const resultUse = chosen === null ? null : (linkUse ?? currentUseOf(chosen));
  const mixed = value.mode === 'account' && resultUse?.kind === 'mixed';
  const mixedSeed = chosenBalance === null ? null : Math.min(Math.max(0, chosenBalance), MAX_INPUT_MINOR);
  const mixedAmount = mixedTyped ? value.amount : (value.amount ?? mixedSeed);
  const setMixedAmount = (minor: number | null): void => {
    setMixedTyped(true);
    setDraft({ ...value, amount: clamp(minor) });
  };

  const currency = chosen?.currency ?? settings?.currency ?? rc.homeCurrency;

  // The amount written: a typed amount, or the chosen account's balance (kept as it was when the balance is unknown).
  const amountOut = value.mode === 'amount' ? value.amount : value.mode === 'account' ? (mixed ? mixedAmount : (chosenBalance ?? storedAmount)) : null;
  const accountOut = value.mode === 'account' && chosen !== null ? chosen.id : null;
  const goalOut = value.mode === 'notSet' ? value.goal : storedGoal;

  const valid =
    value.mode === 'notSet' ||
    (value.mode === 'amount' && value.amount !== null) ||
    (value.mode === 'account' && chosen !== null && (!mixed || mixedAmount !== null));

  const changed = amountOut !== storedAmount || accountOut !== storedAccountId || goalOut !== storedGoal || linkUse !== null;
  const dirty = draft !== null && value.mode !== null && valid && changed;

  const month = v3.evaluation?.month;
  const threeMonths = month && month.e !== null ? 3 * (Number(month.recurringBills) + Number(month.e)) : null;

  return {
    variant,
    value,
    set,
    accounts,
    chosen,
    chosenBalance,
    asks,
    linkUse,
    mixed,
    mixedAmount,
    setMixedAmount,
    prefilled: prefilled !== null && draft === null ? prefilled : null,
    threeMonths,
    currency,
    dirty: dirty || (prefilled !== null && draft === null),
    valid,
    hasStored,
    storedGoal,
    save() {
      if (!valid || value.mode === null) return null;
      if (!changed && !(prefilled !== null && draft === null)) return null;
      const result = saver.save({
        amount: amountOut,
        accountId: accountOut,
        goal: goalOut,
        linkUse: chosen !== null && linkUse !== null ? { account: chosen, use: linkUse } : null,
      });
      return result === null ? null : { stepId: result.stepId, linked: linkUse !== null ? chosen : null };
    },
    remove() {
      const result = saver.remove();
      setDraft(null);
      return result;
    },
  };
}

function AccountPicker({ form, onClose }: { form: EmergencyFundForm; onClose: () => void }) {
  const t = useT();
  const copy = useCopy();
  const { colors, pairing } = useTheme();
  const noWrap = useNoWrapMoney(form.currency);
  const pick = (id: string | null): void => {
    hapticSelection();
    if (id === null) form.set({ mode: 'amount', accountId: null });
    else form.set({ mode: 'account', accountId: id, holdsSpending: false });
    onClose();
  };
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={copy('decide.setup.emergency.chooseAccount')}>
      <SheetHeader title={copy('decide.setup.emergency.chooseAccount')} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={{ gap: space.gapSm }}>
        <View accessibilityRole="radiogroup" accessibilityLabel={copy('decide.setup.emergency.chooseAccount')} style={{ gap: space.gapSm }}>
          {form.accounts.map(({ account, balance }) => {
            const selected = form.value.mode === 'account' && form.value.accountId === account.id;
            const money = balance === null ? '' : noWrap(balance);
            return (
              <Pressable
                key={account.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={money ? `${account.name}, ${money}` : account.name}
                onPress={() => pick(account.id)}
                style={({ pressed }) => [styles.pickRow, { borderColor: colors.line2, backgroundColor: colors.surface, opacity: pressed ? PRESSED_OPACITY : 1 }]}
              >
                <RadioDot selected={selected} />
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flex: 1, flexShrink: 1 }}>{account.name}</Text>
                {money ? (
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ ...textRole(pairing, 'body'), color: colors.inkMuted, flexShrink: 0 }}>
                    {money}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          {form.value.mode === 'account' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy('decide.setup.emergency.noAccount')}
              onPress={() => pick(null)}
              style={({ pressed }) => [styles.pickRow, { borderColor: colors.line2, backgroundColor: colors.surface, opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flex: 1, flexShrink: 1 }}>{copy('decide.setup.emergency.noAccount')}</Text>
            </Pressable>
          ) : null}
        </View>
      </SheetScroll>
    </Sheet>
  );
}

export interface EmergencyFundFieldsProps {
  form: EmergencyFundForm;
  /** The sheet's read-only "Used $600 on Oct 12 · rebuilding" line (data written by 05.3); nothing is drawn without it. */
  usedLine?: string | null;
}

export function EmergencyFundFields({ form, usedLine = null }: EmergencyFundFieldsProps) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const noWrap = useNoWrapMoney(form.currency);
  const [picking, setPicking] = useState(false);
  const { value, set } = form;
  const isStep = form.variant === 'step';
  const accountMode = value.mode === 'account';
  const yes = value.mode === 'amount' || value.mode === 'account';

  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  const card = (key: string, title: string, selected: boolean, onPress: () => void) => (
    <ChoiceCard key={key} selected={selected} onPress={onPress} title={title} accessibilityLabel={title} />
  );

  const amountBlock = (
    <View style={{ gap: space.gapSm }}>
      {accountMode && form.mixed ? (
        <MoneyInput
          boxed
          value={form.mixedAmount}
          currency={form.currency}
          onChange={form.setMixedAmount}
          label={t('decide.setup.emergency.amountCaption')}
          accessibilityLabel={t('decide.setup.emergency.amountCaption')}
        />
      ) : accountMode && form.chosen !== null ? (
        <View accessible accessibilityLabel={`${t('decide.setup.emergency.amountCaption')}, ${t('decide.setup.emergency.follows', { balance: form.chosenBalance === null ? '' : noWrap(form.chosenBalance) })}`} style={{ gap: 2 }}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('decide.setup.emergency.amountCaption')}</Text>
          {form.chosenBalance !== null ? (
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.setup.emergency.follows', { balance: noWrap(form.chosenBalance) })}</Text>
          ) : null}
          <Text style={label}>{t('decide.setup.emergency.followsHint')}</Text>
        </View>
      ) : (
        <MoneyInput
          boxed
          value={value.amount}
          currency={form.currency}
          onChange={(m) => set({ mode: 'amount', amount: clamp(m) })}
          label={t('decide.setup.emergency.amountCaption')}
          accessibilityLabel={t('decide.setup.emergency.amountCaption')}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={form.chosen ? `${t('decide.setup.emergency.pickRow')}, ${form.chosen.name}` : t('decide.setup.emergency.pickRow')}
        onPress={() => setPicking(true)}
        style={({ pressed }) => [styles.pickRow, { borderColor: colors.line2, backgroundColor: colors.surface, opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <View style={{ flex: 1, flexShrink: 1, gap: 2 }}>
          <Text style={label}>{t('decide.setup.emergency.pickRow')}</Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{form.chosen ? form.chosen.name : t('decide.setup.emergency.chooseAccount')}</Text>
        </View>
        <View style={[styles.chevron, { borderColor: colors.inkFaint }]} />
      </Pressable>
      {accountMode && form.asks && form.chosen !== null ? (
        <View style={{ gap: space.gapSm }}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.setup.emergency.alsoSpend')}</Text>
          <SegmentedToggle
            options={[
              { key: 'yes', label: t('decide.setup.emergency.alsoYes') },
              { key: 'no', label: t('decide.setup.emergency.alsoNo') },
            ]}
            value={value.holdsSpending ? 'yes' : 'no'}
            onChange={(k) => set({ holdsSpending: k === 'yes' })}
            accessibilityLabel={t('decide.setup.emergency.alsoSpend')}
          />
          <Meta text={t(value.holdsSpending ? 'decide.setup.emergency.previewMix' : 'decide.setup.emergency.previewKept', { account: form.chosen.name })} />
        </View>
      ) : null}
    </View>
  );

  const goalBlock = (
    <View style={{ gap: space.gapSm }}>
      <MoneyInput
        value={value.goal}
        currency={form.currency}
        onChange={(m) => set({ mode: 'notSet', goal: clamp(m) })}
        label={t('decide.setup.emergency.goalCaption')}
        accessibilityLabel={t('decide.setup.emergency.goalCaption')}
      />
      {form.threeMonths !== null && form.threeMonths > 0 ? <Meta text={t('decide.setup.emergency.goalHint', { amount: noWrap(form.threeMonths) })} /> : null}
      {!isStep && value.goal === null ? <Meta text={t('decide.emergencySheet.goalFact')} /> : null}
    </View>
  );

  return (
    <View style={{ gap: space.groupGap }}>
      {isStep ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.setup.emergency.title')} style={{ gap: space.gapSm }}>
          {card('yes', t('decide.setup.emergency.optionYes'), yes, () => {
            if (!yes) set({ mode: 'amount' });
          })}
          {card('no', t('decide.setup.emergency.optionNo'), value.mode === 'notSet', () => set({ mode: 'notSet' }))}
        </View>
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.emergencySheet.title')} style={{ gap: space.gapSm }}>
          {card('amount', t('decide.emergencySheet.optionAmount'), value.mode === 'amount', () => set({ mode: 'amount', accountId: null }))}
          {card('account', t('decide.emergencySheet.optionAccount'), accountMode, () => {
            if (accountMode) return;
            if (value.accountId !== null && form.accounts.some((a) => a.account.id === value.accountId)) set({ mode: 'account' });
            else setPicking(true);
          })}
          {card('notSet', t('decide.emergencySheet.optionNotSet'), value.mode === 'notSet', () => set({ mode: 'notSet', accountId: null }))}
        </View>
      )}

      {isStep && yes ? amountBlock : null}
      {!isStep && value.mode === 'amount' ? (
        <MoneyInput
          value={value.amount}
          currency={form.currency}
          onChange={(m) => set({ amount: clamp(m) })}
          label={t('decide.setup.emergency.amountCaption')}
          accessibilityLabel={t('decide.setup.emergency.amountCaption')}
        />
      ) : null}
      {!isStep && accountMode ? amountBlock : null}
      {value.mode === 'notSet' ? goalBlock : null}

      {!isStep && usedLine ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{usedLine}</Text> : null}
      {(
        <View style={[styles.tile, { backgroundColor: colors.fill2 }]}>
          <InfoGlyph size={16} color={colors.inkDim} />
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim, flex: 1, flexShrink: 1 }}>
            {t('decide.setup.emergency.infoTile')}
          </Text>
        </View>
      )}
      {picking ? <AccountPicker form={form} onClose={() => setPicking(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pickRow: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, borderWidth: 1, borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: space.rowPad },
  chevron: { width: 8, height: 8, borderTopWidth: 1.5, borderRightWidth: 1.5, transform: [{ rotate: '45deg' }] },
  tile: { flexDirection: 'row', alignItems: 'flex-start', gap: space.gapMd, padding: space.cardPad, borderRadius: 16 },
});
