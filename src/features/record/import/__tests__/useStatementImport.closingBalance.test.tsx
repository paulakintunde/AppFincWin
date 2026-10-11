// Debug pdf-closing-balance-unverified (02.1 walkthrough step 9b): a period-less, balance-less PDF
// imported into an account whose stored balance comes from accounts.opening_balance plus earlier
// rows, checked against the closing balance the bank printed. The database is mocked at the
// Supabase client level only: the real db/ readers, the real useAccountBalances and the real
// pipeline and engine all run.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow } from '@/db/rows';
import { useStatementImport } from '../useStatementImport';

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

// The production account "Checking test": opening 1000.00, one paid -100.00 row before the file.
const mockTables: Record<string, Row[]> = {
  transactions_active: [
    {
      id: 'tx-old',
      household_id: 'hh-1',
      account_id: 'acc-1',
      created_by: 'user-1',
      local_date: '2026-02-01',
      original_amount: -10000,
      original_currency: 'GBP',
      status: 'paid',
      name: 'Earlier spend',
      category_id: null,
      transfer_id: null,
      is_refund: false,
      is_automatic: false,
      external_id: null,
      import_format: null,
      payment_type: null,
      version: 1,
      created_at: '2026-02-01T09:00:00Z',
      updated_at: '2026-02-01T09:00:00Z',
    },
  ],
  import_profiles: [],
};

// What the account_balances RPC returns for that account: the paid and pending sums of its legs.
const mockRpc: Record<string, Row[]> = {
  account_balances: [{ account_id: 'acc-1', currency: 'GBP', paid_sum: '-10000', pending_sum: '0' }],
};

function mockQuery(table: string) {
  const filters: Filter[] = [];
  let limit: number | null = null;
  let window: [number, number] | null = null;
  const run = () => {
    let rows = (mockTables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (window !== null) rows = rows.slice(window[0], window[1] + 1);
    if (limit !== null) rows = rows.slice(0, limit);
    return rows;
  };
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
    lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), b),
    lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), b),
    gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), b),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
    is: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    not: (c: string, op: string, v: unknown) => (filters.push((r) => !(op === 'is' && r[c] === v)), b),
    order: () => b,
    limit: (n: number) => ((limit = n), b),
    range: (from: number, to: number) => ((window = [from, to]), b),
    maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null, status: 200 }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const rows = run();
      return Promise.resolve({ data: rows, error: null, status: 200, count: rows.length }).then(resolve, reject);
    },
  };
  return b;
}

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: (table: string) => mockQuery(table),
    rpc: (name: string) => Promise.resolve({ data: mockRpc[name] ?? [], error: null, status: 200 }),
  },
}));
jest.mock('@/services/files/pickStatement', () => ({ pickStatementBytes: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: () => undefined }) }));
jest.mock('@/state/undoToast', () => ({ showToast: () => undefined }));
jest.mock('@/data/mutations/importFinalize', () => ({ useImportCommit: () => ({ commit: () => undefined }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({
  ...jest.requireActual('@/data/mutations/recurringSeries'),
  useCreateSeries: () => ({ create: () => 'series-step' }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-GB', timeZone: 'Europe/London', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'user-1',
    householdId: 'hh-1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'Europe/London',
    today: '2026-10-11',
  }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ builtinIds: new Map(), transferCategoryId: 'cat-transfer', loading: false }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [], isLoading: false }) }));
const mockReadPdf = jest.fn();
jest.mock('@/services/statementPdf', () => ({ readPdfStatement: (...a: unknown[]) => mockReadPdf(...a) }));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  onlineManager: { isOnline: () => true },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pickStatementBytes } = require('@/services/files/pickStatement') as { pickStatementBytes: jest.Mock };

const mockAccounts: AccountRow[] = [
  {
    id: 'acc-1',
    deleted_at: null,
    is_sample: false,
    household_id: 'hh-1',
    created_by: 'user-1',
    name: 'Checking test',
    kind: 'checking',
    currency: 'GBP',
    opening_balance: 100000,
    archived_at: null,
    updated_by: null,
    overdraft_limit: null,
    credit_limit: null,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const PDF_FIXTURES = path.join(__dirname, '..', '..', '..', '..', 'engine', 'statement', 'pdf', '__tests__', 'fixtures');
const extraction = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(PDF_FIXTURES, `${name}.extract.json`), 'utf8'));

async function readNoBalances() {
  const hook = await renderHook(() => useStatementImport({ entry: 'account', accountId: 'acc-1' }), {
    wrapper: function Wrapper({ children }: { children: React.ReactNode }) {
      const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    },
  });
  pickStatementBytes.mockResolvedValueOnce({ kind: 'ok', bytes: new TextEncoder().encode('%PDF-1.4'), mimeType: null, extension: 'pdf' });
  mockReadPdf.mockResolvedValueOnce({ kind: 'ok', extraction: extraction('no-balances') });
  await act(async () => {
    hook.result.current.start();
  });
  await act(async () => {
    await hook.result.current.sendPdf();
  });
  return hook;
}

describe('useStatementImport: entered closing balance against the stored balance (debug pdf-closing-balance-unverified)', () => {
  it("the bank's closing balance verifies every certain row; only the ambiguous-column row is left to check", async () => {
    const { result } = await readNoBalances();
    expect(result.current.stage).toBe('pdf-balance');
    // 1000.00 - 100.00 before the file, +1121.70 across it: the statement closes at 2021.70.
    await act(async () => {
      expect(result.current.submitClosingBalance('2021.70')).toEqual({ ok: true });
    });
    expect(result.current.formatFigures?.closing).toBe(202170);
    await act(async () => {
      result.current.confirmFormat();
    });
    await waitFor(() => expect(result.current.preview).not.toBeNull());

    const rows = result.current.preview!.rows;
    const checks = rows.map((r) => r.check);
    expect(checks.filter((c) => c === 'verified')).toHaveLength(9);
    expect(checks[6]).toBe('cannot-verify');
    // LITWARE BOOKS printed 18.50 with no column to say which way: only money out ties the ends.
    expect(rows[6]!.converted.amount).toBe(-1850);
    expect(result.current.reconcile?.file).toBe('partial');
    expect(result.current.reviewGate).toEqual({ required: true, count: 1 });
  });

  it('a closing balance that ties with neither reading of the ambiguous row still verifies nothing', async () => {
    const { result } = await readNoBalances();
    await act(async () => {
      result.current.submitClosingBalance('2000.00');
    });
    await act(async () => {
      result.current.confirmFormat();
    });
    await waitFor(() => expect(result.current.preview).not.toBeNull());
    expect(result.current.preview!.rows.map((r) => r.check)).not.toContain('verified');
    expect(result.current.reviewGate).toEqual({ required: true, count: 10 });
  });
});
