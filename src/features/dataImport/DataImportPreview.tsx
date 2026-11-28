/**
 * 10-18 (DAT-03, UI-SPEC section 9 item 5): the preview of a chosen file. A summary card, then one row per file row with
 * its key fields. A row that needs a look carries the Check badge and the plain reason; a row that already exists says so
 * and is skipped unless its switch is turned on.
 * 10-review (D-1): each row shows its main amount formatted as money, so a file in the wrong unit (100x) is visible
 * before anything is written.
 * 10-review-2 (D-1, D-2; owner 2026-11-28): reasons stay one short line per row ('More decimals than USD has'); the
 * longer explanation shows once above the rows. An amount nothing could settle keeps its row ready, with a Check badge
 * and 'Read as $1,234' so the person sees how it was read.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import type { DataTable } from '@/engine/dataCsv';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { useFormatAmount } from '@/features/record/import/importUi';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, rowHeight, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { RowReport } from './importRows';

export interface DataImportPreviewProps {
  table: DataTable;
  reports: readonly RowReport[];
  overrides: ReadonlySet<number>;
  onToggle: (index: number, on: boolean) => void;
  /** 10-review-2 (D-1): the file was read as an older FincWin export (amounts in cents); said once above the rows. */
  oldExport?: boolean;
}

const AMOUNT_ISSUES = new Set(['bad-amount', 'extra-decimals', 'mixed-format']);

const ISSUE_KEY: Record<string, string> = {
  'name-missing': 'nameMissing',
  'currency-missing': 'currencyMissing',
  'bad-amount': 'badAmount',
  'extra-decimals': 'extraDecimals',
  'mixed-format': 'mixedFormat',
  'bad-date': 'badDate',
  'bad-choice': 'badChoice',
  'bad-id': 'badId',
  'out-of-range': 'outOfRange',
};

/** 10-review (D-1): the amount a row is mostly about, shown formatted in the preview. */
const MAIN_AMOUNT: Readonly<Record<DataTable, string>> = {
  accounts: 'opening_balance',
  savings_goals: 'target',
  debts: 'balance',
  holdings: 'value',
};

export function DataImportPreview({ table, reports, overrides, onToggle, oldExport = false }: DataImportPreviewProps) {
  const t = useT() as unknown as (key: string, options?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const fmt = useFormatAmount();
  const look = reports.filter((r) => r.state === 'check').length;
  const ready = reports.filter((r) => r.state === 'ready' || (r.state === 'exists' && overrides.has(r.row.index))).length;

  const amountsToFix = reports.some((r) => r.state === 'check' && AMOUNT_ISSUES.has(r.issue ?? ''));

  const reason = (r: RowReport): string => {
    return t(`system.ownData.dataImport.${ISSUE_KEY[r.issue ?? 'out-of-range'] ?? 'outOfRange'}`, {
      currency: r.row.values.currency?.trim() ?? '',
    });
  };

  /** 10-review-2 (D-2): the amount a row was read as, for a value nothing in the file could settle. */
  const readAs = (r: RowReport): string | null => {
    const note = r.row.notes[0];
    const value = note ? r.row.money[note.column] : null;
    const currency = r.row.values.currency?.trim() ?? '';
    if (value === null || value === undefined || currency === '') return null;
    return t('system.ownData.dataImport.readAs', { amount: fmt.amount(value, currency) });
  };

  return (
    <View style={styles.column} testID="import-preview">
      <View style={[styles.summary, { backgroundColor: colors.surface }]}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }} testID="import-summary">
          {t('system.ownData.dataImport.previewSummary', { ready, look })}
        </Text>
      </View>
      {oldExport ? (
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }} testID="import-old-export">
          {t('system.ownData.dataImport.oldExportNote')}
        </Text>
      ) : null}
      {amountsToFix ? (
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }} testID="import-amounts-note">
          {t('system.ownData.dataImport.amountsNote')}
        </Text>
      ) : null}
      {reports.map((r) => {
        const name = r.row.values.name ?? '';
        const sub = [r.row.values.currency, r.row.values.kind ?? r.row.values.type].filter(Boolean).join(' · ');
        const amount = r.row.money[MAIN_AMOUNT[table]];
        const currency = r.row.values.currency?.trim() ?? '';
        const readLine = r.state !== 'check' ? readAs(r) : null;
        return (
          <View key={`${table}-${r.row.index}`} style={[styles.row, { backgroundColor: colors.surface }]} testID={`import-row-${r.row.index}`}>
            <View style={styles.top}>
              <View style={styles.main}>
                <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{name}</Text>
                {sub ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{sub}</Text> : null}
              </View>
              {amount !== null && amount !== undefined && currency !== '' ? (
                <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }} testID={`import-row-${r.row.index}-amount`}>
                  {fmt.amount(amount, currency)}
                </Text>
              ) : null}
            </View>
            {r.state === 'check' ? (
              <View style={styles.note}>
                <StatusBadge status="check" testID={`import-row-${r.row.index}-check`} />
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{reason(r)}</Text>
              </View>
            ) : null}
            {readLine !== null ? (
              <View style={styles.note} testID={`import-row-${r.row.index}-read-as`}>
                <StatusBadge status="check" />
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{readLine}</Text>
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
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: space.gapSm },
  main: { gap: space.gapSm, flexShrink: 1 },
  note: { gap: space.gapSm },
});
