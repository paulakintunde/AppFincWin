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
  it('shows the privacy line, the file helper and only the non-archived accounts', async () => {
    await renderScreen();
    expect(screen.getByText('This file is read on your device and never uploaded.')).toBeTruthy();
    expect(screen.getByText('CSV, OFX or QFX — up to 5,000 rows (about 2MB).')).toBeTruthy();
    expect(screen.getByText('Which account is this file from?')).toBeTruthy();
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByText('Savings')).toBeTruthy();
    expect(screen.queryByText('Old card')).toBeNull();
  });

  it('passes the entry and account to the hook', async () => {
    await renderScreen();
    expect(mockUseStatementImport).toHaveBeenCalledWith({ entry: 'you', accountId: null });
  });

  it('the file button is disabled until an account is chosen', async () => {
    await renderScreen();
    expect(screen.getByRole('button', { name: 'Choose a statement file' })).toBeDisabled();
    await fireEvent.press(screen.getByText('Savings'));
    expect(mockState.setAccount).toHaveBeenCalledWith('a2');
  });

  it('with an account chosen the file button starts the import', async () => {
    mockState = makeState({ accountId: 'a1' });
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a statement file' }));
    expect(mockState.start).toHaveBeenCalledTimes(1);
  });

  it('Add an account opens the account sheet and selects the saved account', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add an account' }));
    expect(screen.getByText('account-sheet:later')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('account-sheet-stub'));
    expect(mockState.setAccount).toHaveBeenCalledWith('new-account');
  });

  it('opens the account sheet in onboarding context when the entry is onboarding', async () => {
    await render(
      <ThemeProvider>
        <ImportScreen entry="onboarding" accountId={null} onDone={jest.fn()} />
      </ThemeProvider>
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add an account' }));
    expect(screen.getByText('account-sheet:onboarding')).toBeTruthy();
  });
});

describe('ImportScreen: rejected and statement choice', () => {
  it('too many rows shows the split-the-file message', async () => {
    mockState = makeState({ stage: 'rejected', rejectReason: 'too_many_rows' });
    await renderScreen();
    expect(screen.getByText('This file has more than 5,000 rows. Split it into smaller files and import them one at a time.')).toBeTruthy();
  });

  it.each([
    ['unreadable', 'This file couldn’t be read as a statement.'],
    ['no_rows', 'This file has no transactions in it.'],
    ['too_big', 'This file is too large to read.'],
    ['unsupported_format', 'This file isn’t a CSV, OFX or QFX statement.'],
    ['unsupported_statement', 'This file holds an investment or loan statement, which can’t be imported yet.'],
  ])('%s shows its copy, and Back returns to the start', async (reason, copy) => {
    mockState = makeState({ stage: 'rejected', rejectReason: reason });
    await renderScreen();
    expect(screen.getByText(copy)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockState.cancel).toHaveBeenCalledTimes(1);
  });

  it('a multi-account file lists one row per statement and chooses on tap', async () => {
    mockState = makeState({
      stage: 'choose-statement',
      statementChoices: [
        { index: 0, kind: 'card', currency: 'GBP', count: 12 },
        { index: 1, kind: 'bank', currency: 'EUR', count: 1 },
      ],
    });
    await renderScreen();
    expect(screen.getByText('This file holds more than one account. Which one is this import for?')).toBeTruthy();
    expect(screen.getByText('Credit card in GBP · 12 lines')).toBeTruthy();
    expect(screen.getByText('Bank account in EUR · 1 line')).toBeTruthy();
    await fireEvent.press(screen.getByText('Bank account in EUR · 1 line'));
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

  it('states the reading in words with the example row, flip and confirm', async () => {
    mockState = makeState({
      stage: 'format',
      accountId: 'a1',
      profile: profile(),
      exampleRow: example,
      formatFigures: { closing: -125000, limit: 100000, overLimit: true, currency: 'GBP' },
    });
    await renderScreen();
    expect(screen.getByText('Check how we read this')).toBeTruthy();
    expect(
      screen.getByText(
        'We read this as a credit card statement. Purchases are shown as positive and payments as negative. The balance is what you owe: £1,250.00, which is over your £1,000.00 limit.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Example row')).toBeTruthy();
    expect(screen.getByText('COFFEE SHOP')).toBeTruthy();
    await fireEvent.press(screen.getByText('Doesn’t look right? Flip the reading'));
    expect(mockState.flip).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Use this reading' }));
    expect(mockState.confirmFormat).toHaveBeenCalledTimes(1);
  });

  it('the flip control names the new meaning for a screen reader', async () => {
    mockState = makeState({ stage: 'format', accountId: 'a1', profile: profile({ positiveMeans: 'money-in' }), exampleRow: example });
    await renderScreen();
    expect(screen.getByLabelText('Flip the reading — read positive amounts as money out instead')).toBeTruthy();
  });

  it('an ambiguous file shows the candidate readings, preselects none and blocks confirm (E-CR-04)', async () => {
    mockState = makeState({
      stage: 'format',
      accountId: 'a1',
      profile: null,
      candidates: [
        profile({ positiveMeans: 'money-spent', balanceMeans: 'owed' }),
        profile({ positiveMeans: 'money-in', balanceMeans: 'owed' }),
      ],
    });
    await renderScreen();
    expect(screen.getByText('We can’t tell how this file reads its amounts. Choose how it should be read before importing.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use this reading' })).toBeDisabled();
    expect(screen.queryByText('✓')).toBeNull();
    expect(screen.queryByText('Doesn’t look right? Flip the reading')).toBeNull();
    await fireEvent.press(screen.getByLabelText(/Positive amounts are money out/));
    expect(mockState.chooseCandidate).toHaveBeenCalledWith(0);
  });

  it('once a candidate is chosen it is marked and confirm is enabled', async () => {
    const chosen = profile({ positiveMeans: 'money-in', balanceMeans: 'owed', decidedBy: 'user' });
    mockState = makeState({
      stage: 'format',
      accountId: 'a1',
      profile: chosen,
      candidates: [profile({ positiveMeans: 'money-spent' }), profile({ positiveMeans: 'money-in' })],
    });
    await renderScreen();
    expect(screen.getByRole('button', { name: 'Use this reading' })).not.toBeDisabled();
    expect(screen.getAllByText('✓')).toHaveLength(1);
  });

  it('Cancel calls cancel()', async () => {
    mockState = makeState({ stage: 'format', accountId: 'a1', profile: profile(), exampleRow: example });
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
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

  it('shows one row per role with the chosen header or Not used', async () => {
    mockState = makeState(base);
    await renderScreen();
    expect(screen.getByText('Check the columns')).toBeTruthy();
    for (const role of ['Date', 'Description', 'Amount', 'Money out', 'Money in', 'Money in or out', 'Balance', 'Currency', 'Limit']) {
      expect(screen.getByText(role)).toBeTruthy();
    }
    expect(screen.getByText('Posted')).toBeTruthy();
    expect(screen.getAllByText('Not used').length).toBeGreaterThanOrEqual(5);
  });

  it('picking a header for a role sets the mapping; picking Not used clears it', async () => {
    mockState = makeState(base);
    await renderScreen();
    await fireEvent.press(screen.getByText('Amount'));
    await fireEvent.press(screen.getByLabelText('Memo'));
    expect(mockState.setMapping).toHaveBeenCalledWith({ ...mapping, amount: 1 });
  });

  it('lists mapping errors and disables Continue while any exist', async () => {
    mockState = makeState({ ...base, mappingErrors: ['no-date', 'duplicate-column'] });
    await renderScreen();
    expect(screen.getByText('Pick the date column.')).toBeTruthy();
    expect(screen.getByText('Each column can only be used once.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('Continue calls continue() when the mapping is valid', async () => {
    mockState = makeState(base);
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockState.continue).toHaveBeenCalledTimes(1);
  });

  it('an ambiguous date order is asked explicitly, preselects neither, and blocks Continue (E-CR-02)', async () => {
    mockState = makeState({ ...base, dateAmbiguous: true, dateNeedsChoice: true });
    await renderScreen();
    expect(screen.getByText('These dates could be day-first or month-first. Pick one.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await fireEvent.press(screen.getByText('MM/DD/YYYY'));
    expect(mockState.setDateFormat).toHaveBeenCalledWith('MDY');
    await fireEvent.press(screen.getByText('DD/MM/YYYY'));
    expect(mockState.setDateFormat).toHaveBeenCalledWith('DMY');
  });

  it('an ambiguous decimal mark is asked explicitly and blocks Continue (E-CR-02)', async () => {
    mockState = makeState({ ...base, decimalMark: ',', notationAmbiguous: true, notationNeedsChoice: true });
    await renderScreen();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await fireEvent.press(screen.getByText('Point (1,234.56)'));
    expect(mockState.setDecimalMark).toHaveBeenCalledWith('.');
  });

  it('shows the remembered-reading note when the format step was skipped', async () => {
    mockState = makeState({ ...base, rememberedNote: true });
    await renderScreen();
    expect(screen.getByText('Read the same way as your last statement from this account.')).toBeTruthy();
  });

  it('Back and Cancel are wired', async () => {
    mockState = makeState(base);
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockState.back).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockState.cancel).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------------------

function previewRow(index: number, over: Record<string, unknown> = {}, converted: Record<string, unknown> = {}) {
  return {
    index,
    converted: {
      index,
      localDate: '2026-03-01',
      description: `LINE ${index}`,
      amount: -350,
      balance: null,
      availableSigned: null,
      rawAmount: '3.50',
      rawBalance: null,
      currency: 'GBP',
      externalId: null,
      trnType: null,
      issues: [],
      ...converted,
    },
    check: 'verified',
    duplicate: null,
    categoryId: null,
    categorySource: 'none',
    included: true,
    locked: false,
    transfer: null,
    payMatch: null,
    ...over,
  };
}

function reviewState(rows: ReturnType<typeof previewRow>[], over: Record<string, unknown> = {}, file = 'all-verified') {
  return makeState({
    stage: 'review',
    accountId: 'a1',
    profile: profile({ accountFamily: 'deposit', balanceMeans: 'held' }),
    preview: { rows, reconcile: { file, rows: rows.map((r) => r.check), orientation: 'as-is', verifiedLinks: 0, failedLinks: 0 }, fitidDisabled: false, limitOffer: null },
    reconcile: { file },
    counts: { total: rows.length, included: rows.filter((r) => r.included).length, duplicates: 0, blocked: 0, cannotVerify: 0 },
    rowState: jest.fn((i: number) => {
      const r = rows.find((x) => x.index === i);
      return { included: r?.included ?? false, categoryId: r?.categoryId ?? null, locked: r?.locked ?? false };
    }),
    ...over,
  });
}

describe('ImportScreen: review', () => {
  it.each([
    ['all-verified', ['Balances check out.'], []],
    ['partial', ['Some rows can’t be checked against the balance', 'Review them before importing. The rest reconciled.'], []],
    [
      'ends-only-mismatch',
      ['The opening and closing balances don’t add up', 'The rows between them can’t be checked one by one. Review them before importing.'],
      ['The rest reconciled.'],
    ],
    ['none-in-file', ['Couldn’t check this file against a balance.'], []],
  ])('reconciliation %s reads as a plain sentence', async (file, shown, hidden) => {
    mockState = reviewState([previewRow(0)], {}, file);
    await renderScreen();
    for (const s of shown) expect(screen.getByText(s)).toBeTruthy();
    for (const s of hidden) expect(screen.queryByText(s)).toBeNull();
  });

  it('ends-only mismatch never says the rest reconciled', async () => {
    mockState = reviewState([previewRow(0)], {}, 'ends-only-mismatch');
    await renderScreen();
    expect(screen.queryByText(/The rest reconciled/)).toBeNull();
  });

  it('shows the heading with the line count and a row per line', async () => {
    mockState = reviewState([previewRow(0), previewRow(1)]);
    await renderScreen();
    expect(screen.getByText('Review 2 lines')).toBeTruthy();
    expect(screen.getByText('LINE 0')).toBeTruthy();
    expect(screen.getByText('LINE 1')).toBeTruthy();
    expect(screen.getAllByText('-£3.50')).toHaveLength(2);
  });

  it('a cannot-verify row carries the Can’t verify tag and stays tickable', async () => {
    mockState = reviewState([previewRow(0, { check: 'cannot-verify' }), previewRow(1)], {}, 'partial');
    await renderScreen();
    expect(screen.getAllByText('Can’t verify')).toHaveLength(1);
    expect(screen.getByLabelText('Can’t verify against the balance')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Select LINE 0' }));
    expect(mockState.toggleRow).toHaveBeenCalledWith(0);
  });

  it('a row with a negative running balance gets no tag and no warning', async () => {
    mockState = reviewState([previewRow(0, { check: 'verified' }, { balance: -5000 })]);
    await renderScreen();
    expect(screen.queryByText('Can’t verify')).toBeNull();
    expect(screen.queryByText('Possible duplicate')).toBeNull();
  });

  it('a possible duplicate is tagged and shown unticked; a locked row cannot be toggled', async () => {
    mockState = reviewState([previewRow(0, { duplicate: { kind: 'fitid' }, included: false }), previewRow(1, { locked: true, included: false })]);
    await renderScreen();
    expect(screen.getAllByText('Possible duplicate')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Select LINE 0' })).toHaveProp('accessibilityState', { checked: false, disabled: false });
    expect(screen.getByRole('checkbox', { name: 'Select LINE 1' })).toBeDisabled();
  });

  it('shows each row issue', async () => {
    mockState = reviewState([previewRow(0, {}, { issues: ['conflicting-markers', 'bad-balance'] })]);
    await renderScreen();
    expect(screen.getByText('Amount shows two different signs')).toBeTruthy();
    expect(screen.getByText('Balance not recognised')).toBeTruthy();
  });

  it('the category chip opens the picker and sets the row category', async () => {
    mockState = reviewState([previewRow(0)]);
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Category for LINE 0'));
    await fireEvent.press(screen.getByLabelText('Groceries'));
    expect(mockState.setRowCategory).toHaveBeenCalledWith(0, 'c1');
  });

  it('notes that rates for older foreign-currency lines are still being fetched', async () => {
    mockState = reviewState([previewRow(0, {}, { currency: 'EUR', localDate: '2026-03-01' })]);
    await renderScreen();
    expect(screen.getByText('Rates for older dates are still being fetched.')).toBeTruthy();
  });

  it('shows no rates note for home-currency lines', async () => {
    mockState = reviewState([previewRow(0)]);
    await renderScreen();
    expect(screen.queryByText('Rates for older dates are still being fetched.')).toBeNull();
  });

  it('offers the statement limit with Add limit and Skip', async () => {
    mockState = reviewState([previewRow(0)], { limitOffer: { field: 'overdraft_limit', amount: 100000 } });
    await renderScreen();
    expect(screen.getByText('This statement shows a £1,000.00 limit. Add it to Current?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add limit' }));
    expect(mockState.acceptLimit).toHaveBeenCalledWith(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(mockState.acceptLimit).toHaveBeenCalledWith(false);
  });

  it('shows no limit card when none is offered', async () => {
    mockState = reviewState([previewRow(0)]);
    await renderScreen();
    expect(screen.queryByRole('button', { name: 'Add limit' })).toBeNull();
  });

  it('commits from review when no matches remain, with the ticked count', async () => {
    mockState = reviewState([previewRow(0), previewRow(1), previewRow(2, { included: false })]);
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Import 2 transactions' }));
    expect(mockState.commit).toHaveBeenCalledTimes(1);
  });

  it('shows Continue instead when matches remain', async () => {
    mockState = reviewState([previewRow(0)], { transferRows: [{ index: 0, suggestion: { kind: 'orphan' }, answer: null }] });
    await renderScreen();
    expect(screen.queryByRole('button', { name: /Import/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockState.continue).toHaveBeenCalledTimes(1);
  });

  it('disables the primary action at zero ticked lines', async () => {
    mockState = reviewState([previewRow(0, { included: false })]);
    await renderScreen();
    expect(screen.getByRole('button', { name: 'Import 0 transactions' })).toBeDisabled();
  });

  it('while the preview is still being read there is nothing to commit', async () => {
    mockState = makeState({ stage: 'review', accountId: 'a1', preview: null });
    await renderScreen();
    expect(screen.queryByRole('button', { name: /Import/ })).toBeNull();
  });

  it('Back and Cancel are wired', async () => {
    mockState = reviewState([previewRow(0)]);
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockState.back).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockState.cancel).toHaveBeenCalledTimes(1);
  });
});
