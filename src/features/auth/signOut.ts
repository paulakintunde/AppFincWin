// D-15: sign-out warns with the pending-write count when unsynced writes exist, then wipes
// the encrypted session, its key, every fincwin: cache key and queued writes, resets the
// analytics identity and resets the theme; with nothing pending it signs out with no dialog.
// Phase 0 has no write queue yet, so getPendingWriteCount() resolves 0 unless a Phase 1
// handler has registered — the warning path is still fully implemented and tested here with
// an injected count.
//
// T-00-18 (mirrors 00-10's connection.ts pattern): the real Supabase client is resolved via a
// lazy `await import('@/services/supabase')`, never a static top-level import, because
// client.ts calls getEnv() eagerly at module load — a static import here would make this
// module (and every test importing it) throw under Jest, where no EXPO_PUBLIC_* env is set.
// Tests always inject a fake `supabase` dep, so the dynamic import is never reached.
import { getPendingWriteCount as realGetPendingWriteCount, wipeDeviceData as realWipeDeviceData } from '@/services/storage/wipe';
import { getAnalytics } from '@/services/analytics';

export interface SignOutAnalytics {
  disable(): Promise<void>;
}

export interface SignOutSupabase {
  auth: {
    signOut(options: { scope: 'local' }): Promise<{ error: unknown } | void>;
  };
}

export interface SignOutDeps {
  getPendingWriteCount: () => Promise<number>;
  wipeDeviceData: () => Promise<void>;
  analytics: SignOutAnalytics;
  supabase: SignOutSupabase;
  /** Resets the live theme back to defaults — theme.reset() is a React hook value, so the
   * caller (YouScreen) must pass it in; there is no importable default. */
  resetTheme(): void;
}

async function resolveDeps(overrides?: Partial<SignOutDeps>): Promise<SignOutDeps> {
  return {
    getPendingWriteCount: overrides?.getPendingWriteCount ?? realGetPendingWriteCount,
    wipeDeviceData: overrides?.wipeDeviceData ?? realWipeDeviceData,
    analytics: overrides?.analytics ?? getAnalytics(),
    supabase: overrides?.supabase ?? (await import('@/services/supabase')).supabase,
    resetTheme:
      overrides?.resetTheme ??
      (() => {
        /* no default: only meaningful with a real theme.reset() passed in */
      }),
  };
}

export interface RequestSignOutResult {
  needsConfirm: boolean;
  count?: number;
}

/**
 * Checks the pending-write count first. With 0 pending, signs out immediately (no dialog).
 * With writes pending, returns needsConfirm so the caller can show the destructive
 * confirmation dialog and call performSignOut() itself if the user proceeds.
 */
export async function requestSignOut(deps?: Partial<SignOutDeps>): Promise<RequestSignOutResult> {
  const resolved = await resolveDeps(deps);
  const count = await resolved.getPendingWriteCount();
  if (count > 0) {
    return { needsConfirm: true, count };
  }
  await performSignOut(resolved);
  return { needsConfirm: false };
}

/**
 * Runs the D-15 wipe, in order: analytics.disable() (so identity never carries to the next
 * user on a shared device), supabase.auth.signOut({ scope: 'local' }), wipeDeviceData(), then
 * resetTheme(). If the Supabase sign-out call rejects (e.g. offline), the device is still
 * wiped locally and this still resolves rather than rejecting.
 */
export async function performSignOut(deps?: Partial<SignOutDeps>): Promise<void> {
  const resolved = await resolveDeps(deps);

  await resolved.analytics.disable();

  try {
    await resolved.supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Offline or network failure — the local wipe below still removes the session, so the
    // user is effectively signed out on this device regardless.
  }

  await resolved.wipeDeviceData();
  resolved.resetTheme();
}
