/**
 * 10-18 (DAT-03, UI-SPEC section 9): Import from CSV for accounts, goals, debts and investments. A file saved by Export
 * works as it is; the template carries the export columns and one example row. Nothing is written before the preview.
 * Every accepted row goes through the existing queued create mutations, so it works offline; an import that would pass the
 * 500-change queue cap is refused up front with the QueueNote.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useAccounts } from '@/data/queries/accounts';
import { useDebts } from '@/data/queries/decide';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { useHoldingRows } from '@/data/queries/growHoldings';
import { useAddAccount } from '@/data/mutations/accounts';
import { useSaveGoalPlan } from '@/data/mutations/growGoals';
import { useSaveGrowDebt } from '@/data/mutations/growDebts';
import { useAddHolding } from '@/data/mutations/growHoldings';
import { useQueueGuard } from '@/data/sync/useQueueGuard';
import { classifyRows, DATA_CSV_SCHEMAS, parseDataCsv, type DataCsvRow, type DataTable, type RowMatch } from '@/engine/dataCsv';
import { currencyExponent } from '@/engine/money/currencyExponents';
import { useRecordContext } from '@/features/record/useRecordContext';
import { QueueNote } from '@/features/record/entry/QueueNote';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { showToast } from '@/state/undoToast';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Text } from '@/ui/Text';
import { WarningCard } from '@/ui/WarningCard';
import { hapticMilestone, hapticTap } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { pickCsvText, saveTemplateFile } from './files';
import { reportRows, toCreateInputs, type ImportContext } from './importRows';
import { buildTemplate, templateColumns, TEMPLATE_FILE } from './templates';
import { DataImportPreview } from './DataImportPreview';

const TABLES: readonly { key: DataTable; label: string; kind: string }[] = [
  { key: 'accounts', label: 'segmentAccounts', kind: 'kindAccounts' },
  { key: 'savings_goals', label: 'segmentGoals', kind: 'kindGoals' },
  { key: 'debts', label: 'segmentDebts', kind: 'kindDebts' },
  { key: 'holdings', label: 'segmentInvestments', kind: 'kindInvestments' },
];

interface Loaded {
  table: DataTable;
  rows: DataCsvRow[];
  matches: RowMatch[];
}

export function DataImportScreen() {
  const t = useT() as unknown as (key: string, options?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const rc = useRecordContext();
  const guard = useQueueGuard();
  const [table, setTable] = useState<DataTable>('accounts');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [overrides, setOverrides] = useState<ReadonlySet<number>>(new Set());

  const householdId = rc.householdId ?? undefined;
  const userId = rc.userId ?? undefined;
  const accounts = useAccounts(householdId).data;
  const goals = useSavingsGoalRows(userId, householdId).data;
  const debts = useDebts(householdId).data;
  const holdings = useHoldingRows(userId, householdId).data;
  const addAccount = useAddAccount();
  const saveGoal = useSaveGoalPlan();
  const saveDebt = useSaveGrowDebt();
  const addHolding = useAddHolding();

  const ctx: ImportContext | null =
    rc.householdId !== null && rc.userId !== null
      ? { householdId: rc.householdId, ownerId: rc.userId, homeCurrency: rc.homeCurrency, today: rc.today }
      : null;

  const existing = (which: DataTable): { id: string; name: string }[] => {
    const list = which === 'accounts' ? accounts : which === 'savings_goals' ? goals : which === 'debts' ? debts : holdings;
    return (list ?? []).map((r) => ({ id: r.id, name: r.name }));
  };

  const reports = useMemo(
    () => (loaded && ctx ? reportRows(loaded.table, loaded.rows, loaded.matches, ctx) : []),
    // ctx is rebuilt each render from stable primitives
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, rc.householdId, rc.userId, rc.today],
  );

  const choose = (key: string) => {
    setTable(key as DataTable);
    setLoaded(null);
    setUnreadable(false);
    setBlocked(false);
    setOverrides(new Set());
  };

  const pick = async (): Promise<void> => {
    hapticTap();
    setBlocked(false);
    setOverrides(new Set());
    const picked = await pickCsvText();
    if (picked.kind === 'canceled') return;
    if (picked.kind === 'unreadable') {
      setLoaded(null);
      setUnreadable(true);
      return;
    }
    const parsed = parseDataCsv(table, picked.text, currencyExponent);
    if (!parsed.ok) {
      setLoaded(null);
      setUnreadable(true);
      return;
    }
    setUnreadable(false);
    setLoaded({ table, rows: parsed.rows, matches: classifyRows(parsed.rows, existing(table)) });
  };

  const saveTemplate = async (): Promise<void> => {
    hapticTap();
    try {
      const result = await saveTemplateFile(TEMPLATE_FILE[table], buildTemplate(table, rc.homeCurrency));
      if (result !== 'cancelled') showToast({ kind: 'info', text: { key: 'system.ownData.dataImport.templateSaved' } });
    } catch {
      showToast({ kind: 'info', text: { key: 'sync.exportFailed' } });
    }
  };

  const accepted = loaded && ctx ? toCreateInputs(loaded.table, loaded.rows, loaded.matches, ctx, overrides) : [];

  const run = (): void => {
    if (!loaded || !ctx || accepted.length === 0) return;
    if (!guard.canAdd(accepted.length)) {
      setBlocked(true);
      return;
    }
    let added = 0;
    for (const c of accepted) {
      try {
        if (c.table === 'accounts') addAccount.add(c.input);
        else if (c.table === 'savings_goals') saveGoal.save({ ...c.input, series: null });
        else if (c.table === 'debts') saveDebt.save(c.input);
        else addHolding.add(c.input);
        added += 1;
      } catch {
        // A row the create refuses is left out; the preview already screens for these.
      }
    }
    hapticMilestone();
    const kind = TABLES.find((x) => x.key === loaded.table)?.kind ?? 'kindAccounts';
    showToast({
      kind: 'info',
      text: { key: 'system.ownData.dataImport.addedToast', params: { count: added, kind: t(`system.ownData.dataImport.${kind}`) } },
    });
    setLoaded(null);
    setOverrides(new Set());
  };

  const columns = templateColumns(table);
  const required = DATA_CSV_SCHEMAS[table].required;
  const shown = [...required, ...columns.filter((c) => !required.includes(c))].slice(0, 6).join(', ');

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <View style={styles.column} testID="data-import-screen">
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('system.ownData.dataImport.title')}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('system.ownData.dataImport.intro')}</Text>
        <SegmentedControl
          accessibilityLabel={t('system.ownData.dataImport.title')}
          value={table}
          onChange={choose}
          options={TABLES.map((x) => ({ key: x.key, label: t(`system.ownData.dataImport.${x.label}`) }))}
        />
        <View style={[styles.template, { backgroundColor: colors.fill1 }]} testID="import-template">
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
            {t('system.ownData.dataImport.templateColumns', { columns: `${shown}, ...` })}
          </Text>
          <Pill label={t('system.ownData.dataImport.saveTemplate')} variant="secondary" onPress={() => void saveTemplate()} />
        </View>
        <Pill label={t('system.ownData.dataImport.chooseFile')} variant="primary" onPress={() => void pick()} />
        {unreadable ? (
          <View testID="import-unreadable">
            <WarningCard tone="soft" title={t('system.ownData.dataImport.unreadable')} value="" body={[]} />
          </View>
        ) : null}
        <QueueNote queued={guard.queued} state={blocked ? 'blocked' : guard.state} />
        {loaded ? (
          <>
            <DataImportPreview
              table={loaded.table}
              reports={reports}
              overrides={overrides}
              onToggle={(index, on) =>
                setOverrides((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(index);
                  else next.delete(index);
                  return next;
                })
              }
            />
            <Pill
              label={t('system.ownData.dataImport.importRows', { count: accepted.length })}
              variant="primary"
              disabled={accepted.length === 0}
              onPress={run}
            />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapSm },
  column: { gap: space.groupGap, paddingBottom: space.sheetPadBottom },
  template: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
});
