// 05-44: the estimate-gap read. Every fetcher and the Record context are mocked; this proves composition, the 3-decision floor
// (the engine's) and that nothing computed reaches the query cache.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useEstimateBias } from '../useEstimateBias';

jest.mock('@/services/supabase', () => ({ supabase: {} }));

const mockFetch = { checks: jest.fn(), links: jest.fn(), linked: jest.fn(), fx: jest.fn(), customs: jest.fn() };
jest.mock('@/db/decideChecks', () => ({ fetchDecideChecks: (...a: unknown[]) => mockFetch.checks(...a) }));
jest.mock('@/db/decideLinks', () => ({
  fetchDecideLinks: (...a: unknown[]) => mockFetch.links(...a),
  fetchLinkedLines: (...a: unknown[]) => mockFetch.linked(...a),
}));
jest.mock('@/db/fxRates', () => ({ fetchFxLatest: (...a: unknown[]) => mockFetch.fx(...a) }));
jest.mock('@/db/customCurrencies', () => ({ fetchCustomCurrencies: (...a: unknown[]) => mockFetch.customs(...a) }));

const mockCtx = { ready: true, userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: null, today: '2026-02-15' };
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockCtx }));

const check = (id: string) => ({
  id,
  status: 'bought',
  deleted_at: null,
  decided_at: '2026-01-10T12:00:00Z',
  inputs: {},
  estimate_day_one: 50_000,
  estimate_monthly_payment: 10_000,
  estimate_running: 2_000,
});
const link = (id: string, checkId: string, target: string) => ({
  id,
  check_id: checkId,
  entity: 'transactions',
  target_id: target,
  role: 'payment',
  deleted_at: null,
});
const payment = (id: string) => ({
  id,
  status: 'paid',
  deleted_at: null,
  local_date: '2026-01-20',
  home_currency: 'USD',
  home_amount: -12_000,
  original_amount: -12_000,
  original_currency: 'USD',
  orig_per_eur: null,
  recurring_series_id: null,
});

function setup(count: number) {
  const ids = Array.from({ length: count }, (_, i) => `c${i + 1}`);
  mockFetch.checks.mockResolvedValue(ids.map(check));
  mockFetch.links.mockResolvedValue(ids.map((id, i) => link(`k${i}`, id, `t${i}`)));
  mockFetch.linked.mockResolvedValue(ids.map((_, i) => payment(`t${i}`)));
  mockFetch.fx.mockResolvedValue([]);
  mockFetch.customs.mockResolvedValue([]);
}

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => useEstimateBias(), { wrapper });
  return { client, result: hook.result };
}

describe('useEstimateBias', () => {
  beforeEach(() => jest.clearAllMocks());

  it('gives no figure with two decisions that have actuals', async () => {
    setup(2);
    const { result } = await render();
    await waitFor(() => expect(mockFetch.linked).toHaveBeenCalled());
    await waitFor(() => expect(mockFetch.fx).toHaveBeenCalled());
    expect(result.current).toEqual({ running: null, payment: null, dayOne: null });
  });

  it('gives the payment figure from three decisions; figures with no actuals stay absent', async () => {
    setup(3);
    const { result } = await render();
    await waitFor(() => expect(result.current.payment).not.toBeNull());
    expect(result.current.payment).toMatchObject({ figure: 'monthly_payment', decisionsUsed: 3, biasBasisPoints: 2000 });
    expect(result.current.running).toBeNull();
    expect(result.current.dayOne).toBeNull();
  });

  it('is all null when the decisions cannot be read', async () => {
    setup(3);
    mockFetch.checks.mockRejectedValue(new Error('offline'));
    const { result } = await render();
    await waitFor(() => expect(mockFetch.checks).toHaveBeenCalled());
    expect(result.current).toEqual({ running: null, payment: null, dayOne: null });
  });

  it('WR-C12: more linked lines than one fetch returns gives no figure rather than a partial one', async () => {
    setup(3);
    const extra = Array.from({ length: 201 }, (_, i) => link(`x${i}`, 'c1', `extra-${String(i).padStart(3, '0')}`));
    mockFetch.links.mockResolvedValue([...['c1', 'c2', 'c3'].map((id, i) => link(`k${i}`, id, `t${i}`)), ...extra]);
    const { result } = await render();
    await waitFor(() => expect(mockFetch.links).toHaveBeenCalled());
    await waitFor(() => expect(mockFetch.fx).toHaveBeenCalled());
    expect(mockFetch.linked).not.toHaveBeenCalled();
    expect(result.current).toEqual({ running: null, payment: null, dayOne: null });
  });

  it('never stores a computed figure in the query cache', async () => {
    setup(3);
    const { result, client } = await render();
    await waitFor(() => expect(result.current.payment).not.toBeNull());
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey));
    expect(keys.some((k) => k.includes('estimate'))).toBe(false);
    expect(keys.some((k) => k.includes('"bias"'))).toBe(true); // only the linked-lines read, row-derived
  });
});
