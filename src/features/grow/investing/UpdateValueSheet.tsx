// 06-18 (GRW-10, D-11, D-12, G09a): "Update value". The user types the value from their statement; it is dated today, so the
// as-of date moves everywhere. A value entry, not a market price: there are no live prices in this version.
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useAddHoldingLot, useEditHoldingLot } from '@/data/mutations/growHoldings';
import type { HoldingLotRow } from '@/db/holdingLots';
import type { HoldingRow } from '@/db/holdings';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useIsDirty } from '@/ui/useIsDirty';
import { useInvestingFormat } from './investingFormat';

export interface UpdateValueSheetProps {
  visible: boolean;
  holding: HoldingRow;
  /** D-32: a value entry to change. */
  lot?: HoldingLotRow | null;
  lots?: readonly HoldingLotRow[];
  onRemove?: () => void;
  onClose: () => void;
}

export function UpdateValueSheet({ visible, holding, lot, lots, onRemove, onClose }: UpdateValueSheetProps) {
  if (!visible) return null;
  return <Body holding={holding} lot={lot} lots={lots} onRemove={onRemove} onClose={onClose} />;
}

function Body({ holding, lot, lots, onRemove, onClose }: Omit<UpdateValueSheetProps, 'visible'>) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const f = useInvestingFormat();
  const { add } = useAddHoldingLot();
  const { edit } = useEditHoldingLot();
  const editing = lot ?? null;
  const [value, setValue] = useState<number | null>(editing?.amount ?? holding.value);
  const [initial] = useState(() => ({ value }));
  const dirty = useIsDirty(initial, { value });

  const canSave = rc.userId !== null && value !== null && value >= 0;
  const change = value === null || editing !== null ? null : value - holding.value;

  const save = () => {
    if (!canSave || rc.userId === null || value === null) return;
    if (editing !== null) {
      if (value === editing.amount) {
        onClose();
        return;
      }
      try {
        const stepId = edit(editing, { amount: value }, holding, lots ?? [], rc.userId);
        hapticLight();
        showToast({ kind: 'ordinary', text: undoLabelText('holdingEntryEdited', { name: holding.name }), stepId });
        onClose();
      } catch {
        // P3-WR-09: the hook refused (a value over the cap); nothing was written.
        showToast({ kind: 'refusal', text: { key: 'grow.common.notSaved' } });
      }
      return;
    }
    try {
      const { stepId } = add({ ownerId: rc.userId, holding, lots: [], kind: 'value', amount: value, date: rc.today });
      hapticLight();
      showToast({ kind: 'ordinary', text: undoLabelText('holdingValueUpdated', { name: holding.name }), stepId });
      onClose();
    } catch {
      showToast({ kind: 'refusal', text: { key: 'grow.common.notSaved' } });
    }
  };

  const title = editing !== null ? t('grow.investing.entry.editTitle') : t('grow.investing.update.title');
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <MoneyInput
          boxed
          value={value}
          onChange={setValue}
          currency={holding.currency}
          label={t('grow.investing.update.field')}
          accessibilityLabel={t('grow.investing.update.field')}
        />
        <Text style={[textRole(pairing, 'label'), { color: colors.inkMuted }]}>
          {t('grow.investing.update.asOf', { date: editing !== null ? f.day(editing.local_date) : t('grow.investing.update.today') })}
        </Text>
        {change !== null ? (
          <Text testID="update-preview" style={[textRole(pairing, 'label'), { color: colors.inkMuted }]}>
            {t('grow.investing.update.preview', { date: f.day(holding.value_as_of), change: f.signed(change, holding.currency) })}
          </Text>
        ) : null}
        <Pill label={t('grow.investing.update.save')} variant="primary" onPress={save} disabled={!canSave} />
        {editing !== null && onRemove ? (
          <Pressable testID="value-remove" accessibilityRole="button" accessibilityLabel={t('grow.investing.entry.remove')} onPress={onRemove} style={styles.removeButton}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.danger }}>{t('grow.investing.entry.remove')}</Text>
          </Pressable>
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  removeButton: { minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
});
