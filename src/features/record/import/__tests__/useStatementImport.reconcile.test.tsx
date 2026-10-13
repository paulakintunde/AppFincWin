// 02.3-10 (REC-26): the choose-mode stage between format confirmation and review. The pipeline and
// the engine run for real; the picker, the database reads, the mutation hooks and analytics are mocked.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow } from '@/db/rows';
import { useStatementImport } from '../useStatementImport';

const mockTrack = jest.fn();
const mockCommit = jest.fn();
let mockUuid = 0;

jest.mock('@/services/files/pickStatement', () => ({ pickStatementBytes: jest.fn() }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/importProfiles', () => ({ fetchImportProfile: jest.fn() }));
jest.mock('@/db/transactions', () => ({
  fetchTransactionsInRange: jest.fn(),
  fetchTransferCandidates: jest.fn(),
  fetchHasRowsBefore: jest.fn(),
  fetchHasRowsAfter: jest.fn(),
  fetchCategorisedNames: jest.fn(),
}));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...args: unknown[]) => mockTrack(...args) }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => `id-${++mockUuid}` }));
jest.mock('@/data/mutations/importFinalize', () => ({ useImportCommit: () => ({ commit: (...args: unknown[]) => mockCommit(...args) }) }));
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
  useCategoryLookup: () => ({ all: [], builtinIds: new Map(), transferCategoryId: 'cat-transfer', loading: false }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [], isLoading: false }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: new Map([['acc-1', { balance: 5000 }]]), isLoading: false }),
}));
jest.mock('@/services/statementPdf', () => ({ readPdfStatement: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pickStatementBytes } = require('@/services/files/pickStatement') as { pickStatementBytes: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fetchImportProfile } = require('@/db/importProfiles') as { fetchImportProfile: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dbTx = require('@/db/transactions') as {
  fetchTransactionsInRange: jest.Mock;
  fetchTransferCandidates: jest.Mock;
  fetchHasRowsBefore: jest.Mock;
  fetchHasRowsAfter: jest.Mock;
  fetchCategorisedNames: jest.Mock;
};

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
const csvBytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const CSV_DECIDED = ['Date,Description,Debit,Credit', '2026-03-01,COFFEE,3.50,', '2026-03-02,PAYSLIP,,1000.00', '2026-03-09,COFFEE,3.50,'].join('\n');

function pickOk(bytes: Uint8Array, extension: 'csv' | 'ofx') {
  pickStatementBytes.mockResolvedValueOnce({ kind: 'ok', bytes, mimeType: null, extension });
}

let testClient: QueryClient;
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  testClient = client;
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup() {
  return renderHook(() => useStatementImport({ entry: 'account', accountId: 'acc-1' }), { wrapper: wrapper() });
}

type Hook = Awaited<ReturnType<typeof setup>>;

async function toChooseMode(bytes: Uint8Array, extension: 'csv' | 'ofx'): Promise<Hook> {
  pickOk(bytes, extension);
  const hook = await setup();
  await act(async () => {
    hook.result.current.start();
  });
  await act(async () => {
    hook.result.current.confirmFormat();
  });
  if (extension === 'csv') {
    await act(async () => {
      await hook.result.current.continue();
    });
  }
  await waitFor(() => expect(hook.result.current.preview).not.toBeNull());
  return hook;
}

const stored = (over: Record<string, unknown>) => ({
  id: 'stored-1',
  household_id: 'hh-1',
  account_id: 'acc-1',
  original_amount: -100,
  original_currency: 'GBP',
  local_date: '2026-09-01',
  name: 'SOMETHING ELSE',
  category_id: null,
  payment_type: null,
  status: 'paid',
  transfer_id: null,
  external_id: null,
  import_format: null,
  version: 2,
  ...over,
});

// The two stored rows that findDuplicates matches to SYN0001 and SYN0002 of bank-sgml.ofx.
const MATCH_1 = stored({ id: 'dup-1', original_amount: -4500, name: 'TESCO STORES', external_id: 'SYN0001', import_format: 'ofx', local_date: '2026-09-01' });
const MATCH_2 = stored({ id: 'dup-2', original_amount: -1250, name: 'COSTA COFFEE', external_id: 'SYN0002', import_format: 'ofx', local_date: '2026-09-03' });

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockUuid = 0;
  fetchImportProfile.mockResolvedValue(null);
  dbTx.fetchTransactionsInRange.mockResolvedValue([]);
  dbTx.fetchTransferCandidates.mockResolvedValue([]);
  dbTx.fetchHasRowsBefore.mockResolvedValue(false);
  dbTx.fetchHasRowsAfter.mockResolvedValue(false);
  dbTx.fetchCategorisedNames.mockResolvedValue([]);
});

describe('useStatementImport: choose-mode stage (REC-26)', () => {
  it('an OFX file ends in choose-mode with the preview built and no mode chosen', async () => {
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    expect(result.current.stage).toBe('choose-mode');
    expect(result.current.mode).toBeNull();
    expect(result.current.preview).not.toBeNull();
  });

  it('a CSV file ends in choose-mode after mapping', async () => {
    const { result } = await toChooseMode(csvBytes(CSV_DECIDED), 'csv');
    expect(result.current.stage).toBe('choose-mode');
    expect(result.current.mode).toBeNull();
  });

  it('overlapCount is the number of lines the duplicate pass matched', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([MATCH_1, MATCH_2]);
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    expect(result.current.overlapCount).toBe(2);
  });

  it('overlapCount is 0 when nothing overlaps, and the choice is still offered', async () => {
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    expect(result.current.overlapCount).toBe(0);
    expect(result.current.stage).toBe('choose-mode');
    await act(async () => {
      result.current.chooseMode('reconcile');
    });
    expect(result.current.stage).toBe('review');
  });

  it('reconcile: unmatched unlocked lines start ticked, matched lines unticked', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([MATCH_1, MATCH_2]);
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    await act(async () => {
      result.current.chooseMode('reconcile');
    });
    expect(result.current.stage).toBe('review');
    expect(result.current.mode).toBe('reconcile');
    const rows = result.current.preview!.rows;
    for (const r of rows) {
      const ticked = result.current.rowState(r.index).included;
      if (r.duplicate !== null) expect(ticked).toBe(false);
      else if (!r.locked) expect(ticked).toBe(true);
    }
    const unmatched = rows.filter((r) => r.duplicate === null && !r.locked).length;
    expect(result.current.counts.included).toBe(unmatched);
  });

  it('new: keeps the existing defaults, duplicates unticked and flagged', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([MATCH_1]);
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    await act(async () => {
      result.current.chooseMode('new');
    });
    expect(result.current.stage).toBe('review');
    expect(result.current.mode).toBe('new');
    expect(result.current.counts).toEqual({ total: 5, included: 3, duplicates: 1, blocked: 1, cannotVerify: expect.any(Number) });
  });

  it('a failed read with no cached month refuses reconcile but allows new', async () => {
    dbTx.fetchTransactionsInRange.mockRejectedValue(new Error('offline'));
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    expect(result.current.existingChecked).toBe(false);
    await act(async () => {
      result.current.chooseMode('reconcile');
    });
    expect(result.current.stage).toBe('choose-mode');
    await act(async () => {
      result.current.chooseMode('new');
    });
    expect(result.current.stage).toBe('review');
  });

  it('a successful read counts as checked', async () => {
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    expect(result.current.existingChecked).toBe(true);
  });

  it('chooseMode before the preview is ready does nothing', async () => {
    const releases: ((v: unknown[]) => void)[] = [];
    dbTx.fetchTransactionsInRange.mockImplementation(() => new Promise((res) => releases.push(res)));
    pickOk(ofxBytes(), 'ofx');
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.confirmFormat();
    });
    expect(result.current.stage).toBe('choose-mode');
    expect(result.current.preview).toBeNull();
    await act(async () => {
      result.current.chooseMode('new');
    });
    expect(result.current.stage).toBe('choose-mode');
    await act(async () => {
      releases.forEach((r) => r([]));
    });
    await waitFor(() => expect(result.current.preview).not.toBeNull());
  });

  it('chooseMode outside the stage does nothing', async () => {
    pickOk(ofxBytes(), 'ofx');
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.chooseMode('new');
    });
    expect(result.current.stage).toBe('format');
  });
});

describe('useStatementImport: reconcile extras (D-23)', () => {
  it('lists unmatched paid in-period lines, not matched, pending or out-of-period ones', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([
      MATCH_1,
      MATCH_2,
      stored({ id: 'extra-1', original_amount: -999, name: 'ONLY IN APP', local_date: '2026-09-04' }),
      stored({ id: 'pend-1', original_amount: -777, name: 'PENDING', local_date: '2026-09-04', status: 'pending' }),
      stored({ id: 'out-1', original_amount: -555, name: 'BEFORE PERIOD', local_date: '2026-08-30' }),
    ]);
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    const ids = result.current.extras.map((e) => e.id);
    expect(ids).toEqual(['extra-1']);
    expect(result.current.extraRows.get('extra-1')?.name).toBe('ONLY IN APP');
    expect(result.current.extraRows.has('dup-1')).toBe(false);
    expect(result.current.extraRows.has('pend-1')).toBe(false);
  });

  it('pairs an extra with a missing statement line of equal amount a couple of days away', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([
      MATCH_1,
      MATCH_2,
      stored({ id: 'near-1', original_amount: -30000, name: 'RENT', local_date: '2026-09-06' }),
    ]);
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    const rent = result.current.preview!.rows.find((r) => r.converted.description.includes('RENT PAYMENT'))!;
    expect(result.current.nearByIndex.get(rent.index)).toBe('near-1');
    expect(result.current.extras[0]?.nearIndex).toBe(rent.index);
  });

  it('has no extras when the existing entries could not be read', async () => {
    dbTx.fetchTransactionsInRange.mockRejectedValue(new Error('offline'));
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    expect(result.current.extras).toEqual([]);
  });
});

describe('useStatementImport: navigation around choose-mode', () => {
  it('Back from review returns to choose-mode with the preview kept', async () => {
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    await act(async () => {
      result.current.chooseMode('new');
    });
    await act(async () => {
      result.current.back();
    });
    expect(result.current.stage).toBe('choose-mode');
    expect(result.current.preview).not.toBeNull();
  });

  it('Back from choose-mode goes to format for OFX and mapping for CSV', async () => {
    const ofx = await toChooseMode(ofxBytes(), 'ofx');
    await act(async () => {
      ofx.result.current.back();
    });
    expect(ofx.result.current.stage).toBe('format');
    const csv = await toChooseMode(csvBytes(CSV_DECIDED), 'csv');
    await act(async () => {
      csv.result.current.back();
    });
    expect(csv.result.current.stage).toBe('mapping');
  });

  it('Cancel from choose-mode tracks import_abandoned at format', async () => {
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    await act(async () => {
      result.current.cancel();
    });
    expect(mockTrack).toHaveBeenCalledWith('import_abandoned', { stage: 'format' });
    expect(result.current.stage).toBe('idle');
  });

  it('commit after reconcile writes exactly the ticked rows in one commit call', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([MATCH_1, MATCH_2]);
    const { result } = await toChooseMode(ofxBytes(), 'ofx');
    await act(async () => {
      result.current.chooseMode('reconcile');
    });
    const ticked = result.current.counts.included;
    expect(ticked).toBeGreaterThan(0);
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockCommit.mock.calls[0]![0].rows).toHaveLength(ticked);
  });
});

afterAll(() => {
  void testClient;
});
