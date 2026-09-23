// ACC-05: the configured Supabase client, with an AppState-driven auto-refresh lifecycle
// so a foregrounded app keeps its session token fresh and a backgrounded one stops polling.
// Device-level "stay signed in across restarts" is proven by 00-19, not here.
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/config/env';
import { LargeSecureStore } from './largeSecureStore';

const env = getEnv();

// Kept under the fincwin: prefix so wipeDeviceData's AsyncStorage sweep (src/services/storage/wipe.ts)
// catches the encrypted session blob too.
export const AUTH_STORAGE_KEY = 'fincwin:auth';

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    storage: new LargeSecureStore(),
    storageKey: AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce', // Apple-on-Android web OAuth (D-11) uses exchangeCodeForSession
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
