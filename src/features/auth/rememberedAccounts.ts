// ACC-14 (D-18, D-20, D-21, D-22): the "Continue as" list on the signed-out screen. Holds only
// display name, email, provider and last use -- never a credential or financial data. Stored OUTSIDE
// the 'fincwin:' wipe prefix on purpose so sign-out keeps it; AsyncStorage (not SecureStore) so
// uninstalling the app removes it (iOS Keychain would survive a reinstall). Never sent to
// analytics or error reports.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const REMEMBERED_ACCOUNTS_KEY = 'fincwin-identity:recent-accounts:v1';
export const MAX_REMEMBERED = 3;
const MAX_EMAIL = 320;
const MAX_NAME = 200;

export type SignInProvider = 'google' | 'apple';

export interface RememberedAccount {
  provider: SignInProvider;
  email: string;
  name: string | null;
  lastUsedAt: string;
}

type Identity = Omit<RememberedAccount, 'lastUsedAt'>;

const PROVIDERS: readonly SignInProvider[] = ['google', 'apple'];
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function addRemembered(
  list: readonly RememberedAccount[],
  entry: Identity,
  now: string,
): RememberedAccount[] {
  const rest = list.filter((a) => !(a.provider === entry.provider && same(a.email, entry.email)));
  return [{ provider: entry.provider, email: entry.email, name: entry.name, lastUsedAt: now }, ...rest].slice(
    0,
    MAX_REMEMBERED,
  );
}

export function removeRemembered(
  list: readonly RememberedAccount[],
  provider: SignInProvider,
  email: string,
): RememberedAccount[] {
  return list.filter((a) => !(a.provider === provider && same(a.email, email)));
}

export function parseRemembered(raw: string | null): RememberedAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; accounts?: unknown } | null;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.accounts)) return [];
    const out: RememberedAccount[] = [];
    for (const item of parsed.accounts as unknown[]) {
      if (!item || typeof item !== 'object') return [];
      const a = item as Record<string, unknown>;
      if (typeof a.provider !== 'string' || !PROVIDERS.includes(a.provider as SignInProvider)) return [];
      if (typeof a.email !== 'string' || !a.email.includes('@') || a.email.length > MAX_EMAIL) return [];
      if (a.name !== null && a.name !== undefined && typeof a.name !== 'string') return [];
      if (typeof a.lastUsedAt !== 'string') return [];
      out.push({
        provider: a.provider as SignInProvider,
        email: a.email,
        name: typeof a.name === 'string' ? a.name.slice(0, MAX_NAME) : null,
        lastUsedAt: a.lastUsedAt,
      });
    }
    return out.slice(0, MAX_REMEMBERED);
  } catch {
    return [];
  }
}

export async function loadRememberedAccounts(): Promise<RememberedAccount[]> {
  try {
    return parseRemembered(await AsyncStorage.getItem(REMEMBERED_ACCOUNTS_KEY));
  } catch {
    return [];
  }
}

async function save(list: readonly RememberedAccount[]): Promise<void> {
  try {
    await AsyncStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify({ v: 1, accounts: list }));
  } catch {
    // A list that cannot be saved is not worth interrupting sign-in for.
  }
}

export async function rememberAccount(entry: Identity | null): Promise<void> {
  if (!entry) return;
  const list = await loadRememberedAccounts();
  await save(addRemembered(list, entry, new Date().toISOString()));
}

export async function forgetRememberedAccount(
  provider: SignInProvider,
  email: string,
): Promise<RememberedAccount[]> {
  const next = removeRemembered(await loadRememberedAccounts(), provider, email);
  await save(next);
  return next;
}

export function identityFromUser(
  user: {
    email?: string | null;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  } | null,
): Identity | null {
  if (!user?.email) return null;
  const provider = user.app_metadata?.provider;
  if (provider !== 'google' && provider !== 'apple') return null;
  const meta = user.user_metadata ?? {};
  const name =
    typeof meta.full_name === 'string' && meta.full_name
      ? meta.full_name
      : typeof meta.name === 'string' && meta.name
        ? meta.name
        : null;
  return { provider, email: user.email, name };
}
