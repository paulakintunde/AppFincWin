// 05.2-46 (DSU-15, DSU-05): "Income type" and "Counts toward my month" for a regular income, edited on the series
// itself (existing income_kind / counts_as columns, one Undo through usePatchSeriesAttributes). Explicit taps only;
// an unchanged pick writes nothing (the patch helper drops equal values). Hidden unless Decide v3 is on (D-01).
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RecurringSeriesRow } from '@/db/rows';
import { usePatchSeriesAttributes } from '@/data/mutations/seriesAttributes';
import { useDecideAccess } from '@/features/decide/useDecideAccess';
import { INCOME_KINDS, kindNameKey } from '@/features/record/activity/IncomeTagChip';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { space } from '@/theme/layout';
import { Chip } from '@/ui/Chip';
import { hapticSelection } from '@/ui/haptics';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { ToggleRow } from '@/ui/ToggleRow';

export interface SeriesIncomeRowsProps {
  series: RecurringSeriesRow;
  householdId: string;
  ownerId: string;
}

export function SeriesIncomeRows({ series, householdId, ownerId }: SeriesIncomeRowsProps): React.JSX.Element | null {
  const t = useT();
  const { v3 } = useDecideAccess();
  const { patch } = usePatchSeriesAttributes(householdId, ownerId);
  const [open, setOpen] = useState(false);
  if (!v3) return null;

  const saved = (stepId: string) =>
    showToast({ kind: 'ordinary', text: { key: 'activity.incomeTag.toastSaved' }, stepId });
  const write = (attributes: { income_kind?: string; counts_as?: 'available' | 'kept' }) => {
    const res = patch([{ series, attributes }], 'incomeTypeSaved', series.name);
    if (res !== null) saved(res.stepId);
  };

  const kind = series.income_kind ?? null;
  const valueText = kind === null ? t('activity.incomeTag.detailNotSet') : t(kindNameKey(kind));
  const title = t('activity.incomeTag.detailRow');
  return (
    <View>
      <Row label={title} value={valueText} chevron onPress={() => setOpen(true)} accessibilityLabel={`${title}, ${valueText}`} />
      <ToggleRow
        label={t('activity.incomeTag.seriesCounts')}
        value={series.counts_as !== 'kept'}
        onChange={(on) => write({ counts_as: on ? 'available' : 'kept' })}
      />
      {open ? (
        <Sheet visible onDismiss={() => setOpen(false)} accessibilityLabel={title}>
          <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={() => setOpen(false)} />
          <SheetScroll contentContainerStyle={styles.column}>
            <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.chips}>
              {INCOME_KINDS.map((k) => (
                <Chip
                  key={k.kind}
                  label={t(k.key)}
                  selected={kind === k.kind}
                  onPress={() => {
                    hapticSelection();
                    write({ income_kind: k.kind });
                    setOpen(false);
                  }}
                />
              ))}
            </View>
          </SheetScroll>
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd, paddingBottom: space.sheetPadBottom },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
