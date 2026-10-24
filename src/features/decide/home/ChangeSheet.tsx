/**
 * 05-48 (D-27, DCU-08, DCU-15): the add / edit sheet for one dated change. Income | Spending, Goes up | Goes down, an
 * optional name, an amount a month, a start month and an end month ('No end date' on by default). The signed monthly
 * amount is stored in integer minor units (down is negative). Start and end months are 'YYYY-MM' sliced from the picked
 * LOCAL 'YYYY-MM-DD' string, never through a Date round trip (Pitfall 4). Cancel with edits asks the 03 D-26 discard
 * question; without edits it just closes. The form mounts per opening so fields start from the row.
 */
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useAddChange, useEditChange } from '@/data/mutations/decideChanges';
import type { DecideChangePatch, DecideChangeRow } from '@/db/decideChanges';
import { DateField } from '@/features/record/entry/pickers/DateField';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { ToggleRow } from '@/ui/ToggleRow';
import { useIsDirty } from '@/ui/useIsDirty';
import { Box, Label, Meta } from '../check/steps/stepUi';
import { MAX_INPUT_MINOR } from '../snapshot/checkInputs';
import { MoneyInput } from '../ui/MoneyInput';
import { SegmentedToggle } from '../ui/SegmentedToggle';

export interface ChangeSheetProps {
  visible: boolean;
  /** null: add mode. */
  row: DecideChangeRow | null;
  onClose: () => void;
}

/** 'YYYY-MM-DD' (local) to 'YYYY-MM'. String slicing only. */
export function toMonthKey(localDate: string): string {
  return localDate.slice(0, 7);
}

/** 'YYYY-MM' to a short "Mon YYYY" label in the given locale, pinned to UTC so the month never shifts. */
export function monthLabel(locale: string, month: string): string {
  const [y = 1970, m = 1] = month.split('-').map((p) => parseInt(p, 10));
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1));
}

interface Fields {
  kind: 'income' | 'spending';
  goesUp: boolean;
  name: string;
  amount: number | null;
  start: string;
  noEnd: boolean;
  end: string;
}

const firstOfMonth = (month: string): string => `${month}-01`;

export function ChangeSheet(props: ChangeSheetProps) {
  return props.visible ? <ChangeForm row={props.row} onClose={props.onClose} /> : null;
}

function ChangeForm({ row, onClose }: { row: DecideChangeRow | null; onClose: () => void }) {
  const t = useT();
  const rc = useRecordContext();
  const fmt = useMoneyFormatter(false);
  const { add } = useAddChange();
  const { edit } = useEditChange();
  const [asking, setAsking] = useState(false);

  const thisMonthStart = firstOfMonth(toMonthKey(rc.today));
  const [initial] = useState<Fields>(() => {
    if (row === null) {
      return { kind: 'income', goesUp: true, name: '', amount: null, start: thisMonthStart, noEnd: true, end: thisMonthStart };
    }
    return {
      kind: row.kind,
      goesUp: row.monthly_amount > 0,
      name: row.name ?? '',
      amount: Math.abs(row.monthly_amount),
      start: firstOfMonth(row.start_month),
      noEnd: row.end_month === null,
      end: firstOfMonth(row.end_month ?? row.start_month),
    };
  });
  const [value, setValue] = useState<Fields>(initial);
  const dirty = useIsDirty(initial, value);
  const set = (patch: Partial<Fields>) => setValue((v) => ({ ...v, ...patch }));

  const currency = row?.currency ?? rc.homeCurrency;
  const amountOk = value.amount !== null && Number.isSafeInteger(value.amount) && value.amount > 0 && value.amount <= MAX_INPUT_MINOR;
  const endBeforeStart = !value.noEnd && toMonthKey(value.end) < toMonthKey(value.start);
  const canSave = amountOk && !endBeforeStart && (row !== null || (rc.userId !== null && rc.householdId !== null));
  const minStart = row !== null && initial.start < thisMonthStart ? initial.start : thisMonthStart;

  const save = () => {
    if (!canSave || value.amount === null) return;
    const signed = value.goesUp ? value.amount : -value.amount;
    const startMonth = toMonthKey(value.start);
    const endMonth = value.noEnd ? null : toMonthKey(value.end);
    const name = value.name.trim() === '' ? null : value.name.trim();
    if (row === null) {
      if (rc.userId === null || rc.householdId === null) return;
      add({
        householdId: rc.householdId,
        ownerId: rc.userId,
        change: { kind: value.kind, name, monthly_amount: signed, currency, start_month: startMonth, end_month: endMonth },
      });
    } else {
      const patch: DecideChangePatch = {};
      if (value.kind !== row.kind) patch.kind = value.kind;
      if (name !== row.name) patch.name = name;
      if (signed !== row.monthly_amount) patch.monthly_amount = signed;
      if (startMonth !== row.start_month) patch.start_month = startMonth;
      if (endMonth !== row.end_month) patch.end_month = endMonth;
      if (Object.keys(patch).length > 0) edit(row, patch);
    }
    onClose();
  };

  const cancel = () => (dirty ? setAsking(true) : onClose());
  const title = t(row === null ? 'decide.depth.changes.addTitle' : 'decide.depth.changes.editTitle');

  return (
    <>
      <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
        <SheetHeader title={title} cancelLabel={t('decide.depth.changes.cancel')} onCancel={cancel} />
        <SheetScroll contentContainerStyle={styles.column}>
          <SegmentedToggle
            accessibilityLabel={`${t('decide.depth.changes.income')} · ${t('decide.depth.changes.spending')}`}
            value={value.kind}
            onChange={(key) => set({ kind: key === 'spending' ? 'spending' : 'income' })}
            options={[
              { key: 'income', label: t('decide.depth.changes.income') },
              { key: 'spending', label: t('decide.depth.changes.spending') },
            ]}
          />
          <SegmentedToggle
            accessibilityLabel={`${t('decide.depth.changes.goesUp')} · ${t('decide.depth.changes.goesDown')}`}
            value={value.goesUp ? 'up' : 'down'}
            onChange={(key) => set({ goesUp: key === 'up' })}
            options={[
              { key: 'up', label: t('decide.depth.changes.goesUp') },
              { key: 'down', label: t('decide.depth.changes.goesDown') },
            ]}
          />
          <Label>{t('decide.depth.changes.nameLabel')}</Label>
          <Box
            value={value.name}
            onChangeText={(name) => set({ name })}
            accessibilityLabel={t('decide.depth.changes.nameLabel')}
            placeholder={t('decide.depth.changes.namePlaceholder')}
            maxLength={60}
          />
          <MoneyInput
            value={value.amount}
            currency={currency}
            onChange={(amount) => set({ amount })}
            label={t('decide.depth.changes.amount')}
            accessibilityLabel={t('decide.depth.changes.amount')}
          />
          <DateField
            label={t('decide.depth.changes.starts')}
            value={value.start}
            display={monthLabel(fmt.locale, toMonthKey(value.start))}
            minDate={minStart}
            onChange={(start) => set({ start })}
          />
          <ToggleRow label={t('decide.depth.changes.noEnd')} value={value.noEnd} onChange={(noEnd) => set({ noEnd })} />
          {value.noEnd ? null : (
            <DateField
              label={t('decide.depth.changes.ends')}
              value={value.end}
              display={monthLabel(fmt.locale, toMonthKey(value.end))}
              minDate={value.start}
              onChange={(end) => set({ end })}
            />
          )}
          {endBeforeStart ? <Meta tone="danger">{t('decide.depth.changes.endBeforeStart')}</Meta> : null}
          <Pill label={t('decide.depth.changes.save')} variant="primary" disabled={!canSave} onPress={save} />
        </SheetScroll>
      </Sheet>
      <ConfirmSheet
        visible={asking}
        title={t('sheet.discard.title')}
        body={t('sheet.discard.body')}
        cancelLabel={t('sheet.discard.keep')}
        confirmLabel={t('sheet.discard.confirm')}
        destructive
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          onClose();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
});
