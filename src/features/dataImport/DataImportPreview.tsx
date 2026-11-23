/**
 * 10-18 (DAT-03, UI-SPEC section 9 item 5): the preview of a chosen file. A summary card, then one row per file row with
 * its key fields. A row that needs a look carries the Check badge and the plain reason; a row that already exists says so
 * and is skipped unless its switch is turned on.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import type { DataTable } from '@/engine/dataCsv';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, rowHeight, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { RowReport } from './importRows';

export interface DataImportPreviewProps {
  table: DataTable;
  reports: readonly RowReport[];
  overrides: ReadonlySet<number>;
  onToggle: (index: number, on: boolean) => void;
}

const ISSUE_KEY: Record<string, string> = {
  'name-missing': 'nameMissing',
  'currency-missing': 'currencyMissing',
  'bad-amount': 'badAmount',
  'bad-date': 'badDate',
  'bad-choice': 'badChoice',
  'bad-id': 'badId',
  'out-of-range': 'outOfRange',
};

export function DataImportPreview({ table, reports, overrides, onToggle }: DataImportPreviewProps) {
  const t = useT() as unknown as (key: string, options?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const look = reports.filter((r) => r.state === 'check').length;
  const ready = reports.filter((r) => r.state === 'ready' || (r.state === 'exists' && overrides.has(r.row.index))).length;

  const reason = (r: RowReport): string => {
    if (r.issue === 'too-many-decimals') {
      return t('system.ownData.dataImport.tooManyDecimals', { currency: r.row.values.currency ?? '' });
    }
    return t(`system.ownData.dataImport.${ISSUE_KEY[r.issue ?? 'out-of-range'] ?? 'outOfRange'}`);
  };

  return (
    <View style={styles.column} testID="import-preview">
      <View style={[styles.summary, { backgroundColor: colors.surface }]}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }} testID="import-summary">
          {t('system.ownData.dataImport.previewSummary', { ready, look })}
        </Text>
      </View>
      {reports.map((r) => {
        const name = r.row.values.name ?? '';
        const sub = [r.row.values.currency, r.row.values.kind ?? r.row.values.type].filter(Boolean).join(' · ');
        return (
          <View key={`${table}-${r.row.index}`} style={[styles.row, { backgroundColor: colors.surface }]} testID={`import-row-${r.row.index}`}>
            <View style={styles.main}>
              <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{name}</Text>
              {sub ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{sub}</Text> : null}
            </View>
            {r.state === 'check' ? (
              <View style={styles.note}>
                <StatusBadge status="check" testID={`import-row-${r.row.index}-check`} />
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{reason(r)}</Text>
              </View>
            ) : null}
            {r.state === 'exists' ? (
              <View style={styles.note}>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('system.ownData.dataImport.alreadyExists')}</Text>
                <ToggleRow
                  label={t('system.ownData.dataImport.importAnyway')}
                  value={overrides.has(r.row.index)}
                  onChange={(on) => onToggle(r.row.index, on)}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
  summary: { borderRadius: radii.card, padding: space.cardPad },
  row: { borderRadius: radii.card, padding: space.cardPad, minHeight: rowHeight.two, gap: space.gapSm },
  main: { gap: space.gapSm },
  note: { gap: space.gapSm },
});
