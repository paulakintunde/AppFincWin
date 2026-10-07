import type { FormatProfile } from '@/engine/statement';
import { MAX_LAYOUT_SIGNATURE } from '@/engine/statement';
import { NotFoundError, VersionConflictError } from '../errors';
import { IMPORT_PROFILE_COLUMNS, type ImportProfileRow } from '../rows';
import { fetchImportProfile, isFormatProfile, saveImportProfile } from '../importProfiles';
import { createFakeSupabase } from './fakeSupabase';

const VALID_PROFILE: FormatProfile = {
  version: 1,
  source: 'csv',
  accountFamily: 'deposit',
  positiveMeans: 'money-in',
  balanceMeans: 'held',
  statedLimit: null,
  decidedBy: 'labels',
};

function profileRow(overrides: Partial<ImportProfileRow> = {}): ImportProfileRow {
  return {
    id: 'p1',
    owner_id: 'u1',
    account_id: 'a1',
    layout_signature: 'date,description,amount|.|,',
    profile: VALID_PROFILE,
    version: 1,
    created_at: '2026-09-27T00:00:00Z',
    ...overrides,
  };
}

describe('isFormatProfile', () => {
  it('accepts a fully-shaped profile', () => {
    expect(isFormatProfile(VALID_PROFILE)).toBe(true);
  });

  it('accepts every enumerated source/accountFamily/positiveMeans/balanceMeans/decidedBy value', () => {
    for (const source of ['csv', 'ofx'] as const) {
      expect(isFormatProfile({ ...VALID_PROFILE, source })).toBe(true);
    }
    for (const accountFamily of ['deposit', 'card', 'loan'] as const) {
      expect(isFormatProfile({ ...VALID_PROFILE, accountFamily })).toBe(true);
    }
    for (const positiveMeans of ['money-in', 'money-spent'] as const) {
      expect(isFormatProfile({ ...VALID_PROFILE, positiveMeans })).toBe(true);
    }
    for (const balanceMeans of ['held', 'owed', 'available', 'none'] as const) {
      expect(isFormatProfile({ ...VALID_PROFILE, balanceMeans })).toBe(true);
    }
    for (const decidedBy of ['labels', 'reconciliation', 'remembered', 'user'] as const) {
      expect(isFormatProfile({ ...VALID_PROFILE, decidedBy })).toBe(true);
    }
  });

  it('accepts a non-negative safe-integer statedLimit', () => {
    expect(isFormatProfile({ ...VALID_PROFILE, statedLimit: 100000 })).toBe(true);
  });

  it('rejects a non-object / null / array', () => {
    expect(isFormatProfile(null)).toBe(false);
    expect(isFormatProfile('csv')).toBe(false);
    expect(isFormatProfile(42)).toBe(false);
  });

  it('rejects a wrong version', () => {
    expect(isFormatProfile({ ...VALID_PROFILE, version: 2 })).toBe(false);
  });

  it('rejects an unrecognised enum value for each field', () => {
    expect(isFormatProfile({ ...VALID_PROFILE, source: 'pdf' })).toBe(false);
    expect(isFormatProfile({ ...VALID_PROFILE, accountFamily: 'investment' })).toBe(false);
    expect(isFormatProfile({ ...VALID_PROFILE, positiveMeans: 'unsure' })).toBe(false);
    expect(isFormatProfile({ ...VALID_PROFILE, balanceMeans: 'unsure' })).toBe(false);
    expect(isFormatProfile({ ...VALID_PROFILE, decidedBy: 'guessed' })).toBe(false);
  });

  it('rejects a negative, non-integer, or non-safe-integer statedLimit', () => {
    expect(isFormatProfile({ ...VALID_PROFILE, statedLimit: -1 })).toBe(false);
    expect(isFormatProfile({ ...VALID_PROFILE, statedLimit: 1.5 })).toBe(false);
    expect(isFormatProfile({ ...VALID_PROFILE, statedLimit: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
  });

  it('rejects a shape with an extra key', () => {
    expect(isFormatProfile({ ...VALID_PROFILE, extra: 'nope' })).toBe(false);
  });

  it('rejects a shape missing a required key', () => {
    const { decidedBy: _decidedBy, ...missingDecidedBy } = VALID_PROFILE;
    expect(isFormatProfile(missingDecidedBy)).toBe(false);
  });
});

describe('fetchImportProfile', () => {
  it('selects IMPORT_PROFILE_COLUMNS filtered by owner_id/account_id/layout_signature and returns the row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: profileRow(), error: null, status: 200 });

    const result = await fetchImportProfile(client, 'u1', 'a1', 'sig');

    expect(result).toEqual(profileRow());
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe(IMPORT_PROFILE_COLUMNS);
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['owner_id', 'u1'],
      ['account_id', 'a1'],
      ['layout_signature', 'sig'],
    ]);
  });

  it('returns null when no row is found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchImportProfile(client, 'u1', 'a1', 'sig')).resolves.toBeNull();
  });

  it('returns null when the stored profile fails isFormatProfile (a stale or foreign shape is never applied)', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: profileRow({ profile: { version: 2 } as unknown as FormatProfile }), error: null, status: 200 });

    await expect(fetchImportProfile(client, 'u1', 'a1', 'sig')).resolves.toBeNull();
  });

  it('throws a DbError on a query error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(fetchImportProfile(client, 'u1', 'a1', 'sig')).rejects.toMatchObject({ name: 'DbError', code: 'XX000' });
  });
});

describe('saveImportProfile', () => {
  const INPUT = { id: 'p1', ownerId: 'u1', accountId: 'a1', signature: 'sig', profile: VALID_PROFILE };

  it('throws a RangeError before any call when the signature exceeds MAX_LAYOUT_SIGNATURE', async () => {
    const client = createFakeSupabase();
    const tooLong = 'x'.repeat(MAX_LAYOUT_SIGNATURE + 1);

    await expect(saveImportProfile(client, { ...INPUT, signature: tooLong })).rejects.toThrow(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('when absent, inserts {id, account_id, layout_signature, profile} with no owner_id', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 }); // fetchRawRow: absent
    client.respondWith({ data: profileRow(), error: null, status: 201 }); // insert

    const result = await saveImportProfile(client, INPUT);

    expect(result).toEqual(profileRow());
    const insertPayload = client.calls.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(insertPayload).toEqual({ id: 'p1', account_id: 'a1', layout_signature: 'sig', profile: VALID_PROFILE });
    expect(insertPayload).not.toHaveProperty('owner_id');
  });

  it('when present, updates {profile} with eq(id) and eq(version) and returns the new row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: profileRow({ version: 3 }), error: null, status: 200 }); // fetchRawRow: present
    client.respondWith({ data: [profileRow({ version: 4 })], error: null, status: 200 }); // update

    const result = await saveImportProfile(client, INPUT);

    expect(result).toEqual(profileRow({ version: 4 }));
    expect(client.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ profile: VALID_PROFILE });
    expect(client.calls.find((c) => c.method === 'eq' && c.args[0] === 'id')?.args).toEqual(['id', 'p1']);
    expect(client.calls.find((c) => c.method === 'eq' && c.args[0] === 'version')?.args).toEqual(['version', 3]);
  });

  it('on a 23505 during insert (a concurrent save), re-fetches and updates instead of failing', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 }); // fetchRawRow: absent
    client.respondWith({ data: null, error: { message: 'duplicate key', code: '23505' }, status: 409 }); // insert races
    client.respondWith({ data: profileRow({ version: 1 }), error: null, status: 200 }); // re-fetch: now present
    client.respondWith({ data: [profileRow({ version: 2 })], error: null, status: 200 }); // update

    await expect(saveImportProfile(client, INPUT)).resolves.toEqual(profileRow({ version: 2 }));
  });

  it('rethrows a non-23505 insert error as a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 }); // fetchRawRow: absent
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 }); // insert fails

    await expect(saveImportProfile(client, INPUT)).rejects.toMatchObject({ name: 'DbError', code: 'XX000' });
  });

  it('zero rows back from update with the row still present throws VersionConflictError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: profileRow({ version: 3 }), error: null, status: 200 }); // fetchRawRow: present
    client.respondWith({ data: [], error: null, status: 200 }); // update: version moved on
    client.respondWith({ data: profileRow({ version: 5 }), error: null, status: 200 }); // refetch by id

    const err = await saveImportProfile(client, INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).serverRow).toEqual(profileRow({ version: 5 }));
  });

  it('zero rows back from update with the row gone throws NotFoundError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: profileRow({ version: 3 }), error: null, status: 200 }); // fetchRawRow: present
    client.respondWith({ data: [], error: null, status: 200 }); // update: row gone
    client.respondWith({ data: null, error: null, status: 200 }); // refetch by id: gone

    await expect(saveImportProfile(client, INPUT)).rejects.toBeInstanceOf(NotFoundError);
  });
});
