// 06-18 (GRW-11): the interest rate (APY) on savings and investment accounts. Field shown for those kinds only, one Undo per save,
// detail row and the growth-calculator link.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { AccountRow } from '@/db/rows';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { AccountDetailRows } from '../AccountDetailRows';
import { AccountSheet } from '../AccountSheet';

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockAdd = jest.fn((..._args: unknown[]) => 'new-acc');
const mockEdit = jest.fn((..._args: unknown[]) => true);
const mockSetRate = jest.fn((..._args: unknown[]) => 'rate-step');
jest.mock('@/data/mutations/accounts', () => ({
  useAddAccount: () => ({ add: mockAdd }),
  useEditAccount: () => ({ edit: mockEdit }),
}));
jest.mock('@/data/mutations/growHoldings', () => ({ useSetAccountRate: () => ({ set: mockSetRate }) }));
jest.mock('@/data/mutations/accountUse', () => ({ useSaveAccountUse: () => ({ save: jest.fn() }), useSaveAccountUses: () => ({ save: jest.fn() }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: null }), usePots: () => ({ data: null }) }));
jest.mock('@/data/queries/activity', () => ({ useAccountBalances: () => ({ balances: new Map() }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
let mockRates: { quote: string; rate: string; rate_date: string; source: string }[] = [];
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: mockRates }) }));
jest.mock('@/data/queries/currencyOptions', () => ({
  useCurrencyOptions: () => ({
    options: [{ code: 'GBP', name: 'Pound', symbol: '£', exponent: 2, kind: 'iso', rateDate: null }],
    loading: false,
  }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true, userId: 'u1', householdId: 'h1', homeCurrency: 'GBP', showCents: true, region: 'GB', timeZone: 'Europe/London', today: '2026-10-06',
  }),
}));

function account(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc1', deleted_at: null, is_sample: false, household_id: 'h1', created_by: null, name: 'Rainy day', kind: 'savings', currency: 'GBP',
    opening_balance: 250000, archived_at: null, updated_by: null, overdraft_limit: null, credit_limit: null, version: 3, created_at: '', updated_at: '',
    ...over,
  };
}

function wrap(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  mockRates = [];
});

describe('APY field on the account sheet', () => {
  it('shows for savings and investment accounts only', async () => {
    const savings = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: account() }} onClose={jest.fn()} />);
    expect(savings.getByLabelText('Interest a year (APY)')).toBeTruthy();
    expect(savings.getByText('Leave blank if none.')).toBeTruthy();
    await savings.unmount();
    const invest = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: account({ kind: 'investment' }) }} onClose={jest.fn()} />);
    expect(invest.getByLabelText('Interest a year (APY)')).toBeTruthy();
    await invest.unmount();
    const checking = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: account({ kind: 'checking' }) }} onClose={jest.fn()} />);
    expect(checking.queryByLabelText('Interest a year (APY)')).toBeNull();
  });

  it('a rate-only change uses the rate write with one Undo (accountRateSaved)', async () => {
    const onClose = jest.fn();
    const { getByLabelText, getByText } = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: account() }} onClose={onClose} />);
    await fireEvent.changeText(getByLabelText('Interest a year (APY)'), '4.5');
    await fireEvent.press(getByText('Save changes'));
    expect(mockSetRate).toHaveBeenCalledTimes(1);
    expect(mockSetRate).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc1' }), '4.5', 'u1');
    expect(mockEdit).not.toHaveBeenCalled();
    expect(getToast()).toMatchObject({ stepId: 'rate-step', text: { key: 'undo.label.accountRateSaved' } });
    expect(onClose).toHaveBeenCalled();
  });

  it('a rate change with other changes goes in one account edit patch', async () => {
    const { getByLabelText, getByText } = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: account() }} onClose={jest.fn()} />);
    await fireEvent.changeText(getByLabelText('Name'), 'Rainy day pot');
    await fireEvent.changeText(getByLabelText('Interest a year (APY)'), '4.5');
    await fireEvent.press(getByText('Save changes'));
    expect(mockSetRate).not.toHaveBeenCalled();
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [vars] = mockEdit.mock.calls[0] as unknown as [{ patch: Record<string, unknown> }];
    expect(vars.patch).toEqual({ name: 'Rainy day pot', interest_rate: '4.5' });
    expect(getToast()).toMatchObject({ text: { key: 'undo.label.accountEdited' } });
  });

  it('text like 4.5% shows the helper and blocks save', async () => {
    const { getByLabelText, getByText, getByTestId } = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: account() }} onClose={jest.fn()} />);
    await fireEvent.changeText(getByLabelText('Interest a year (APY)'), '4.5%');
    expect(getByTestId('account-rate-error')).toBeTruthy();
    await fireEvent.press(getByText('Save changes'));
    expect(mockSetRate).not.toHaveBeenCalled();
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it('P5-WR-03 a comma decimal (4,5) is accepted and stored as 4.5', async () => {
    const { getByLabelText, getByText, queryByTestId } = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: account() }} onClose={jest.fn()} />);
    await fireEvent.changeText(getByLabelText('Interest a year (APY)'), '4,5');
    expect(queryByTestId('account-rate-error')).toBeNull();
    await fireEvent.press(getByText('Save changes'));
    expect(mockSetRate).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc1' }), '4.5', 'u1');
  });

  it('clearing the field clears the rate', async () => {
    const { getByLabelText, getByText } = await wrap(<AccountSheet visible mode={{ kind: 'edit', account: account({ interest_rate: '4.5' }) }} onClose={jest.fn()} />);
    await fireEvent.changeText(getByLabelText('Interest a year (APY)'), '');
    await fireEvent.press(getByText('Save changes'));
    expect(mockSetRate).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc1' }), null, 'u1');
  });
});

describe('APY on the account detail rows', () => {
  const view = { balance: 250000, otherCurrencies: [], overflow: false, pendingSum: 0, standing: null };

  it('shows the rate and opens the growth calculator with the balance, rate and monthly 0', async () => {
    const { getByText, getByTestId } = await wrap(
      <AccountDetailRows account={account({ interest_rate: '4.5' })} balance={view} split={undefined} horizonMonth={null} />
    );
    expect(getByText('4.5% a year')).toBeTruthy();
    await fireEvent.press(getByTestId('account-growth-row'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/grow/calculators/growth',
      params: { start: '250000', rate: '4.5', monthly: '0' },
    });
  });

  it('P5-WR-04 a foreign-currency balance is converted to home currency before it prefills the start', async () => {
    mockRates = [{ quote: 'GBP', rate: '0.8', rate_date: '2026-10-05', source: 'ecb' }];
    const { getByTestId } = await wrap(
      <AccountDetailRows account={account({ interest_rate: '4.5', currency: 'EUR' })} balance={view} split={undefined} horizonMonth={null} />
    );
    await fireEvent.press(getByTestId('account-growth-row'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/grow/calculators/growth', params: { start: '200000', rate: '4.5', monthly: '0' } });
  });

  it('P5-WR-04 with no stored rate for a foreign account, the start is not prefilled', async () => {
    const { getByTestId } = await wrap(
      <AccountDetailRows account={account({ interest_rate: '4.5', currency: 'EUR' })} balance={view} split={undefined} horizonMonth={null} />
    );
    await fireEvent.press(getByTestId('account-growth-row'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/grow/calculators/growth', params: { rate: '4.5', monthly: '0' } });
  });

  it('hides both rows when the account has no rate', async () => {
    const { queryByText, queryByTestId } = await wrap(<AccountDetailRows account={account()} balance={view} split={undefined} horizonMonth={null} />);
    expect(queryByText(/a year/)).toBeNull();
    expect(queryByTestId('account-growth-row')).toBeNull();
  });
});
