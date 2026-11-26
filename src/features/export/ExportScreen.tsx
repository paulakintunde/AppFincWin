/**
 * 09-18 (D-03, Owner Answer 2): export your own records as CSV. Reads stay open in every plan state, so this screen never
 * checks `writable`; the plan state is read only to tell the analytics event whether the person was locked.
 *
 * 10-17 (DAT-02): lists every file that will be written and links to Import from CSV. Opened with `months` (the Archive
 * list's "Export the archive"), it exports only those months and says so.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { i18n, useT } from '@/i18n';
import { supabase } from '@/services/supabase';
import { getAnalytics } from '@/services/analytics';
import { showToast } from '@/state/undoToast';
import { useLockedWrites } from '@/data/sync/lockedWrites';
import { usePlanState } from '@/features/plans/usePlanState';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { hapticTap } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { exportCsv } from './csvExport';
import { exportFileNames, SERVER_RECORDS_FILE } from './exportFiles';

// Cast because Expo Router's generated route types may not know the route yet (built in 10-18).
const DATA_IMPORT_HREF = '/data-import' as Href;

export interface ExportScreenProps {
  /** 'YYYY-MM' list from the route; absent or empty means the full export. */
  months?: readonly string[];
}

function monthsText(months: readonly string[], locale: string): string {
  const labels = months.map((m) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1),
    ),
  );
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(labels);
}

export function ExportScreen({ months }: ExportScreenProps = {}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const plan = usePlanState();
  const kept = useLockedWrites().length;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const filtered = months !== undefined && months.length > 0;
  const files = useMemo(() => exportFileNames(months), [months]);

  const run = async (): Promise<void> => {
    if (busy) return;
    hapticTap();
    setBusy(true);
    try {
      const result = await (filtered ? exportCsv(supabase, { months }) : exportCsv(supabase));
      if (result !== 'cancelled') {
        getAnalytics().track('csv_exported', { locked: !plan.writable });
        showToast({ kind: 'info', text: { key: 'plans.export.done' } });
      }
    } catch {
      showToast({ kind: 'info', text: { key: 'sync.exportFailed' } });
    } finally {
      setBusy(false);
    }
  };

  const fileLabel = (name: string): string => (name === SERVER_RECORDS_FILE ? `${name}: ${t('system.ownData.exportFiles.serverRecords')}` : name);

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <View style={styles.column} testID="export-screen">
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('plans.export.title')}
        </Text>
        {filtered ? (
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'body'), color: colors.ink }} testID="export-scope">
            {t('system.archive.exportScope', { months: monthsText(months, i18n.language || 'en') })}
          </Text>
        ) : null}
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('plans.export.body')}</Text>
        {kept > 0 && !filtered ? (
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('plans.export.savedOnPhoneIncluded')}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((o) => !o)}
          testID="export-files-toggle"
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>
            {open ? t('system.ownData.exportFiles.hide') : t('system.ownData.exportFiles.show', { count: files.length })}
          </Text>
        </Pressable>
        {open ? (
          <View testID="export-files">
            <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('system.ownData.exportFiles.intro')}</Text>
            {files.map((name) => (
              <Text key={name} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                {fileLabel(name)}
              </Text>
            ))}
          </View>
        ) : null}
        <Pill label={t('plans.export.button')} variant="primary" onPress={() => void run()} pending={busy} />
        <Pressable accessibilityRole="link" onPress={() => router.push(DATA_IMPORT_HREF)} testID="export-import-link">
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('system.ownData.exportFiles.importLink')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapSm },
  column: { gap: space.groupGap, paddingBottom: space.sheetPadBottom },
});
