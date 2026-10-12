import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_PREFIX, wipeDeviceData } from '@/services/storage/wipe';
import {
  REMEMBERED_ACCOUNTS_KEY,
  addRemembered,
  forgetRememberedAccount,
  identityFromUser,
  loadRememberedAccounts,
  parseRemembered,
  rememberAccount,
  removeRemembered,
  type RememberedAccount,
} from '../rememberedAccounts';

const acct = (email: string, provider: 'google' | 'apple' = 'google') => ({ provider, email, name: 'N' });

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('key', () => {
  it('is outside the wipe prefix', () => {
    expect(REMEMBERED_ACCOUNTS_KEY).toBe('fincwin-identity:recent-accounts:v1');
    expect(REMEMBERED_ACCOUNTS_KEY.startsWith(STORAGE_PREFIX)).toBe(false);
  });
  it('survives wipeDeviceData while other fincwin: keys go', async () => {
    await rememberAccount(acct('a@x.com'));
    await AsyncStorage.setItem('fincwin:other', '1');
    await wipeDeviceData();
    expect((await loadRememberedAccounts()).map((a) => a.email)).toEqual(['a@x.com']);
    expect(await AsyncStorage.getItem('fincwin:other')).toBeNull();
  });
});

describe('list ops', () => {
  it('keeps most recent first, dedupes case-insensitively, max 3', () => {
    let l: RememberedAccount[] = [];
    l = addRemembered(l, acct('a@x.com'), 't1');
    l = addRemembered(l, acct('b@x.com'), 't2');
    l = addRemembered(l, acct('A@X.com'), 't3');
    expect(l.map((a) => a.email)).toEqual(['A@X.com', 'b@x.com']);
    l = addRemembered(l, acct('c@x.com'), 't4');
    l = addRemembered(l, acct('d@x.com'), 't5');
    expect(l.map((a) => a.email)).toEqual(['d@x.com', 'c@x.com', 'A@X.com']);
  });
  it('removes case-insensitively', () => {
    const l = addRemembered([], acct('a@x.com'), 't');
    expect(removeRemembered(l, 'google', 'A@x.com')).toEqual([]);
    expect(removeRemembered(l, 'apple', 'a@x.com')).toHaveLength(1);
  });
  it('forgetRememberedAccount persists and returns the new list', async () => {
    await rememberAccount(acct('a@x.com'));
    await rememberAccount(acct('b@x.com'));
    const next = await forgetRememberedAccount('google', 'A@x.com');
    expect(next.map((a) => a.email)).toEqual(['b@x.com']);
    expect(await loadRememberedAccounts()).toEqual(next);
  });
});

describe('parseRemembered', () => {
  const ok = (accounts: unknown[], v: unknown = 1) => JSON.stringify({ v, accounts });
  const e = { provider: 'google', email: 'a@x.com', name: 'A', lastUsedAt: 't' };
  it.each([
    ['null', null],
    ['bad json', '{'],
    ['wrong version', ok([e], 2)],
    ['non-array', JSON.stringify({ v: 1, accounts: {} })],
    ['no @', ok([{ ...e, email: 'nope' }])],
    ['long email', ok([{ ...e, email: 'a'.repeat(320) + '@x.com' }])],
    ['bad provider', ok([{ ...e, provider: 'facebook' }])],
  ])('discards %s', (_n, raw) => {
    expect(parseRemembered(raw as string | null)).toEqual([]);
  });
  it('truncates long names and caps at 3', () => {
    const r = parseRemembered(ok([{ ...e, name: 'n'.repeat(300) }, e, e, e]));
    expect(r).toHaveLength(3);
    expect(r[0]!.name).toHaveLength(200);
  });
});

describe('identityFromUser', () => {
  it('maps google and falls back to name', () => {
    expect(
      identityFromUser({ email: 'a@x.com', user_metadata: { full_name: 'Ann' }, app_metadata: { provider: 'google' } }),
    ).toEqual({ provider: 'google', email: 'a@x.com', name: 'Ann' });
    expect(
      identityFromUser({ email: 'a@x.com', user_metadata: { name: 'Bo' }, app_metadata: { provider: 'apple' } }),
    ).toEqual({ provider: 'apple', email: 'a@x.com', name: 'Bo' });
  });
  it('returns null for other providers or no email', () => {
    expect(identityFromUser({ email: 'a@x.com', app_metadata: { provider: 'email' } })).toBeNull();
    expect(identityFromUser({ app_metadata: { provider: 'google' } })).toBeNull();
    expect(identityFromUser(null)).toBeNull();
  });
});

describe('write failures', () => {
  it('never throw', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('x'));
    await expect(rememberAccount(acct('a@x.com'))).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
