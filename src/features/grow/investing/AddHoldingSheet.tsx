// 06-18 (GRW-04, D-09, D-10): Add a holding. Simple first: name, a plain-word type, what was put in, what it is worth now and
// the date of that value. A regular amount going in and a rate sit behind a disclosure. Saving is one queued write with one Undo.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAddHolding, useEditHolding, type EditHoldingFields } from '@/data/mutations/growHoldings';
import type { HoldingLotRow } from '@/db/holdingLots';
import type { HoldingRow, HoldingType } from '@/db/holdings';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useIsDirty } from '@/ui/useIsDirty';
import { validDateText, validRateText } from './investingFormat';

/** The five plain-word types (D-10). No tax-wrapper names. */
export const HOLDING_TYPE_OPTIONS: readonly HoldingType[] = ['brokerage', 'retirement', 'pension', 'crypto', 'other'];
const NAME_MAX = 80;

export interface AddHoldingSheetProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  /** D-32: a holding to change. Value moves only through Update value, so Value now and As of are hidden. */
  holding?: HoldingRow | null;
  /** The holding's entries, so a put-in change that breaks a sale is refused. */
  lots?: readonly HoldingLotRow[];
}

export function AddHoldingSheet({ visible, onClose, onSaved, holding, lots }: AddHoldingSheetProps) {
  if (!visible) return null;
  return <Body onClose={onClose} onSaved={onSaved} holding={holding} lots={lots} />;
}

function Body({ onClose, onSaved, holding, lots }: Omit<AddHoldingSheetProps, 'visible'>) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const { add } = useAddHolding();
  const { edit } = useEditHolding();
  const editing = holding ?? null;
  // P3-WR-08: an edited holding keeps its own currency (a USD holding with a JPY home still types dollars and cents).
  const currency = editing?.currency ?? rc.homeCurrency;

  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<HoldingType>(editing?.type ?? 'brokerage');
  const [putIn, setPutIn] = useState<number | null>(editing?.opening_put_in ?? null);
  const [value, setValue] = useState<number | null>(null);
  const [asOf, setAsOf] = useState(rc.today);
  const [regular, setRegular] = useState(editing !== null && editing.monthly_amount !== null && editing.monthly_amount > 0);
  const [monthly, setMonthly] = useState<number | null>(editing?.monthly_amount ?? null);
  const [day, setDay] = useState(editing?.day != null ? String(editing.day) : '');
  const [rate, setRate] = useState(editing?.rate ?? '');
  // P3-IN-04: turning "regular amount" off clears the monthly amount on save, so it counts as a change.
  const [initial] = useState(() => ({ name, type, putIn, value, asOf, regular, monthly, day, rate }));
  const dirty = useIsDirty(initial, { name, type, putIn, value, asOf, regular, monthly, day, rate });

  const nameOk = name.trim().length >= 1 && name.trim().length <= NAME_MAX;
  const dateOk = validDateText(asOf) && asOf <= rc.today;
  const dayNum = day.trim() === '' ? null : Number(day);
  const dayOk = dayNum === null || (Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31);
  const rateOk = validRateText(rate);
  const canSave =
    editing !== null
      ? rc.userId !== null && nameOk && putIn !== null && dayOk && rateOk
      : rc.ready && rc.householdId !== null && rc.userId !== null && nameOk && putIn !== null && value !== null && dateOk && dayOk && rateOk;

  const saveEdit = () => {
    if (editing === null || !canSave || rc.userId === null || putIn === null) return;
    const fields: EditHoldingFields = {};
    if (name.trim() !== editing.name) fields.name = name.trim();
    if (type !== editing.type) fields.type = type;
    if (putIn !== editing.opening_put_in) fields.opening_put_in = putIn;
    const nextMonthly = regular ? monthly : null;
    const nextDay = regular ? dayNum : null;
    const nextRate = rate.trim() === '' ? null : rate.trim();
    if (nextMonthly !== editing.monthly_amount) fields.monthly_amount = nextMonthly;
    if (nextDay !== editing.day) fields.day = nextDay;
    if (nextRate !== editing.rate) fields.rate = nextRate;
    if (Object.keys(fields).length === 0) {
      onClose();
      return;
    }
    try {
      const stepId = edit(editing, fields, rc.userId, lots);
      showToast({ kind: 'ordinary', text: undoLabelText('holdingEdited', { name: name.trim() }), stepId });
      onSaved?.(editing.id);
      onClose();
    } catch {
      // P3-WR-09: the hook refused (a figure over the cap, or a put-in that breaks a later sale); nothing was written.
      showToast({ kind: 'refusal', text: { key: 'grow.common.notSaved' } });
    }
  };

  const save = () => {
    if (editing !== null) {
      saveEdit();
      return;
    }
    if (!canSave || rc.householdId === null || rc.userId === null || putIn === null || value === null) return;
    try {
      const { id, stepId } = add({
        ownerId: rc.userId,
        householdId: rc.householdId,
        name: name.trim(),
        type,
        currency: rc.homeCurrency,
        value,
        openingPutIn: putIn,
        valueAsOf: asOf,
        monthlyAmount: regular ? monthly : null,
        day: regular ? dayNum : null,
        rate: rate.trim() === '' ? null : rate.trim(),
      });
      showToast({ kind: 'ordinary', text: undoLabelText('holdingAdded', { name: name.trim() }), stepId });
      onSaved?.(id);
      onClose();
    } catch {
      showToast({ kind: 'refusal', text: { key: 'grow.common.notSaved' } });
    }
  };

  const labelStyle = [textRole(pairing, 'label'), { color: colors.inkMuted }];
  const inputStyle = [textRole(pairing, 'body'), styles.input, { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 }];
  const title = editing !== null ? t('grow.investing.add.editTitle') : t('grow.investing.add.title');

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={labelStyle}>{t('grow.investing.add.name')}</Text>
        <TextInput
          testID="holding-name"
          accessibilityLabel={t('grow.investing.add.name')}
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX}
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />

        <Text style={labelStyle}>{t('grow.investing.add.type')}</Text>
        <View testID="holding-type-options" style={styles.chips}>
          {HOLDING_TYPE_OPTIONS.map((o) => (
            <Chip key={o} label={t(`grow.investing.types.${o}`)} selected={type === o} onPress={() => setType(o)} />
          ))}
        </View>

        <MoneyInput
          boxed
          value={putIn}
          onChange={setPutIn}
          currency={currency}
          label={t('grow.investing.add.putIn')}
          accessibilityLabel={t('grow.investing.add.putIn')}
        />
        {editing === null ? (
          <>
        <MoneyInput
          boxed
          value={value}
          onChange={setValue}
          currency={rc.homeCurrency}
          label={t('grow.investing.add.valueNow')}
          accessibilityLabel={t('grow.investing.add.valueNow')}
        />

        <Text style={labelStyle}>{t('grow.investing.add.asOf')}</Text>
        <TextInput
          testID="holding-as-of"
          accessibilityLabel={t('grow.investing.add.asOf')}
          value={asOf}
          onChangeText={setAsOf}
          autoCapitalize="none"
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />
        {dateOk ? null : <Text style={[textRole(pairing, 'label'), { color: colors.danger }]}>{t('grow.investing.dateInvalid')}</Text>}
          </>
        ) : null}

        <Row label={t('grow.investing.add.regular')} chevron dense onPress={() => setRegular((r) => !r)} accessibilityLabel={t('grow.investing.add.regular')} />
        {regular ? (
          <View style={styles.column}>
            <MoneyInput
              boxed
              value={monthly}
              onChange={setMonthly}
              currency={currency}
              label={t('grow.investing.add.eachMonth')}
              accessibilityLabel={t('grow.investing.add.eachMonth')}
            />
            <Text style={labelStyle}>{t('grow.investing.add.day')}</Text>
            <TextInput
              testID="holding-day"
              accessibilityLabel={t('grow.investing.add.day')}
              value={day}
              onChangeText={setDay}
              keyboardType="number-pad"
              style={inputStyle}
              placeholderTextColor={colors.inkFaint}
            />
          </View>
        ) : null}

        <Text style={labelStyle}>{t('grow.investing.add.rate')}</Text>
        <TextInput
          testID="holding-rate"
          accessibilityLabel={t('grow.investing.add.rate')}
          value={rate}
          onChangeText={setRate}
          keyboardType="decimal-pad"
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />

        <Pill label={editing !== null ? t('grow.investing.add.saveEdit') : t('grow.investing.add.save')} variant="primary" onPress={save} disabled={!canSave} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  input: { minHeight: space.touchMin, paddingHorizontal: space.cardPad, paddingVertical: space.gapSm },
});
