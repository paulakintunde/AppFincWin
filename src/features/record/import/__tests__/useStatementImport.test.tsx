// 02-39: the statement import state machine. The pure pipeline (02-26) and the engine run for
// real; the picker, the database reads, the mutation hooks, analytics and the toast are mocked.
// D-39: nothing in these tests (or the hook) puts statement content in an analytics property.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow } from '@/db/rows';
import { useStatementImport } from '../useStatementImport';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

const mockTrack = jest.fn();
const mockCommit = jest.fn();
const mockCreateSeries = jest.fn(() => 'series-step');
const mockShowToast = jest.fn();
let mockUuid = 0;

jest.mock('@/services/files/pickStatement', () => ({ pickStatementBytes: jest.fn() }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/importProfiles', () => ({ fetchImportProfile: jest.fn() }));
jest.mock('@/db/transactions', () => ({
  fetchTransactionsInRange: jest.fn(),
  fetchTransferCandidates: jest.fn(),
  fetchHasRowsBefore: jest.fn(),
  fetchCategorisedNames: jest.fn(),
}));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...args: unknown[]) => mockTrack(...args) }) }));
jest.mock('@/state/undoToast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => `id-${++mockUuid}` }));
jest.mock('@/data/mutations/importFinalize', () => ({ useImportCommit: () => ({ commit: (...args: unknown[]) => mockCommit(...args) }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({ useCreateSeries: () => ({ create: (...args: unknown[]) => mockCreateSeries(...args) }) }));
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
  useCategoryLookup: () => ({ builtinIds: new Map(), transferCategoryId: 'cat-transfer', loading: false }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: new Map([['acc-1', { balance: 5000 }]]), isLoading: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pickStatementBytes } = require('@/services/files/pickStatement') as { pickStatementBytes: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fetchImportProfile } = require('@/db/importProfiles') as { fetchImportProfile: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dbTx = require('@/db/transactions') as Record<string, jest.Mock>;

function account(over: Partial<AccountRow>): AccountRow {
  return {
    id: 'acc-1',
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

const mockAccounts: AccountRow[] = [
  account({}),
  account({ id: 'acc-2', name: 'Savings', kind: 'savings' }),
  account({ id: 'acc-card', name: 'Card', kind: 'credit' }),
  account({ id: 'acc-eur', name: 'Euro', kind: 'checking', currency: 'EUR' }),
];

const OFX_DIR = path.join(__dirname, '..', '..', '..', '..', 'engine', 'ofx', '__tests__', 'fixtures');
function fixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(OFX_DIR, name)));
}
function csv(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// Debit/Credit columns decide the reading from the labels alone.
const CSV_DECIDED = ['Date,Description,Debit,Credit', '2026-03-01,COFFEE,3.50,', '2026-03-02,PAYSLIP,,1000.00', '2026-03-09,COFFEE,3.50,'].join('\n');
// A single signed Amount column with no balance cannot say which way round it reads.
const CSV_AMBIGUOUS = ['Date,Description,Amount', '2026-03-01,COFFEE,-3.50', '2026-03-02,PAYSLIP,1000.00'].join('\n');
// 03/04/2026 and 05/06/2026 read as either day-first or month-first.
const CSV_DATE_AMBIGUOUS = ['Date,Description,Debit,Credit', '03/04/2026,COFFEE,3.50,', '05/06/2026,PAYSLIP,,1000.00'].join('\n');

function pickOk(bytes: Uint8Array, extension: 'csv' | 'ofx' | 'qfx' | 'other' = 'csv') {
  pickStatementBytes.mockResolvedValueOnce({ kind: 'ok', bytes, mimeType: null, extension });
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup(opts: { entry?: 'onboarding' | 'you' | 'account'; accountId?: string | null } = {}) {
  return renderHook(() => useStatementImport({ entry: opts.entry ?? 'account', accountId: opts.accountId === undefined ? 'acc-1' : opts.accountId }), {
    wrapper: wrapper(),
  });
}

function trackedNames(): string[] {
  return mockTrack.mock.calls.map((c) => c[0] as string);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUuid = 0;
  fetchImportProfile.mockResolvedValue(null);
  dbTx.fetchTransactionsInRange.mockResolvedValue([]);
  dbTx.fetchTransferCandidates.mockResolvedValue([]);
  dbTx.fetchHasRowsBefore.mockResolvedValue(false);
  dbTx.fetchCategorisedNames.mockResolvedValue([]);
});

describe('useStatementImport: pick, statement choice, format and mapping', () => {
  it('start() fires import_started and a cancelled pick returns to idle', async () => {
    pickStatementBytes.mockResolvedValueOnce({ kind: 'canceled' });
    const { result } = setup({ entry: 'you' });
    await act(async () => {
      result.current.start();
    });
    expect(mockTrack).toHaveBeenCalledWith('import_started', { entry: 'you' });
    expect(result.current.stage).toBe('idle');
  });

  it('a rejected pick moves to rejected and fires import_file_rejected with the reason only', async () => {
    pickStatementBytes.mockResolvedValueOnce({ kind: 'rejected', reason: 'too_big' });
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.stage).toBe('rejected');
    expect(result.current.rejectReason).toBe('too_big');
    expect(mockTrack).toHaveBeenCalledWith('import_file_rejected', { reason: 'too_big' });
  });

  it('a file the pipeline cannot read is rejected with its typed reason', async () => {
    pickOk(csv('hello'), 'other');
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.stage).toBe('rejected');
    expect(result.current.rejectReason).toBe('unsupported_format');
    expect(mockTrack).toHaveBeenCalledWith('import_file_rejected', { reason: 'unsupported_format' });
  });

  it('an OFX file with two statements waits on choose-statement, then continues', async () => {
    pickOk(fixture('multi-statement.ofx'), 'ofx');
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.stage).toBe('choose-statement');
    expect(result.current.statementChoices).toHaveLength(2);
    await act(async () => {
      result.current.chooseStatement(1);
    });
    expect(result.current.stage).toBe('format');
    expect(result.current.format).toBe('ofx');
    expect(result.current.profile).not.toBeNull();
  });

  it('a decided CSV reading shows the format step with one example row, then goes to mapping', async () => {
    pickOk(csv(CSV_DECIDED));
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.stage).toBe('format');
    expect(result.current.profile?.decidedBy).toBe('labels');
    expect(result.current.rememberedNote).toBe(false);
    expect(result.current.exampleRow?.amount).toBe(-350);
    act(() => {
      result.current.confirmFormat();
    });
    expect(mockTrack).toHaveBeenCalledWith('import_format_confirmed', { format: 'csv', decided_by: 'labels', flipped: false });
    expect(result.current.stage).toBe('mapping');
    expect(result.current.mapping).not.toBeNull();
  });

  it('flip() replaces the profile and re-derives the example row; the event says flipped', async () => {
    pickOk(csv(CSV_AMBIGUOUS));
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    // ambiguous: no profile until one is chosen, and confirm is a no-op
    expect(result.current.stage).toBe('format');
    expect(result.current.profile).toBeNull();
    expect(result.current.candidates.length).toBeGreaterThanOrEqual(2);
    act(() => {
      result.current.confirmFormat();
    });
    expect(result.current.stage).toBe('format');
    expect(trackedNames()).not.toContain('import_format_confirmed');

    act(() => {
      result.current.chooseCandidate(0);
    });
    const before = result.current.exampleRow?.amount;
    expect(result.current.profile).not.toBeNull();
    act(() => {
      result.current.flip();
    });
    expect(result.current.exampleRow?.amount).toBe(-(before as number));
    act(() => {
      result.current.confirmFormat();
    });
    expect(mockTrack).toHaveBeenCalledWith('import_format_confirmed', { format: 'csv', decided_by: 'user', flipped: true });
    expect(result.current.stage).toBe('mapping');
  });

  it('a remembered reading that still holds skips the format step and shows the remembered note', async () => {
    pickOk(csv(CSV_DECIDED));
    fetchImportProfile.mockResolvedValueOnce({
      profile: { version: 1, source: 'csv', accountFamily: 'deposit', positiveMeans: 'money-in', balanceMeans: 'none', statedLimit: null, decidedBy: 'user' },
    });
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    expect(fetchImportProfile).toHaveBeenCalledWith(expect.anything(), 'user-1', 'acc-1', expect.any(String));
    expect(result.current.rememberedNote).toBe(true);
    expect(result.current.profile?.decidedBy).toBe('remembered');
    expect(result.current.stage).toBe('mapping');
  });

  it('a failing remembered-profile read never blocks the import', async () => {
    pickOk(csv(CSV_DECIDED));
    fetchImportProfile.mockRejectedValueOnce(new Error('offline'));
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.stage).toBe('format');
    expect(result.current.profile).not.toBeNull();
  });

  it('mapping errors recompute, an ambiguous date order must be asked, and continue fires the event', async () => {
    pickOk(csv(CSV_DATE_AMBIGUOUS));
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    act(() => {
      result.current.confirmFormat();
    });
    expect(result.current.stage).toBe('mapping');
    expect(result.current.dateAmbiguous).toBe(true);
    expect(result.current.dateNeedsChoice).toBe(true);

    // an unanswered date order blocks continue (E-CR-02)
    await act(async () => {
      result.current.continue();
    });
    expect(result.current.stage).toBe('mapping');
    expect(trackedNames()).not.toContain('import_mapping_confirmed');

    const detected = result.current.mapping;
    act(() => {
      result.current.setMapping({ ...(detected as NonNullable<typeof detected>), date: null });
    });
    expect(result.current.mappingErrors).toContain('no-date');
    act(() => {
      result.current.setMapping(detected as NonNullable<typeof detected>);
    });
    expect(result.current.mappingErrors).toEqual([]);

    act(() => {
      result.current.setDateFormat('MDY');
    });
    expect(result.current.dateNeedsChoice).toBe(false);
    await act(async () => {
      result.current.continue();
    });
    expect(mockTrack).toHaveBeenCalledWith('import_mapping_confirmed', { corrected: expect.any(Boolean) });
    expect(result.current.stage).toBe('review');
  });

  it('an OFX file skips mapping and goes straight to review', async () => {
    pickOk(fixture('bank-sgml.ofx'), 'ofx');
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.stage).toBe('format');
    await act(async () => {
      result.current.confirmFormat();
    });
    expect(result.current.stage).toBe('review');
    expect(mockTrack).toHaveBeenCalledWith('import_format_confirmed', expect.objectContaining({ format: 'ofx' }));
  });

  it('changing the account re-runs the reading for the new account kind', async () => {
    pickOk(csv(CSV_DECIDED));
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    fetchImportProfile.mockClear();
    await act(async () => {
      result.current.setAccount('acc-2');
    });
    expect(result.current.accountId).toBe('acc-2');
    expect(fetchImportProfile).toHaveBeenCalledWith(expect.anything(), 'user-1', 'acc-2', expect.any(String));
    expect(result.current.stage).toBe('format');
  });

  it('with no account the import waits for one, then reads', async () => {
    pickOk(csv(CSV_DECIDED));
    const { result } = setup({ accountId: null });
    await act(async () => {
      result.current.start();
    });
    expect(result.current.profile).toBeNull();
    expect(fetchImportProfile).not.toHaveBeenCalled();
    await act(async () => {
      result.current.setAccount('acc-1');
    });
    expect(result.current.profile).not.toBeNull();
  });

  it('cancel() fires import_abandoned with the stage and returns to idle', async () => {
    pickOk(csv(CSV_DECIDED));
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    act(() => {
      result.current.cancel();
    });
    expect(mockTrack).toHaveBeenCalledWith('import_abandoned', { stage: 'format' });
    expect(result.current.stage).toBe('idle');
    await waitFor(() => expect(result.current.profile).toBeNull());
  });

  it('never puts statement content in an analytics property', async () => {
    pickOk(csv(CSV_DECIDED));
    const { result } = setup();
    await act(async () => {
      result.current.start();
    });
    act(() => {
      result.current.confirmFormat();
    });
    const serialised = JSON.stringify(mockTrack.mock.calls);
    expect(serialised).not.toMatch(/COFFEE|PAYSLIP|3\.50|1000/);
  });
});
