import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { AccountRow } from '@/db/rows';
import type { AccountBalanceView } from '@/data/queries/activity';
import { AccountsCard } from '../AccountsCard';

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/currencyOptions', () => ({
  useCurrencyOptions: () => ({
    options: [
      { code: 'GBP', name: 'Pound', symbol: '£', exponent: 2, kind: 'iso', rateDate: null },
      { code: 'USD', name: 'Dollar', symbol: '$', exponent: 2, kind: 'iso', rateDate: null },
    ],
    loading: false,
  }),
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
    today: '2026-09-10',
  }),
}));

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
    version: 1,
    created_at: '',
    updated_at: '',
    ...over,
  };
}
const view = (over: Partial<AccountBalanceView> = {}): AccountBalanceView => ({
  balance: 10000,
  otherCurrencies: [],
  overflow: false,
  pendingSum: 0,
  standing: null,
  ...over,
});

async function draw(accounts: AccountRow[], loading = false) {
  const balances = new Map(accounts.map((a) => [a.id, view()]));
  return render(
    <ThemeProvider>
      <AccountsCard accounts={accounts} balances={balances} homeCurrency="GBP" loading={loading} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AccountsCard', () => {
  it('lists the given accounts as buttons that open their detail', async () => {
    const { getByText, getAllByRole } = await draw([
      account({ id: 'a1', name: 'Current' }),
      account({ id: 'a2', name: 'Cash', kind: 'cash' }),
    ]);
    expect(getByText('Accounts')).toBeTruthy();
    const buttons = getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.props.accessibilityLabel).toMatch(/^Current, Current account, /);
    await fireEvent.press(buttons[1] as (typeof buttons)[number]);
    expect(mockPush).toHaveBeenCalledWith('/accounts/a2');
  });

  it('shows Waiting for a rate for a foreign account without a rate', async () => {
    const { getByText } = await draw([account({ id: 'u', name: 'Dollars', currency: 'USD' })]);
    expect(getByText('Waiting for a rate')).toBeTruthy();
  });

  it('caps at 6 and offers See all accounts', async () => {
    const many = Array.from({ length: 7 }, (_, i) => account({ id: `a${i}`, name: `Acc ${i}` }));
    const { getAllByRole, getByText, queryByText } = await draw(many);
    expect(getAllByRole('button')).toHaveLength(7); // 6 rows + See all
    expect(queryByText('Acc 6')).toBeNull();
    await fireEvent.press(getByText('See all accounts'));
    expect(mockPush).toHaveBeenCalledWith('/accounts');
  });

  it('is absent with no accounts', async () => {
    const { toJSON } = await draw([]);
    expect(toJSON()).toBeNull();
  });

  it('shows busy placeholders while loading', async () => {
    const { getByLabelText, queryAllByRole } = await draw([], true);
    expect(getByLabelText('Loading overview').props.accessibilityState).toEqual({ busy: true });
    expect(queryAllByRole('button')).toHaveLength(0);
  });
});
