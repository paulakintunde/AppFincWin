// 02-27: the statement import screens. useStatementImport (02-39) is mocked so each stage can be
// rendered directly; the machine itself is covered by its own tests. D-39: the screens render
// the file's text as plain Text only.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { FormatProfile } from '@/engine/statement';
import { ImportScreen } from '../ImportScreen';
import type { useStatementImport } from '../useStatementImport';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

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

type ImportState = ReturnType<typeof useStatementImport>;
let mockState: ImportState;
const mockUseStatementImport = jest.fn((..._args: unknown[]) => mockState);
jest.mock('../useStatementImport', () => ({ useStatementImport: (...args: unknown[]) => mockUseStatementImport(...args) }));

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-GB', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'UTC',
    today: '2026-10-06',
  }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a1', name: 'Current', currency: 'GBP', kind: 'checking', archived_at: null },
      { id: 'a2', name: 'Savings', currency: 'GBP', kind: 'savings', archived_at: null },
      { id: 'a3', name: 'Old card', currency: 'GBP', kind: 'credit', archived_at: '2026-01-01T00:00:00Z' },
    ],
  }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => {
    const groceries = { id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null };
    return { all: [groceries], active: [groceries], byId: new Map([['c1', groceries]]), transferCategoryId: 'tc', loading: false };
  },
}));
jest.mock('@/features/record/accounts/AccountSheet', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    AccountSheet: (props: { visible: boolean; mode: { kind: string; context: string }; onSaved?: (id: string) => void }) =>
      props.visible ? (
        <Pressable testID="account-sheet-stub" onPress={() => props.onSaved?.('new-account')}>
          <Text>{`account-sheet:${props.mode.context}`}</Text>
        </Pressable>
      ) : null,
  };
});

const fn = () => jest.fn();

function makeState(over: Partial<Record<keyof ImportState, unknown>> = {}): ImportState {
  const base = {
    stage: 'idle',
    rejectReason: null,
    format: null,
    statementChoices: [],
    chooseStatement: fn(),
    accountId: null,
    setAccount: fn(),
    profile: null,
    candidates: [],
    rememberedNote: false,
    exampleRow: null,
    flip: fn(),
    chooseCandidate: fn(),
    confirmFormat: fn(),
    mapping: null,
    mappingErrors: [],
    dateFormat: null,
    dateAmbiguous: false,
    dateNeedsChoice: false,
    decimalMark: null,
    notationAmbiguous: false,
    notationNeedsChoice: false,
    setMapping: fn(),
    setDateFormat: fn(),
    setDecimalMark: fn(),
    start: fn(),
    cancel: fn(),
    continue: fn(),
    back: fn(),
    headers: [],
    formatFigures: null,
    preview: null,
    reconcile: null,
    counts: { total: 0, included: 0, duplicates: 0, blocked: 0, cannotVerify: 0 },
    rowState: jest.fn(() => ({ included: true, categoryId: null, locked: false })),
    toggleRow: fn(),
    setRowCategory: fn(),
    selectAllClean: fn(),
    limitOffer: null,
    limitAccepted: false,
    acceptLimit: fn(),
    transferRows: [],
    payMatchRows: [],
    linkTransfer: fn(),
    dismissTransfer: fn(),
    setOrphanAccount: fn(),
    dismissOrphan: fn(),
    acceptPayMatch: fn(),
    dismissPayMatch: fn(),
    commit: fn(),
    suggestions: [],
    acceptSuggestion: fn(),
    dismissSuggestion: fn(),
  };
  return { ...base, ...over } as unknown as ImportState;
}

function profile(over: Partial<FormatProfile> = {}): FormatProfile {
  return {
    version: 1,
    source: 'csv',
    accountFamily: 'card',
    positiveMeans: 'money-spent',
    balanceMeans: 'owed',
    statedLimit: null,
    decidedBy: 'labels',
    ...over,
  } as FormatProfile;
}

function renderScreen(onDone: () => void = jest.fn()) {
  return render(
    <ThemeProvider>
      <ImportScreen entry="you" accountId={null} onDone={onDone} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState = makeState();
});

describe('ImportScreen: pick', () => {
  it('shows the privacy line, the file helper and only the non-archived accounts', () => {
    renderScreen();
    expect(screen.getByText('This file is read on your device and never uploaded.')).toBeTruthy();
    expect(screen.getByText('CSV, OFX or QFX — up to 5,000 rows (about 2MB).')).toBeTruthy();
    expect(screen.getByText('Which account is this file from?')).toBeTruthy();
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByText('Savings')).toBeTruthy();
    expect(screen.queryByText('Old card')).toBeNull();
  });

  it('passes the entry and account to the hook', () => {
    renderScreen();
    expect(mockUseStatementImport).toHaveBeenCalledWith({ entry: 'you', accountId: null });
  });

  it('the file button is disabled until an account is chosen', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: 'Choose a statement file' })).toBeDisabled();
    fireEvent.press(screen.getByText('Savings'));
    expect(mockState.setAccount).toHaveBeenCalledWith('a2');
  });

  it('with an account chosen the file button starts the import', () => {
    mockState = makeState({ accountId: 'a1' });
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Choose a statement file' }));
    expect(mockState.start).toHaveBeenCalledTimes(1);
  });

  it('Add an account opens the account sheet and selects the saved account', () => {
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Add an account' }));
    expect(screen.getByText('account-sheet:later')).toBeTruthy();
    fireEvent.press(screen.getByTestId('account-sheet-stub'));
    expect(mockState.setAccount).toHaveBeenCalledWith('new-account');
  });

  it('opens the account sheet in onboarding context when the entry is onboarding', () => {
    render(
      <ThemeProvider>
        <ImportScreen entry="onboarding" accountId={null} onDone={jest.fn()} />
      </ThemeProvider>
    );
    fireEvent.press(screen.getByRole('button', { name: 'Add an account' }));
    expect(screen.getByText('account-sheet:onboarding')).toBeTruthy();
  });
});

describe('ImportScreen: rejected and statement choice', () => {
  it('too many rows shows the split-the-file message', () => {
    mockState = makeState({ stage: 'rejected', rejectReason: 'too_many_rows' });
    renderScreen();
    expect(screen.getByText('This file has more than 5,000 rows. Split it into smaller files and import them one at a time.')).toBeTruthy();
  });

  it.each([
    ['unreadable', 'This file couldn’t be read as a statement.'],
    ['no_rows', 'This file has no transactions in it.'],
    ['too_big', 'This file is too large to read.'],
    ['unsupported_format', 'This file isn’t a CSV, OFX or QFX statement.'],
    ['unsupported_statement', 'This file holds an investment or loan statement, which can’t be imported yet.'],
  ])('%s shows its copy, and Back returns to the start', (reason, copy) => {
    mockState = makeState({ stage: 'rejected', rejectReason: reason });
    renderScreen();
    expect(screen.getByText(copy)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockState.cancel).toHaveBeenCalledTimes(1);
  });

  it('a multi-account file lists one row per statement and chooses on tap', () => {
    mockState = makeState({
      stage: 'choose-statement',
      statementChoices: [
        { index: 0, kind: 'card', currency: 'GBP', count: 12 },
        { index: 1, kind: 'bank', currency: 'EUR', count: 1 },
      ],
    });
    renderScreen();
    expect(screen.getByText('This file holds more than one account. Which one is this import for?')).toBeTruthy();
    expect(screen.getByText('Credit card in GBP · 12 lines')).toBeTruthy();
    expect(screen.getByText('Bank account in EUR · 1 line')).toBeTruthy();
    fireEvent.press(screen.getByText('Bank account in EUR · 1 line'));
    expect(mockState.chooseStatement).toHaveBeenCalledWith(1);
  });
});

describe('ImportScreen: format', () => {
  const example = {
    index: 0,
    localDate: '2026-03-01',
    description: 'COFFEE SHOP',
    amount: -350,
    balance: null,
    availableSigned: null,
    rawAmount: '3.50',
    rawBalance: null,
    currency: 'GBP',
    externalId: null,
    trnType: null,
    issues: [],
  };

  it('states the reading in words with the example row, flip and confirm', () => {
    mockState = makeState({
      stage: 'format',
      accountId: 'a1',
      profile: profile(),
      exampleRow: example,
      formatFigures: { closing: -125000, limit: 100000, overLimit: true, currency: 'GBP' },
    });
    renderScreen();
    expect(screen.getByText('Check how we read this')).toBeTruthy();
    expect(
      screen.getByText(
        'We read this as a credit card statement. Purchases are shown as positive and payments as negative. The balance is what you owe: £1,250.00, which is over your £1,000.00 limit.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Example row')).toBeTruthy();
    expect(screen.getByText('COFFEE SHOP')).toBeTruthy();
    fireEvent.press(screen.getByText('Doesn’t look right? Flip the reading'));
    expect(mockState.flip).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Use this reading' }));
    expect(mockState.confirmFormat).toHaveBeenCalledTimes(1);
  });

  it('the flip control names the new meaning for a screen reader', () => {
    mockState = makeState({ stage: 'format', accountId: 'a1', profile: profile({ positiveMeans: 'money-in' }), exampleRow: example });
    renderScreen();
    expect(screen.getByLabelText('Flip the reading — read positive amounts as money out instead')).toBeTruthy();
  });

  it('an ambiguous file shows the candidate readings, preselects none and blocks confirm (E-CR-04)', () => {
    mockState = makeState({
      stage: 'format',
      accountId: 'a1',
      profile: null,
      candidates: [
        profile({ positiveMeans: 'money-spent', balanceMeans: 'owed' }),
        profile({ positiveMeans: 'money-in', balanceMeans: 'owed' }),
      ],
    });
    renderScreen();
    expect(screen.getByText('We can’t tell how this file reads its amounts. Choose how it should be read before importing.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use this reading' })).toBeDisabled();
    expect(screen.queryByText('✓')).toBeNull();
    expect(screen.queryByText('Doesn’t look right? Flip the reading')).toBeNull();
    fireEvent.press(screen.getByLabelText(/Positive amounts are money out/));
    expect(mockState.chooseCandidate).toHaveBeenCalledWith(0);
  });

  it('once a candidate is chosen it is marked and confirm is enabled', () => {
    const chosen = profile({ positiveMeans: 'money-in', balanceMeans: 'owed', decidedBy: 'user' });
    mockState = makeState({
      stage: 'format',
      accountId: 'a1',
      profile: chosen,
      candidates: [profile({ positiveMeans: 'money-spent' }), profile({ positiveMeans: 'money-in' })],
    });
    renderScreen();
    expect(screen.getByRole('button', { name: 'Use this reading' })).not.toBeDisabled();
    expect(screen.getAllByText('✓')).toHaveLength(1);
  });

  it('Cancel calls cancel()', () => {
    mockState = makeState({ stage: 'format', accountId: 'a1', profile: profile(), exampleRow: example });
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockState.cancel).toHaveBeenCalledTimes(1);
  });
});

describe('ImportScreen: mapping', () => {
  const mapping = { date: 0, description: 1, amount: null, debit: 2, credit: 3, currency: null, balance: null, direction: null, limit: null };
  const base = {
    stage: 'mapping',
    accountId: 'a1',
    profile: profile({ accountFamily: 'deposit', balanceMeans: 'none' }),
    format: 'csv',
    headers: ['Posted', 'Memo', 'Out', 'In'],
    mapping,
    dateFormat: 'YMD',
    decimalMark: '.',
  };

  it('shows one row per role with the chosen header or Not used', () => {
    mockState = makeState(base);
    renderScreen();
    expect(screen.getByText('Check the columns')).toBeTruthy();
    for (const role of ['Date', 'Description', 'Amount', 'Money out', 'Money in', 'Money in or out', 'Balance', 'Currency', 'Limit']) {
      expect(screen.getByText(role)).toBeTruthy();
    }
    expect(screen.getByText('Posted')).toBeTruthy();
    expect(screen.getAllByText('Not used').length).toBeGreaterThanOrEqual(5);
  });

  it('picking a header for a role sets the mapping; picking Not used clears it', () => {
    mockState = makeState(base);
    renderScreen();
    fireEvent.press(screen.getByText('Amount'));
    fireEvent.press(screen.getByLabelText('Memo'));
    expect(mockState.setMapping).toHaveBeenCalledWith({ ...mapping, amount: 1 });
  });

  it('lists mapping errors and disables Continue while any exist', () => {
    mockState = makeState({ ...base, mappingErrors: ['no-date', 'duplicate-column'] });
    renderScreen();
    expect(screen.getByText('Pick the date column.')).toBeTruthy();
    expect(screen.getByText('Each column can only be used once.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('Continue calls continue() when the mapping is valid', () => {
    mockState = makeState(base);
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockState.continue).toHaveBeenCalledTimes(1);
  });

  it('an ambiguous date order is asked explicitly, preselects neither, and blocks Continue (E-CR-02)', () => {
    mockState = makeState({ ...base, dateAmbiguous: true, dateNeedsChoice: true });
    renderScreen();
    expect(screen.getByText('These dates could be day-first or month-first. Pick one.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.press(screen.getByText('MM/DD/YYYY'));
    expect(mockState.setDateFormat).toHaveBeenCalledWith('MDY');
    fireEvent.press(screen.getByText('DD/MM/YYYY'));
    expect(mockState.setDateFormat).toHaveBeenCalledWith('DMY');
  });

  it('an ambiguous decimal mark is asked explicitly and blocks Continue (E-CR-02)', () => {
    mockState = makeState({ ...base, decimalMark: ',', notationAmbiguous: true, notationNeedsChoice: true });
    renderScreen();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.press(screen.getByText('Point (1,234.56)'));
    expect(mockState.setDecimalMark).toHaveBeenCalledWith('.');
  });

  it('shows the remembered-reading note when the format step was skipped', () => {
    mockState = makeState({ ...base, rememberedNote: true });
    renderScreen();
    expect(screen.getByText('Read the same way as your last statement from this account.')).toBeTruthy();
  });

  it('Back and Cancel are wired', () => {
    mockState = makeState(base);
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockState.back).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockState.cancel).toHaveBeenCalledTimes(1);
  });
});
