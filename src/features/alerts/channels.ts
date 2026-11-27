// 10-22 (ENV-19, D-09): the two Android notification channels alerts use. Creating a channel never asks for permission.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { i18n } from '@/i18n';

export const ALERTS_CHANNEL = 'alerts';
export const DIGEST_CHANNEL = 'digest';

let ensured = false;

/** Android only, once per launch. iOS has no channels. Never requests permission. */
export async function ensureAlertChannels(): Promise<void> {
  if (Platform.OS !== 'android' || ensured) return;
  ensured = true;
  try {
    await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL, {
      // 10-review (D-7): channel names come from the locale files
      name: i18n.t('system.alerts.channelAlerts'),
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync(DIGEST_CHANNEL, {
      name: i18n.t('system.alerts.channelDigest'),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    ensured = false;
  }
}

/** Test seam. */
export function resetAlertChannelsForTest(): void {
  ensured = false;
}
