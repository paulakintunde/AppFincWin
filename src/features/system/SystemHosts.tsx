// 10-27: Phase 10 boot bookkeeping, mounted once in the signed-in layout next to HouseholdRealtimeHost. Renders nothing.
// Signed in: creates the Android alert channels, keeps the saved time zone in step with the phone, refreshes the push token
// when notification permission is already granted (it never asks, D-09), and records this phone in the device list.
// Signed out: does nothing.
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { ensureAlertChannels } from '@/features/alerts/channels';
import { refreshPushTokenIfGranted } from '@/features/alerts/pushRegistration';
import { useAlertTimeZoneSync } from '@/features/alerts/useAlertTimeZoneSync';
import { useDeviceHeartbeat } from '@/services/devices/useDeviceHeartbeat';

function SignedInSystemHost({ userId }: { userId: string }) {
  useAlertTimeZoneSync(userId);
  useDeviceHeartbeat(userId);
  useEffect(() => {
    // Channels first, so a token refresh never races the channel a notification needs.
    void ensureAlertChannels().then(() => refreshPushTokenIfGranted());
  }, [userId]);
  return null;
}

export function SystemHosts() {
  const { user } = useAuth();
  if (!user?.id) return null;
  return <SignedInSystemHost userId={user.id} />;
}
