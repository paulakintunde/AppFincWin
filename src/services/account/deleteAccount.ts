// 08-22 (D-40, HH-14, store-mandatory in-app deletion): asks the delete-account Edge Function to delete the signed-in user,
// and only after the server confirms does the device sign out and wipe. The function takes the caller from the verified
// token, so nothing here names a user. A failure leaves the account and the device exactly as they were.
import { onlineManager } from '@tanstack/react-query';
import { performSignOut, type SignOutDeps } from '@/features/auth/signOut';
import { setSignOutReason } from '@/features/auth/signOutReason';
import { wipeDeviceData as realWipeDeviceData } from '@/services/storage/wipe';

export type DeleteAccountResult = { ok: true } | { ok: false; reason: 'offline' | 'failed' };

export interface DeleteAccountDeps {
  isOnline: () => boolean;
  invoke: () => Promise<{ data: unknown; error: unknown }>;
  wipeDeviceData: () => Promise<void>;
  signOut: (deps?: Partial<SignOutDeps>) => Promise<void>;
  resetTheme?: () => void;
  /** 10-14: the signed-in user's email, read before the delete call; null when there is none (Apple private relay). */
  getEmail: () => Promise<string | null>;
  forgetGoogle: (email: string) => Promise<void>;
}

async function resolveDeps(overrides?: Partial<DeleteAccountDeps>): Promise<DeleteAccountDeps> {
  // Lazy: the real client reads its env at import time (see signOut.ts).
  const supabase = overrides?.invoke ? null : (await import('@/services/supabase')).supabase;
  return {
    isOnline: overrides?.isOnline ?? (() => onlineManager.isOnline()),
    invoke: overrides?.invoke ?? (() => (supabase as NonNullable<typeof supabase>).functions.invoke('delete-account', { method: 'POST' })),
    wipeDeviceData: overrides?.wipeDeviceData ?? realWipeDeviceData,
    signOut: overrides?.signOut ?? performSignOut,
    resetTheme: overrides?.resetTheme,
    getEmail:
      overrides?.getEmail ??
      (async () => {
        const client = (await import('@/services/supabase')).supabase;
        const { data } = await client.auth.getUser();
        return data?.user?.email ?? null;
      }),
    forgetGoogle: overrides?.forgetGoogle ?? (async (e) => (await import('@/services/auth/google')).forgetGoogleOnAccountDeletion(e)),
  };
}

export async function requestAccountDeletion(overrides?: Partial<DeleteAccountDeps>): Promise<DeleteAccountResult> {
  const deps = await resolveDeps(overrides);
  if (!deps.isOnline()) return { ok: false, reason: 'offline' };

  // 10-14 (D-20, 02.3 D-20): email captured before the user is gone; Google forgotten after the server confirms, before the wipe.
  let email: string | null = null;
  try {
    email = await deps.getEmail();
  } catch {
    email = null;
  }

  let reply: { data: unknown; error: unknown };
  try {
    reply = await deps.invoke();
  } catch {
    return { ok: false, reason: 'failed' };
  }
  const ok = !reply.error && (reply.data as { ok?: boolean } | null)?.ok === true;
  if (!ok) return { ok: false, reason: 'failed' };

  if (email) {
    try {
      await deps.forgetGoogle(email);
    } catch {
      // Never blocks deletion (D-17).
    }
  }
  setSignOutReason('deleted');

  // The user no longer exists: sign out locally (no server call needed), then clear every cache and queued write.
  // performSignOut also wipes; the explicit wipe below is the guarantee when a different signOut is injected.
  await deps.signOut({ resetTheme: deps.resetTheme, wipeDeviceData: deps.wipeDeviceData });
  return { ok: true };
}
