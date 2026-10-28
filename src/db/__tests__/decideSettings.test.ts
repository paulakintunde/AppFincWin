import { DbError } from '../errors';
import {
  DECIDE_SETTINGS_COLUMNS,
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

  it('D-103 housing_line round-trips through the settings row and patch', async () => {
    const client = createFakeSupabase();
    const withLine: DecideSettingsRow = { ...ROW, housing_line: '28.5' };
    client.respondWith({ data: withLine, error: null, status: 200 });
    await expect(upsertDecideSettings(client, 'u1', { housing_line: '28.5' })).resolves.toEqual(withLine);
    expect(client.calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({ user_id: 'u1', housing_line: '28.5' });
    expect(DECIDE_SETTINGS_PATCH_KEYS).toContain('housing_line');
    expect(DECIDE_SETTINGS_COLUMNS).toContain('housing_line');
    expect(EMPTY_DECIDE_SETTINGS.housing_line).toBeNull();
  });

  it('D-103 housing_line null clears the stored value', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: ROW, error: null, status: 200 });
    await upsertDecideSettings(client, 'u1', { housing_line: null });
    expect(client.calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({ user_id: 'u1', housing_line: null });
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

describe('05.2 columns', () => {
  it('EMPTY_DECIDE_SETTINGS has every new field null and an empty id', () => {
    expect(EMPTY_DECIDE_SETTINGS.id).toBe('');
    for (const key of ['income_pattern', 'month_marks', 'reserve_account_id', 'unexplained_use', 'refine_snooze_until'] as const) {
      expect(EMPTY_DECIDE_SETTINGS[key]).toBeNull();
    }
  });

  it('never sends id or seeded, even when the caller object holds them', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: ROW, error: null, status: 200 });
    const patch = { refine_snooze_until: '2026-11-01', id: 'x', seeded: true } as unknown as DecideSettingsPatch;
    // assertAllowedKeys rejects the stray keys before any request
    await expect(upsertDecideSettings(client, 'u1', patch)).rejects.toBeInstanceOf(Error);
    expect(client.calls.find((c) => c.method === 'upsert')).toBeUndefined();
    await upsertDecideSettings(client, 'u1', { refine_snooze_until: '2026-11-01' });
    expect(client.calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({
      user_id: 'u1',
      refine_snooze_until: '2026-11-01',
    });
  });

  it('reads a row cached before the push with the new fields as null', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { user_id: 'u1', reserve: 5, version: 2, updated_at: 't' }, error: null, status: 200 });
    const row = await fetchDecideSettings(client, 'u1');
    expect(row?.income_pattern).toBeNull();
    expect(row?.month_marks).toBeNull();
    expect(row?.reserve).toBe(5);
  });

  it('selects and patches the new columns', () => {
    for (const c of ['id', 'refine_snooze_until', 'unexplained_use', 'reserve_account_id', 'income_pattern']) {
      expect(DECIDE_SETTINGS_COLUMNS).toContain(c);
    }
    expect(DECIDE_SETTINGS_PATCH_KEYS).toContain('refine_snooze_until');
  });
});
