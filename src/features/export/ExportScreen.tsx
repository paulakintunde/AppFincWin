/**
 * 09-18 (D-03, Owner Answer 2): export your own records as CSV. Reads stay open in every plan state, so this screen never
 * checks `writable`; the plan state is read only to tell the analytics event whether the person was locked.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
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

export function ExportScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const plan = usePlanState();
  const kept = useLockedWrites().length;
  const [busy, setBusy] = useState(false);

  const run = async (): Promise<void> => {
    if (busy) return;
    hapticTap();
    setBusy(true);
    try {
      const result = await exportCsv(supabase);
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

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <View style={styles.column} testID="export-screen">
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('plans.export.title')}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('plans.export.body')}</Text>
        {kept > 0 ? (
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('plans.export.savedOnPhoneIncluded')}</Text>
        ) : null}
        <Pill label={t('plans.export.button')} variant="primary" onPress={() => void run()} pending={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapSm },
  column: { gap: space.groupGap, paddingBottom: space.sheetPadBottom },
});
