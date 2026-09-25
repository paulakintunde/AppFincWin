// Task 2: setMutationDefaults-backed money-preference and custom-currency mutations -- client
// UUIDs before mutate() for custom currencies (MON-08), optimistic pending rows/cache patches,
// D-18/D-19 conflict/rejection handling, and useMoneyPrefs' loaded-vs-default read. Mirrors
// 01-12's transactions.test.tsx pattern exactly: '@/services/supabase' is mocked to a mutable
// client so each test controls what the (lazily required) write function talks to.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { CustomCurrencyRow, DbClient, MoneyPrefsRow } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { registerMutationDefaults } from '../index';
import { useUpdateMoneyPrefs } from '../moneyPrefs';
import { useAddCustomCurrency, useEditCustomCurrency } from '../customCurrencies';
import { DEFAULT_MONEY_PREFS, useMoneyPrefs } from '@/data/queries/moneyPrefs';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

jest.mock('@/data/queries/currencyOptions', () => ({ useCurrencyOptions: jest.fn(() => ({ options: [], loading: false })) }));

let mockActiveClient: unknown;
let mockUuidCounter = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${mockUuidCounter++}`),
}));

jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
}));

jest.mock('@/services/locale/deviceLocale', () => ({
  getDeviceTimeZone: jest.fn(() => 'UTC'),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  return qc;
}

const prefsRow = (overrides: Partial<MoneyPrefsRow> = {}): MoneyPrefsRow => ({
  home_currency: 'USD',
  show_cents: false,
  lead_figure: 'home',
  region: null,
  ...overrides,
});

const customRow = (overrides: Partial<CustomCurrencyRow> = {}): CustomCurrencyRow => ({
  id: 'uuid-0',
  owner_id: 'user-1',
  code: 'GLD',
  symbol: 'GLD',
  decimals: 0,
  reference_currency: 'USD',
  unit_value: '2.5000000000',
  as_of: '2026-09-24',
  version: 1,
  created_at: '2026-09-24T00:00:00.000Z',
  updated_at: '2026-09-24T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  mockUuidCounter = 0;
  recordFailedWrite.mockClear();
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('useMoneyPrefs', () => {
  it('returns DEFAULT_MONEY_PREFS until loaded (no userId, query never fires)', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useMoneyPrefs(undefined), { wrapper: wrapper(qc) });

    expect(result.current.prefs).toEqual(DEFAULT_MONEY_PREFS);
    expect(result.current.loading).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });

  it('returns the server row once loaded', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: prefsRow({ home_currency: 'JPY' }), error: null, status: 200 });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useMoneyPrefs('user-1'), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.prefs.home_currency).toBe('JPY'));
  });
});

describe('useUpdateMoneyPrefs', () => {
  it('setHomeCurrency updates the cache optimistically and sends exactly { home_currency }', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: prefsRow({ home_currency: 'JPY' }), error: null, status: 200 });

    const qc = newClient();
    qc.setQueryData(queryKeys.moneyPrefs('user-1'), prefsRow());
    const { result } = await renderHook(() => useUpdateMoneyPrefs('user-1'), { wrapper: wrapper(qc) });

    result.current.setHomeCurrency('JPY');

    await waitFor(() => {
      expect(qc.getQueryData<MoneyPrefsRow>(queryKeys.moneyPrefs('user-1'))?.home_currency).toBe('JPY');
    });

    const updateCall = fake.calls.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({ home_currency: 'JPY' });
  });

  it('on a 23514 rejection, rolls the cache back to the previous value and records a failed write', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'unknown home currency XYZ', code: '23514' }, status: 400 });

    const qc = newClient();
    qc.setQueryData(queryKeys.moneyPrefs('user-1'), prefsRow({ home_currency: 'USD' }));
    const { result } = await renderHook(() => useUpdateMoneyPrefs('user-1'), { wrapper: wrapper(qc) });

    result.current.setHomeCurrency('XYZ');

    await waitFor(() => {
      expect(recordFailedWrite).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'profiles', kind: 'rejected', code: '23514' })
      );
    });

    expect(qc.getQueryData<MoneyPrefsRow>(queryKeys.moneyPrefs('user-1'))?.home_currency).toBe('USD');
  });

  it('setShowCents while offline pauses the mutation and flushes on reconnect', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);

    const qc = newClient();
    qc.setQueryData(queryKeys.moneyPrefs('user-1'), prefsRow({ show_cents: false }));
    const { result } = await renderHook(() => useUpdateMoneyPrefs('user-1'), { wrapper: wrapper(qc) });

    result.current.setShowCents(true);

    await waitFor(() => {
      expect(qc.getQueryData<MoneyPrefsRow>(queryKeys.moneyPrefs('user-1'))?.show_cents).toBe(true);
    });
    await waitFor(() => {
      const mutation = qc.getMutationCache().getAll()[0];
      expect(mutation?.state.isPaused).toBe(true);
    });
    expect(fake.calls.some((c) => c.method === 'update')).toBe(false);

    fake.respondWith({ data: prefsRow({ show_cents: true }), error: null, status: 200 });
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'update')).toBe(true));
  });

  it('RD-02: setRegion updates the cache optimistically and sends exactly { region }', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: prefsRow({ region: 'DE' }), error: null, status: 200 });

    const qc = newClient();
    qc.setQueryData(queryKeys.moneyPrefs('user-1'), prefsRow());
    const { result } = await renderHook(() => useUpdateMoneyPrefs('user-1'), { wrapper: wrapper(qc) });

    result.current.setRegion('DE');

    await waitFor(() => {
      expect(qc.getQueryData<MoneyPrefsRow>(queryKeys.moneyPrefs('user-1'))?.region).toBe('DE');
    });

    const updateCall = fake.calls.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({ region: 'DE' });
  });

  it('RD-02: setRegion(null) clears the override back to "unset"', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: prefsRow({ region: null }), error: null, status: 200 });

    const qc = newClient();
    qc.setQueryData(queryKeys.moneyPrefs('user-1'), prefsRow({ region: 'DE' }));
    const { result } = await renderHook(() => useUpdateMoneyPrefs('user-1'), { wrapper: wrapper(qc) });

    result.current.setRegion(null);

    const updateCall = await waitFor(() => {
      const call = fake.calls.find((c) => c.method === 'update');
      if (!call) throw new Error('not yet called');
      return call;
    });
    expect(updateCall.args[0]).toEqual({ region: null });
  });
});

describe('useAddCustomCurrency', () => {
  const ctx = { isoCodes: new Set(['USD', 'EUR']), existingCustomCodes: new Set<string>() };

  it('returns { ok: false, errors } for invalid input and never calls mutate', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;

    const qc = newClient();
    const { result } = await renderHook(() => useAddCustomCurrency('user-1'), { wrapper: wrapper(qc) });

    const outcome = result.current.add(
      { code: '', symbol: '', decimals: 0, referenceCurrency: 'USD', unitValueRaw: '2.5', locale: 'en-US' },
      ctx
    );

    expect(outcome).toEqual({ ok: false, errors: ['code-missing'] });
    expect(fake.calls.some((c) => c.method === 'insert')).toBe(false);
  });

  it('returns { ok: true, id } for valid input, patches the custom list cache at once, and sends that id', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: customRow(), error: null, status: 201 });

    const qc = newClient();
    const { result } = await renderHook(() => useAddCustomCurrency('user-1'), { wrapper: wrapper(qc) });

    const outcome = result.current.add(
      { code: 'gld', symbol: '', decimals: 0, referenceCurrency: 'USD', unitValueRaw: '2.5', locale: 'en-US' },
      ctx
    );

    expect(outcome).toEqual({ ok: true, id: 'uuid-0' });

    await waitFor(() => {
      const rows = qc.getQueryData<WithPending<CustomCurrencyRow>[]>(queryKeys.customCurrencies('user-1'));
      expect(rows?.[0]?.id).toBe('uuid-0');
    });

    const insertCall = fake.calls.find((c) => c.method === 'insert');
    expect((insertCall?.args[0] as { id: string }).id).toBe('uuid-0');
    expect(insertCall?.args[0]).toMatchObject({ code: 'GLD', symbol: 'GLD', unit_value: '2.5000000000' });
  });

  it('WR-A14: as_of is the local calendar day in the device time zone, not the UTC day', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: customRow(), error: null, status: 201 });
    // Whichever of UTC+14 / UTC-11 is on a different calendar day from UTC right now.
    const zone = new Date().getUTCHours() >= 10 ? 'Pacific/Kiritimati' : 'Pacific/Pago_Pago';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/services/locale/deviceLocale') as { getDeviceTimeZone: jest.Mock }).getDeviceTimeZone.mockReturnValue(zone);

    const qc = newClient();
    const { result } = await renderHook(() => useAddCustomCurrency('user-1'), { wrapper: wrapper(qc) });
    result.current.add(
      { code: 'GLD', symbol: '', decimals: 0, referenceCurrency: 'USD', unitValueRaw: '2.5', locale: 'en-US' },
      ctx
    );

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'insert')).toBe(true));
    const sent = fake.calls.find((c) => c.method === 'insert')?.args[0] as { as_of: string };
    const expected = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date()
    );
    expect(sent.as_of).toBe(expected);
    expect(sent.as_of).not.toBe(new Date().toISOString().slice(0, 10));
  });

  it('CR-A03: a (owner_id, code) unique clash from another device is recorded as a failed write and the optimistic row removed', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "custom_currencies_owner_id_code_key"', code: '23505' },
      status: 409,
    });
    fake.respondWith({ data: null, error: null, status: 200 }); // fetch by our id finds nothing

    const qc = newClient();
    const { result } = await renderHook(() => useAddCustomCurrency('user-1'), { wrapper: wrapper(qc) });

    result.current.add(
      { code: 'GLD', symbol: '', decimals: 0, referenceCurrency: 'USD', unitValueRaw: '2.5', locale: 'en-US' },
      ctx
    );

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'custom_currencies', entityId: 'uuid-0', kind: 'rejected', code: '23505' })
    );
    const rows = qc.getQueryData<WithPending<CustomCurrencyRow>[]>(queryKeys.customCurrencies('user-1'));
    expect(rows ?? []).toHaveLength(0);
  });
});

describe('useEditCustomCurrency', () => {
  it('sends a version-conditional update', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [customRow({ version: 2, unit_value: '3.0000000000' })], error: null, status: 200 });

    const qc = newClient();
    const { result } = await renderHook(() => useEditCustomCurrency('user-1'), { wrapper: wrapper(qc) });

    result.current.edit({ id: 'c1', expectedVersion: 1, patch: { unit_value: '3.0000000000' } });

    await waitFor(() => {
      expect(fake.calls.find((c) => c.method === 'eq' && c.args[0] === 'version')?.args).toEqual(['version', 1]);
    });
  });

  it('WR-A03: normalizes a hand-edited unit_value to the canonical 10-dp form, region-aware when given a locale', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [customRow({ id: 'c1', version: 2, unit_value: '3.2500000000' })], error: null, status: 200 });

    const qc = newClient();
    qc.setQueryData(queryKeys.customCurrencies('user-1'), [customRow({ id: 'c1', version: 1 })]);
    const { result } = await renderHook(() => useEditCustomCurrency('user-1'), { wrapper: wrapper(qc) });

    const outcome = result.current.edit({ id: 'c1', expectedVersion: 1, patch: { unit_value: '3,25' } }, { locale: 'de-DE' });
    expect(outcome).toEqual({ ok: true });

    await waitFor(() => expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ unit_value: '3.2500000000' }));
  });

  it('WR-A03: rejects a malformed unit_value before it reaches the cache or the queue', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;

    const qc = newClient();
    qc.setQueryData(queryKeys.customCurrencies('user-1'), [customRow({ id: 'c1', version: 1 })]);
    const { result } = await renderHook(() => useEditCustomCurrency('user-1'), { wrapper: wrapper(qc) });

    expect(result.current.edit({ id: 'c1', expectedVersion: 1, patch: { unit_value: 'abc' } })).toEqual({
      ok: false,
      errors: ['value-invalid'],
    });
    expect(result.current.edit({ id: 'c1', expectedVersion: 1, patch: { unit_value: '0' } })).toEqual({
      ok: false,
      errors: ['value-invalid'],
    });
    // RD-01: 11 fraction digits is still value-invalid (numeric(24,10) precision), but a
    // large *value* like 5000000 is not -- there is no static bound any more (see
    // engine/money/__tests__/customCurrency.test.ts).
    expect(result.current.edit({ id: 'c1', expectedVersion: 1, patch: { unit_value: '1.00000000001' } })).toEqual({
      ok: false,
      errors: ['value-invalid'],
    });
    expect(result.current.edit({ id: 'c1', expectedVersion: 1, patch: { unit_value: 'x' } }, { locale: 'en-US' })).toEqual({
      ok: false,
      errors: ['value-invalid'],
    });
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
    const rows = qc.getQueryData<WithPending<CustomCurrencyRow>[]>(queryKeys.customCurrencies('user-1'));
    expect(rows?.[0]?.unit_value).toBe('2.5000000000');
  });

  it('a version conflict parks the attempt as kind conflict and keeps the server row', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const serverRow = customRow({ version: 5, unit_value: '9.0000000000' });
    fake.respondWith({ data: [], error: null, status: 200 });
    fake.respondWith({ data: serverRow, error: null, status: 200 });

    const qc = newClient();
    qc.setQueryData(queryKeys.customCurrencies('user-1'), [customRow({ id: 'c1', version: 1 })]);
    const { result } = await renderHook(() => useEditCustomCurrency('user-1'), { wrapper: wrapper(qc) });

    result.current.edit({ id: 'c1', expectedVersion: 1, patch: { unit_value: '3.0000000000' } });

    await waitFor(() => {
      expect(recordFailedWrite).toHaveBeenCalledWith(expect.objectContaining({ entity: 'custom_currencies', kind: 'conflict' }));
    });

    const rows = qc.getQueryData<WithPending<CustomCurrencyRow>[]>(queryKeys.customCurrencies('user-1'));
    expect(rows?.[0]).toMatchObject({ version: 5, unit_value: '9.0000000000' });
  });
});
