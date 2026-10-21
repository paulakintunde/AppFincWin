import { DbError } from '../errors';
import {
  DECIDE_SETTINGS_PATCH_KEYS,
  EMPTY_DECIDE_SETTINGS,
  fetchDecideSettings,
  upsertDecideSettings,
  type DecideSettingsPatch,
  type DecideSettingsRow,
} from '../decideSettings';
import { createFakeSupabase } from './fakeSupabase';

const ROW: DecideSettingsRow = { user_id: 'u1', ...EMPTY_DECIDE_SETTINGS, reserve: 5000, version: 1 };

describe('fetchDecideSettings', () => {
  it('returns null when no row exists', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchDecideSettings(client, 'u1')).resolves.toBeNull();
  });

  it('returns the row and maps errors', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: ROW, error: null, status: 200 });
    await expect(fetchDecideSettings(client, 'u1')).resolves.toEqual(ROW);
    client.respondWith({ data: null, error: { message: 'x', code: '500' }, status: 500 });
    await expect(fetchDecideSettings(client, 'u1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('upsertDecideSettings', () => {
  it('upserts on user_id', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: ROW, error: null, status: 200 });
    await expect(upsertDecideSettings(client, 'u1', { reserve: 5000 })).resolves.toEqual(ROW);
    expect(client.calls.find((c) => c.method === 'upsert')?.args).toEqual([
      { user_id: 'u1', reserve: 5000 },
      { onConflict: 'user_id' },
    ]);
  });

  it('rejects keys outside the patch list before any request', async () => {
    const client = createFakeSupabase();
    await expect(upsertDecideSettings(client, 'u1', { version: 9 } as unknown as DecideSettingsPatch)).rejects.toBeInstanceOf(
      TypeError
    );
    expect(client.calls).toHaveLength(0);
    expect(DECIDE_SETTINGS_PATCH_KEYS).not.toContain('user_id');
  });

  it('CR-A01: never sends seeded, and the payload holds only user_id and granted keys', async () => {
    const client = createFakeSupabase();
    await expect(
      upsertDecideSettings(client, 'u1', { seeded: true } as unknown as DecideSettingsPatch)
    ).rejects.toBeInstanceOf(TypeError);
    expect(client.calls).toHaveLength(0);
    expect(DECIDE_SETTINGS_PATCH_KEYS).not.toContain('seeded');

    client.respondWith({ data: ROW, error: null, status: 200 });
    await upsertDecideSettings(client, 'u1', { reserve: 5000, rough_income: undefined });
    const payload = client.calls.find((c) => c.method === 'upsert')?.args[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['reserve', 'user_id']);
  });
});
