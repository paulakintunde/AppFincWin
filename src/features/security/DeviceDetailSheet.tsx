// 10-12 (ACC-06/07): one device's detail: when it signed in, when it was last active, and the sign-out action.
// The action is neutral (not danger): it ends a session, it does not delete records.
import React from 'react';
import { useT } from '@/i18n';
import { DetailSheet } from '@/ui/DetailSheet';
import { LabelValueRow } from '@/ui/LabelValueRow';
import { Pill } from '@/ui/Pill';
import type { DeviceInfo } from '@/db/devices';
import { deviceName, formatLastActive } from './DeviceRow';

export interface DeviceDetailSheetProps {
  device: DeviceInfo | null;
  locale: string;
  offline: boolean;
  onSignOut: (device: DeviceInfo) => void;
  onDismiss: () => void;
}

export function DeviceDetailSheet({ device, locale, offline, onSignOut, onDismiss }: DeviceDetailSheetProps) {
  const t = useT();
  const name = device ? deviceName(device, t('system.security.unnamedDevice')) : '';
  return (
    <DetailSheet
      visible={device !== null}
      onDismiss={onDismiss}
      accessibilityLabel={name}
      title={name}
      actions={
        device ? (
          <Pill
            label={t('system.security.signOutThis')}
            variant="secondary"
            disabled={offline}
            onPress={() => onSignOut(device)}
            accessibilityLabel={t(device.isCurrent ? 'system.security.a11yThisDevice' : 'system.security.a11yDevice', {
              device: device.model === '' ? t('system.security.unnamedDevice') : device.model,
            })}
          />
        ) : undefined
      }
    >
      {device ? (
        <>
          <LabelValueRow label={t('system.security.signedIn')} value={formatLastActive(device.signedInAt, locale)} />
          <LabelValueRow label={t('system.security.lastActiveLabel')} value={formatLastActive(device.lastActive, locale)} />
        </>
      ) : null}
    </DetailSheet>
  );
}
