// 02-39: the statement import state machine. The pure pipeline (02-26) and the engine run for
// real; the picker, the database reads, the mutation hooks, analytics and the toast are mocked.
// D-39: nothing in these tests (or the hook) puts statement content in an analytics property.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow } from '@/db/rows';
import { useStatementImport } from '../useStatementImport';
import * as suggestionCap from '../suggestionCap';
import * as pipeline from '../importPipeline';

const mockTrack = jest.fn();
const mockCommit = jest.fn();
const mockCreateSeries = jest.fn((..._args: unknown[]) => 'series-step');
const mockShowToast = jest.fn();
let mockTransferCategoryId: string | null = 'cat-transfer';
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
jest.mock('@/state/undoToast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => `id-${++mockUuid}` }));
jest.mock('@/data/mutations/importFinalize', () => ({ useImportCommit: () => ({ commit: (...args: unknown[]) => mockCommit(...args) }) }));
// 02.2-20: suggestionToSeries moved here from the pipeline; keep the real one, mock only the hook.
jest.mock('@/data/mutations/recurringSeries', () => ({
  ...jest.requireActual('@/data/mutations/recurringSeries'),
  useCreateSeries: () => ({ create: (...args: unknown[]) => mockCreateSeries(...args) }),
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
  useCategoryLookup: () => ({ builtinIds: new Map(), transferCategoryId: mockTransferCategoryId, loading: false }),
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
  jest.restoreAllMocks();
  mockTransferCategoryId = 'cat-transfer';
  mockUuid = 0;
  fetchImportProfile.mockResolvedValue(null);
  dbTx.fetchTransactionsInRange.mockResolvedValue([]);
  dbTx.fetchTransferCandidates.mockResolvedValue([]);
  dbTx.fetchHasRowsBefore.mockResolvedValue(false);
  dbTx.fetchHasRowsAfter.mockResolvedValue(false);
  dbTx.fetchCategorisedNames.mockResolvedValue([]);
});

describe('useStatementImport: pick, statement choice, format and mapping', () => {
  it('start() fires import_started and a cancelled pick returns to idle', async () => {
    pickStatementBytes.mockResolvedValueOnce({ kind: 'canceled' });
    const { result } = await setup({ entry: 'you' });
    await act(async () => {
      result.current.start();
    });
    expect(mockTrack).toHaveBeenCalledWith('import_started', { entry: 'you' });
    expect(result.current.stage).toBe('idle');
  });

  it('a rejected pick moves to rejected and fires import_file_rejected with the reason only', async () => {
    pickStatementBytes.mockResolvedValueOnce({ kind: 'rejected', reason: 'too_big' });
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.stage).toBe('rejected');
    expect(result.current.rejectReason).toBe('too_big');
    expect(mockTrack).toHaveBeenCalledWith('import_file_rejected', { reason: 'too_big' });
  });

  it('a file the pipeline cannot read is rejected with its typed reason', async () => {
    pickOk(csv('hello'), 'other');
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.stage).toBe('rejected');
    expect(result.current.rejectReason).toBe('unsupported_format');
    expect(mockTrack).toHaveBeenCalledWith('import_file_rejected', { reason: 'unsupported_format' });
  });

  it('an OFX file with two statements waits on choose-statement, then continues', async () => {
    pickOk(fixture('multi-statement.ofx'), 'ofx');
    const { result } = await setup();
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
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.stage).toBe('format');
    expect(result.current.profile?.decidedBy).toBe('labels');
    expect(result.current.rememberedNote).toBe(false);
    expect(result.current.exampleRow?.amount).toBe(-350);
    await act(async () => {
      result.current.confirmFormat();
    });
    expect(mockTrack).toHaveBeenCalledWith('import_format_confirmed', { format: 'csv', decided_by: 'labels', flipped: false });
    expect(result.current.stage).toBe('mapping');
    expect(result.current.mapping).not.toBeNull();
  });

  it('flip() replaces the profile and re-derives the example row; the event says flipped', async () => {
    pickOk(csv(CSV_AMBIGUOUS));
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    // ambiguous: no profile until one is chosen, and confirm is a no-op
    expect(result.current.stage).toBe('format');
    expect(result.current.profile).toBeNull();
    expect(result.current.candidates.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      result.current.confirmFormat();
    });
    expect(result.current.stage).toBe('format');
    expect(trackedNames()).not.toContain('import_format_confirmed');

    await act(async () => {
      result.current.chooseCandidate(0);
    });
    const before = result.current.exampleRow?.amount;
    expect(result.current.profile).not.toBeNull();
    await act(async () => {
      result.current.flip();
    });
    expect(result.current.exampleRow?.amount).toBe(-(before as number));
    await act(async () => {
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
    const { result } = await setup();
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
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.stage).toBe('format');
    expect(result.current.profile).not.toBeNull();
  });

  it('mapping errors recompute, an ambiguous date order must be asked, and continue fires the event', async () => {
    pickOk(csv(CSV_DATE_AMBIGUOUS));
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
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
    await act(async () => {
      result.current.setMapping({ ...(detected as NonNullable<typeof detected>), date: null });
    });
    expect(result.current.mappingErrors).toContain('no-date');
    await act(async () => {
      result.current.setMapping(detected as NonNullable<typeof detected>);
    });
    expect(result.current.mappingErrors).toEqual([]);

    await act(async () => {
      result.current.setDateFormat('MDY');
    });
    expect(result.current.dateNeedsChoice).toBe(false);
    await act(async () => {
      result.current.continue();
    });
    expect(mockTrack).toHaveBeenCalledWith('import_mapping_confirmed', { corrected: expect.any(Boolean) });
    expect(result.current.stage).toBe('review');
  });

  it('S-CR-06: remapping Date to an ambiguous column asks for the order again; it is never inherited', async () => {
    // Column 0 has a day above 12 (certainly day-first); column 1 reads either way.
    pickOk(csv(['Date,Value Date,Description,Debit,Credit', '25/03/2026,03/04/2026,COFFEE,3.50,', '26/03/2026,05/06/2026,PAYSLIP,,1000.00'].join('\n')));
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.confirmFormat();
    });
    expect(result.current.stage).toBe('mapping');
    const detected = result.current.mapping as NonNullable<typeof result.current.mapping>;
    expect(detected.date).toBe(0);
    expect(result.current.dateNeedsChoice).toBe(false);

    await act(async () => {
      result.current.setMapping({ ...detected, date: 1 });
    });
    expect(result.current.dateAmbiguous).toBe(true);
    expect(result.current.dateNeedsChoice).toBe(true);
    await act(async () => {
      result.current.continue();
    });
    expect(result.current.stage).toBe('mapping');

    // Back to the certain column: no question, and its own order applies.
    await act(async () => {
      result.current.setMapping(detected);
    });
    expect(result.current.dateNeedsChoice).toBe(false);
    expect(result.current.dateFormat).toBe('DMY');
  });

  it('S-CR-06: a date order chosen for one column is asked again after a remap', async () => {
    pickOk(csv(['Date,Value Date,Description,Debit,Credit', '03/04/2026,07/08/2026,COFFEE,3.50,', '05/06/2026,09/10/2026,PAYSLIP,,1000.00'].join('\n')));
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.confirmFormat();
    });
    await act(async () => {
      result.current.setDateFormat('MDY');
    });
    expect(result.current.dateNeedsChoice).toBe(false);
    const detected = result.current.mapping as NonNullable<typeof result.current.mapping>;
    await act(async () => {
      result.current.setMapping({ ...detected, date: detected.date === 0 ? 1 : 0 });
    });
    expect(result.current.dateNeedsChoice).toBe(true);
  });

  it('S-CR-06: remapping an amount column to one with an ambiguous decimal mark asks for the mark', async () => {
    // Debit/Credit settle the mark ('.'); Out/In read either way (1.234 is 1234 or 1.234).
    pickOk(
      csv(['Date,Description,Debit,Credit,Out,In', '2026-03-01,COFFEE,3.50,,1.234,', '2026-03-02,PAYSLIP,,1000.00,,2.345'].join('\n'))
    );
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.confirmFormat();
    });
    expect(result.current.stage).toBe('mapping');
    expect(result.current.notationNeedsChoice).toBe(false);
    const detected = result.current.mapping as NonNullable<typeof result.current.mapping>;
    await act(async () => {
      result.current.setMapping({ ...detected, debit: 4, credit: 5 });
    });
    expect(result.current.notationAmbiguous).toBe(true);
    expect(result.current.notationNeedsChoice).toBe(true);
    await act(async () => {
      result.current.continue();
    });
    expect(result.current.stage).toBe('mapping');
  });

  it('an OFX file skips mapping and goes straight to review', async () => {
    pickOk(fixture('bank-sgml.ofx'), 'ofx');
    const { result } = await setup();
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
    const { result } = await setup();
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
    const { result } = await setup({ accountId: null });
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
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.cancel();
    });
    expect(mockTrack).toHaveBeenCalledWith('import_abandoned', { stage: 'format' });
    expect(result.current.stage).toBe('idle');
    await waitFor(() => expect(result.current.profile).toBeNull());
  });

  it('never puts statement content in an analytics property', async () => {
    pickOk(csv(CSV_DECIDED));
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.confirmFormat();
    });
    const serialised = JSON.stringify(mockTrack.mock.calls);
    expect(serialised).not.toMatch(/COFFEE|PAYSLIP|3\.50|1000/);
  });
});

// ---------------------------------------------------------------------------------------
// Task 2: review, matches, commit and recurring suggestions
// ---------------------------------------------------------------------------------------

async function reachReview(bytes: Uint8Array, extension: 'csv' | 'ofx' | 'qfx', opts: { accountId?: string } = {}) {
  pickOk(bytes, extension);
  const hook = await setup({ accountId: opts.accountId ?? 'acc-1' });
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

const candidateLeg = (over: Record<string, unknown>) => ({
  id: 'leg-1',
  account_id: 'acc-2',
  local_date: '2026-09-08',
  original_amount: 30000,
  original_currency: 'GBP',
  name: 'RENT PAYMENT',
  payment_type: null,
  transfer_id: null,
  category_id: null,
  version: 4,
  ...over,
});

function rowIndex(result: { current: { preview: { rows: { index: number; converted: { description: string } }[] } | null } }, description: string): number {
  const row = result.current.preview!.rows.find((r) => r.converted.description === description);
  return row!.index;
}

describe('useStatementImport: review', () => {
  it('reads existing rows, candidates and learned names over the file range and builds the preview', async () => {
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    expect(dbTx.fetchTransactionsInRange).toHaveBeenCalledWith(expect.anything(), 'hh-1', {
      from: '2026-08-30',
      toInclusive: '2026-09-12',
      accountId: 'acc-1',
    });
    expect(dbTx.fetchTransferCandidates).toHaveBeenCalledWith(expect.anything(), 'hh-1', {
      excludeAccountId: 'acc-1',
      from: '2026-08-29',
      toInclusive: '2026-09-13',
    });
    expect(dbTx.fetchCategorisedNames).toHaveBeenCalledWith(expect.anything(), 'hh-1', 'user-1');
    // an OFX file also looks for rows before the period (the reconciliation anchor)
    expect(dbTx.fetchHasRowsBefore).toHaveBeenCalledWith(expect.anything(), 'hh-1', 'acc-1', '2026-09-01');
    expect(result.current.counts).toEqual(expect.objectContaining({ total: 5, blocked: 1, duplicates: 0 }));
    expect(result.current.reconcile).not.toBeNull();
  });

  it('S-WR-05: the stored balance stands in for the OFX opening only when nothing is dated after the file', async () => {
    dbTx.fetchHasRowsBefore.mockResolvedValue(true);
    const spy = jest.spyOn(pipeline, 'buildPreview');
    await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const input = spy.mock.calls.at(-1)![0] as { storedOpeningForFile: number | null };
    expect(input.storedOpeningForFile).toBe(5000);
  });

  it('I-02: asks whether any row is dated after the file with one limit-1 read, not a paged range read', async () => {
    dbTx.fetchHasRowsBefore.mockResolvedValue(true);
    await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    expect(dbTx.fetchHasRowsAfter).toHaveBeenCalledWith(expect.anything(), 'hh-1', 'acc-1', '2026-09-12');
    // two range reads: the file range itself and the one refund-purchases read (D-07)
    expect(dbTx.fetchTransactionsInRange).toHaveBeenCalledTimes(2);
  });

  it('S-WR-05: rows dated after the file mean the current balance is not the opening', async () => {
    dbTx.fetchHasRowsBefore.mockResolvedValue(true);
    dbTx.fetchHasRowsAfter.mockResolvedValue(true);
    const spy = jest.spyOn(pipeline, 'buildPreview');
    await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const input = spy.mock.calls.at(-1)![0] as { storedOpeningForFile: number | null };
    expect(input.storedOpeningForFile).toBeNull();
  });

  it('I-02: a failed after-read drops the fallback rather than assume nothing is later', async () => {
    dbTx.fetchHasRowsBefore.mockResolvedValue(true);
    dbTx.fetchHasRowsAfter.mockRejectedValue(new Error('offline'));
    const spy = jest.spyOn(pipeline, 'buildPreview');
    await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const input = spy.mock.calls.at(-1)![0] as { storedOpeningForFile: number | null };
    expect(input.storedOpeningForFile).toBeNull();
  });

  it('S-WR-13: per-row lookups are keyed, not a scan of every preview row', async () => {
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const rows = result.current.preview!.rows;
    const find = jest.spyOn(rows, 'find');
    for (const r of rows) result.current.rowState(r.index);
    await act(async () => {
      result.current.toggleRow(rows[0]!.index);
    });
    expect(find).not.toHaveBeenCalled();
  });

  it('does not look for earlier rows for a CSV file', async () => {
    await reachReview(csv(CSV_DECIDED), 'csv');
    expect(dbTx.fetchHasRowsBefore).not.toHaveBeenCalled();
  });

  it('every read failing falls back and the preview is still built', async () => {
    dbTx.fetchTransactionsInRange.mockRejectedValue(new Error('offline'));
    dbTx.fetchTransferCandidates.mockRejectedValue(new Error('offline'));
    dbTx.fetchHasRowsBefore.mockRejectedValue(new Error('offline'));
    dbTx.fetchCategorisedNames.mockRejectedValue(new Error('offline'));
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    expect(result.current.stage).toBe('review');
    expect(result.current.preview?.rows).toHaveLength(5);
  });

  it('a stored FITID match is a duplicate and excluded by default; rows can be toggled, categorised and bulk-included', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([
      stored({ id: 'dup-1', original_amount: -4500, name: 'TESCO STORES', external_id: 'SYN0001', import_format: 'ofx' }),
    ]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    expect(result.current.counts).toEqual({ total: 5, included: 3, duplicates: 1, blocked: 1, cannotVerify: expect.any(Number) });

    const rows = result.current.preview!.rows;
    const dup = rows.find((r) => r.duplicate !== null)!;
    const locked = rows.find((r) => r.locked)!;
    const plain = rows.find((r) => !r.locked && r.duplicate === null)!;

    await act(async () => {
      result.current.toggleRow(locked.index);
    });
    expect(result.current.counts.included).toBe(3); // locked rows cannot be switched on
    await act(async () => {
      result.current.toggleRow(plain.index);
    });
    expect(result.current.counts.included).toBe(2);
    await act(async () => {
      result.current.setRowCategory(plain.index, 'cat-x');
    });
    expect(result.current.rowState(plain.index).categoryId).toBe('cat-x');
    await act(async () => {
      result.current.selectAllClean();
    });
    expect(result.current.rowState(dup.index).included).toBe(false);
    expect(result.current.counts.included).toBe(3);
  });

  it('a card statement offering a limit lets acceptLimit toggle it', async () => {
    const { result } = await reachReview(fixture('card-over-limit.ofx'), 'ofx', { accountId: 'acc-card' });
    expect(result.current.limitOffer).not.toBeNull();
    expect(result.current.limitAccepted).toBe(false);
    await act(async () => {
      result.current.acceptLimit(true);
    });
    expect(result.current.limitAccepted).toBe(true);
  });
});

describe('useStatementImport: matches', () => {
  it('goes straight to commit when nothing is suggested', async () => {
    const { result } = await reachReview(csv(CSV_DECIDED), 'csv');
    expect(result.current.transferRows).toHaveLength(0);
    expect(result.current.payMatchRows).toHaveLength(0);
    await act(async () => {
      result.current.continue();
    });
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(result.current.stage).toBe('done');
  });

  it('a transfer pair is only linked when accepted; the default is a plain import', async () => {
    dbTx.fetchTransferCandidates.mockResolvedValue([candidateLeg({})]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    expect(result.current.transferRows).toHaveLength(1);
    const rent = rowIndex(result, 'RENT PAYMENT');
    expect(result.current.transferRows[0]).toEqual(expect.objectContaining({ index: rent, answer: null }));
    await act(async () => {
      result.current.continue();
    });
    expect(result.current.stage).toBe('matches');

    // nothing accepted -> nothing linked
    await act(async () => {
      result.current.dismissTransfer(rent);
    });
    expect(mockTrack).toHaveBeenCalledWith('transfer_suggestion_answered', { accepted: false, kind: 'pair' });
    await act(async () => {
      result.current.commit();
    });
    const input = mockCommit.mock.calls[0]![0];
    expect(input.finalize.links).toEqual([]);
    expect(input.rows.some((r: { name: string }) => r.name === 'RENT PAYMENT')).toBe(true);
  });

  it('accepting a pair links the imported row to the stored leg with its transfer id', async () => {
    dbTx.fetchTransferCandidates.mockResolvedValue([candidateLeg({})]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const rent = rowIndex(result, 'RENT PAYMENT');
    await act(async () => {
      result.current.continue();
    });
    await act(async () => {
      result.current.linkTransfer(rent, 'not-offered');
    });
    expect(result.current.transferRows[0]!.answer).toBeNull(); // an id the row never offered is ignored
    await act(async () => {
      result.current.linkTransfer(rent, 'leg-1');
    });
    expect(mockTrack).toHaveBeenCalledWith('transfer_suggestion_answered', { accepted: true, kind: 'pair' });
    await act(async () => {
      result.current.commit();
    });
    const { finalize } = mockCommit.mock.calls[0]![0];
    expect(finalize.links).toHaveLength(1);
    expect(finalize.links[0]).toEqual(expect.objectContaining({ storedId: 'leg-1', storedVersion: 4, storedTransferId: null }));
    expect(finalize.transferCategoryId).toBe('cat-transfer');
  });

  it('an orphan transfer needs an account, and a cross-currency one a counter amount the strict parser accepts', async () => {
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const rent = rowIndex(result, 'RENT PAYMENT');
    expect(result.current.transferRows[0]!.suggestion.kind).toBe('orphan');
    await act(async () => {
      result.current.continue();
    });

    await act(async () => {
      result.current.setOrphanAccount(rent, 'acc-eur');
    });
    expect(result.current.transferRows[0]!.answer).toBeNull();
    expect(result.current.transferRows[0]!.needsCounterAmount).toBe(true);
    await act(async () => {
      result.current.setOrphanAccount(rent, 'acc-eur', 'abc');
    });
    expect(result.current.transferRows[0]!.answer).toBeNull();
    expect(mockTrack).not.toHaveBeenCalledWith('transfer_suggestion_answered', expect.objectContaining({ kind: 'orphan' }));
    await act(async () => {
      result.current.setOrphanAccount(rent, 'acc-eur', '350.00');
    });
    expect(result.current.transferRows[0]!.answer).toBe('orphan');
    expect(mockTrack).toHaveBeenCalledWith('transfer_suggestion_answered', { accepted: true, kind: 'orphan' });

    await act(async () => {
      result.current.commit();
    });
    const { rows } = mockCommit.mock.calls[0]![0];
    const counter = rows.find((r: { account_id: string }) => r.account_id === 'acc-eur');
    expect(counter.original_amount).toBe(35000);
    expect(counter.transfer_id).toBeTruthy();
  });

  it('S-WR-03: an accept beyond the cap is refused by the hook, not only the buttons', async () => {
    dbTx.fetchTransferCandidates.mockResolvedValue([candidateLeg({})]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const rent = rowIndex(result, 'RENT PAYMENT');
    jest.spyOn(suggestionCap, 'maxAcceptedSuggestions').mockReturnValue(0);
    await act(async () => {
      result.current.continue();
    });
    await act(async () => {
      result.current.linkTransfer(rent, 'leg-1');
    });
    expect(result.current.transferRows[0]!.answer).toBeNull();
  });

  it('S-WR-03: commit re-checks the cap and writes nothing when it has gone stale', async () => {
    dbTx.fetchTransferCandidates.mockResolvedValue([candidateLeg({})]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const rent = rowIndex(result, 'RENT PAYMENT');
    await act(async () => {
      result.current.continue();
    });
    await act(async () => {
      result.current.linkTransfer(rent, 'leg-1');
    });
    expect(result.current.transferRows[0]!.answer).toBe('linked');
    // More lines were included since: the cap is now below what was accepted.
    jest.spyOn(suggestionCap, 'maxAcceptedSuggestions').mockReturnValue(0);
    await act(async () => {
      result.current.back();
    });
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit).not.toHaveBeenCalled();
    expect(result.current.overSuggestionCap).toBe(true);
    expect(result.current.stage).toBe('matches');
  });

  it('S-WR-04: with no transfer category a link is refused and commit never throws', async () => {
    mockTransferCategoryId = null;
    dbTx.fetchTransferCandidates.mockResolvedValue([candidateLeg({})]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const rent = rowIndex(result, 'RENT PAYMENT');
    await act(async () => {
      result.current.continue();
    });
    expect(result.current.transfersUnavailable).toBe(true);
    await act(async () => {
      result.current.linkTransfer(rent, 'leg-1');
    });
    expect(result.current.transferRows[0]!.answer).toBeNull();
  });

  it('S-WR-04: a commit that throws moves to a recoverable state instead of crashing', async () => {
    mockCommit.mockImplementationOnce(() => {
      throw new TypeError('useImportCommit: transferCategoryId is required when links are present');
    });
    const { result } = await reachReview(csv(CSV_DECIDED), 'csv');
    await act(async () => {
      expect(() => result.current.commit()).not.toThrow();
    });
    expect(result.current.commitProblem).toBe('failed');
    expect(result.current.stage).toBe('review');
    expect(mockShowToast).not.toHaveBeenCalled();
    // The guard is released, so the user can try again.
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit).toHaveBeenCalledTimes(2);
    expect(result.current.commitProblem).toBeNull();
  });

  it('dismissing an orphan keeps the row as an ordinary import', async () => {
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const rent = rowIndex(result, 'RENT PAYMENT');
    await act(async () => {
      result.current.continue();
    });
    await act(async () => {
      result.current.dismissOrphan(rent);
    });
    expect(mockTrack).toHaveBeenCalledWith('transfer_suggestion_answered', { accepted: false, kind: 'orphan' });
    await act(async () => {
      result.current.commit();
    });
    const { rows } = mockCommit.mock.calls[0]![0];
    expect(rows.filter((r: { transfer_id?: string }) => r.transfer_id).length).toBe(0);
  });

  it('a pay-match appears only in markPaid when accepted, and is an ordinary row when dismissed', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([
      stored({ id: 'pend-1', status: 'pending', original_amount: -1250, name: 'COSTA COFFEE', local_date: '2026-09-03', version: 6 }),
    ]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    expect(result.current.payMatchRows).toHaveLength(1);
    const costa = rowIndex(result, 'COSTA COFFEE');
    expect(result.current.payMatchRows[0]).toEqual(expect.objectContaining({ index: costa, pendingId: 'pend-1', answer: null }));
    await act(async () => {
      result.current.continue();
    });
    await act(async () => {
      result.current.acceptPayMatch(costa);
    });
    expect(mockTrack).toHaveBeenCalledWith('pay_match_answered', { accepted: true });
    await act(async () => {
      result.current.commit();
    });
    const { rows, finalize } = mockCommit.mock.calls[0]![0];
    expect(finalize.markPaid).toHaveLength(1);
    expect(finalize.markPaid[0]).toEqual(expect.objectContaining({ pendingId: 'pend-1', expectedVersion: 6 }));
    expect(finalize.markPaid[0].line.name).toBe('COSTA COFFEE');
    expect(rows.some((r: { name: string }) => r.name === 'COSTA COFFEE')).toBe(false);
  });

  it('a dismissed pay-match is tracked and the line is inserted normally', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([
      stored({ id: 'pend-1', status: 'pending', original_amount: -1250, name: 'COSTA COFFEE', local_date: '2026-09-03' }),
    ]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const costa = rowIndex(result, 'COSTA COFFEE');
    await act(async () => {
      result.current.continue();
    });
    await act(async () => {
      result.current.dismissPayMatch(costa);
    });
    expect(mockTrack).toHaveBeenCalledWith('pay_match_answered', { accepted: false });
    await act(async () => {
      result.current.commit();
    });
    const { rows, finalize } = mockCommit.mock.calls[0]![0];
    expect(finalize.markPaid).toEqual([]);
    expect(rows.some((r: { name: string }) => r.name === 'COSTA COFFEE')).toBe(true);
  });
});

describe('useStatementImport: refunds and automatic pay matches (D-07, D-08)', () => {
  const pending = (over: Record<string, unknown>) =>
    stored({ id: 'pend-1', status: 'pending', original_amount: -1250, name: 'COSTA COFFEE', local_date: '2026-09-03', version: 6, ...over });

  it('D-08: an Automatic pending line is pre-ticked and commits as mark-paid without an answer', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([pending({ is_automatic: true })]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    expect(result.current.payMatchRows[0]).toEqual(expect.objectContaining({ pendingId: 'pend-1', automatic: true, answer: 'accepted' }));
    await act(async () => {
      result.current.commit();
    });
    const { finalize } = mockCommit.mock.calls[0]![0];
    expect(finalize.markPaid).toHaveLength(1);
  });

  it('D-08: a pre-tick can be unticked, and a Manual line stays unticked', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([pending({ is_automatic: true })]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const costa = rowIndex(result, 'COSTA COFFEE');
    await act(async () => {
      result.current.dismissPayMatch(costa);
    });
    expect(result.current.payMatchRows[0]?.answer).toBe('dismissed');
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit.mock.calls[0]![0].finalize.markPaid).toEqual([]);
  });

  it('D-08: a Manual line is not pre-ticked', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([pending({ is_automatic: false })]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    expect(result.current.payMatchRows[0]).toEqual(expect.objectContaining({ automatic: false, answer: null }));
  });

  const purchase = stored({ id: 'pur-1', original_amount: -150000, name: 'ACME LTD', local_date: '2026-08-20', category_id: 'cat-shop' });
  const withPurchase = (): void => {
    // the purchases read starts REFUND_LOOKBACK_DAYS before the file; the file-range read does not
    dbTx.fetchTransactionsInRange.mockImplementation(async (_c: unknown, _h: unknown, range: { from: string }) =>
      range.from === '2026-05-04' ? [purchase] : []
    );
  };

  it('D-07: a refund is unticked by default and inserts as is_refund only when accepted', async () => {
    withPurchase();
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    expect(result.current.refundRows).toHaveLength(1);
    const acme = result.current.refundRows[0]!.index;
    expect(result.current.refundRows[0]).toEqual({ index: acme, merchant: 'ACME LTD', answer: null });
    await act(async () => {
      result.current.continue();
    });
    expect(result.current.stage).toBe('matches');
    await act(async () => {
      result.current.acceptRefund(acme);
    });
    expect(mockTrack).toHaveBeenCalledWith('refund_suggestion_answered', { accepted: true });
    await act(async () => {
      result.current.commit();
    });
    const { rows } = mockCommit.mock.calls[0]![0];
    const line = rows.find((r: { original_amount: number }) => r.original_amount === 150000);
    expect(line).toEqual(expect.objectContaining({ is_refund: true, category_id: 'cat-shop' }));
  });

  it('D-07: declining a refund inserts the line unchanged', async () => {
    withPurchase();
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    const acme = result.current.refundRows[0]!.index;
    await act(async () => {
      result.current.dismissRefund(acme);
    });
    expect(mockTrack).toHaveBeenCalledWith('refund_suggestion_answered', { accepted: false });
    await act(async () => {
      result.current.commit();
    });
    const line = mockCommit.mock.calls[0]![0].rows.find((r: { original_amount: number }) => r.original_amount === 150000);
    expect(line.is_refund).toBeUndefined();
  });
});

describe('useStatementImport: commit and recurring suggestions', () => {
  it('commits one batch: input, destructive toast, funnel event, then done', async () => {
    const { result } = await reachReview(csv(CSV_DECIDED), 'csv');
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit).toHaveBeenCalledTimes(1);
    const input = mockCommit.mock.calls[0]![0];
    expect(input).toEqual(
      expect.objectContaining({ householdId: 'hh-1', userId: 'user-1', homeCurrency: 'GBP', batchId: expect.any(String), stepId: expect.any(String) })
    );
    expect(input.rows).toHaveLength(3);
    // the confirmed reading is remembered for this layout (D-42)
    expect(input.finalize.profile).toEqual(expect.objectContaining({ accountId: 'acc-1', signature: expect.any(String), id: expect.any(String) }));
    expect(mockShowToast).toHaveBeenCalledWith({
      kind: 'destructive',
      text: { key: 'undo.label.imported', params: { count: 3, n: 3 } },
      stepId: input.stepId,
    });
    expect(mockTrack).toHaveBeenCalledWith('import_committed', {
      entry: 'account',
      size: '1-50',
      format: 'csv',
      reconciliation: expect.stringMatching(/^(all_verified|partial|none_in_file|ends_only_mismatch)$/),
    });
    expect(result.current.stage).toBe('done');
    const serialised = JSON.stringify(mockTrack.mock.calls) + JSON.stringify(mockShowToast.mock.calls);
    expect(serialised).not.toMatch(/COFFEE|PAYSLIP/);
  });

  it('a remembered reading is not saved again', async () => {
    fetchImportProfile.mockResolvedValue({
      profile: { version: 1, source: 'csv', accountFamily: 'deposit', positiveMeans: 'money-in', balanceMeans: 'none', statedLimit: null, decidedBy: 'user' },
    });
    pickOk(csv(CSV_DECIDED));
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      await result.current.continue();
    });
    await waitFor(() => expect(result.current.preview).not.toBeNull());
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit.mock.calls[0]![0].finalize.profile).toBeNull();
  });

  it('commit with nothing included is a no-op', async () => {
    const { result } = await reachReview(csv(CSV_DECIDED), 'csv');
    for (const r of result.current.preview!.rows) {
      await act(async () => {
        result.current.toggleRow(r.index);
      });
    }
    expect(result.current.counts.included).toBe(0);
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit).not.toHaveBeenCalled();
    expect(trackedNames()).not.toContain('import_committed');
  });

  it('cannot commit without a selected reading (an ambiguous one)', async () => {
    pickOk(csv(CSV_AMBIGUOUS));
    const { result } = await setup();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.profile).toBeNull();
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('suggests recurring series from the committed non-transfer rows and creates one on accept', async () => {
    const monthly = ['Date,Description,Debit,Credit', '2026-01-05,GYM,30.00,', '2026-02-05,GYM,30.00,', '2026-03-05,GYM,30.00,', '2026-04-05,GYM,30.00,'].join('\n');
    const { result } = await reachReview(csv(monthly), 'csv');
    await act(async () => {
      result.current.commit();
    });
    expect(result.current.stage).toBe('done');
    expect(result.current.suggestions).toHaveLength(1);
    const key = result.current.suggestions[0]!.key;
    await act(async () => {
      result.current.acceptSuggestion(key);
    });
    expect(mockCreateSeries).toHaveBeenCalledWith(
      expect.objectContaining({ anchorIsNew: false, ownerId: 'user-1', anchorTransactionId: expect.any(String), linkTransactionIds: expect.any(Array) })
    );
    expect(mockTrack).toHaveBeenCalledWith('recurring_suggestion_answered', { accepted: true });
    expect(result.current.suggestions).toHaveLength(0);
  });

  it('dismissing a suggestion is tracked and creates nothing', async () => {
    const monthly = ['Date,Description,Debit,Credit', '2026-01-05,GYM,30.00,', '2026-02-05,GYM,30.00,', '2026-03-05,GYM,30.00,', '2026-04-05,GYM,30.00,'].join('\n');
    const { result } = await reachReview(csv(monthly), 'csv');
    await act(async () => {
      result.current.commit();
    });
    await act(async () => {
      result.current.dismissSuggestion(result.current.suggestions[0]!.key);
    });
    expect(mockTrack).toHaveBeenCalledWith('recurring_suggestion_answered', { accepted: false });
    expect(mockCreateSeries).not.toHaveBeenCalled();
  });

  it('never feeds a linked or counter transfer leg to recurring detection (D-56)', async () => {
    const rentCsv = [
      'Date,Description,Debit,Credit',
      '2026-01-08,TRANSFER TO SAVINGS,300.00,',
      '2026-02-08,TRANSFER TO SAVINGS,300.00,',
      '2026-03-08,TRANSFER TO SAVINGS,300.00,',
      '2026-04-08,TRANSFER TO SAVINGS,300.00,',
    ].join('\n');
    const { result } = await reachReview(csv(rentCsv), 'csv');
    expect(result.current.transferRows.length).toBeGreaterThan(0);
    await act(async () => {
      result.current.continue();
    });
    for (const t of result.current.transferRows) {
      await act(async () => {
        result.current.setOrphanAccount(t.index, 'acc-2');
      });
    }
    await act(async () => {
      result.current.commit();
    });
    expect(result.current.suggestions).toHaveLength(0);
  });
});

// 02-27: what the screens need that the machine kept to itself -- the CSV header row (so the
// mapping step can name a column) and the figures the format sentence quotes.
describe('useStatementImport: screen read-outs (02-27)', () => {
  it('exposes the CSV header row for the mapping step, and none before a file is read', async () => {
    pickOk(csv(CSV_DECIDED));
    const { result } = await setup();
    expect(result.current.headers).toEqual([]);
    await act(async () => {
      result.current.start();
    });
    expect(result.current.headers).toEqual(['Date', 'Description', 'Debit', 'Credit']);
  });

  it('exposes the stated closing balance and limit the format sentence quotes (D-42)', async () => {
    pickOk(fixture('card-over-limit.ofx'), 'ofx');
    const { result } = await setup({ accountId: 'acc-card' });
    expect(result.current.formatFigures).toBeNull();
    await act(async () => {
      result.current.start();
    });
    expect(result.current.stage).toBe('format');
    const figures = result.current.formatFigures;
    expect(figures).not.toBeNull();
    expect(figures?.closing).not.toBeNull();
    expect(figures?.currency).toBe('GBP');
    expect(typeof figures?.overLimit).toBe('boolean');
  });

  it('names the account a transfer pair points at, so the suggestion can say both accounts (D-52)', async () => {
    dbTx.fetchTransferCandidates.mockResolvedValue([candidateLeg({})]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    expect(result.current.storedLegs.get('leg-1')).toEqual({ accountId: 'acc-2', name: 'RENT PAYMENT' });
  });

  it('names the pending bill a pay-match points at (D-55)', async () => {
    dbTx.fetchTransactionsInRange.mockResolvedValue([
      stored({ id: 'pend-1', status: 'pending', original_amount: -1250, name: 'Coffee subscription', local_date: '2026-09-03', version: 6 }),
    ]);
    const { result } = await reachReview(fixture('bank-sgml.ofx'), 'ofx');
    expect(result.current.storedLegs.get('pend-1')).toEqual({ accountId: 'acc-1', name: 'Coffee subscription' });
  });
});
