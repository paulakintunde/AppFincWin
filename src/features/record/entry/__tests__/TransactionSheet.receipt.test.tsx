import React from 'react';
import { fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import { resetToastForTests } from '@/state/undoToast';
import { TransactionSheet } from '../TransactionSheet';

// 10.1-23 (RCP-01, D-09, T-10.1-23-02): the entry sheet's receipt rows. Mocks copied from TransactionSheet.test.tsx; the
// feature seam here answers per feature, so receipts (level 2) can be on while splits (level 3) stay off.
let mockReceiptsOn = true;
jest.mock('@/features/levels/useFeatureAccess', () => ({
  useFeatureAccess: (id: string) => {
    const on = id === 'receipts' ? mockReceiptsOn : false;
    return { visible: on, on };
  },
}));
const mockPick = jest.fn();
jest.mock('@/features/record/receipt/useReceiptActions', () => ({
  ...jest.requireActual('@/features/record/receipt/useReceiptActions'),
  pickReceipt: (...a: unknown[]) => mockPick(...a),
}));
const mockEnqueue = jest.fn(async (..._a: unknown[]) => ({ ok: true, items: [] }));
const mockRemoveFile = jest.fn(async (_uri: string) => undefined);
jest.mock('@/services/receipts/outbox', () => ({
  enqueueReceipt: (...a: unknown[]) => mockEnqueue(...a),
  drainOutbox: jest.fn(async () => ({ uploaded: 0, waiting: 0, failed: 0, uploadedTransactionIds: [] })),
  defaultOutboxDeps: () => ({ remove: (uri: string) => mockRemoveFile(uri) }),
}));
jest.mock('@/features/record/receipt/ReceiptSheet', () => ({
  ReceiptSheet: (p: { line: { id: string } }) => {
    const { Text } = require('react-native');
    return require('react').createElement(Text, null, `receipt-sheet-open ${p.line.id}`);
  },
}));
jest.mock('@/features/record/split/CategorySplitSheet', () => ({
  CategorySplitSheet: (p: { line: { id: string } }) => {
    const { Text } = require('react-native');
    return require('react').createElement(Text, null, `split-sheet-open ${p.line.id}`);
  },
}));
jest.mock('@/features/household/sharing/SharedGroup', () => ({ SharedGroup: () => null, useSharedEntry: () => ({ commit: () => undefined }) })); // 08-19: the household data layer is not part of this test
jest.mock('@/features/grow/goals/useGoalLinePay', () => ({ useGoalLinePay: () => ({ pay: jest.fn(() => true) }) }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) })); // 05.2-44: OccurrenceActions gates on v3
jest.mock('@/features/record/accounts/AccountSheet', () => ({ AccountSheet: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const mockAdd = jest.fn(() => 'new-id');
const mockCheckCap = jest.fn((..._a: unknown[]) => false);
const mockPush = jest.fn();
let mockRates: { quote: string; rate: string; rate_date: string; source: string }[] = [];
const mockEdit = jest.fn(() => true);
const mockRemove = jest.fn((): string | null => 'del-step');
const mockAddTransfer = jest.fn(() => ({ transferId: 'tr1', stepId: 'tr-step' }));
const mockEditTransfer = jest.fn((): string | null => 'tre-step');
const mockRemoveTransfer = jest.fn(() => 'trd-step');
const mockTrack = jest.fn();
// 06.2-11 (L02, D-20): the save moment marks the new rows and gives one light tap.
const mockMarkJustSaved = jest.fn();
const mockTap = jest.fn();
jest.mock('@/state/justSaved', () => ({
  ...jest.requireActual('@/state/justSaved'),
  markJustSaved: (...a: unknown[]) => mockMarkJustSaved(...a),
}));
jest.mock('@/ui/haptics', () => ({
  ...jest.requireActual('@/ui/haptics'),
  hapticTap: () => mockTap(),
}));
let mockLegs: TransactionRow[] = [];
let mockLegsRead: Record<string, unknown> = { isPending: false, fetchStatus: 'idle', isError: false, isSuccess: true };
let mockRegion = 'GB';
let mockTransferCat: string | null = 'tc';
let mockNoAccounts = false;
let mockHome = 'GBP';
let mockV3 = false;
let mockSeries: unknown[] = [];

jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: mockAdd }),
  useEditTransaction: () => ({ edit: mockEdit }),
  useDeleteTransaction: () => ({ remove: mockRemove }),
  useMarkPaid: () => ({ markPaid: jest.fn(() => 'paid-step') }),
  useSkipOccurrence: () => ({ skip: jest.fn(() => 'skip-step') }),
}));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('../useCapCrossing', () => ({ useCapCrossing: () => ({ check: (...a: unknown[]) => mockCheckCap(...a) }) }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: mockRates }) }));
jest.mock('@/data/queries/moneyPrefs', () => ({ useMoneyPrefs: () => ({ prefs: { lead_figure: 'home' } }) }));
jest.mock('@/features/record/categories/useCategoryMonthUsage', () => ({ useCategoryMonthUsage: () => ({ usage: new Map(), isLoading: false }) }));
jest.mock('@/data/mutations/transfers', () => ({
  useAddTransfer: () => ({ add: mockAddTransfer }),
  useEditTransfer: () => ({ edit: mockEditTransfer }),
  useDeleteTransfer: () => ({ remove: mockRemoveTransfer }),
}));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/data/mutations/bulkAdd', () => ({ useBulkAdd: () => ({ save: jest.fn(() => 'bulk-step') }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({
  ...jest.requireActual('@/data/mutations/recurringSeries'),
  useCreateSeries: () => ({ create: jest.fn(() => 'series-step') }),
  useEditSeriesFrom: () => ({ editFrom: jest.fn(() => 'sedit-step') }),
  useEndSeries: () => ({ end: jest.fn(() => 'send-step') }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: mockSeries }) }));
jest.mock('@/data/mutations/seriesAttributes', () => ({ usePatchSeriesAttributes: () => ({ patch: jest.fn(() => null) }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'series-1' }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: mockTrack }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: mockNoAccounts
      ? []
      : [
          { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null },
          { id: 'a2', name: 'Savings', currency: 'GBP', archived_at: null },
          { id: 'a3', name: 'Euro pot', currency: 'EUR', archived_at: null },
        ],
  }),
}));
const mockAddRule = jest.fn((..._a: unknown[]) => ({ id: 'rule-1', stepId: 'rule-step' }));
jest.mock('@/data/mutations/categoryRules', () => ({ useAddRule: () => ({ add: mockAddRule }) }));
jest.mock('@/features/record/useGuessContext', () => {
  const value = {
    guess: {
      keywordRules: jest.requireActual('@/engine/categorize').DEFAULT_KEYWORD_RULES,
      learned: new Map(),
      builtinIds: new Map(),
      personalRules: [],
      sharedRules: [],
    },
    rules: [],
    resolved: { personal: [], shared: [], byRuleId: new Map(), unresolvedIds: new Set() },
    memberCategories: [],
    rulesStatus: 'ready',
  };
  return { useGuessContext: () => value };
});
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({
    active: [{ id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null }],
    byId: new Map(),
    transferCategoryId: mockTransferCat,
  }),
}));
jest.mock('@/data/queries/currencyOptions', () => ({
  useCurrencyOptions: () => ({
    options: [
      { code: 'GBP', name: 'Pound', symbol: '£', exponent: 2, kind: 'iso', rateDate: null },
      { code: 'EUR', name: 'Euro', symbol: '€', exponent: 2, kind: 'iso', rateDate: null },
    ],
    loading: false,
  }),
}));
jest.mock('@/data/queries/activity', () => ({
  useTransferLegs: () => ({ legs: mockLegs, isLoading: false, ...mockLegsRead }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: mockHome,
    showCents: true,
    region: mockRegion,
    timeZone: 'Europe/London',
    today: '2026-09-25',
  }),
}));

function row(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 't1',
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -1250,
    original_currency: 'GBP',
    home_currency: 'GBP',
    local_date: '2026-09-20',
    name: 'Coffee',
    category_id: 'c1',
    payment_type: 'card',
    status: 'paid',
    note: null,
    version: 3,
    transfer_id: null,
    rate_source: 'same-currency',
    rate_date: null,
    rate_pending: false,
    ...over,
  } as TransactionRow;
}

async function typeAmount(getByLabelText: RenderResult['getByLabelText'], text: string) {
  const { getAllByLabelText } = screen;
  // 02.3 D-12: the pad opens on tap. Long-press backspace clears, so an edit that opens with a prefilled amount types from empty.
  try {
    getByLabelText('Delete last digit');
  } catch {
    await fireEvent.press(getAllByLabelText(/^Amount/)[0]!);
  }
  await fireEvent(getByLabelText('Delete last digit'), 'longPress');
  for (const ch of text) {
    await fireEvent.press(getByLabelText(ch === '.' || ch === ',' ? 'Decimal point' : ch));
  }
}

async function open(mode: React.ComponentProps<typeof TransactionSheet>['mode'], onClose = jest.fn()) {
  const utils = await render(
    <ThemeProvider>
      <TransactionSheet visible mode={mode} onClose={onClose} />
    </ThemeProvider>
  );
  return { ...utils, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReceiptsOn = true;
  resetToastForTests();
  mockLegs = [];
  mockRates = [];
  mockLegsRead = { isPending: false, fetchStatus: 'idle', isError: false, isSuccess: true };
  mockRegion = 'GB';
  mockV3 = false;
  mockSeries = [];
  mockTransferCat = 'tc';
  mockNoAccounts = false;
  mockHome = 'GBP';
});


const photo = { uri: 'file:///cache/p1.jpg', mime: 'image/jpeg', ext: 'jpg', bytes: 1000, width: 10, height: 10 };

async function pickPhoto(screen: RenderResult) {
  mockPick.mockResolvedValueOnce({ ok: true, kind: 'photo', files: [photo] });
  await fireEvent.press(screen.getByText('Add a receipt'));
  await fireEvent.press(screen.getByText('Take a photo'));
  await waitFor(() => expect(screen.getByText('1 file')).toBeTruthy());
}

describe('TransactionSheet: receipts (10.1-23)', () => {
  it('offers Add a receipt on a new entry and shows the picked count', async () => {
    const s = await open({ kind: 'new', direction: 'out' });
    expect(s.queryByText('Take a photo')).toBeNull();
    await pickPhoto(s);
    expect(mockPick).toHaveBeenCalledWith('camera');
    expect(s.queryByText('Take a photo')).toBeNull(); // the capture choice closed
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('queues the picked files with the saved line id', async () => {
    const s = await open({ kind: 'new', direction: 'out' });
    await pickPhoto(s);
    await typeAmount(s.getByLabelText, '4.20');
    await fireEvent.changeText(s.getByLabelText('What is it for?'), 'Tea');
    await fireEvent.press(s.getByText('Save expense'));
    expect(mockAdd).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledTimes(1));
    expect(mockEnqueue.mock.calls[0]?.[0]).toEqual({ transactionId: 'new-id', kind: 'photo', files: [photo] });
    // the cache copy goes only once the outbox has its own
    await waitFor(() => expect(mockRemoveFile).toHaveBeenCalledWith(photo.uri));
    await s.unmount();
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it('deletes the picked files and queues nothing when the entry is discarded', async () => {
    const s = await open({ kind: 'new', direction: 'out' });
    await pickPhoto(s);
    await fireEvent.press(s.getByText('Cancel'));
    expect(s.onClose).toHaveBeenCalled();
    await s.unmount();
    expect(mockRemoveFile).toHaveBeenCalledWith(photo.uri);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('says why when the camera is off', async () => {
    const s = await open({ kind: 'new', direction: 'out' });
    mockPick.mockResolvedValueOnce({ ok: false, reason: 'permission_denied' });
    await fireEvent.press(s.getByText('Add a receipt'));
    await fireEvent.press(s.getByText('Take a photo'));
    await waitFor(() => expect(s.getByText('Camera access is off')).toBeTruthy());
  });

  it('opens the Receipt sheet for an existing line', async () => {
    const s = await open({ kind: 'edit', row: row() });
    expect(s.queryByText('Add a receipt')).toBeNull();
    await fireEvent.press(s.getByText('Receipt'));
    expect(s.getByText('receipt-sheet-open t1')).toBeTruthy();
  });

  it('has no receipt rows below level 2', async () => {
    mockReceiptsOn = false;
    const s = await open({ kind: 'new', direction: 'out' });
    expect(s.queryByText('Add a receipt')).toBeNull();
    expect(s.queryByText('Receipt')).toBeNull();
  });

  it('has no receipt row on a transfer', async () => {
    const s = await open({ kind: 'new', direction: 'transfer' });
    expect(s.queryByText('Add a receipt')).toBeNull();
  });
});
