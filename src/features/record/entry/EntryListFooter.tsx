// REC-30 (UI-SPEC 5a): the new-entry footer. 'Add to list' (secondary, left) and Save (primary,
// right) share a row; the cap note and the finish-current error sit beneath it.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ListSummary } from '@/engine/entryList';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';

export interface EntryListFooterProps {
  saveLabel: string;
  onSave: () => void;
  saveDisabled?: boolean;
  saveHint?: string;
  onAddToList: () => void;
  addDisabled: boolean;
  capNote: string | null;
  finishError: boolean;
}

export function EntryListFooter(p: EntryListFooterProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Pill label={t('record.sheet.list.add')} variant="secondary" disabled={p.addDisabled} onPress={p.onAddToList} />
        </View>
        <View style={styles.cell}>
          <Pill
            label={p.saveLabel}
            variant="primary"
            disabled={p.saveDisabled}
            accessibilityHint={p.saveHint}
            onPress={p.onSave}
          />
        </View>
      </View>
      {p.capNote ? <Text style={[textRole(pairing, 'label'), { color: colors.inkMuted }]}>{p.capNote}</Text> : null}
      {p.finishError ? (
        <Text style={[textRole(pairing, 'label'), { color: colors.danger }]}>{t('record.sheet.list.finishCurrent')}</Text>
      ) : null}
    </>
  );
}

/** The list header text ("2 in list · £12.50"), shared by the list section and the announcement. */
export function listSummaryText(
  t: ReturnType<typeof useT>,
  summary: ListSummary,
  formatAmount: (minor: number, currency: string) => string,
): string {
  const head = t('record.sheet.list.count', { count: summary.count });
  if (summary.kind === 'single') {
    return head + t('record.sheet.list.total', { amount: formatAmount(summary.total, summary.currency) });
  }
  if (summary.kind === 'split') {
    return (
      head +
      t('record.sheet.list.totalSplit', {
        out: formatAmount(summary.outTotal, summary.currency),
        in: formatAmount(summary.inTotal, summary.currency),
      })
    );
  }
  return head;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.gapSm,
  },
  cell: {
    flex: 1,
  },
});
