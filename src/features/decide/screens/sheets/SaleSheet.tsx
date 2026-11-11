/**
 * 06.1-16 (D-27, UX-42, FIN-21): D45, selling the one you have now. Writes CheckV2.replaces.sale = { amount, arrives, paysDebtId }
 * (switch off -> null). The engine (fullCost/replaces.ts) counts the debt first and only a sale that arrives by the purchase
 * date is netted against day one; this sheet passes paysDebtId and never counts a sale against a debt itself (T-06.1-16-01).
 * Debts reach it from the snapshot (V3Inputs.debts), never from Grow tables.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { DateField } from '@/features/record/entry/pickers/DateField';
import { Chip } from '@/ui/Chip';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { useIsDirty } from '@/ui/useIsDirty';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { currencyCode, minorUnits } from '@/engine/money';
import type { LocalDate, Sale } from '@/engine/decide/v3';
import { WaterfallCard } from '../ui/WaterfallCard';

/** Keys are looked up by name, so the typed key union does not apply. */
type Translate = (key: string) => string;

export interface SaleDebt {
  id: string;
  name: string;
  /** Minor units still owed. */
  balance: number;
}

export interface SaleSheetProps {
  visible: boolean;
  currency: string;
  /** 'YYYY-MM-DD' */
  today: string;
  /** The current sale on the check, if any. */
  sale: Sale | null;
  debts: readonly SaleDebt[];
  /** null = the switch is off. */
  onSave: (sale: Sale | null) => void;
  onClose: () => void;
}

type Timing = 'now' | 'later' | 'date';

const pad = (n: number): string => String(n).padStart(2, '0');

/** One calendar month on, clamped to the month's last day. */
export function monthLater(date: string): string {
  const [y = 1970, m = 1, d = 1] = date.split('-').map((p) => parseInt(p, 10));
  const total = y * 12 + (m - 1) + 1;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(ny, nm, 0).getDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`;
}

interface Form {
  on: boolean;
  amount: number | null;
  debtId: string | null;
  timing: Timing;
  date: string;
}

export function SaleSheet(props: SaleSheetProps) {
  return props.visible ? <SaleForm {...props} /> : null;
}

function SaleForm({ currency, today, sale, debts, onSave, onClose }: SaleSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const fmt = useMoneyFormatter(false);
  const [start] = useState<Form>(() => ({
    on: sale !== null,
    amount: sale?.amount ?? null,
    debtId: sale?.paysDebtId ?? null,
    timing: sale === null || sale.arrives === today ? 'now' : sale.arrives === monthLater(today) ? 'later' : 'date',
    date: sale?.arrives ?? today,
  }));
  const [form, setForm] = useState<Form>(start);
  const dirty = useIsDirty(start, form);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const k = (key: string): string => (t as unknown as Translate)(`decide.screens.sheetsCosts.sale.${key}`);
  const money = (n: number): string => fmt.formatMoney({ amount: minorUnits(n), currency: currencyCode(currency) });

  const debt = debts.find((d) => d.id === form.debtId) ?? null;
  const price = form.amount ?? 0;
  const paysDown = debt === null ? 0 : Math.min(price, debt.balance);
  const toward = price - paysDown;
  const arrives = form.timing === 'now' ? today : form.timing === 'later' ? monthLater(today) : form.date;
  const valid = !form.on || (form.amount !== null && form.amount > 0);

  const save = () => {
    if (!valid) return;
    if (!form.on) onSave(null);
    else onSave({ amount: price as Sale['amount'], arrives: arrives as LocalDate, paysDebtId: debt === null ? null : debt.id });
    onClose();
  };

  const label = { ...textRole(pairing, 'label'), color: colors.inkDim };
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={k('title')} dirty={dirty}>
      <SheetHeader title={k('title')} cancelLabel={t('decide.screens.common.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <ToggleRow label={k('switch')} value={form.on} onChange={(on) => set({ on })} />
        {form.on ? (
          <>
            <MoneyInput value={form.amount} currency={currency} onChange={(amount) => set({ amount })} label={k('price')} accessibilityLabel={k('price')} />

            {debts.length > 0 ? (
              <View style={styles.field}>
                <Text style={label}>{k('debtQ')}</Text>
                <View style={styles.chips}>
                  <Chip label={k('noDebt')} selected={form.debtId === null} onPress={() => set({ debtId: null })} />
                  {debts.map((d) => (
                    <Chip key={d.id} label={d.name} selected={form.debtId === d.id} onPress={() => set({ debtId: d.id })} />
                  ))}
                </View>
                {debt === null ? null : (
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{`${k('owed')}: ${money(debt.balance)}`}</Text>
                )}
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={label}>{k('whenQ')}</Text>
              <View style={styles.chips}>
                <Chip label={k('sameDay')} selected={form.timing === 'now'} onPress={() => set({ timing: 'now' })} />
                <Chip label={k('monthLater')} selected={form.timing === 'later'} onPress={() => set({ timing: 'later' })} />
                <Chip label={t('decide.screens.common.pickDate')} selected={form.timing === 'date'} onPress={() => set({ timing: 'date' })} />
              </View>
              {form.timing === 'date' ? (
                <DateField label={k('arrivesOn')} value={form.date} display={fmt.formatDate(form.date)} onChange={(date) => set({ date })} minDate={today} />
              ) : null}
            </View>

            <WaterfallCard
              currency={currency}
              lines={[
                { label: t('decide.screens.sheetsCosts.waterfall.salePrice'), amount: price, sign: '' },
                ...(debt === null ? [] : [{ label: t('decide.screens.sheetsCosts.waterfall.paysDown', { debt: debt.name }), amount: paysDown, sign: '-' as const }]),
              ]}
              total={{ label: t('decide.screens.sheetsCosts.waterfall.toward'), amount: toward }}
            />
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{k('laterNote')}</Text>
          </>
        ) : null}
        <Pill label={k('save')} variant="primary" disabled={!valid} onPress={save} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd, paddingBottom: space.gapMd },
  field: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
