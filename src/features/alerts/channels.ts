// 10-22 (ENV-19, D-09): the two Android notification channels alerts use. Creating a channel never asks for permission.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const ALERTS_CHANNEL = 'alerts';
export const DIGEST_CHANNEL = 'digest';

let ensured = false;

/** Android only, once per launch. iOS has no channels. Never requests permission. */
export async function ensureAlertChannels(): Promise<void> {
  if (Platform.OS !== 'android' || ensured) return;
  ensured = true;
  try {
    await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL, {
      name: 'Alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync(DIGEST_CHANNEL, {
      name: 'Daily summary',
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
