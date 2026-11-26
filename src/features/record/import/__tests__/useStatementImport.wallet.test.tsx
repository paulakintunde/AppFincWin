// 10-26 (IMP-06, D-21..D-23, D-27): the wallet path of the import machine -- detection straight to a
// wallet preview, nothing created or written without a tap, the commit's rows, fee category and
// 500-change refusal. The engine and pipeline run for real; the picker and the writes are mocked.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { useStatementImport } from '../useStatementImport';

const { setMockQueued } = jest.requireMock('@/data/sync/useQueueGuard') as { setMockQueued: (n: number) => void };

const mockCommit = jest.fn();
const mockAddCategory = jest.fn(() => ({ id: 'fees-new', stepId: 's' }));
let mockUuid = 0;
let mockBuiltinIds = new Map<string, string>();
let mockCategories: { id: string; builtin_key: string | null; name: string | null; is_system: boolean; archived_at: null }[] = [];

jest.mock('@/services/files/pickStatement', () => ({ pickStatementBytes: jest.fn() }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/importProfiles', () => ({ fetchImportProfile: jest.fn(async () => null) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => `id-${++mockUuid}` }));
jest.mock('@/data/mutations/importFinalize', () => ({ useImportCommit: () => ({ commit: (...a: unknown[]) => mockCommit(...a) }) }));
jest.mock('@/data/mutations/categories', () => ({ useAddCategory: () => ({ add: (...a: unknown[]) => mockAddCategory(...(a as [])) }) }));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-GB', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true, userId: 'user-1', householdId: 'hh-1', homeCurrency: 'EUR', showCents: true, region: 'GB', timeZone: 'UTC', today: '2026-10-06',
  }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [{ id: 'acc-eur', name: 'Revolut EUR', kind: 'checking', currency: 'EUR', archived_at: null, version: 1, credit_limit: null, overdraft_limit: null }],
  }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: mockCategories, active: mockCategories, builtinIds: mockBuiltinIds, transferCategoryId: 'cat-transfer', loading: false }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [], isLoading: false }) }));
jest.mock('@/data/queries/activity', () => ({ useAccountBalances: () => ({ balances: new Map(), isLoading: false }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pickStatementBytes } = require('@/services/files/pickStatement') as { pickStatementBytes: jest.Mock };

const REVOLUT = [
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
  'CARD_PAYMENT,Current,2026-03-06 09:00:00,2026-03-06 09:00:00,Bakery,-12.50,0.30,EUR,COMPLETED,',
  'EXCHANGE,Current,2026-03-05 10:00:00,2026-03-05 10:00:00,Exchanged to GBP,-100.00,0.50,EUR,COMPLETED,',
  'EXCHANGE,Current,2026-03-05 10:00:00,2026-03-05 10:00:00,Exchanged from EUR,85.10,0.00,GBP,COMPLETED,',
].join('\n');

const PLAIN_CSV = ['Date,Description,Amount', '2026-03-01,Shop,-5.00'].join(String.fromCharCode(10));

function wrapper(client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

async function started(text = REVOLUT, client?: QueryClient, accountId: string | null = 'acc-eur') {
  pickStatementBytes.mockResolvedValueOnce({ kind: 'ok', bytes: new TextEncoder().encode(text), mimeType: null, extension: 'csv' });
  const hook = await renderHook(() => useStatementImport({ entry: 'account', accountId }), { wrapper: wrapper(client) });
  await act(async () => {
    hook.result.current.start();
  });
  // D-34: the duplicate check and category guess finish before the Import pill enables.
  await act(async () => {
    await Promise.resolve();
  });
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUuid = 0;
  mockCategories = [];
  mockBuiltinIds = new Map();
  setMockQueued(0);
});

describe('useStatementImport: wallet files', () => {
  it('goes straight to the wallet preview: one account suggested, the other held back, nothing created or written', async () => {
    const { result } = await started();
    expect(result.current.stage).toBe('review');
    expect(result.current.wallet?.wallet).toBe('revolut');
    expect(result.current.walletPlan?.targets).toEqual([
      { currency: 'EUR', accountId: 'acc-eur', createName: null, create: false },
      { currency: 'GBP', accountId: null, createName: 'Revolut GBP', create: false },
    ]);
    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockAddCategory).not.toHaveBeenCalled();
  });

  it('commits only the lines of currencies with an account; the held-back GBP leg stays out and the conversion is not linked', async () => {
    const { result } = await started();
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit).toHaveBeenCalledTimes(1);
    const input = mockCommit.mock.calls[0]?.[0] as { rows: { original_currency: string }[]; walletFees: unknown[]; walletPairs: unknown[] };
    expect(input.rows.every((r) => r.original_currency === 'EUR')).toBe(true);
    expect(input.rows).toHaveLength(2);
    expect(input.walletPairs).toEqual([]);
    expect(input.walletFees).toHaveLength(2);
    expect(result.current.stage).toBe('done');
  });

  it('creates the Fees category on first use, and links the conversion once both currencies have an account', async () => {
    const { result } = await started();
    await act(async () => {
      result.current.linkWalletAccount('GBP', 'acc-gbp');
    });
    await act(async () => {
      result.current.commit();
    });
    expect(mockAddCategory).toHaveBeenCalledWith({ ownerId: 'user-1', name: 'Fees', colorKey: 'slate' });
    const input = mockCommit.mock.calls[0]?.[0] as { rows: unknown[]; walletFees: { row: { category_id: string } }[]; walletPairs: unknown[] };
    expect(input.walletFees.every((f) => f.row.category_id === 'fees-new')).toBe(true);
    expect(input.walletPairs).toHaveLength(1);
    expect(input.rows).toHaveLength(3);
  });

  it("reuses the person's own Fees category instead of creating another", async () => {
    mockCategories = [{ id: 'fees-own', builtin_key: null, name: 'fees', is_system: false, archived_at: null }];
    const { result } = await started();
    await act(async () => {
      result.current.commit();
    });
    expect(mockAddCategory).not.toHaveBeenCalled();
    const input = mockCommit.mock.calls[0]?.[0] as { walletFees: { row: { category_id: string } }[] };
    expect(input.walletFees[0]?.row.category_id).toBe('fees-own');
  });

  it('refuses the whole import up front when it would pass the 500-change cap, writing and creating nothing', async () => {
    setMockQueued(499);
    const { result } = await started();
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockAddCategory).not.toHaveBeenCalled();
    expect(result.current.commitProblem).toBe('queueFull');
    expect(result.current.stage).toBe('review');
  });

  it('D-34: importing the same wallet file twice adds nothing the second time (duplicates skipped, fees too)', async () => {
    const first = await started();
    await act(async () => {
      first.result.current.commit();
    });
    expect(mockCommit).toHaveBeenCalledTimes(1);
    const input = mockCommit.mock.calls[0]?.[0] as { rows: { id: string; account_id: string; local_date: string; original_amount: number; name: string | null; external_id: string | null; import_format: string | null }[]; walletFees: { row: { id: string; account_id: string; local_date: string; original_amount: number; name: string | null; external_id: string | null; import_format: string | null } }[] };
    // The stored rows the second import sees: the first import's lines and fee expenses.
    const stored = [...input.rows, ...input.walletFees.map((f) => f.row)].map((r) => ({ ...r, status: 'paid', version: 1, original_currency: 'EUR', transfer_id: null }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['transactions', 'hh-1', '2026-03'], stored);
    mockCommit.mockClear();
    const second = await started(REVOLUT, client);
    expect(second.result.current.walletMarksReady).toBe(true);
    expect(second.result.current.walletPlan?.duplicateCount).toBe(2);
    expect(second.result.current.walletPlan?.counts.lines).toBe(0);
    expect(second.result.current.walletPlan?.counts.fees).toBe(0);
    await act(async () => {
      second.result.current.commit();
    });
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('D-34: a known merchant line gets the guessed category the statement import would give it', async () => {
    mockBuiltinIds = new Map([['Groceries', 'cat-groceries']]);
    const { result } = await started(REVOLUT.replace('Bakery', 'Tesco Stores'));
    await act(async () => {
      result.current.commit();
    });
    const input = mockCommit.mock.calls[0]?.[0] as { rows: { name: string | null; category_id: string | null }[] };
    expect(input.rows.find((r) => r.name === 'Tesco Stores')?.category_id).toBe('cat-groceries');
    expect(input.rows.find((r) => r.name !== 'Tesco Stores')?.category_id).toBeNull();
  });

  it('10-28: a wallet file can be picked before any account exists; another file asks for one first', async () => {
    const wallet = await started(REVOLUT, undefined, null);
    expect(wallet.result.current.stage).toBe('review');
    expect(wallet.result.current.needAccount).toBe(false);
    const plain = await started(PLAIN_CSV, undefined, null);
    expect(plain.result.current.stage).toBe('idle');
    expect(plain.result.current.needAccount).toBe(true);
  });

  it('a switched-on currency with no account yet blocks the commit until its account exists', async () => {
    const { result } = await started();
    await act(async () => {
      result.current.setWalletCreate('GBP', true);
    });
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit).not.toHaveBeenCalled();
  });
});
