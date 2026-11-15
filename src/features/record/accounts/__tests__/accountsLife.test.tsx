// 06.2-16 (DSG-01, DSG-07, NAV-06): Accounts get their type icons on rows, the detail header and the kind picker;
// a negative balance keeps its minus, speaks "minus" and is red only for owed beyond a limit or debt (D-14); and an
// empty Accounts screen shows the 48 tile, one sentence and one button that opens Add (D-24).
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors } from '@/theme/tokens';
import type { AccountRow } from '@/db/rows';
import type { AccountBalanceView } from '@/data/queries/activity';
import { resetToastForTests } from '@/state/undoToast';
import { minorUnits } from '@/engine/money';
import { layOutSheets } from '@/test/sheetLayout';
import { MATRIX, expectFits, expectTargets, matrixName } from '@/test/textFitMatrix';
import { AccountSheet } from '../AccountSheet';
import { AccountBalanceBlock, balanceIsDanger } from '../AccountBalanceBlock';
import { AccountsScreen } from '../AccountsScreen';
import { AccountDetailScreen } from '../AccountDetailScreen';

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const mockAdd = jest.fn((..._args: unknown[]) => 'new-acc');
const mockEdit = jest.fn((..._args: unknown[]) => true);
const mockTrack = jest.fn();
let mockAccounts: AccountRow[] = [];
let mockRegion = 'GB';
let mockHome = 'GBP';
let mockReady = true;
let mockBalances = new Map<string, AccountBalanceView>();
let mockSync = { isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null as number | null };

// 05.2-26: AccountSheet now imports the Decide account-use row; the flag is off here, so none of it renders.
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
jest.mock('@/data/mutations/accountUse', () => ({ useSaveAccountUse: () => ({ save: jest.fn() }), useSaveAccountUses: () => ({ save: jest.fn() }) }));
jest.mock('@/data/queries/decide', () => ({
  usePots: () => ({ data: undefined }),
  useDecideSettings: () => ({ data: null }),
}));

jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: () => mockSync }));

jest.mock('@/data/mutations/accounts', () => ({
  useAddAccount: () => ({ add: mockAdd }),
  useEditAccount: () => ({ edit: mockEdit }),
}));
// 06-18: AccountSheet takes the rate write from the Grow holdings mutations (needs a query client, none here).
jest.mock('@/data/mutations/growHoldings', () => ({ useSetAccountRate: () => ({ set: jest.fn(() => 'rate-step') }) }));
jest.mock('@/data/mutations/accountDelete', () => ({ useDeleteAccount: () => ({ remove: jest.fn() }) }));
jest.mock('@/data/queries/pendingSplit', () => ({ usePendingSplit: () => ({ split: new Map(), isLoading: false }) }));
jest.mock('../useAccountUsage', () => ({ useAccountUsage: () => ({ usage: null }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
const mockMarkPaid = jest.fn((..._a: unknown[]): string | null => null);
const mockGoalPay = jest.fn((..._a: unknown[]): boolean => true);
jest.mock('@/data/mutations/transactions', () => ({ useMarkPaid: () => ({ markPaid: (...a: unknown[]) => mockMarkPaid(...a) }) }));
// P5-WR-01: a goal's Expected line is marked paid through the goal confirm, never a plain status patch.
jest.mock('@/features/grow/goals/useGoalLinePay', () => ({ useGoalLinePay: () => ({ pay: (...a: unknown[]) => mockGoalPay(...a) }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [{ id: 's-lisbon', goal_id: 'g1' }] }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: mockTrack }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: mockBalances, isLoading: false }),
  useMonthView: () => ({
    rows: [
      { id: 't1', account_id: 'acc1', name: 'Coffee', category_id: null, original_amount: -400, amountHome: -400, note: null, transfer_id: null },
      { id: 't2', account_id: 'other', name: 'Elsewhere', category_id: null, original_amount: -900, amountHome: -900, note: null, transfer_id: null },
      { id: 't3', account_id: 'acc1', name: 'Lisbon', category_id: null, original_amount: -5000, amountHome: -5000, note: null, transfer_id: null, status: 'pending', recurring_series_id: 's-lisbon', goal_id: null },
    ],
    projections: [],
    totals: {},
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ active: [], all: [], byId: new Map(), transferCategoryId: 'tc' }) }));
jest.mock('@/data/queries/fxLatest', () => ({
  useFxLatest: () => ({ data: [
      { quote: 'EUR', rate: '1.00000000', rate_date: '2026-10-01', source: 'frankfurter-v2' },
      { quote: 'GBP', rate: '0.85000000', rate_date: '2026-10-01', source: 'frankfurter-v2' },
    ],
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
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: mockReady,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: mockHome,
    showCents: true,
    region: mockRegion,
    timeZone: 'Europe/London',
    today: '2026-10-06',
    horizonMonth: null,
  }),
}));
jest.mock('@/features/record/entry/TransactionSheet', () => ({ TransactionSheet: () => null }));
jest.mock('@/features/record/activity/ActivityRow', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    ActivityRow: ({ row, onMarkPaid }: { row: { name: string }; onMarkPaid?: (r: unknown) => void }) => (
      <Text onPress={() => onMarkPaid?.(row)}>{`line:${row.name}`}</Text>
    ),
  };
});

function account(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc1',
    deleted_at: null,
    is_sample: false,
    household_id: 'h1',
    created_by: null,
    name: 'Current',
    kind: 'checking',
    currency: 'GBP',
    opening_balance: 10000,
    archived_at: null,
    updated_by: null,
    overdraft_limit: null,
    credit_limit: null,
    version: 4,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

function view(over: Partial<AccountBalanceView> = {}): AccountBalanceView {
  return { balance: 10000, otherCurrencies: [], overflow: false, pendingSum: 0, standing: null, ...over };
}

function wrap(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  mockAccounts = [];
  mockBalances = new Map();
  mockRegion = 'GB';
  mockHome = 'GBP';
  mockReady = true;
  mockSync = { isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null };
  mockWidth = 402;
  mockScale = 1;
});

const KINDS: AccountRow['kind'][] = ['cash', 'checking', 'savings', 'credit', 'investment', 'loan', 'other'];
const ICON_OF: Record<AccountRow['kind'], string> = {
  cash: 'acctCash',
  checking: 'acctCurrent',
  savings: 'acctSavings',
  credit: 'acctCard',
  investment: 'acctInvestment',
  loan: 'acctLoan',
  other: 'acctOther',
};
const flat = (n: { props: { style?: unknown } }) => (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>;
/** Glyph draws its Svg with testID glyph-<name>. */
const glyphNames = (node: Parameters<typeof within>[0]): string[] =>
  within(node)
    .queryAllByTestId(/^glyph-/, { includeHiddenElements: true })
    .map((n) => String(n.props.testID).slice('glyph-'.length));
/** The Glyph inside a tile: its icon name. */
const glyphNameIn = (testID: string): string | undefined => glyphNames(screen.getByTestId(testID, { includeHiddenElements: true }))[0];

describe('Task 1: account-type icons', () => {
  it.each(KINDS)('a %s row leads with its 36 type tile', async (kind) => {
    mockAccounts = [account({ kind })];
    mockBalances = new Map([['acc1', view()]]);
    await wrap(<AccountsScreen onOpenAccount={jest.fn()} />);
    const tile = screen.getByTestId('account-tile-acc1', { includeHiddenElements: true });
    expect(flat(tile)).toMatchObject({ width: 36, height: 36 });
    expect(glyphNameIn('account-tile-acc1')).toBe(ICON_OF[kind]);
  });

  it('keeps the row tap, name and kind line, and ends in the arrow', async () => {
    mockAccounts = [account()];
    mockBalances = new Map([['acc1', view()]]);
    const onOpen = jest.fn();
    await wrap(<AccountsScreen onOpenAccount={onOpen} />);
    const row = screen.getByLabelText('Current, Current account · GBP, £100.00');
    expect(glyphNames(row)).toContain('arrowRight');
    await fireEvent.press(row);
    expect(onOpen).toHaveBeenCalledWith('acc1');
  });

  it('the detail header shows the 48 tile with the same icon', async () => {
    mockAccounts = [account({ kind: 'savings' })];
    mockBalances = new Map([['acc1', view()]]);
    await wrap(<AccountDetailScreen accountId="acc1" onImport={jest.fn()} />);
    const tile = screen.getByTestId('account-detail-tile', { includeHiddenElements: true });
    expect(flat(tile)).toMatchObject({ width: 48, height: 48 });
    expect(glyphNameIn('account-detail-tile')).toBe('acctSavings');
  });

  it('the kind picker shows each kind icon beside its word, and picking still works', async () => {
    await wrap(<AccountSheet visible mode={{ kind: 'new', context: 'later' }} onClose={jest.fn()} />);
    await layOutSheets();
    await fireEvent.press(screen.getByLabelText('Type'));
    await layOutSheets();
    for (const k of KINDS) {
      const icon = screen.getByTestId(`glyph-${ICON_OF[k]}`, { includeHiddenElements: true });
      expect(icon.props.width).toBe(20);
    }
    await fireEvent.press(screen.getByLabelText('Loan'));
    expect(screen.getAllByText('Amount owed', { includeHiddenElements: true }).length).toBeGreaterThan(0);
  });
});

describe('Task 1: negative balance (D-14)', () => {
  it('an overdraft within its limit keeps the minus, speaks minus, and stays ink', async () => {
    const standing = { kind: 'overdrawn-within', overdrawnBy: minorUnits(2500), limit: minorUnits(50000) } as const;
    await wrap(<AccountBalanceBlock account={account()} balance={view({ balance: -2500, standing })} homeCurrency="GBP" />);
    const figure = screen.getByText('−£25.00');
    expect(figure.props.accessibilityLabel).toBe('minus £25.00');
    expect(flat(figure).color).toBe(colors.ink);
  });

  it('an overdraft beyond its limit is danger', async () => {
    const standing = { kind: 'overdrawn-beyond', overdrawnBy: minorUnits(64000), limit: minorUnits(50000), beyondBy: minorUnits(14000) } as const;
    await wrap(<AccountBalanceBlock account={account()} balance={view({ balance: -64000, standing })} homeCurrency="GBP" />);
    expect(flat(screen.getByText('−£640.00')).color).toBe(colors.danger);
  });

  it('a card with money owed is danger (debt) on the compact block, and speaks minus', async () => {
    const owing = { kind: 'owing-within', owed: minorUnits(12000), limit: minorUnits(100000) } as const;
    await wrap(
      <AccountBalanceBlock account={account({ kind: 'credit' })} balance={view({ balance: -12000, standing: owing })} homeCurrency="GBP" compact />
    );
    const figure = screen.getByText('−£120.00');
    expect(flat(figure).color).toBe(colors.danger);
    expect(figure.props.accessibilityLabel).toBe('minus £120.00');
  });

  it('a card in credit is ink', async () => {
    await wrap(
      <AccountBalanceBlock
        account={account({ kind: 'credit' })}
        balance={view({ balance: 3000, standing: { kind: 'card-in-credit', creditBy: minorUnits(3000) } })}
        homeCurrency="GBP"
      />
    );
    expect(flat(screen.getByText('£30.00')).color).toBe(colors.ink);
  });

  it('a loan with money owed is danger', async () => {
    await wrap(
      <AccountBalanceBlock
        account={account({ kind: 'loan' })}
        balance={view({ balance: -500000, standing: { kind: 'loan-owing', owed: minorUnits(500000) } })}
        homeCurrency="GBP"
      />
    );
    expect(flat(screen.getByText('−£5,000.00')).color).toBe(colors.danger);
  });

  it('balanceIsDanger: red only for owed beyond a limit or debt, never ordinary spending', () => {
    expect(balanceIsDanger('checking', -100, { kind: 'overdrawn-no-limit', overdrawnBy: minorUnits(100) })).toBe(false);
    expect(balanceIsDanger('cash', -100, null)).toBe(false);
    expect(balanceIsDanger('checking', 100, { kind: 'in-credit', balance: minorUnits(100) })).toBe(false);
    expect(balanceIsDanger('credit', -100, { kind: 'over-limit', owed: minorUnits(100), limit: minorUnits(50), overBy: minorUnits(50) })).toBe(true);
    expect(balanceIsDanger('credit', 0, { kind: 'owing-within', owed: minorUnits(0), limit: null })).toBe(false);
    expect(balanceIsDanger('loan', -1, null)).toBe(true);
    expect(balanceIsDanger('loan', null, null)).toBe(false);
  });

  it('the account card speaks the minus in words', async () => {
    mockAccounts = [account()];
    mockBalances = new Map([['acc1', view({ balance: -2500, standing: { kind: 'overdrawn-no-limit', overdrawnBy: minorUnits(2500) } })]]);
    await wrap(<AccountsScreen onOpenAccount={jest.fn()} />);
    expect(screen.getByLabelText('Current, Current account · GBP, minus £25.00, Overdrawn')).toBeTruthy();
  });

  it('shows no updated-days-ago clock (accounts carry no balance-as-of date)', async () => {
    mockAccounts = [account()];
    mockBalances = new Map([['acc1', view()]]);
    await wrap(<AccountsScreen onOpenAccount={jest.fn()} />);
    expect(screen.queryByText(/Updated|days ago/)).toBeNull();
  });
});

describe('Task 2: empty Accounts (D-24)', () => {
  it('shows the 48 accounts tile, the heading, one sentence and one button that opens Add', async () => {
    mockAccounts = [];
    await wrap(<AccountsScreen onOpenAccount={jest.fn()} />);
    const empty = screen.getByTestId('accounts-empty');
    expect(within(empty).getByText('No accounts yet.')).toBeTruthy();
    expect(within(empty).getByText('Add the account your pay goes into first. You can add more later.')).toBeTruthy();
    const tile = screen.getByTestId('empty-state-tile', { includeHiddenElements: true });
    expect(flat(tile)).toMatchObject({ width: 48, height: 48 });
    expect(glyphNameIn('empty-state-tile')).toBe('accounts');
    expect(within(empty).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByLabelText('Name')).toBeNull();
    await fireEvent.press(within(empty).getByText('Add an account'));
    await layOutSheets();
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('the not-found detail gains the accounts icon and no button', async () => {
    mockAccounts = [account({ id: 'other' })];
    await wrap(<AccountDetailScreen accountId="acc1" onImport={jest.fn()} />);
    expect(glyphNameIn('empty-state-tile')).toBe('accounts');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  for (const m of MATRIX) {
    it(`the empty screen fits at ${matrixName(m)} and its button is a 44+ target`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      mockAccounts = [];
      await wrap(<AccountsScreen onOpenAccount={jest.fn()} />);
      expectFits();
      expectTargets('Add an account');
    });

    it(`a card account owing money fits at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      mockAccounts = [account({ name: 'Everyday spending account', kind: 'credit' })];
      mockBalances = new Map([['acc1', view({ balance: -12000, standing: { kind: 'owing-within', owed: minorUnits(12000), limit: null } })]]);
      await wrap(<AccountsScreen onOpenAccount={jest.fn()} />);
      expectFits();
    });
  }
});
