// 10-12 (ACC-06/07): the "Signed-in devices" group of the Security screen (plan 10-27 places it).
// Lists every device the account is signed in on, current device first, and signs out one or all others.
// A signed-out device may keep reading for up to an hour (1-hour access token), and the copy says so.
import React, { useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { useT, i18n } from '@/i18n';
import { useAuth } from '@/features/auth/AuthProvider';
import { performSignOut } from '@/features/auth/signOut';
import { SettingsGroup } from '@/features/you/components/SettingsGroup';
import { useDevices, useRevokeDevice, useSignOutOthers } from '@/services/devices/useDevices';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { RiseIn } from '@/ui/RiseIn';
import { Text } from '@/ui/Text';
import { WarningCard } from '@/ui/WarningCard';
import type { DeviceInfo } from '@/db/devices';
import { DeviceRow, deviceName } from './DeviceRow';
import { DeviceDetailSheet } from './DeviceDetailSheet';

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true
  );
}

export function DevicesSection() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const online = useOnline();
  const devices = useDevices(userId);
  const revoke = useRevokeDevice(userId);
  const signOutOthers = useSignOutOthers(userId);
  const [detail, setDetail] = useState<DeviceInfo | null>(null);
  const [confirm, setConfirm] = useState<DeviceInfo | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const locale = i18n.language;
  const metaStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  const list = devices.data ?? [];
  const others = list.filter((d) => !d.isCurrent);
  const offline = !online;
  const failed = devices.isError || (offline && devices.data === undefined);

  const confirmSignOut = async (): Promise<void> => {
    const target = confirm;
    setConfirm(null);
    setDetail(null);
    if (!target) return;
    if (target.isCurrent) {
      await performSignOut();
      return;
    }
    await revoke.mutateAsync(target.sessionId).catch(() => undefined);
  };

  const confirmSignOutOthers = async (): Promise<void> => {
    const count = others.length;
    setConfirmOthers(false);
    try {
      await signOutOthers.mutateAsync();
      showToast({ kind: 'ordinary', text: { key: 'system.security.signedOutOthersToast', params: { count } } });
    } catch {
      // The list refetches on settle; a failed attempt leaves the devices as they were.
    }
  };

  let body: React.ReactNode;
  if (failed) {
    body = (
      <View style={styles.pad}>
        <WarningCard tone="soft" title={t('system.security.devicesGroup')} value="" body={[t('system.security.loadError')]} />
        <Pill label={t('system.security.tryAgain')} variant="secondary" onPress={() => void devices.refetch()} />
      </View>
    );
  } else if (devices.isLoading || !devices.data) {
    body = [0, 1, 2].map((i) => (
      <View key={i} testID="device-skeleton" style={[styles.skeleton, { backgroundColor: colors.fill1 }]} />
    ));
  } else {
    body = list.map((d) => <DeviceRow key={d.sessionId} device={d} locale={locale} onPress={() => setDetail(d)} />);
  }

  const signOutOthersRow =
    !failed && devices.data ? (
      <Row
        label={t('system.security.signOutOthers')}
        sublabel={others.length === 0 ? t('system.security.noOthers') : undefined}
        disabled={others.length === 0 || offline}
        onPress={() => setConfirmOthers(true)}
      />
    ) : null;

  return (
    <View>
      <RiseIn>
        <SettingsGroup title={t('system.security.devicesGroup')}>
          {body}
          {signOutOthersRow}
        </SettingsGroup>
      </RiseIn>
      <Text style={[metaStyle, styles.meta]}>{t('system.security.devicesIntro')}</Text>
      <Text style={[metaStyle, styles.meta]}>{t('system.security.revokeDelayMeta')}</Text>

      <DeviceDetailSheet
        device={detail}
        locale={locale}
        offline={offline}
        onSignOut={(d) => setConfirm(d)}
        onDismiss={() => setDetail(null)}
      />
      <ConfirmSheet
        visible={confirm !== null}
        title={t('system.security.signOutDeviceTitle', {
          device: confirm ? deviceName(confirm, t('system.security.unnamedDevice')) : '',
        })}
        body={confirm?.isCurrent ? t('system.security.signOutThisBody') : t('system.security.signOutDeviceBody')}
        cancelLabel={t('system.security.cancel')}
        confirmLabel={t('system.security.signOutConfirm')}
        onConfirm={() => void confirmSignOut()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmSheet
        visible={confirmOthers}
        title={t('system.security.signOutOthersTitle')}
        body={t('system.security.signOutOthersBody', { count: others.length })}
        cancelLabel={t('system.security.cancel')}
        confirmLabel={t('system.security.signOutOthersConfirm')}
        onConfirm={() => void confirmSignOutOthers()}
        onCancel={() => setConfirmOthers(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingVertical: space.gapSm, gap: space.gapSm },
  skeleton: { height: 64, borderRadius: radii.card, marginVertical: space.gapSm },
  meta: { marginTop: space.gapSm },
});
