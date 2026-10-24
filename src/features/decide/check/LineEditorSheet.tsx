/**
 * 05-14: the one line editor behind every list in the check flow (adjustments, running costs, replaced expenses,
 * setbacks, fees). Presentational: it hands a plain JSON-shaped value to onSave; the step decides which list it joins.
 * Cancel never asks; a swipe, back or backdrop on a dirty sheet asks "Discard changes?" through the shared Sheet (03 D-26).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SetbackCode } from '@/engine/decide';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useIsDirty } from '@/ui/useIsDirty';
import { MoneyInput } from '../ui/MoneyInput';
import { SegmentedToggle } from '../ui/SegmentedToggle';
import { useInfoSheet } from '../ui/useInfoSheet';
import { Box, Label } from './steps/stepUi';

export type LineContext = 'adjust' | 'running' | 'replaces' | 'setback' | 'fee';

export interface LineEditorValue {
  name: string;
  amount: number;
  note: string;
  effect: 'adds' | 'takes_off';
  onDay: boolean;
  seriesId: string | null;
  code: SetbackCode;
  months: number;
  percentDrop: number;
  daysLate: number;
}

export interface RecurringBillOption {
  id: string;
  name: string;
  monthly: number;
}

export interface LineEditorSheetProps {
  visible: boolean;
  context: LineContext;
  currency: string;
  initial?: Partial<LineEditorValue>;
  recurringBills?: readonly RecurringBillOption[];
  /** Formats a bill's monthly amount for its row. */
  formatMoney: (minor: number) => string;
  onSave: (line: LineEditorValue) => void;
  onCancel: () => void;
}

const TITLE = {
  adjust: 'decide.lineEditor.titleAdjust',
  running: 'decide.lineEditor.titleRunning',
  replaces: 'decide.lineEditor.titleReplaces',
  setback: 'decide.lineEditor.titleSetback',
  fee: 'decide.lineEditor.titleFee',
} as const satisfies Record<LineContext, string>;

const SETBACK_KINDS = [
  { code: 'unexpected_expense', key: 'decide.lineEditor.once' },
  { code: 'income_drop', key: 'decide.lineEditor.drop' },
  { code: 'job_loss', key: 'decide.lineEditor.loss' },
  { code: 'late_invoice', key: 'decide.lineEditor.late' },
] as const satisfies readonly { code: SetbackCode; key: string }[];

const NAME_MAX = 80;
const NOTE_MAX = 200;
const MAX_MONTHS = 600;

const BLANK: LineEditorValue = {
  name: '', amount: 0, note: '', effect: 'adds', onDay: false, seriesId: null,
  code: 'unexpected_expense', months: 0, percentDrop: 0, daysLate: 0,
};

/** A whole number typed into a small field, clamped to [0, hi]; anything else is 0. */
function whole(text: string, hi: number): number {
  const n = parseInt(text.replace(/\D/g, ''), 10);
  return Number.isSafeInteger(n) ? Math.min(n, hi) : 0;
}

export function LineEditorSheet(props: LineEditorSheetProps) {
  // The form mounts per opening so every field starts from `initial`.
  return props.visible ? <LineEditorForm {...props} /> : null;
}

function LineEditorForm({ context, currency, initial, recurringBills = [], formatMoney, onSave, onCancel }: LineEditorSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [start] = useState<LineEditorValue>(() => ({ ...BLANK, ...initial }));
  const [value, setValue] = useState<LineEditorValue>(start);
  const set = (patch: Partial<LineEditorValue>) => setValue((v) => ({ ...v, ...patch }));
  const dirty = useIsDirty(start, value);
  const tradeInInfo = useInfoSheet('tradeIn'); // R15.8: "Takes off the price" explains itself, stacked over this sheet

  const isSetback = context === 'setback';
  const needsAmount = !isSetback || value.code === 'unexpected_expense';
  const canSave = value.name.trim() !== '' && (!needsAmount || value.amount > 0);
  const title = t(TITLE[context]);

  const save = () => {
    if (!canSave) return;
    onSave({ ...value, name: value.name.trim(), amount: needsAmount ? value.amount : 0 });
  };

  return (
    <Sheet visible onDismiss={onCancel} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('decide.lineEditor.cancel')} onCancel={onCancel} />
      <SheetScroll contentContainerStyle={styles.column}>
        {context === 'replaces' && recurringBills.length > 0 ? (
          <View style={styles.column}>
            <Label>{t('decide.lineEditor.fromBills')}</Label>
            {recurringBills.map((bill) => (
              <Pressable
                key={bill.id}
                accessibilityRole="button"
                accessibilityLabel={`${bill.name}, ${formatMoney(bill.monthly)}`}
                onPress={() => set({ name: bill.name, amount: bill.monthly, seriesId: bill.id })}
                style={styles.bill}
              >
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{bill.name}</Text>
                <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{formatMoney(bill.monthly)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {isSetback ? (
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {SETBACK_KINDS.map((k) => (
              <Chip key={k.code} label={t(k.key)} selected={value.code === k.code} onPress={() => set({ code: k.code })} />
            ))}
          </View>
        ) : null}

        <Label>{t('decide.lineEditor.name')}</Label>
        <Box value={value.name} onChangeText={(name) => set({ name })} accessibilityLabel={t('decide.lineEditor.name')} maxLength={NAME_MAX} />

        {needsAmount ? (
          <MoneyInput
            value={value.amount > 0 ? value.amount : null}
            currency={currency}
            onChange={(minor) =>
              // WR-C11: Go ahead ends a picked bill's whole series, so a changed amount is no longer that bill: the line
              // keeps the typed amount and ends nothing.
              setValue((v) => {
                const amount = minor ?? 0;
                const bill = v.seriesId === null ? undefined : recurringBills.find((b) => b.id === v.seriesId);
                const keepsBill = bill === undefined || bill.monthly === amount;
                return { ...v, amount, seriesId: keepsBill ? v.seriesId : null };
              })
            }
            label={t('decide.lineEditor.amount')}
            accessibilityLabel={t('decide.lineEditor.amount')}
          />
        ) : null}

        {isSetback && value.code !== 'unexpected_expense' ? (
          <>
            {value.code === 'late_invoice' ? (
              <>
                <Label>{t('decide.lineEditor.days')}</Label>
                <Box numeric value={value.daysLate > 0 ? String(value.daysLate) : ''} onChangeText={(x) => set({ daysLate: whole(x, 365) })} accessibilityLabel={t('decide.lineEditor.days')} maxLength={3} />
              </>
            ) : (
              <>
                {value.code === 'income_drop' ? (
                  <>
                    <Label>{t('decide.lineEditor.percent')}</Label>
                    <Box numeric value={value.percentDrop > 0 ? String(value.percentDrop) : ''} onChangeText={(x) => set({ percentDrop: whole(x, 100) })} accessibilityLabel={t('decide.lineEditor.percent')} maxLength={3} />
                  </>
                ) : null}
                <Label>{t('decide.lineEditor.months')}</Label>
                <Box numeric value={value.months > 0 ? String(value.months) : ''} onChangeText={(x) => set({ months: whole(x, MAX_MONTHS) })} accessibilityLabel={t('decide.lineEditor.months')} maxLength={3} />
              </>
            )}
          </>
        ) : null}

        <Label>{t('decide.lineEditor.note')}</Label>
        <Box value={value.note} onChangeText={(note) => set({ note })} accessibilityLabel={t('decide.lineEditor.note')} maxLength={NOTE_MAX} />

        {context === 'adjust' ? (
          <>
            <View style={styles.effectRow}>
              <View style={styles.effectToggle}>
                <SegmentedToggle
                  accessibilityLabel={t('decide.lineEditor.titleAdjust')}
                  value={value.effect}
                  onChange={(key) => set({ effect: key === 'takes_off' ? 'takes_off' : 'adds' })}
                  options={[
                    { key: 'adds', label: t('decide.lineEditor.adds') },
                    { key: 'takes_off', label: t('decide.lineEditor.takesOff') },
                  ]}
                />
              </View>
              {tradeInInfo.button()}
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: value.onDay }}
              accessibilityLabel={t('decide.lineEditor.onDay')}
              onPress={() => set({ onDay: !value.onDay })}
              style={styles.toggle}
            >
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.lineEditor.onDay')}</Text>
              <Text style={{ ...textRole(pairing, 'label'), color: value.onDay ? colors.accent : colors.inkMuted }}>
                {value.onDay ? t('decide.pay.yes') : t('decide.pay.no')}
              </Text>
            </Pressable>
          </>
        ) : null}

        <Pill label={t('decide.lineEditor.save')} variant="primary" disabled={!canSave} onPress={save} />
      </SheetScroll>
      {tradeInInfo.sheet}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  effectRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  effectToggle: { flex: 1 },
  bill: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  toggle: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
});
