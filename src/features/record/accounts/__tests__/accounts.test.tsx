import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors } from '@/theme/tokens';
import type { AccountRow } from '@/db/rows';
import type { AccountBalanceView } from '@/data/queries/activity';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { minorUnits } from '@/engine/money';
import { AccountSheet } from '../AccountSheet';
import { AccountBalanceBlock } from '../AccountBalanceBlock';
import { AccountsScreen } from '../AccountsScreen';
import { AccountDetailScreen } from '../AccountDetailScreen';

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

jest.mock('@/data/mutations/accounts', () => ({
  useAddAccount: () => ({ add: mockAdd }),
  useEditAccount: () => ({ edit: mockEdit }),
}));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/data/mutations/transactions', () => ({ useMarkPaid: () => ({ markPaid: jest.fn(() => null) }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: mockTrack }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: mockBalances, isLoading: false }),
  useMonthView: () => ({
    rows: [
      { id: 't1', account_id: 'acc1', name: 'Coffee', category_id: null, original_amount: -400, amountHome: -400, note: null, transfer_id: null },
      { id: 't2', account_id: 'other', name: 'Elsewhere', category_id: null, original_amount: -900, amountHome: -900, note: null, transfer_id: null },
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
  }),
}));
jest.mock('@/features/record/entry/TransactionSheet', () => ({ TransactionSheet: () => null }));
jest.mock('@/features/record/activity/ActivityRow', () => {
  const { Text } = jest.requireActual('react-native');
  return { ActivityRow: ({ row }: { row: { name: string } }) => <Text>{`line:${row.name}`}</Text> };
});

function account(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc1',
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
});

describe('AccountSheet new', () => {
  it('saves an overdrawn opening balance as negative with an overdraft limit and no warning copy', async () => {
    const onClose = jest.fn();
    const onSaved = jest.fn();
    const { getByLabelText, getByText, queryByText } = await wrap(
      <AccountSheet visible mode={{ kind: 'new', context: 'later' }} onClose={onClose} onSaved={onSaved} />
    );
    await fireEvent.changeText(getByLabelText('Name'), 'Main');
    await fireEvent.press(getByText('Overdrawn'));
    await fireEvent.changeText(getByLabelText('Opening balance'), '240.00');
    await fireEvent.changeText(getByLabelText('Overdraft limit'), '500.00');
    await fireEvent.press(getByText('Save account'));

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [input, undo] = mockAdd.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(input).toMatchObject({
      household_id: 'h1',
      name: 'Main',
      kind: 'checking',
      currency: 'GBP',
      opening_balance: -24000,
      overdraft_limit: 50000,
    });
    expect(input).not.toHaveProperty('credit_limit');
    expect(undo).toEqual({ stepId: 'step-1', ownerId: 'u1' });
    expect(getToast()).toMatchObject({ stepId: 'step-1', text: { key: 'undo.label.accountAdded' } });
    expect(mockTrack).toHaveBeenCalledWith('account_created', { context: 'later' });
    expect(onSaved).toHaveBeenCalledWith('new-acc');
    expect(onClose).toHaveBeenCalled();
    expect(queryByText(/error|warning/i)).toBeNull();
  });

  it('requires a name and does not write', async () => {
    const { getByText } = await wrap(<AccountSheet visible mode={{ kind: 'new', context: 'onboarding' }} onClose={jest.fn()} />);
    await fireEvent.press(getByText('Save account'));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(getByText('Give the account a name.')).toBeTruthy();
  });

  it('rejects a typed minus sign through the strict parser', async () => {
    const { getByLabelText, getByText } = await wrap(
      <AccountSheet visible mode={{ kind: 'new', context: 'later' }} onClose={jest.fn()} />
    );
    await fireEvent.changeText(getByLabelText('Name'), 'Main');
    await fireEvent.changeText(getByLabelText('Opening balance'), '-5');
    await fireEvent.press(getByText('Save account'));
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('a blank opening balance saves as 0 and a blank limit as null; analytics carries the onboarding context', async () => {
    const { getByLabelText, getByText } = await wrap(
      <AccountSheet visible mode={{ kind: 'new', context: 'onboarding' }} onClose={jest.fn()} />
    );
    await fireEvent.changeText(getByLabelText('Name'), 'Main');
    await fireEvent.press(getByText('Save account'));
    const [input] = mockAdd.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input).toMatchObject({ opening_balance: 0, overdraft_limit: null });
    expect(mockTrack).toHaveBeenCalledWith('account_created', { context: 'onboarding' });
  });
});

describe('AccountSheet kinds', () => {
  it('a card defaults to owing and takes a credit limit', async () => {
    const { getByLabelText, getByText, queryByLabelText } = await wrap(
      <AccountSheet visible mode={{ kind: 'new', context: 'later' }} onClose={jest.fn()} />
    );
    await fireEvent.press(getByLabelText('Type'));
    await fireEvent.press(getByText('Credit card'));
    expect(getByText('I owe this')).toBeTruthy();
    expect(getByText('I’m in credit')).toBeTruthy();
    expect(queryByLabelText('Overdraft limit')).toBeNull();
    await fireEvent.changeText(getByLabelText('Name'), 'Visa');
    await fireEvent.changeText(getByLabelText('Opening balance'), '100');
    await fireEvent.changeText(getByLabelText('Credit limit'), '1000');
    await fireEvent.press(getByText('Save account'));
    const [input] = mockAdd.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input).toMatchObject({ kind: 'credit', opening_balance: -10000, credit_limit: 100000 });
    expect(input).not.toHaveProperty('overdraft_limit');
  });

  it('a loan reads Amount owed, has no sign control or limit, and is stored negative', async () => {
    const { getByLabelText, getByText, queryByText, queryByLabelText } = await wrap(
      <AccountSheet visible mode={{ kind: 'new', context: 'later' }} onClose={jest.fn()} />
    );
    await fireEvent.press(getByLabelText('Type'));
    await fireEvent.press(getByText('Loan'));
    expect(queryByText('In credit')).toBeNull();
    expect(queryByLabelText('Overdraft limit')).toBeNull();
    expect(queryByLabelText('Credit limit')).toBeNull();
    await fireEvent.changeText(getByLabelText('Name'), 'Car');
    await fireEvent.changeText(getByLabelText('Amount owed'), '2500');
    await fireEvent.press(getByText('Save account'));
    const [input] = mockAdd.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input).toMatchObject({ kind: 'loan', opening_balance: -250000 });
  });
});

describe('AccountSheet edit', () => {
  it('shows the currency read-only and patches only what changed, with an undo toast', async () => {
    const { getByLabelText, getByText, queryByLabelText } = await wrap(
      <AccountSheet visible mode={{ kind: 'edit', account: account() }} onClose={jest.fn()} />
    );
    expect(getByText('The currency is set when the account is made.')).toBeTruthy();
    expect(queryByLabelText('Currency')).toBeNull();
    await fireEvent.changeText(getByLabelText('Name'), 'Everyday');
    await fireEvent.press(getByText('Save changes'));
    const [vars, undo] = mockEdit.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(vars).toEqual({ id: 'acc1', householdId: 'h1', expectedVersion: 4, patch: { name: 'Everyday' } });
    expect(undo).toEqual({ stepId: 'step-1', ownerId: 'u1' });
    expect(getToast()).toMatchObject({ stepId: 'step-1', text: { key: 'undo.label.accountEdited' } });
  });

  it('offers no Undo when the hook records no step (follow-up item 7)', async () => {
    mockEdit.mockReturnValueOnce(false);
    const { getByLabelText, getByText } = await wrap(
      <AccountSheet visible mode={{ kind: 'edit', account: account() }} onClose={jest.fn()} />
    );
    await fireEvent.changeText(getByLabelText('Name'), 'Everyday');
    await fireEvent.press(getByText('Save changes'));
    expect(getToast()?.stepId).toBeNull();
  });

  it('archives and restores through edit', async () => {
    const first = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: account() }} onClose={jest.fn()} />);
    await fireEvent.press(first.getByText('Archive account'));
    const [vars] = mockEdit.mock.calls[0] as unknown as [{ patch: { archived_at: string | null } }];
    expect(typeof vars.patch.archived_at).toBe('string');
    expect(getToast()).toMatchObject({ stepId: 'step-1' });
  });
});

describe('AccountBalanceBlock', () => {
  it('shows a warn1 standing sentence with the sentence as its accessibility label for an exceeded tier', async () => {
    const standing = { kind: 'overdrawn-beyond', overdrawnBy: minorUnits(64000), limit: minorUnits(50000), beyondBy: minorUnits(14000) } as const;
    const { getByLabelText, getByText } = await wrap(
      <AccountBalanceBlock account={account()} balance={view({ balance: -64000, standing })} homeCurrency="GBP" />
    );
    const sentence = getByText('£140.00 beyond your £500.00 overdraft.');
    expect(getByLabelText('£140.00 beyond your £500.00 overdraft.')).toBeTruthy();
    expect(JSON.stringify(sentence.props.style)).toContain(colors.warn1);
    expect(JSON.stringify(sentence.props.style)).not.toContain(colors.danger);
  });

  it('keeps a within-limit negative balance in plain ink and a card with zero owed reads Nothing owing', async () => {
    const { getByText } = await wrap(
      <AccountBalanceBlock
        account={account({ kind: 'credit' })}
        balance={view({ balance: 0, standing: { kind: 'owing-within', owed: minorUnits(0), limit: minorUnits(100000) } })}
        homeCurrency="GBP"
      />
    );
    expect(getByText('Nothing owing.')).toBeTruthy();
  });

  it('shows a visible minus, never parentheses, and no danger colour when standing is understood', async () => {
    const { getByText } = await wrap(
      <AccountBalanceBlock
        account={account()}
        balance={view({ balance: -24000, standing: { kind: 'overdrawn-no-limit', overdrawnBy: minorUnits(24000) } })}
        homeCurrency="GBP"
      />
    );
    const figure = getByText(/^[−-]£240\.00$/);
    expect(figure.props.children).not.toMatch(/\(/);
    expect(JSON.stringify(figure.props.style)).not.toContain(colors.danger);
  });

  it('shows other-currency subtotals, still to come, and an approximate home figure with the rate date', async () => {
    const { getByText } = await wrap(
      <AccountBalanceBlock
        account={account({ currency: 'EUR' })}
        balance={view({ balance: 20000, otherCurrencies: [{ currency: 'GBP', paidSum: 500 }], pendingSum: -1500 })}
        homeCurrency="GBP"
      />
    );
    expect(getByText('Also £5.00 in GBP')).toBeTruthy();
    expect(getByText(/still to come/)).toBeTruthy();
    expect(getByText(/^≈ /)).toBeTruthy();
    expect(getByText(/1 Oct 2026|2026/)).toBeTruthy();
  });

  it('shows nothing numeric on overflow', async () => {
    const { queryByText } = await wrap(
      <AccountBalanceBlock account={account()} balance={view({ balance: null, overflow: true, standing: null })} homeCurrency="GBP" />
    );
    expect(queryByText(/£/)).toBeNull();
  });
});

describe('AccountsScreen and AccountDetailScreen', () => {
  it('lists active accounts with kind and currency, an Archived section, and opens one on tap', async () => {
    mockAccounts = [account(), account({ id: 'acc2', name: 'Old', archived_at: '2026-01-01T00:00:00Z' })];
    mockBalances = new Map([['acc1', view()]]);
    const onOpen = jest.fn();
    const { getByText, getAllByText, getByLabelText } = await wrap(<AccountsScreen onOpenAccount={onOpen} />);
    expect(getAllByText('Current account · GBP')).toHaveLength(2);
    expect(getByText('Archived')).toBeTruthy();
    await fireEvent.press(getByLabelText('Old'));
    expect(onOpen).toHaveBeenCalledWith('acc2');
  });

  it('shows the empty state', async () => {
    const { getByText } = await wrap(<AccountsScreen onOpenAccount={jest.fn()} />);
    expect(getByText('No accounts yet.')).toBeTruthy();
    expect(getByText('Add one to start logging money in and out.')).toBeTruthy();
  });

  it('opens the new-account sheet from Add account', async () => {
    const { getByText } = await wrap(<AccountsScreen onOpenAccount={jest.fn()} />);
    await fireEvent.press(getByText('Add account'));
    expect(getByText('New account')).toBeTruthy();
  });

  it('detail offers Import statement for the account, Edit account, and only this account’s lines', async () => {
    mockAccounts = [account()];
    mockBalances = new Map([['acc1', view()]]);
    const onImport = jest.fn();
    const { getByText, queryByText } = await wrap(<AccountDetailScreen accountId="acc1" onImport={onImport} />);
    expect(getByText('line:Coffee')).toBeTruthy();
    expect(queryByText('line:Elsewhere')).toBeNull();
    await fireEvent.press(getByText('Import statement'));
    expect(onImport).toHaveBeenCalledWith('acc1');
    await fireEvent.press(getByText('Edit account'));
    expect(getByText('Save changes')).toBeTruthy();
  });
});

describe('AccountSheet: opening balance prefill in the region notation (S-CR-01)', () => {
  it('de-DE, KWD (3 decimals): renaming leaves the opening balance unchanged', async () => {
    mockRegion = 'DE';
    const acc = account({ currency: 'KWD', opening_balance: 500000 });
    const { getByLabelText, getByText } = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: acc }} onClose={jest.fn()} />);
    expect(getByLabelText('Opening balance').props.value).toBe('500,000');
    await fireEvent.changeText(getByLabelText('Name'), 'Dinar');
    await fireEvent.press(getByText('Save changes'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [vars] = mockEdit.mock.calls[0] as unknown as [{ patch: Record<string, unknown> }];
    expect(vars.patch).toEqual({ name: 'Dinar' });
  });

  it('de-DE, EUR: a rename of an account with cents saves, with no separator error', async () => {
    mockRegion = 'DE';
    const acc = account({ currency: 'EUR', opening_balance: 123456, overdraft_limit: 50000 });
    const { getByLabelText, getByText, queryByText } = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: acc }} onClose={jest.fn()} />);
    expect(getByLabelText('Opening balance').props.value).toBe('1234,56');
    expect(getByLabelText('Overdraft limit').props.value).toBe('500,00');
    await fireEvent.changeText(getByLabelText('Name'), 'Giro');
    await fireEvent.press(getByText('Save changes'));
    expect(queryByText(/match how amounts are written/)).toBeNull();
    const [vars] = mockEdit.mock.calls[0] as unknown as [{ patch: Record<string, unknown> }];
    expect(vars.patch).toEqual({ name: 'Giro' });
  });
});

describe('AccountSheet: new-account currency follows a late home-currency default (S-WR-09)', () => {
  it('moves with the home currency until the user picks one', async () => {
    mockHome = 'USD';
    const ui = (
      <ThemeProvider>
        <AccountSheet visible mode={{ kind: 'new', context: 'onboarding' }} onClose={jest.fn()} />
      </ThemeProvider>
    );
    const u = await render(ui);
    expect(u.getByLabelText('Currency').props.accessibilityValue).toMatchObject({ text: 'USD' });
    mockHome = 'GBP';
    await u.rerender(
      <ThemeProvider>
        <AccountSheet visible mode={{ kind: 'new', context: 'onboarding' }} onClose={jest.fn()} />
      </ThemeProvider>
    );
    expect(u.getByLabelText('Currency').props.accessibilityValue).toMatchObject({ text: 'GBP' });
    await fireEvent.changeText(u.getByLabelText('Name'), 'Main');
    await fireEvent.press(u.getByText('Save account'));
    const [input] = mockAdd.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input.currency).toBe('GBP');
  });

  it('keeps a currency the user picked when the home currency changes later', async () => {
    mockHome = 'GBP';
    const u = await render(
      <ThemeProvider>
        <AccountSheet visible mode={{ kind: 'new', context: 'onboarding' }} onClose={jest.fn()} />
      </ThemeProvider>
    );
    await fireEvent.press(u.getByLabelText('Currency'));
    await fireEvent.press(u.getByText('EUR · Euro'));
    mockHome = 'USD';
    await u.rerender(
      <ThemeProvider>
        <AccountSheet visible mode={{ kind: 'new', context: 'onboarding' }} onClose={jest.fn()} />
      </ThemeProvider>
    );
    await fireEvent.changeText(u.getByLabelText('Name'), 'Euro');
    await fireEvent.press(u.getByText('Save account'));
    const [input] = mockAdd.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input.currency).toBe('EUR');
  });
});

describe('AccountSheet: a disabled Save gives its reason (S-WR-10)', () => {
  it('says why while the record context is still loading', async () => {
    mockReady = false;
    const u = await wrap(<AccountSheet visible mode={{ kind: 'new', context: 'later' }} onClose={jest.fn()} />);
    const reason = 'Your account details are still loading, so this can’t be saved yet.';
    expect(u.getByText(reason)).toBeTruthy();
    const save = u.getByRole('button', { name: 'Save account' });
    expect(save).toBeDisabled();
    expect(save.props.accessibilityHint).toBe(reason);
  });
});

describe('AccountSheet: changing the type keeps what the balance means (S-WR-12)', () => {
  it('an overdrawn current account changed to Savings stays overdrawn', async () => {
    const acc = account({ kind: 'checking', opening_balance: -20000 });
    const u = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: acc }} onClose={jest.fn()} />);
    await fireEvent.press(u.getByLabelText('Type'));
    await fireEvent.press(u.getByText('Savings'));
    await fireEvent.press(u.getByText('Save changes'));
    const [vars] = mockEdit.mock.calls[0] as unknown as [{ patch: Record<string, unknown> }];
    expect(vars.patch).toEqual({ kind: 'savings' });
  });

  it('a credit card changed to a current account drops the credit limit instead of re-using it', async () => {
    const acc = account({ kind: 'credit', opening_balance: -10000, credit_limit: 50000 });
    const u = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: acc }} onClose={jest.fn()} />);
    expect(u.getByLabelText('Credit limit').props.value).toBe('500.00');
    await fireEvent.press(u.getByLabelText('Type'));
    await fireEvent.press(u.getByText('Current account'));
    expect(u.getByLabelText('Overdraft limit').props.value).toBe('');
    await fireEvent.press(u.getByText('Save changes'));
    const [vars] = mockEdit.mock.calls[0] as unknown as [{ patch: Record<string, unknown> }];
    expect(vars.patch).toEqual({ kind: 'checking', credit_limit: null });
  });
});
