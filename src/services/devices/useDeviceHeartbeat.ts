// 10-12 (ACC-06): records this phone in the devices list on launch and when the app comes back to the
// foreground, at most once every 15 minutes, and never while offline.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { touchMyDevice } from '@/db/devices';
import { deviceInfo } from './deviceInfo';

export const HEARTBEAT_MIN_GAP_MS = 15 * 60 * 1000;

type GetClient = () => Promise<Parameters<typeof touchMyDevice>[0]>;
// Lazy: the real client reads its env at import time (see signOut.ts, T-00-18). Tests pass their own getClient.
const defaultClient: GetClient = async () => (await import('@/services/supabase')).supabase;

export function useDeviceHeartbeat(userId?: string, getClient: GetClient = defaultClient): void {
  const lastTouch = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const touch = async (): Promise<void> => {
      if (!onlineManager.isOnline()) return;
      const now = Date.now();
      if (lastTouch.current !== null && now - lastTouch.current < HEARTBEAT_MIN_GAP_MS) return;
      lastTouch.current = now;
      try {
        const supabase = await getClient();
        if (cancelled) return;
        await touchMyDevice(supabase, deviceInfo());
      } catch {
        // Best effort: a failed heartbeat retries on the next foreground.
        lastTouch.current = null;
      }
    };

    void touch();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void touch();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [userId]);
}
