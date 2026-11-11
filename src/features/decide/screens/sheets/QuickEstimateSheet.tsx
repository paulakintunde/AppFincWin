/**
 * 06.1-15 (D41, D-21): Quick estimate, one variant per tile: Expense, Loan, Savings, Income. A quick line counts in this one check
 * only (the sheet says so) and is never written to records. Nothing applies until the primary button; editing a saved line adds
 * "Remove", which shows a toast with Undo. Which kinds exist is quickLineKinds.ts (plan 09 owner choice: all four).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { maxCheckPrice, type LocalDate, type QuickLine } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useIsDirty } from '@/ui/useIsDirty';
import { parseWholeInRange } from '@/ui/wholeNumberField';
import { QUICK_LINE_KINDS, type QuickLineKind } from './quickLineKinds';
import { Field, FieldLabel, Note } from './sheetUi';

export interface QuickEstimateSheetProps {
  visible: boolean;
  kind: QuickLineKind;
  /** A saved line to edit; absent = a new one. */
  line?: QuickLine;
  currency: string;
  today: LocalDate;
  formatDate: (date: LocalDate) => string;
  /** Opens the caller's date picker; it answers through `set`. */
  onPickDate: (current: LocalDate | null, set: (date: LocalDate) => void) => void;
  /** Add (new id) or save (same id). */
  onAdd: (line: QuickLine) => void;
  /** Present only when a saved line is being edited. */
  onRemove?: (line: QuickLine) => void;
  onDismiss: () => void;
}

interface Draft {
  name: string;
  amount: number | null;
  everyMonths: 0 | 1 | 3 | 12;
  date: LocalDate | null;
  payments: string;
  usable: boolean;
}

const NAME_MAX = 80;
const MAX_PAYMENTS = 600; // T-06.1-15-01
const EXPENSE_EVERY = [
  { v: 0, key: 'once' },
  { v: 1, key: 'everyMonth' },
  { v: 3, key: 'every3Months' },
  { v: 12, key: 'everyYear' },
] as const;
const INCOME_EVERY = EXPENSE_EVERY.filter((e) => e.v === 0 || e.v === 1);

function startDraft(kind: QuickLineKind, line: QuickLine | undefined, today: LocalDate): Draft {
  const base: Draft = { name: '', amount: null, everyMonths: kind === 'income' ? 0 : 1, date: kind === 'income' || kind === 'expense' ? today : null, payments: '', usable: false };
  if (line === undefined) return base;
  switch (line.kind) {
    case 'expense':
      return { ...base, name: line.name, amount: line.amount, everyMonths: line.everyMonths, date: line.date ?? today };
    case 'loan':
      return { ...base, name: line.name, amount: line.monthly, payments: String(line.payments), date: line.firstDate };
    case 'savings':
      return { ...base, name: line.name, amount: line.amount, usable: line.usable };
    case 'income':
      return { ...base, name: line.name, amount: line.amount, everyMonths: line.everyMonths, date: line.date };
  }
}

export function QuickEstimateSheet(props: QuickEstimateSheetProps) {
  // An unoffered kind has no sheet; the form mounts per opening.
  return props.visible && QUICK_LINE_KINDS.includes(props.kind) ? <QuickForm {...props} /> : null;
}

function QuickForm({ kind, line, currency, today, formatDate, onPickDate, onAdd, onRemove, onDismiss }: QuickEstimateSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [initial] = useState(() => startDraft(kind, line, today));
  const [d, setD] = useState<Draft>(initial);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const dirty = useIsDirty(initial, d);
  const editing = line !== undefined;
  const title = t(`decide.screens.sheetsInput.quick.${kind}.title`);
  const cap = maxCheckPrice(currency);

  const name = d.name.trim();
  const amountOk = d.amount !== null && d.amount > 0 && d.amount <= cap;
  const payments = parseWholeInRange(d.payments, 1, MAX_PAYMENTS);
  const paymentsBad = d.payments !== '' && payments.kind !== 'ok';
  const valid = name !== '' && amountOk && (kind !== 'loan' || payments.kind === 'ok');

  const build = (): QuickLine | null => {
    if (!valid || d.amount === null) return null;
    const id = line?.id ?? Crypto.randomUUID();
    const amount = minorUnits(d.amount);
    switch (kind) {
      case 'expense':
        return { id, kind, name, amount, everyMonths: d.everyMonths, date: d.date ?? today };
      case 'loan':
        return { id, kind, name, monthly: amount, payments: payments.kind === 'ok' ? payments.value : 1, firstDate: d.date };
      case 'savings':
        return { id, kind, name, amount, usable: d.usable };
      case 'income':
        return { id, kind, name, amount, everyMonths: d.everyMonths === 1 ? 1 : 0, date: d.date ?? today };
    }
  };

  const add = () => {
    const out = build();
    if (out !== null) onAdd(out);
  };

  const remove = () => {
    if (line === undefined || onRemove === undefined) return;
    const removed = line;
    onRemove(removed);
    showToast({
      kind: 'destructive',
      text: { key: 'decide.screens.common.toast.removed', params: { item: removed.name } },
      onUndo: () => onAdd(removed),
    });
  };

  const dateChip = (labelKey: string, optionalNone?: string) => (
    <View style={styles.chips}>
      {optionalNone !== undefined ? <Chip label={optionalNone} selected={d.date === null} onPress={() => set({ date: null })} /> : null}
      <Chip
        label={d.date === null ? t('decide.screens.common.pickDate') : formatDate(d.date)}
        accessibilityLabel={`${labelKey}, ${d.date === null ? t('decide.screens.common.pickDate') : formatDate(d.date)}`}
        selected={d.date !== null}
        onPress={() => onPickDate(d.date, (date) => set({ date }))}
      />
    </View>
  );

  const everyChips = (list: readonly { v: 0 | 1 | 3 | 12; key: 'once' | 'everyMonth' | 'every3Months' | 'everyYear' }[]) => (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.common.howOften')} style={styles.chips}>
      {list.map((e) => (
        <Chip key={e.v} label={t(`decide.screens.sheetsInput.quick.${e.key}`)} selected={d.everyMonths === e.v} onPress={() => set({ everyMonths: e.v })} />
      ))}
    </View>
  );

  const amountLabel = kind === 'loan' ? t('decide.screens.sheetsInput.quick.loan.monthly') : t('decide.screens.sheetsInput.quick.amount');

  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <FieldLabel>{t('decide.screens.sheetsInput.quick.name')}</FieldLabel>
        <Field
          value={d.name}
          onChangeText={(name) => set({ name })}
          accessibilityLabel={t('decide.screens.sheetsInput.quick.name')}
          placeholder={t(`decide.screens.sheetsInput.quick.${kind}.namePlaceholder`)}
          maxLength={NAME_MAX}
        />

        <MoneyInput value={d.amount} currency={currency} onChange={(amount) => set({ amount })} label={amountLabel} accessibilityLabel={amountLabel} />
        {d.amount !== null && d.amount > cap ? <Note tone="warn">{t('decide.screens.sheetsInput.quick.tooBig')}</Note> : null}

        {kind === 'expense' ? (
          <>
            <FieldLabel>{t('decide.screens.common.howOften')}</FieldLabel>
            {everyChips(EXPENSE_EVERY)}
            {d.everyMonths === 0 ? dateChip(t('decide.screens.sheetsInput.quick.date')) : null}
          </>
        ) : null}

        {kind === 'loan' ? (
          <>
            <FieldLabel>{t('decide.screens.sheetsInput.quick.loan.left')}</FieldLabel>
            <Field
              value={d.payments}
              onChangeText={(payments) => set({ payments: payments.replace(/\D/g, '') })}
              accessibilityLabel={t('decide.screens.sheetsInput.quick.loan.left')}
              placeholder={t('decide.screens.sheetsInput.quick.loan.leftPlaceholder')}
              numeric
              maxLength={3}
            />
            {paymentsBad ? <Note tone="warn">{t('decide.screens.sheetsInput.quick.loan.lengthRange')}</Note> : null}
            <FieldLabel>{t('decide.screens.sheetsInput.quick.loan.first')}</FieldLabel>
            {dateChip(t('decide.screens.sheetsInput.quick.loan.first'), t('decide.screens.common.optional'))}
            <Note>{t('decide.screens.sheetsInput.quick.loan.note')}</Note>
          </>
        ) : null}

        {kind === 'savings' ? (
          <>
            <FieldLabel>{t('decide.screens.sheetsInput.quick.savings.canUse')}</FieldLabel>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.sheetsInput.quick.savings.canUse')} style={styles.chips}>
              <Chip label={t('decide.screens.sheetsInput.quick.savings.yes')} selected={d.usable} onPress={() => set({ usable: true })} />
              <Chip label={t('decide.screens.sheetsInput.quick.savings.no')} selected={!d.usable} onPress={() => set({ usable: false })} />
            </View>
            {d.usable ? <Note>{t('decide.screens.sheetsInput.quick.savings.usedNote')}</Note> : null}
          </>
        ) : null}

        {kind === 'income' ? (
          <>
            <FieldLabel>{t('decide.screens.common.howOften')}</FieldLabel>
            {everyChips(INCOME_EVERY)}
            <FieldLabel>{t('decide.screens.sheetsInput.quick.income.arrives')}</FieldLabel>
            {dateChip(t('decide.screens.sheetsInput.quick.income.arrives'))}
            <Note>{t('decide.screens.sheetsInput.quick.income.note')}</Note>
          </>
        ) : null}

        <Note>{t('decide.screens.sheetsInput.quick.note')}</Note>
        <Pill
          label={t(editing ? 'decide.screens.sheetsInput.quick.save' : 'decide.screens.sheetsInput.quick.add')}
          variant="primary"
          disabled={!valid}
          onPress={add}
        />
        {editing && onRemove !== undefined ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('decide.screens.common.remove')} onPress={remove} style={styles.remove}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.danger }}>{t('decide.screens.common.remove')}</Text>
          </Pressable>
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  remove: { minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
