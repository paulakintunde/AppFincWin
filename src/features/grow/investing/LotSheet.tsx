// 06-18 (GRW-05, D-24): add a buy, sale, dividend or fee to a holding. Entries appear only after "Add a buy / sale / dividend".
// A sale above the units held is refused inline (the hook checks again, T-06-18-02). Gain is a record, not a tax figure.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAddHoldingLot, lotsReplayError } from '@/data/mutations/growHoldings';
import type { HoldingLotKind, HoldingLotRow } from '@/db/holdingLots';
import type { HoldingRow } from '@/db/holdings';
import { replayLots, type LotEntry } from '@/engine/grow';
import { minorUnits } from '@/engine/money';
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
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useIsDirty } from '@/ui/useIsDirty';
import { DATE_TEXT_RE } from './investingFormat';

const KINDS: readonly { kind: Exclude<HoldingLotKind, 'value'>; key: 'buy' | 'sale' | 'dividend' | 'fee' }[] = [
  { kind: 'buy', key: 'buy' },
  { kind: 'sell', key: 'sale' },
  { kind: 'dividend', key: 'dividend' },
  { kind: 'fee', key: 'fee' },
];
const UNITS_TEXT_RE = /^\d{1,12}(\.\d{1,8})?$/;

export interface LotSheetProps {
  visible: boolean;
  holding: HoldingRow;
  /** The holding's current entries (not removed). */
  lots: readonly HoldingLotRow[];
  onClose: () => void;
}

export function LotSheet({ visible, holding, lots, onClose }: LotSheetProps) {
  if (!visible) return null;
  return <Body holding={holding} lots={lots} onClose={onClose} />;
}

function unitsHeldText(holding: HoldingRow, lots: readonly HoldingLotRow[]): string {
  const entries: LotEntry[] = [];
  if (holding.opening_put_in > 0) entries.push({ kind: 'buy', amount: minorUnits(holding.opening_put_in), units: null, localDate: '0000-01-01' });
  for (const l of lots) {
    if (l.kind === 'value') continue;
    entries.push({ kind: l.kind, amount: minorUnits(l.amount), units: l.units, localDate: l.local_date, valueBefore: minorUnits(holding.value) });
  }
  const res = replayLots(entries);
  if (!res.ok) return '0';
  const scaled = res.position.unitsScaled;
  const whole = scaled / 100_000_000n;
  const frac = (scaled % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole.toString()}.${frac}`;
}

function Body({ holding, lots, onClose }: Omit<LotSheetProps, 'visible'>) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const { add } = useAddHoldingLot();

  const [kind, setKind] = useState<Exclude<HoldingLotKind, 'value'>>('buy');
  const [amount, setAmount] = useState<number | null>(null);
  const [units, setUnits] = useState('');
  const [date, setDate] = useState(rc.today);
  const [note, setNote] = useState('');
  const [initial] = useState(() => ({ kind, amount, units, date, note }));
  const dirty = useIsDirty(initial, { kind, amount, units, date, note });

  const usesUnits = kind === 'buy' || kind === 'sell';
  const unitsText = usesUnits ? units.trim() : '';
  const unitsOk = unitsText === '' || UNITS_TEXT_RE.test(unitsText);
  const dateOk = DATE_TEXT_RE.test(date) && date <= rc.today;
  const replayError =
    amount !== null && amount > 0 && unitsOk && dateOk
      ? lotsReplayError(holding, [...lots, { kind, amount, units: unitsText === '' ? null : unitsText, local_date: date }])
      : null;
  const canSave = rc.userId !== null && amount !== null && amount > 0 && unitsOk && dateOk && replayError === null;

  const save = () => {
    if (!canSave || rc.userId === null || amount === null) return;
    try {
      const { stepId } = add({
        ownerId: rc.userId,
        holding,
        lots,
        kind,
        amount,
        units: unitsText === '' ? null : unitsText,
        date,
        note: note.trim() === '' ? null : note.trim(),
      });
      showToast({ kind: 'ordinary', text: undoLabelText('holdingEntryAdded', { name: holding.name }), stepId });
      onClose();
    } catch {
      // The hook refuses what the form already blocks.
    }
  };

  const labelStyle = [textRole(pairing, 'label'), { color: colors.inkMuted }];
  const inputStyle = [textRole(pairing, 'body'), styles.input, { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 }];
  const title = t('grow.investing.entry.title');

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <View style={styles.chips}>
          {KINDS.map((k) => (
            <Chip key={k.kind} label={t(`grow.investing.entry.${k.key}`)} selected={kind === k.kind} onPress={() => setKind(k.kind)} />
          ))}
        </View>
        <MoneyInput
          boxed
          value={amount}
          onChange={setAmount}
          currency={holding.currency}
          label={t('grow.investing.entry.amount')}
          accessibilityLabel={t('grow.investing.entry.amount')}
        />
        {usesUnits ? (
          <>
            <Text style={labelStyle}>{t('grow.investing.entry.units')}</Text>
            <TextInput
              testID="lot-units"
              accessibilityLabel={t('grow.investing.entry.units')}
              value={units}
              onChangeText={setUnits}
              keyboardType="decimal-pad"
              style={inputStyle}
              placeholderTextColor={colors.inkFaint}
            />
            {!unitsOk ? <Text style={[textRole(pairing, 'label'), { color: colors.danger }]}>{t('grow.investing.entry.badUnits')}</Text> : null}
          </>
        ) : null}
        {replayError === 'sell-exceeds-units' ? (
          <Text testID="lot-exceeds" style={[textRole(pairing, 'label'), { color: colors.danger }]}>
            {t('grow.investing.entry.sellExceedsUnits', { units: unitsHeldText(holding, lots) })}
          </Text>
        ) : null}
        {replayError === 'bad-units' ? <Text style={[textRole(pairing, 'label'), { color: colors.danger }]}>{t('grow.investing.entry.badUnits')}</Text> : null}
        <Text style={labelStyle}>{t('grow.investing.entry.date')}</Text>
        <TextInput
          testID="lot-date"
          accessibilityLabel={t('grow.investing.entry.date')}
          value={date}
          onChangeText={setDate}
          autoCapitalize="none"
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />
        <Text style={labelStyle}>{t('grow.investing.entry.note')}</Text>
        <TextInput
          accessibilityLabel={t('grow.investing.entry.note')}
          value={note}
          onChangeText={setNote}
          maxLength={200}
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />
        <Pill label={t('grow.investing.entry.save')} variant="primary" onPress={save} disabled={!canSave} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  input: { minHeight: space.touchMin, paddingHorizontal: space.cardPad, paddingVertical: space.gapSm },
});
