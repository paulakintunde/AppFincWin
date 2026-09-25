import { DbError, NotFoundError, VersionConflictError } from '../errors';
import type { CustomCurrencyRow, MoneyPrefsRow } from '../rows';
import {
  CUSTOM_CURRENCY_INSERT_KEYS,
  CUSTOM_CURRENCY_PATCH_KEYS,
  fetchCustomCurrencies,
  fetchCustomCurrency,
  insertCustomCurrency,
  updateCustomCurrency,
  type NewCustomCurrency,
} from '../customCurrencies';
import { MONEY_PREFS_COLUMNS, MONEY_PREFS_PATCH_KEYS, fetchMoneyPrefs, updateMoneyPrefs } from '../profile';
import { CUSTOM_CURRENCY_COLUMNS } from '../rows';
import { createFakeSupabase } from './fakeSupabase';

function customRow(overrides: Partial<CustomCurrencyRow> = {}): CustomCurrencyRow {
  return {
    id: 'c1',
    owner_id: 'u1',
    code: 'GLD',
    symbol: 'GLD',
    decimals: 0,
    reference_currency: 'USD',
    unit_value: '2.5000000000',
    as_of: '2026-09-24',
    version: 1,
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
    ...overrides,
  };
}

const NEW_CUSTOM: NewCustomCurrency = {
  id: 'c1',
  code: 'GLD',
  symbol: 'GLD',
  decimals: 0,
  reference_currency: 'USD',
  unit_value: '2.5000000000',
  as_of: '2026-09-24',
};

function prefsRow(overrides: Partial<MoneyPrefsRow> = {}): MoneyPrefsRow {
  return { home_currency: 'USD', show_cents: false, lead_figure: 'home', ...overrides };
}

describe('CUSTOM_CURRENCY_COLUMNS', () => {
  it('casts unit_value to text so a rate never crosses into JS as a float', () => {
    expect(CUSTOM_CURRENCY_COLUMNS).toContain('unit_value:unit_value::text');
  });
});

describe('fetchCustomCurrency', () => {
  it('returns null when no row is found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchCustomCurrency(client, 'missing')).resolves.toBeNull();
  });

  it('throws a DbError on a query error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(fetchCustomCurrency(client, 'c1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('fetchCustomCurrencies', () => {
  it('filters owner_id and orders by code ascending', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [customRow()], error: null, status: 200 });

    const result = await fetchCustomCurrencies(client, 'u1');

    expect(result).toEqual([customRow()]);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['owner_id', 'u1']);
    expect(client.calls.find((c) => c.method === 'order')?.args).toEqual(['code', { ascending: true }]);
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe(CUSTOM_CURRENCY_COLUMNS);
  });
});

describe('insertCustomCurrency', () => {
  it('sends exactly the 7 granted keys and selects CUSTOM_CURRENCY_COLUMNS', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: customRow(), error: null, status: 201 });

    await insertCustomCurrency(client, NEW_CUSTOM);

    expect(CUSTOM_CURRENCY_INSERT_KEYS).toHaveLength(7);
    expect(client.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'c1',
      code: 'GLD',
      symbol: 'GLD',
      decimals: 0,
      reference_currency: 'USD',
      unit_value: '2.5000000000',
      as_of: '2026-09-24',
    });
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe(CUSTOM_CURRENCY_COLUMNS);
  });

  it('on a 23505 duplicate-id error, fetches by id and returns the existing row instead of failing', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'duplicate key', code: '23505' }, status: 409 });
    client.respondWith({ data: customRow(), error: null, status: 200 });

    await expect(insertCustomCurrency(client, NEW_CUSTOM)).resolves.toEqual(customRow());
  });

  it('on a 23514 guard-trigger rejection (ISO shadow), throws a DbError carrying that code', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'shadows an ISO currency', code: '23514' }, status: 400 });

    await expect(insertCustomCurrency(client, NEW_CUSTOM)).rejects.toMatchObject({ code: '23514' });
  });
});

describe('updateCustomCurrency', () => {
  it('throws a TypeError before any network call when the patch names a non-granted column', async () => {
    const client = createFakeSupabase();
    // @ts-expect-error -- deliberately passing a disallowed key to prove the guard
    await expect(updateCustomCurrency(client, 'c1', 1, { code: 'NEW' })).rejects.toThrow(TypeError);
    expect(client.calls).toHaveLength(0);
  });

  it('is version-conditional: sends eq(version, expectedVersion) and returns the updated row on success', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [customRow({ version: 2, unit_value: '3.0000000000' })], error: null, status: 200 });

    const result = await updateCustomCurrency(client, 'c1', 1, { unit_value: '3.0000000000' });

    expect(result.version).toBe(2);
    expect(client.calls.find((c) => c.method === 'eq' && c.args[0] === 'version')?.args).toEqual(['version', 1]);
  });

  it('zero rows back with the row still present throws VersionConflictError carrying the server row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: customRow({ version: 5 }), error: null, status: 200 });

    const err = await updateCustomCurrency(client, 'c1', 1, { unit_value: '3.0000000000' }).catch((e) => e);
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).serverRow).toEqual(customRow({ version: 5 }));
  });

  it('zero rows back with the row gone throws NotFoundError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: null, error: null, status: 200 });

    await expect(updateCustomCurrency(client, 'c1', 1, { unit_value: '3.0000000000' })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

describe('MONEY_PREFS_COLUMNS', () => {
  it('selects exactly home_currency, show_cents, lead_figure', () => {
    expect(MONEY_PREFS_COLUMNS).toBe('home_currency, show_cents, lead_figure');
  });
});

describe('fetchMoneyPrefs', () => {
  it('filters by the profile id and returns the row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: prefsRow(), error: null, status: 200 });

    const result = await fetchMoneyPrefs(client, 'u1');

    expect(result).toEqual(prefsRow());
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['id', 'u1']);
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe(MONEY_PREFS_COLUMNS);
  });

  it('returns null when no profile row is found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchMoneyPrefs(client, 'missing')).resolves.toBeNull();
  });
});

describe('updateMoneyPrefs', () => {
  it('sends only the 3 granted keys, with no version condition', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: prefsRow({ home_currency: 'JPY' }), error: null, status: 200 });

    const result = await updateMoneyPrefs(client, 'u1', { home_currency: 'JPY' });

    expect(result.home_currency).toBe('JPY');
    expect(client.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ home_currency: 'JPY' });
    expect(client.calls.some((c) => c.method === 'eq' && c.args[0] === 'version')).toBe(false);
    expect(MONEY_PREFS_PATCH_KEYS).toEqual(['home_currency', 'show_cents', 'lead_figure']);
  });

  it('throws a TypeError before any network call for a non-granted column', async () => {
    const client = createFakeSupabase();
    // @ts-expect-error -- deliberately passing a disallowed key to prove the guard
    await expect(updateMoneyPrefs(client, 'u1', { id: 'other' })).rejects.toThrow(TypeError);
    expect(client.calls).toHaveLength(0);
  });

  it('propagates a 23514 rejection (e.g. an unknown home currency) as a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'unknown home currency XYZ', code: '23514' }, status: 400 });

    await expect(updateMoneyPrefs(client, 'u1', { home_currency: 'XYZ' })).rejects.toMatchObject({ code: '23514' });
  });
});
