// 06.2-23 (D-12, D-19, D-20): a finished statement import is marked once. One Success haptic right after a
// committed import (never on a refused one), the finished step's kit header with the import-done icon that plays
// once per commit, and the review rows' state tags on the shared status map.
import React from 'react';
import { UIManager } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor, fireEvent } from '@testing-library/react-native';
import type { AccountRow } from '@/db/rows';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { resetAnimatedIcons } from '@/ui/icons/AnimatedIcon';
import { resetSessionMotion } from '@/ui/motion/useOncePerSession';
import { MATRIX, expectFits, expectTargets, matrixName } from '@/test/textFitMatrix';
import { useStatementImport } from '../useStatementImport';
import { SuggestionsStep } from '../SuggestionsStep';
import { ReviewStep } from '../ReviewStep';

const mockCalls: string[] = [];
const mockCommit = jest.fn();
const mockShowToast = jest.fn((..._a: unknown[]) => {
  mockCalls.push('toast');
});
const mockMilestone = jest.fn(() => {
  mockCalls.push('milestone');
});
let mockUuid = 0;
let mockReduced = false;
let mockWidth = 402;
let mockScale = 1;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));

jest.mock('@/ui/haptics', () => ({
  ...jest.requireActual('@/ui/haptics'),
  hapticMilestone: () => mockMilestone(),
}));
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useMotion: () => ({ reduced: mockReduced, duration: (ms: number) => ms, easing: undefined, fade: (ms: number) => ms }),
}));
jest.mock('lottie-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View, { testID: 'lottie-view' }) };
});
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@shopify/flash-list', () => {
  const { View } = jest.requireActual('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListFooterComponent,
    }: {
      data: { key?: string }[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactElement;
      ListHeaderComponent?: React.ReactElement;
      ListFooterComponent?: React.ReactElement;
    }) => (
      <View>
        {ListHeaderComponent}
        {data.map((item, index) => (
          <View key={item.key ?? index}>{renderItem({ item, index })}</View>
        ))}
        {ListFooterComponent}
      </View>
    ),
  };
});
jest.mock('../ExtrasDetail', () => ({ useExtrasDetail: () => ({ open: jest.fn(), element: null }) }));
jest.mock('@/services/files/pickStatement', () => ({ pickStatementBytes: jest.fn() }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/importProfiles', () => ({ fetchImportProfile: jest.fn(async () => null) }));
jest.mock('@/db/transactions', () => ({
  fetchTransactionsInRange: jest.fn(async () => []),
  fetchTransferCandidates: jest.fn(async () => []),
  fetchHasRowsBefore: jest.fn(async () => false),
  fetchHasRowsAfter: jest.fn(async () => false),
  fetchCategorisedNames: jest.fn(async () => []),
}));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => `id-${++mockUuid}` }));
jest.mock('@/data/mutations/importFinalize', () => ({ useImportCommit: () => ({ commit: (...args: unknown[]) => mockCommit(...args) }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({
  ...jest.requireActual('@/data/mutations/recurringSeries'),
  useCreateSeries: () => ({ create: jest.fn() }),
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
  useCategoryLookup: () => ({ all: [], active: [], byId: new Map(), builtinIds: new Map(), transferCategoryId: 'cat-transfer', loading: false }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [], isLoading: false }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: new Map([['acc-1', { balance: 5000 }]]), isLoading: false }),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  onlineManager: { isOnline: () => true },
}));

// Several suites share the machine; render cases can be slow under load.
jest.setTimeout(30000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pickStatementBytes } = require('@/services/files/pickStatement') as { pickStatementBytes: jest.Mock };

const mockAccounts: AccountRow[] = [
  {
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
  },
];

const CSV = ['Date,Description,Debit,Credit', '2026-03-01,COFFEE,3.50,', '2026-03-02,PAYSLIP,,1000.00', '2026-03-09,COFFEE,3.50,'].join('\n');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function reachReview() {
  pickStatementBytes.mockResolvedValueOnce({ kind: 'ok', bytes: new TextEncoder().encode(CSV), mimeType: null, extension: 'csv' });
  const hook = await renderHook(() => useStatementImport({ entry: 'account', accountId: 'acc-1' }), { wrapper });
  await act(async () => {
    hook.result.current.start();
  });
  await act(async () => {
    hook.result.current.confirmFormat();
  });
  await act(async () => {
    await hook.result.current.continue();
  });
  await waitFor(() => expect(hook.result.current.preview).not.toBeNull());
  await act(async () => {
    hook.result.current.chooseMode('new');
  });
  return hook;
}

const ui = UIManager as unknown as { hasViewManagerConfig: (name: string) => boolean };
const H = { includeHiddenElements: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockUuid = 0;
  mockReduced = false;
  mockWidth = 402;
  mockScale = 1;
  resetAnimatedIcons();
  resetSessionMotion();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('06.2-23 Task 1: the Success haptic on a committed import (D-20)', () => {
  it('a committed import fires hapticMilestone exactly once, after the toast, and exposes the count and step id', async () => {
    const { result } = await reachReview();
    await act(async () => {
      result.current.commit();
    });
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(result.current.stage).toBe('done');
    expect(mockMilestone).toHaveBeenCalledTimes(1);
    expect(mockCalls).toEqual(['toast', 'milestone']);
    expect(result.current.committedCount).toBe(3);
    const stepId = (mockCommit.mock.calls[0]![0] as { stepId: string }).stepId;
    expect(result.current.committedStepId).toBe(stepId);
  });

  it('a refused commit fires no haptic and no toast (T-06.2-23-01)', async () => {
    mockCommit.mockImplementationOnce(() => {
      throw new TypeError('refused');
    });
    const { result } = await reachReview();
    await act(async () => {
      result.current.commit();
    });
    expect(result.current.commitProblem).toBe('failed');
    expect(mockMilestone).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(result.current.committedStepId).toBeNull();
  });
});

type ImportState = ReturnType<typeof useStatementImport>;

function doneState(over: Partial<Record<keyof ImportState, unknown>> = {}): ImportState {
  return {
    stage: 'done',
    suggestions: [],
    committedCount: 3,
    committedStepId: 'step-1',
    acceptSuggestion: jest.fn(),
    dismissSuggestion: jest.fn(),
    ...over,
  } as unknown as ImportState;
}

async function renderDone(state: ImportState, onDone = jest.fn()) {
  return render(
    <ThemeProvider>
      <SuggestionsStep state={state} onDone={onDone} />
    </ThemeProvider>
  );
}

describe('06.2-23 Task 2: the finished step header', () => {
  it('shows the import-done tile, "Import done" as a header and the plural count, then Done', async () => {
    const onDone = jest.fn();
    await renderDone(doneState(), onDone);
    expect(screen.getByTestId('import-done-tile', H)).toBeTruthy();
    expect(screen.getByTestId('import-done-icon', H)).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Import done' })).toBeTruthy();
    expect(screen.getByText('3 transactions added')).toBeTruthy();
    expect(screen.queryByText('Import finished')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('one transaction reads in the singular', async () => {
    await renderDone(doneState({ committedCount: 1 }));
    expect(screen.getByText('1 transaction added')).toBeTruthy();
  });

  it('the icon plays once per commit: a return to the step shows the still tile; a new commit plays again', async () => {
    jest.spyOn(ui, 'hasViewManagerConfig').mockImplementation((name: string) => name === 'LottieAnimationView');
    const first = await renderDone(doneState());
    expect(screen.getByTestId('lottie-view', H)).toBeTruthy();
    await first.unmount();
    resetAnimatedIcons();
    jest.spyOn(ui, 'hasViewManagerConfig').mockImplementation((name: string) => name === 'LottieAnimationView');
    const again = await renderDone(doneState());
    expect(screen.queryByTestId('lottie-view', H)).toBeNull();
    expect(screen.queryByTestId('import-done-icon', H)).toBeNull();
    expect(screen.getByTestId('import-done-tile', H)).toBeTruthy();
    await again.unmount();
    await renderDone(doneState({ committedStepId: 'step-2' }));
    expect(screen.getByTestId('lottie-view', H)).toBeTruthy();
  });

  it('Reduce Motion shows the still import icon and plays nothing', async () => {
    mockReduced = true;
    jest.spyOn(ui, 'hasViewManagerConfig').mockImplementation((name: string) => name === 'LottieAnimationView');
    await renderDone(doneState());
    expect(screen.queryByTestId('lottie-view', H)).toBeNull();
    expect(screen.getByTestId('import-done-icon-still', H)).toBeTruthy();
  });

  it('a build without the Lottie view shows the still import icon', async () => {
    jest.spyOn(ui, 'hasViewManagerConfig').mockImplementation(() => false);
    await renderDone(doneState());
    expect(screen.queryByTestId('lottie-view', H)).toBeNull();
    expect(screen.getByTestId('import-done-icon-still', H)).toBeTruthy();
  });
});

describe('06.2-23: the finished step fits (text-fit matrix)', () => {
  const suggestion = { key: 'k1', name: 'Netflix', amount: -999, currency: 'GBP', freq: 'monthly', anchorDate: '2026-03-01', rowIds: ['r1'] };
  for (const m of MATRIX) {
    it(`fits at ${matrixName(m)} with its buttons 44+`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await renderDone(doneState({ committedCount: 1234, suggestions: [suggestion] }));
      expectFits();
      expectTargets('Done', 'Make recurring', 'Not now');
    });
  }
});

function reviewState(mode: 'new' | 'reconcile', duplicate: boolean): ImportState {
  const row = {
    index: 0,
    converted: {
      index: 0,
      localDate: '2026-03-01',
      description: 'LINE 0',
      amount: -350,
      balance: null,
      availableSigned: null,
      rawAmount: '3.50',
      rawBalance: null,
      currency: 'GBP',
      externalId: null,
      trnType: null,
      issues: [],
    },
    check: 'verified',
    duplicate: duplicate ? { kind: 'fitid', existingId: 'stored-1' } : null,
    categoryId: null,
    categorySource: 'none',
    included: !duplicate,
    locked: false,
    transfer: null,
    payMatch: null,
  };
  const fn = () => jest.fn();
  return {
    stage: 'review',
    accountId: 'acc-1',
    profile: { version: 1, source: 'csv', accountFamily: 'deposit', positiveMeans: 'money-in', balanceMeans: 'held', statedLimit: null, decidedBy: 'user' },
    preview: {
      rows: [row],
      reconcile: { file: 'verified', rows: ['verified'], orientation: 'as-is', verifiedLinks: 0, failedLinks: 0 },
      fitidDisabled: false,
      limitOffer: null,
    },
    reconcile: { file: 'verified' },
    counts: { total: 1, included: duplicate ? 0 : 1, duplicates: duplicate ? 1 : 0, blocked: 0, cannotVerify: 0 },
    rowState: jest.fn(() => ({ included: !duplicate, categoryId: null, locked: false })),
    reviewGate: { required: false, count: 0 },
    rowsChecked: false,
    setRowsChecked: fn(),
    toggleRow: fn(),
    setRowCategory: fn(),
    selectAllClean: fn(),
    limitOffer: null,
    limitAccepted: false,
    acceptLimit: fn(),
    transferRows: [],
    payMatchRows: [],
    refundRows: [],
    commit: fn(),
    commitProblem: null,
    overSuggestionCap: false,
    suggestionCap: 2999,
    transfersUnavailable: false,
    suggestions: [],
    mode,
    extras: [],
    extraRows: new Map(),
    nearByIndex: new Map(),
    back: fn(),
    continue: fn(),
    cancel: fn(),
  } as unknown as ImportState;
}

async function renderReview(state: ImportState) {
  return render(
    <ThemeProvider>
      <ReviewStep state={state} />
    </ThemeProvider>
  );
}

describe('06.2-23 Task 2: review row tags on the shared status map (D-12)', () => {
  it('a possible duplicate is the tight-style badge with its existing words', async () => {
    await renderReview(reviewState('new', true));
    const badge = screen.getByTestId('status-badge-tight');
    expect(badge.props.accessibilityLabel).toBe('Possible duplicate');
    expect(screen.getByText('Possible duplicate')).toBeTruthy();
  });

  it('a missing line is the pending-style badge with "Missing"', async () => {
    await renderReview(reviewState('reconcile', false));
    const badge = screen.getByTestId('status-badge-pending');
    expect(badge.props.accessibilityLabel).toBe('Missing');
  });

  it('an already recorded line is the paid-style badge with "Already recorded"', async () => {
    await renderReview(reviewState('reconcile', true));
    await fireEvent.press(screen.getByRole('button', { name: /already/i }));
    const badge = screen.getByTestId('status-badge-paid');
    expect(badge.props.accessibilityLabel).toBe('Already recorded');
  });
});
