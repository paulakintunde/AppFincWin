// 10-22 (ENV-19 client side, D-09): notification permission and push-token registration.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/services/supabase';
import { ensureAlertChannels } from './channels';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

interface OsPermission {
  granted?: boolean;
  status?: string;
  canAskAgain?: boolean;
}

function toPermission(p: OsPermission): PushPermission {
  if (p.granted === true || p.status === 'granted') return 'granted';
  if (p.status === 'undetermined' || (p.status === undefined && p.canAskAgain !== false)) return 'undetermined';
  return 'denied';
}

/** Reads the OS answer without asking. Safe to call when a screen opens. */
export async function getPushPermission(): Promise<PushPermission> {
  try {
    return toPermission(await Notifications.getPermissionsAsync());
  } catch {
    return 'undetermined';
  }
}

/**
 * The only place Phase 10 asks for notification permission (D-09). Called only after the person switched an alert on and
 * pressed Continue on the pre-ask. When granted, registers this device's Expo push token to the signed-in person.
 */
export async function requestPushPermissionAndRegister(): Promise<'granted' | 'denied'> {
  let current: OsPermission = await Notifications.getPermissionsAsync();
  const first = toPermission(current);
  if (first === 'undetermined' || (first === 'denied' && current.canAskAgain === true)) {
    current = await Notifications.requestPermissionsAsync();
  }
  if (toPermission(current) !== 'granted') return 'denied';

  await ensureAlertChannels();
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return 'denied';
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  } catch {
    // Permission is granted; registration is tried again the next time the person switches an alert on.
  }
  return 'granted';
}
