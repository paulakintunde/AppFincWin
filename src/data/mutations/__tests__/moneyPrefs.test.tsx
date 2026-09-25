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
