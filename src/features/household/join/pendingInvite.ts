// 08-18 (D-02, D-38, T-08-64, T-08-67): an invite code that arrived through fincwin://invite waits here until the person is
// signed in, so it survives the sign-in screens. Only a valid code (12 Crockford characters) is ever stored. It expires after
// 7 days (the invite's own life, D-02) and is wiped on sign-out. Nothing here joins anyone: joining is an explicit tap.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normaliseInviteCode } from '@/db/householdInvites';
import { registerWipeHandler } from '@/services/storage/wipe';

export const PENDING_INVITE_KEY = 'fincwin.pendingInvite.v1';
export const PENDING_INVITE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored {
  code: string;
  savedAt: number;
}

// The key is outside the fincwin: prefix the wipe routine sweeps, so it registers its own handler.
registerWipeHandler({
  id: 'household-pending-invite',
  wipe: async () => {
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  },
});

/** Stores the code when it is a valid one. Returns whether anything was stored. */
export async function savePendingInvite(code: string, now: number = Date.now()): Promise<boolean> {
  const normal = normaliseInviteCode(code);
  if (normal === null) return false;
  const value: Stored = { code: normal, savedAt: now };
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(value));
  return true;
}

async function read(now: number): Promise<string | null> {
  const raw = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Stored> | null;
    if (!parsed || typeof parsed.code !== 'string' || typeof parsed.savedAt !== 'number') return null;
    if (now - parsed.savedAt >= PENDING_INVITE_MAX_AGE_MS) return null;
    return normaliseInviteCode(parsed.code);
  } catch {
    return null;
  }
}

/** The waiting code, if there is one that is still fresh. Does not clear it. A stale or damaged entry is cleared. */
export async function peekPendingInvite(now: number = Date.now()): Promise<string | null> {
  const code = await read(now);
  if (code === null) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  return code;
}

/** The waiting code, cleared as it is returned. */
export async function takePendingInvite(now: number = Date.now()): Promise<string | null> {
  const code = await read(now);
  await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  return code;
}

/** Groups what is typed or pasted as XXXX-XXXX-XXXX while it is still partial (O reads as 0, I and L as 1). */
export function formatTypedCode(input: string): string {
  const flat = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .slice(0, 12);
  return [flat.slice(0, 4), flat.slice(4, 8), flat.slice(8, 12)].filter((p) => p.length > 0).join('-');
}
