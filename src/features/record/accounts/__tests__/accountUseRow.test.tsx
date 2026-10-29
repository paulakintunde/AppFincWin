import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { AccountRow } from '@/db/rows';
import { AccountSheet } from '../AccountSheet';

jest.setTimeout(30000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let mockV3 = false;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('@/data/mutations/accounts', () => ({ useAddAccount: () => ({ add: jest.fn() }), useEditAccount: () => ({ edit: jest.fn() }) }));
jest.mock('@/data/mutations/accountUse', () => ({ useSaveAccountUse: () => ({ save: jest.fn() }) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: new Map([['acc1', { balance: 5000, overflow: false }]]), isLoading: false }),
}));
jest.mock('@/data/queries/decide', () => ({
  usePots: () => ({ data: { plain: [], live: [], wait: [], done: [] } }),
  useDecideSettings: () => ({ data: null }),
}));
jest.mock('@/data/queries/currencyOptions', () => ({ useCurrencyOptions: () => ({ options: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'GBP', region: 'GB', today: '2026-10-15', ready: true }),
}));

const account = (kind: AccountRow['kind'], over: Partial<AccountRow> = {}): AccountRow =>
  ({
    id: 'acc1',
    household_id: 'h1',
    name: 'Main',
    kind,
    currency: 'GBP',
    opening_balance: 0,
    archived_at: null,
    overdraft_limit: null,
    credit_limit: null,
    deleted_at: null,
    version: 1,
    ...over,
  }) as AccountRow;

const show = (a: AccountRow) =>
  render(
    <ThemeProvider>
      <AccountSheet visible mode={{ kind: 'edit', account: a }} onClose={jest.fn()} />
    </ThemeProvider>
  );

describe('account edit: What this account is for', () => {
  beforeEach(() => {
    mockV3 = false;
  });

  it('renders nothing when the flag is false', async () => {
    await show(account('checking'));
    expect(screen.queryByText('What this account is for')).toBeNull();
    expect(screen.queryByText('Decide uses this to work out your unspent money.')).toBeNull();
  });

  it('shows the row, with Not set, when the flag is on', async () => {
    mockV3 = true;
    await show(account('checking'));
    expect(screen.getByText('What this account is for')).toBeTruthy();
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.getByText('Decide uses this to work out your unspent money.')).toBeTruthy();
  });

  it('shows the stored answer', async () => {
    mockV3 = true;
    await show(account('savings', { use: 'untouched' }));
    expect(screen.getByText('Savings I don’t touch')).toBeTruthy();
  });

  it('is hidden for a credit card and a loan even with the flag on', async () => {
    mockV3 = true;
    await show(account('credit'));
    expect(screen.queryByText('What this account is for')).toBeNull();
    await screen.unmount();
    await show(account('loan'));
    expect(screen.queryByText('What this account is for')).toBeNull();
  });

  it('is hidden on a new account', async () => {
    mockV3 = true;
    await render(
      <ThemeProvider>
        <AccountSheet visible mode={{ kind: 'new', context: 'later' }} onClose={jest.fn()} />
      </ThemeProvider>
    );
    expect(screen.queryByText('What this account is for')).toBeNull();
  });
});
