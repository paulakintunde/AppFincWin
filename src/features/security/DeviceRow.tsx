// 10-12 (ACC-06): one signed-in device. Name is model and OS, the second line says when it was last active.
// The current device carries a "This device" badge. No IP address, place or amount is ever shown.
import React from 'react';
import { useT } from '@/i18n';
import { Row } from '@/ui/Row';
import { IconTile } from '@/ui/icons/IconTile';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { useTheme } from '@/theme/ThemeProvider';
import type { DeviceInfo } from '@/db/devices';

const ACTIVE_NOW_MS = 5 * 60 * 1000;

export function deviceName(d: Pick<DeviceInfo, 'model' | 'os'>, unnamed: string): string {
  if (d.model === '') return unnamed;
  return d.os === '' ? d.model : `${d.model} · ${d.os}`;
}

export function formatLastActive(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface DeviceRowProps {
  device: DeviceInfo;
  locale: string;
  now?: number;
  onPress: () => void;
}

export function DeviceRow({ device, locale, now: nowProp, onPress }: DeviceRowProps) {
  // Date.now() is impure, so it is read once at mount (lazy state init), not on every render.
  const [mountedAt] = React.useState(Date.now);
  const now = nowProp ?? mountedAt;
  const t = useT();
  const { colors } = useTheme();
  const name = deviceName(device, t('system.security.unnamedDevice'));
  const active = now - new Date(device.lastActive).getTime() < ACTIVE_NOW_MS;
  const sub = active
    ? t('system.security.activeNow')
    : t('system.security.lastActive', { when: formatLastActive(device.lastActive, locale) });
  const shortName = device.model === '' ? t('system.security.unnamedDevice') : device.model;
  const spoken = device.isCurrent
    ? t('system.security.a11yThisDevice', { device: shortName })
    : t('system.security.a11yDevice', { device: shortName });
  return (
    <Row
      label={name}
      sublabel={sub}
      leading={<IconTile icon="laptop" color={colors.inkDim} tint={colors.fill1} />}
      status={device.isCurrent ? <StatusBadge status="thisDevice" /> : undefined}
      chevron
      onPress={onPress}
      accessibilityLabel={`${spoken}. ${name}, ${sub}`}
    />
  );
}
