// ACC-03: Apple returns fullName/email only on the very first authorization for a given
// user+app pair -- every later sign-in gets null for both. This file writes whatever arrives
// immediately, before any other logic runs, and never overwrites an existing profile value
// with null (only non-empty fields are ever included in the patch). If the write itself fails
// (offline, transient network error), the payload is queued to AsyncStorage under the
// `fincwin:` prefix (so wipeDeviceData's sweep -- src/services/storage/wipe.ts -- also cleans
// it up on sign-out) and replayed by retryPendingFirstAuthProfile() on next launch.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabase';

export const PENDING_PROFILE_KEY = 'fincwin:pending-apple-profile';

export interface AppleFullName {
  givenName?: string | null;
  familyName?: string | null;
}

interface ProfilePatch {
  full_name?: string;
  email?: string;
}

interface PendingProfile {
  userId: string;
  patch: ProfilePatch;
}

function buildFullName(fullName: AppleFullName | null): string | undefined {
  if (!fullName) return undefined;
  const parts = [fullName.givenName, fullName.familyName].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );
  return parts.length > 0 ? parts.join(' ').trim() : undefined;
}

function buildPatch(fullName: AppleFullName | null, email: string | null): ProfilePatch {
  const patch: ProfilePatch = {};
  const full_name = buildFullName(fullName);
  if (full_name) patch.full_name = full_name;
  if (email) patch.email = email;
  return patch;
}

async function applyPatch(userId: string, patch: ProfilePatch): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;

  if (patch.full_name) {
    await supabase.auth.updateUser({ data: { full_name: patch.full_name } });
  }
}

/**
 * Builds a patch from whatever Apple actually returned and writes it immediately. A no-op
 * when Apple returned nothing new (every subsequent sign-in). Never throws: a failed write is
 * queued for retryPendingFirstAuthProfile() rather than surfaced to the caller, since Apple's
 * data is unrecoverable through the sign-in flow itself and must not block the sign-in.
 */
export async function persistFirstAuthProfile(
  userId: string,
  fullName: AppleFullName | null,
  email: string | null
): Promise<void> {
  const patch = buildPatch(fullName, email);
  if (Object.keys(patch).length === 0) return;

  try {
    await applyPatch(userId, patch);
  } catch {
    const pending: PendingProfile = { userId, patch };
    await AsyncStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(pending));
  }
}

/**
 * Replays a pending profile write queued by a prior failed persistFirstAuthProfile() call.
 * Clears the key only on success; a repeated failure leaves it in place for the next call
 * (e.g. the next app launch) to retry again.
 */
export async function retryPendingFirstAuthProfile(): Promise<void> {
  const raw = await AsyncStorage.getItem(PENDING_PROFILE_KEY);
  if (!raw) return;

  let pending: PendingProfile;
  try {
    pending = JSON.parse(raw) as PendingProfile;
  } catch {
    await AsyncStorage.removeItem(PENDING_PROFILE_KEY);
    return;
  }

  try {
    await applyPatch(pending.userId, pending.patch);
    await AsyncStorage.removeItem(PENDING_PROFILE_KEY);
  } catch {
    // Left in place -- retried again next time this is called.
  }
}
