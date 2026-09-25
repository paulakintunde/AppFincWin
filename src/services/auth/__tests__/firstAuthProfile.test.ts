// ACC-03: Apple returns fullName/email only on the very first authorization. These tests
// prove the patch is built from non-empty fields only (never `full_name: null`), that
// auth.updateUser is called only when a name exists, and that a failed write is queued to
// AsyncStorage under 'fincwin:pending-apple-profile' and replayed (then cleared) by
// retryPendingFirstAuthProfile().
import AsyncStorage from '@react-native-async-storage/async-storage';

let mockUpdateError: { message: string } | null = null;
const mockUpdateCalls: Array<{ patch: unknown; userId: unknown }> = [];
const mockUpdateUserCalls: unknown[] = [];

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: (_table: string) => ({
      update: (patch: unknown) => ({
        eq: (_column: string, value: unknown) => {
          mockUpdateCalls.push({ patch, userId: value });
          return Promise.resolve({ error: mockUpdateError });
        },
      }),
    }),
    auth: {
      updateUser: (args: unknown) => {
        mockUpdateUserCalls.push(args);
        return Promise.resolve({ data: {}, error: null });
      },
    },
  },
}));

import { persistFirstAuthProfile, retryPendingFirstAuthProfile } from '../firstAuthProfile';

const PENDING_KEY = 'fincwin:pending-apple-profile';

beforeEach(async () => {
  mockUpdateError = null;
  mockUpdateCalls.length = 0;
  mockUpdateUserCalls.length = 0;
  await AsyncStorage.clear();
});

describe('persistFirstAuthProfile', () => {
  it('updates full_name and email and calls auth.updateUser when a name exists', async () => {
    await persistFirstAuthProfile(
      'user-1',
      { givenName: 'Ada', familyName: 'Lovelace' },
      'x@privaterelay.appleid.com'
    );

    expect(mockUpdateCalls).toEqual([
      { patch: { full_name: 'Ada Lovelace', email: 'x@privaterelay.appleid.com' }, userId: 'user-1' },
    ]);
    expect(mockUpdateUserCalls).toEqual([{ data: { full_name: 'Ada Lovelace' } }]);
  });

  it('makes no update call given an all-null name and a null email', async () => {
    await persistFirstAuthProfile('user-1', { givenName: null, familyName: null }, null);

    expect(mockUpdateCalls).toHaveLength(0);
    expect(mockUpdateUserCalls).toHaveLength(0);
  });

  it('updates only email when only an email is present, never sending full_name: null', async () => {
    await persistFirstAuthProfile('user-1', null, 'x@example.com');

    expect(mockUpdateCalls).toEqual([{ patch: { email: 'x@example.com' }, userId: 'user-1' }]);
    expect(mockUpdateUserCalls).toHaveLength(0);
  });

  it('saves the payload to AsyncStorage when the update errors', async () => {
    mockUpdateError = { message: 'network down' };

    await persistFirstAuthProfile('user-2', { givenName: 'Grace', familyName: null }, null);

    const raw = await AsyncStorage.getItem(PENDING_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ userId: 'user-2', patch: { full_name: 'Grace' } });
  });
});

describe('retryPendingFirstAuthProfile', () => {
  it('replays a pending payload and clears the key on success', async () => {
    await AsyncStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ userId: 'user-2', patch: { full_name: 'Grace' } })
    );

    await retryPendingFirstAuthProfile();

    expect(mockUpdateCalls).toEqual([{ patch: { full_name: 'Grace' }, userId: 'user-2' }]);
    expect(mockUpdateUserCalls).toEqual([{ data: { full_name: 'Grace' } }]);
    expect(await AsyncStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('does nothing when no payload is pending', async () => {
    await retryPendingFirstAuthProfile();

    expect(mockUpdateCalls).toHaveLength(0);
    expect(mockUpdateUserCalls).toHaveLength(0);
  });

  it('leaves the pending key in place when the replay itself fails', async () => {
    await AsyncStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ userId: 'user-2', patch: { full_name: 'Grace' } })
    );
    mockUpdateError = { message: 'still down' };

    await retryPendingFirstAuthProfile();

    expect(await AsyncStorage.getItem(PENDING_KEY)).not.toBeNull();
  });
});
