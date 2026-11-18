// 08.1-05 (APP-21): the "off fast" switch. app_config.decide_off is read like min_supported_version (anon-readable, no client
// write grant). Fail-open: a failed or slow read keeps the last known value; a first-ever failed read means on (Q6).
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MinVersionClient } from '@/features/system/minVersion';

export const DECIDE_OFF_CACHE_KEY = 'fincwin:decide-off';
export const DECIDE_OFF_REFRESH_MS = 15 * 60 * 1000;
const APP_CONFIG_KEY = 'decide_off';
const DEFAULT_TIMEOUT_MS = 3000;

/** The raw server value, or null on any failure (error, missing row, timeout, thrown). */
export async function fetchDecideOff(client?: MinVersionClient, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string | null> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  try {
    const active: MinVersionClient = client ?? ((await import('@/services/supabase')).supabase as unknown as MinVersionClient);
    const query = Promise.resolve(active.from('app_config').select('value').eq('key', APP_CONFIG_KEY).maybeSingle());
    const timeout = new Promise<never>((_resolve, reject) => {
      handle = setTimeout(() => reject(new Error('fetchDecideOff: timed out')), timeoutMs);
    });
    const { data, error } = await Promise.race([query, timeout]);
    if (error || !data) return null;
    return data.value;
  } catch {
    return null;
  } finally {
    if (handle) clearTimeout(handle);
  }
}

export interface DecideServerSwitch {
  off: boolean;
}

export function useDecideServerSwitch(client?: MinVersionClient): DecideServerSwitch {
  const [off, setOff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let latest = 0;
    let lastRead = 0;
    let serverAnswered = false;

    function check(): void {
      const id = ++latest;
      lastRead = Date.now();
      fetchDecideOff(client)
        .then(async (value) => {
          if (cancelled || id !== latest) return;
          if (value === null) return; // a failed read keeps the last known value
          serverAnswered = true;
          setOff(value === 'true');
          await AsyncStorage.setItem(DECIDE_OFF_CACHE_KEY, value).catch(() => undefined);
        })
        .catch(() => undefined);
    }

    // The cache only seeds the first paint; a server answer always wins over it.
    AsyncStorage.getItem(DECIDE_OFF_CACHE_KEY)
      .then((cached) => {
        if (!cancelled && !serverAnswered && cached === 'true') setOff(true);
      })
      .catch(() => undefined);

    check();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && Date.now() - lastRead >= DECIDE_OFF_REFRESH_MS) check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [client]);

  return { off };
}
