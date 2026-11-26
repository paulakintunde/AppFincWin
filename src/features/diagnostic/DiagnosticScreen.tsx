/**
 * 10-17 (DAT-06, UI-SPEC section 10): the diagnostic export. The "What is in it" rows come from DIAGNOSTIC_ROWS (which
 * partition DIAGNOSTIC_FIELDS) and the file is built from the same list, so the person reads exactly what is sent. Nothing
 * is sent automatically: Send opens a confirmation, then the person's own mail app with the text filled in.
 */
import React, { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import * as Application from 'expo-application';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { getDeviceLocale, getDeviceRegion } from '@/services/locale/deviceLocale';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { getFailedWrites } from '@/data/sync/failedWrites';
import { useUserSetup } from '@/features/levels/useUserSetup';
import { usePlanState } from '@/features/plans/usePlanState';
import { SettingsGroup } from '@/features/you/components/SettingsGroup';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { showToast } from '@/state/undoToast';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { DetailSheet } from '@/ui/DetailSheet';
import { LabelValueRow } from '@/ui/LabelValueRow';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { WarningCard } from '@/ui/WarningCard';
import { hapticTap } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { buildDiagnostic, rowCountsFromCache } from './buildDiagnostic';
import { DIAGNOSTIC_FIELDS, DIAGNOSTIC_ROWS, SUPPORT_EMAIL } from './diagnosticFields';

function deviceModel(): string {
  const constants = Platform.constants as { Model?: string; model?: string } | undefined;
  return constants?.Model ?? constants?.model ?? (Platform.OS === 'ios' ? 'iOS device' : 'unknown');
}

export function DiagnosticScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const qc = useQueryClient();
  const sync = useSyncStatus();
  const plan = usePlanState();
  const setup = useUserSetup();
  const [seeOpen, setSeeOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openedAt] = useState(() => Date.now());

  // The cache is read when the screen is shown or the counts change, not on every render.
  const queued = sync.queued;
  const diagnostic = useMemo(
    () =>
      buildDiagnostic({
        appVersion: Application.nativeApplicationVersion ?? 'unknown',
        buildNumber: Application.nativeBuildVersion ?? 'unknown',
        os: `${Platform.OS} ${String(Platform.Version)}`,
        deviceModel: deviceModel(),
        locale: getDeviceLocale(),
        region: getDeviceRegion() ?? null,
        featureLevel: setup.data?.level ?? null,
        planState: plan.status,
        queueSize: queued,
        queueOldestAgeMinutes: sync.oldestPendingAt ? (openedAt - sync.oldestPendingAt) / 60000 : null,
        failedWrites: sync.failed + sync.conflicts,
        lastSyncedAt: sync.lastSyncedAt,
        onlineNow: sync.isOnline,
        recentErrorCodes: getFailedWrites().map((w) => w.code),
        rowCounts: rowCountsFromCache(qc),
      }),
    [qc, openedAt, setup.data?.level, plan.status, queued, sync.oldestPendingAt, sync.failed, sync.conflicts, sync.lastSyncedAt, sync.isOnline],
  );

  const send = async (): Promise<void> => {
    setConfirmOpen(false);
    hapticTap();
    try {
      const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('system.ownData.diagnostic.mailSubject'))}&body=${encodeURIComponent(diagnostic.text)}`;
      await Linking.openURL(url);
      setFailed(false);
      showToast({ kind: 'info', text: { key: 'system.ownData.diagnostic.sentToast' } });
    } catch {
      setFailed(true);
    }
  };

  const saveCopy = async (): Promise<void> => {
    hapticTap();
    try {
      await Share.share({ message: diagnostic.text });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <View style={styles.column} testID="diagnostic-screen">
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('system.ownData.diagnostic.title')}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('system.ownData.diagnostic.intro')}</Text>
        <SettingsGroup title={t('system.ownData.diagnostic.group')}>
          {DIAGNOSTIC_ROWS.filter((row) => row.fields.every((f) => DIAGNOSTIC_FIELDS.includes(f))).map((row) => (
            <LabelValueRow
              key={row.id}
              label={t(`system.ownData.diagnostic.${row.title}`)}
              sub={t(`system.ownData.diagnostic.${row.meta}`)}
              value=""
            />
          ))}
        </SettingsGroup>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('system.ownData.diagnostic.neverMeta')}</Text>
        <Pressable accessibilityRole="link" onPress={() => setSeeOpen(true)} testID="diagnostic-see">
          <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('system.ownData.diagnostic.seeSent')}</Text>
        </Pressable>
        <Pill label={t('system.ownData.diagnostic.sendToSupport')} variant="primary" onPress={() => setConfirmOpen(true)} />
        <Pill label={t('system.ownData.diagnostic.saveCopy')} variant="secondary" onPress={() => void saveCopy()} />
        {failed ? (
          <WarningCard tone="soft" title={t('system.ownData.diagnostic.sendFailed')} value="" body={[]} />
        ) : null}
      </View>
      <DetailSheet
        visible={seeOpen}
        onDismiss={() => setSeeOpen(false)}
        accessibilityLabel={t('system.ownData.diagnostic.seeSent')}
        title={t('system.ownData.diagnostic.seeSent')}
      >
        <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }} testID="diagnostic-text">
          {diagnostic.text}
        </Text>
      </DetailSheet>
      <ConfirmSheet
        visible={confirmOpen}
        title={t('system.ownData.diagnostic.sendTitle')}
        body={t('system.ownData.diagnostic.sendBody')}
        confirmLabel={t('system.ownData.diagnostic.send')}
        cancelLabel={t('system.ownData.diagnostic.cancel')}
        onConfirm={() => void send()}
        onCancel={() => setConfirmOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapSm },
  column: { gap: space.groupGap, paddingBottom: space.sheetPadBottom },
});
