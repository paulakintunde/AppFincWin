/**
 * 06.1-16 (D-27, UX-42): "Add your own" in four variants. D44 a running cost, D44S a cost that stops, D44F a one-off cost,
 * D44K an own kind. The sheet only builds the engine's shape and hands it to onAdd; the stepper writes it into the check,
 * shows "Added: {{name}}." with Undo and removes it again. The kind's "Counts like" list leaves out Home (D-02); up to 3 own
 * items per kind (the engine's own-questions cap). Bills for the stop variant come from the snapshot's bill series, passed in.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RunningCostLine, StoppedCost } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { DateField } from '@/features/record/entry/pickers/DateField';
import { Chip } from '@/ui/Chip';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useIsDirty } from '@/ui/useIsDirty';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';

/** Keys built from a variant or a list are looked up by name, so the typed key union does not apply. */
type Translate = (key: string) => string;

export type OwnVariant = 'running' | 'stop' | 'oneOff' | 'kind';
/** D-02: Home is not on the list. */
export const COUNTS_LIKE = ['everyday', 'tech', 'car', 'other'] as const;
export type CountsLike = (typeof COUNTS_LIKE)[number];
/** The engine's own-questions cap, per kind. */
export const OWN_CAP = 3;

export type OwnAdd =
  | { variant: 'running'; name: string; line: RunningCostLine }
  | { variant: 'stop'; name: string; stop: StoppedCost }
  | { variant: 'oneOff'; id: string; key: string; name: string; amount: number }
  | { variant: 'kind'; kind: { id: string; name: string; countsLike: CountsLike } };

export interface AddYourOwnSheetProps {
  visible: boolean;
  variant: OwnVariant;
  currency: string;
  /** 'YYYY-MM-DD' */
  today: string;
  /** Recorded bills the stop variant can pick from (the snapshot's bill series). */
  bills: readonly { id: string; name: string }[];
  /** Categories for the "everyday" stop. */
  categories: readonly { id: string; name: string }[];
  /** How many own kinds exist already. */
  existingKindCount: number;
  onAdd: (add: OwnAdd) => void;
  onClose: () => void;
  newId?: () => string;
}

const defaultId = (): string => `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const EVERY: readonly { months: 1 | 3 | 12; key: 'monthly' | 'quarterly' | 'yearly' }[] = [
  { months: 1, key: 'monthly' },
  { months: 3, key: 'quarterly' },
  { months: 12, key: 'yearly' },
];

interface Form {
  name: string;
  amount: number | null;
  every: 1 | 3 | 12;
  billId: string | null;
  everyday: boolean;
  categoryId: string | null;
  stopDate: string;
  countsLike: CountsLike;
}

export function AddYourOwnSheet(props: AddYourOwnSheetProps) {
  // The form mounts per opening so every field starts empty.
  return props.visible ? <OwnForm {...props} /> : null;
}

function OwnForm({ variant, currency, today, bills, categories, existingKindCount, onAdd, onClose, newId = defaultId }: AddYourOwnSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const fmt = useMoneyFormatter(false);
  const [start] = useState<Form>(() => ({ name: '', amount: null, every: 1, billId: null, everyday: false, categoryId: null, stopDate: today, countsLike: 'everyday' }));
  const [form, setForm] = useState<Form>(start);
  const [capped, setCapped] = useState(false);
  const dirty = useIsDirty(start, form);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const k = (key: string): string => (t as unknown as Translate)(`decide.screens.sheetsCosts.own.${key}`);

  const title = k(`${variant}.title`);
  const name = form.name.trim();
  const needsAmount = variant !== 'kind';
  const valid = name.length > 0 && (!needsAmount || (form.amount !== null && form.amount > 0));

  const add = () => {
    if (!valid) return;
    if (variant === 'kind' && existingKindCount >= OWN_CAP) {
      setCapped(true);
      return;
    }
    const id = newId();
    const amount = form.amount ?? 0;
    if (variant === 'running') {
      onAdd({ variant, name, line: { id, amount: amount as RunningCostLine['amount'], everyMonths: form.every, start: today as RunningCostLine['start'], end: null, on: true } });
    } else if (variant === 'stop') {
      const source: StoppedCost['source'] = form.everyday || form.billId === null ? { kind: 'everyday', categoryId: form.categoryId } : { kind: 'bill', seriesId: form.billId };
      onAdd({ variant, name, stop: { id, amount: amount as StoppedCost['amount'], everyMonths: form.every, stopDate: form.stopDate as StoppedCost['stopDate'], source } });
    } else if (variant === 'oneOff') {
      onAdd({ variant, id, key: `oneOff:${id}`, name, amount });
    } else {
      onAdd({ variant, kind: { id, name, countsLike: form.countsLike } });
    }
    onClose();
  };

  const label = { ...textRole(pairing, 'label'), color: colors.inkDim };
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{k(`${variant}.hint`)}</Text>

        <View style={styles.field}>
          <Text style={label}>{t('decide.screens.common.name')}</Text>
          <TextInput
            value={form.name}
            onChangeText={(v) => set({ name: v })}
            accessibilityLabel={t('decide.screens.common.name')}
            maxLength={60}
            style={[styles.box, { backgroundColor: colors.fill6, color: colors.ink }, textRole(pairing, 'body')]}
          />
        </View>

        {needsAmount ? (
          <MoneyInput
            value={form.amount}
            currency={currency}
            onChange={(amount) => set({ amount })}
            label={t('decide.screens.common.amount')}
            accessibilityLabel={t('decide.screens.common.amount')}
          />
        ) : null}

        {variant === 'running' || variant === 'stop' ? (
          <View style={styles.field}>
            <Text style={label}>{t('decide.screens.common.howOften')}</Text>
            <View style={styles.chips}>
              {EVERY.map((e) => (
                <Chip key={e.months} label={k(e.key)} selected={form.every === e.months} onPress={() => set({ every: e.months })} />
              ))}
            </View>
          </View>
        ) : null}

        {variant === 'stop' ? (
          <>
            <View style={styles.field}>
              <Text style={label}>{k('stop.pickBill')}</Text>
              <View style={styles.chips}>
                {bills.map((b) => (
                  <Chip key={b.id} label={b.name} selected={!form.everyday && form.billId === b.id} onPress={() => set({ billId: b.id, everyday: false })} />
                ))}
                <Chip label={k('stop.everyday')} selected={form.everyday} onPress={() => set({ everyday: true, billId: null })} />
              </View>
              {bills.length === 0 ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{k('stop.noBills')}</Text> : null}
            </View>
            {form.everyday && categories.length > 0 ? (
              <View style={styles.field}>
                <Text style={label}>{k('stop.everydayCategory')}</Text>
                <View style={styles.chips}>
                  {categories.map((c) => (
                    <Chip key={c.id} label={c.name} selected={form.categoryId === c.id} onPress={() => set({ categoryId: c.id })} />
                  ))}
                </View>
              </View>
            ) : null}
            <DateField label={k('stop.stopDate')} value={form.stopDate} display={fmt.formatDate(form.stopDate)} onChange={(d) => set({ stopDate: d })} minDate={today} />
          </>
        ) : null}

        {variant === 'kind' ? (
          <View style={styles.field}>
            <Text style={label}>{k('kind.countsLike')}</Text>
            <View style={styles.chips}>
              {COUNTS_LIKE.map((c) => {
                const word = k(`kind${c.charAt(0).toUpperCase()}${c.slice(1)}`);
                return <Chip key={c} label={word} selected={form.countsLike === c} onPress={() => set({ countsLike: c })} />;
              })}
            </View>
          </View>
        ) : null}

        {capped ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{k('cap')}</Text> : null}
        <Pill label={k(`${variant}.add`)} variant="primary" disabled={!valid} onPress={add} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd, paddingBottom: space.gapMd },
  field: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  box: { minHeight: space.touchMin, borderRadius: radii.card, paddingHorizontal: space.gapMd },
});
