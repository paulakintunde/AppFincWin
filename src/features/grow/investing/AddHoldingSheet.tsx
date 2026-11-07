// 06-18 (GRW-04, D-09, D-10): Add a holding. Simple first: name, a plain-word type, what was put in, what it is worth now and
// the date of that value. A regular amount going in and a rate sit behind a disclosure. Saving is one queued write with one Undo.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAddHolding } from '@/data/mutations/growHoldings';
import type { HoldingType } from '@/db/holdings';
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
import { DATE_TEXT_RE, validRateText } from './investingFormat';

/** The five plain-word types (D-10). No tax-wrapper names. */
export const HOLDING_TYPE_OPTIONS: readonly HoldingType[] = ['brokerage', 'retirement', 'pension', 'crypto', 'other'];
const NAME_MAX = 80;

export interface AddHoldingSheetProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

export function AddHoldingSheet({ visible, onClose, onSaved }: AddHoldingSheetProps) {
  if (!visible) return null;
  return <Body onClose={onClose} onSaved={onSaved} />;
}

function Body({ onClose, onSaved }: Omit<AddHoldingSheetProps, 'visible'>) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const { add } = useAddHolding();

  const [name, setName] = useState('');
  const [type, setType] = useState<HoldingType>('brokerage');
  const [putIn, setPutIn] = useState<number | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [asOf, setAsOf] = useState(rc.today);
  const [regular, setRegular] = useState(false);
  const [monthly, setMonthly] = useState<number | null>(null);
  const [day, setDay] = useState('');
  const [rate, setRate] = useState('');
  const [initial] = useState(() => ({ name, type, putIn, value, asOf, monthly, day, rate }));
  const dirty = useIsDirty(initial, { name, type, putIn, value, asOf, monthly, day, rate });

  const nameOk = name.trim().length >= 1 && name.trim().length <= NAME_MAX;
  const dateOk = DATE_TEXT_RE.test(asOf) && asOf <= rc.today;
  const dayNum = day.trim() === '' ? null : Number(day);
  const dayOk = dayNum === null || (Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31);
  const rateOk = validRateText(rate);
  const canSave = rc.ready && rc.householdId !== null && rc.userId !== null && nameOk && putIn !== null && value !== null && dateOk && dayOk && rateOk;

  const save = () => {
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
      // The hook refuses what the form already blocks; nothing was written.
    }
  };

  const labelStyle = [textRole(pairing, 'label'), { color: colors.inkMuted }];
  const inputStyle = [textRole(pairing, 'body'), styles.input, { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 }];
  const title = t('grow.investing.add.title');

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
          currency={rc.homeCurrency}
          label={t('grow.investing.add.putIn')}
          accessibilityLabel={t('grow.investing.add.putIn')}
        />
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

        <Row label={t('grow.investing.add.regular')} chevron dense onPress={() => setRegular((r) => !r)} accessibilityLabel={t('grow.investing.add.regular')} />
        {regular ? (
          <View style={styles.column}>
            <MoneyInput
              boxed
              value={monthly}
              onChange={setMonthly}
              currency={rc.homeCurrency}
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

        <Text style={labelStyle}>{t('grow.debts.add.rate')}</Text>
        <TextInput
          testID="holding-rate"
          accessibilityLabel={t('grow.debts.add.rate')}
          value={rate}
          onChangeText={setRate}
          keyboardType="decimal-pad"
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />

        <Pill label={t('grow.investing.add.save')} variant="primary" onPress={save} disabled={!canSave} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  input: { minHeight: space.touchMin, paddingHorizontal: space.cardPad, paddingVertical: space.gapSm },
});
