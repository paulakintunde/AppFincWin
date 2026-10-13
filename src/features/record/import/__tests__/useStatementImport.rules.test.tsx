// 02.3-16 (REC-27, D-11, D-29): category rules reach the statement import preview, and a failed
// rules read never blocks the import. Harness copied from useStatementImport.reconcile.test.tsx.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow } from '@/db/rows';
import { useStatementImport } from '../useStatementImport';

let mockUuid = 0;

jest.mock('@/services/files/pickStatement', () => ({ pickStatementBytes: jest.fn() }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/importProfiles', () => ({ fetchImportProfile: jest.fn() }));
jest.mock('@/db/categoryRules', () => ({ fetchCategoryRules: jest.fn() }));
jest.mock('@/db/transactions', () => ({
  fetchTransactionsInRange: jest.fn(),
  fetchTransferCandidates: jest.fn(),
  fetchHasRowsBefore: jest.fn(),
  fetchHasRowsAfter: jest.fn(),
  fetchCategorisedNames: jest.fn(),
}));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => `id-${++mockUuid}` }));
jest.mock('@/data/mutations/importFinalize', () => ({ useImportCommit: () => ({ commit: jest.fn() }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({
  ...jest.requireActual('@/data/mutations/recurringSeries'),
  useCreateSeries: () => ({ create: jest.fn(() => 'series-step') }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-GB', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'user-1',
    householdId: 'hh-1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'UTC',
    today: '2026-10-06',
  }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({
    all: [{ id: 'cat-groc-rule', builtin_key: null, name: 'Food shop', color_key: 'teal', is_system: false, archived_at: null }],
    builtinIds: new Map(),
    transferCategoryId: 'cat-transfer',
    loading: false,
  }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [], isLoading: false }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: new Map([['acc-1', { balance: 5000 }]]), isLoading: false }),
}));
jest.mock('@/services/statementPdf', () => ({ readPdfStatement: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { pickStatementBytes } = require('@/services/files/pickStatement') as { pickStatementBytes: jest.Mock };
const { fetchImportProfile } = require('@/db/importProfiles') as { fetchImportProfile: jest.Mock };
const { fetchCategoryRules } = require('@/db/categoryRules') as { fetchCategoryRules: jest.Mock };
const dbTx = require('@/db/transactions') as {
  fetchTransactionsInRange: jest.Mock;
  fetchTransferCandidates: jest.Mock;
  fetchHasRowsBefore: jest.Mock;
  fetchHasRowsAfter: jest.Mock;
  fetchCategorisedNames: jest.Mock;
};
/* eslint-enable @typescript-eslint/no-require-imports */

function account(over: Partial<AccountRow>): AccountRow {
  return {
    id: 'acc-1',
    deleted_at: null,
    is_sample: false,
    household_id: 'hh-1',
    created_by: 'user-1',
    name: 'Current',
    kind: 'checking',
    currency: 'GBP',
    opening_balance: 0,
    archived_at: null,
    updated_by: null,
    overdraft_limit: null,
    credit_limit: null,
    version: 3,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}
const mockAccounts: AccountRow[] = [account({}), account({ id: 'acc-2', name: 'Savings', kind: 'savings' })];

const OFX_DIR = path.join(__dirname, '..', '..', '..', '..', 'engine', 'ofx', '__tests__', 'fixtures');
const ofxBytes = (): Uint8Array => new Uint8Array(fs.readFileSync(path.join(OFX_DIR, 'bank-sgml.ofx')));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

async function toPreview() {
  pickStatementBytes.mockResolvedValueOnce({ kind: 'ok', bytes: ofxBytes(), mimeType: null, extension: 'ofx' });
  const hook = await renderHook(() => useStatementImport({ entry: 'account', accountId: 'acc-1' }), { wrapper: wrapper() });
  await act(async () => {
    hook.result.current.start();
  });
  await act(async () => {
    hook.result.current.confirmFormat();
  });
  await waitFor(() => expect(hook.result.current.preview).not.toBeNull());
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUuid = 0;
  fetchImportProfile.mockResolvedValue(null);
  dbTx.fetchTransactionsInRange.mockResolvedValue([]);
  dbTx.fetchTransferCandidates.mockResolvedValue([]);
  dbTx.fetchHasRowsBefore.mockResolvedValue(false);
  dbTx.fetchHasRowsAfter.mockResolvedValue(false);
  dbTx.fetchCategorisedNames.mockResolvedValue([]);
});

describe('useStatementImport: category rules (02.3-16)', () => {
  it('builds the preview with no rules when the rules read fails', async () => {
    fetchCategoryRules.mockRejectedValue(new Error('offline'));
    const { result } = await toPreview();
    expect(result.current.preview?.rows.length).toBeGreaterThan(0);
    expect(result.current.preview?.rows.some((r) => r.categorySource === 'rule-personal')).toBe(false);
  });

  it('uses a personal rule to categorise preview rows', async () => {
    fetchCategoryRules.mockResolvedValue([
      { id: 'rule-1', scope: 'personal', keyword_norm: 'tesco', category_id: 'cat-groc-rule', target_builtin_key: null, target_name: null },
    ]);
    const { result } = await toPreview();
    const ruled = result.current.preview?.rows.filter((r) => r.categorySource === 'rule-personal') ?? [];
    expect(ruled.length).toBeGreaterThan(0);
    expect(ruled.every((r) => r.categoryId === 'cat-groc-rule')).toBe(true);
  });
});
