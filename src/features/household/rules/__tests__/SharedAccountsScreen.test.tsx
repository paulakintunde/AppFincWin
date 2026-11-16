import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { AccountRow } from '@/db/rows';
import { SharedAccountsScreen, jointAccountsOf } from '../SharedAccountsScreen';
import { jointBalanceOf } from '../jointAccounts';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));
jest.mock('@/shell/header/BackButton', () => ({ BackButton: () => null }));
jest.mock('@/features/record/accounts/AccountSheet', () => ({ AccountSheet: () => null }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ showCents: true, homeCurrency: 'GBP', region: 'GB' }) }));
jest.mock('../../useHouseholdScope', () => ({ useHouseholdScope: () => ({ householdId: 'h' }) }));
jest.mock('../../useMemberLabel', () => ({ useMemberLabel: () => (id: string | null) => (id === 'u2' ? 'Sam' : 'You') }));

let mockAccounts: Partial<AccountRow>[] = [];
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));

let mockBalances: { data?: unknown; isError: boolean } = { data: [], isError: false };
jest.mock('../jointAccounts', () => {
  const actual = jest.requireActual('../jointAccounts');
  return { ...actual, useJointAccountBalances: () => mockBalances };
});

function acct(over: Partial<AccountRow>): Partial<AccountRow> {
  return { id: 'a1', name: 'Bills', kind: 'checking', currency: 'GBP', opening_balance: 10000, created_by: 'u2', is_shared: true, tombstone_of: null, deleted_at: null, ...over };
}

async function setup() {
  await render(
    <ThemeProvider>
      <SharedAccountsScreen />
    </ThemeProvider>,
  );
}

describe('jointAccountsOf', () => {
  it('keeps shared live accounts and drops tombstone homes, personal and deleted accounts', () => {
    const list = jointAccountsOf([
      acct({ id: 'a1' }),
      acct({ id: 'a2', tombstone_of: 'u9' }),
      acct({ id: 'a3', is_shared: false }),
      acct({ id: 'a4', deleted_at: '2026-11-01T00:00:00Z' }),
    ] as AccountRow[]);
    expect(list.map((a) => a.id)).toEqual(['a1']);
  });
});

describe('jointBalanceOf', () => {
  it('adds the opening balance to paid lines in the account currency only', () => {
    const rows = [
      { account_id: 'a1', balance: -2500, currency: 'GBP' },
      { account_id: 'a1', balance: 900, currency: 'EUR' },
      { account_id: 'a2', balance: -100, currency: 'GBP' },
    ];
    expect(jointBalanceOf(10000, 'GBP', rows, 'a1')).toBe(7500);
  });
});

describe('SharedAccountsScreen', () => {
  beforeEach(() => {
    mockAccounts = [];
    mockBalances = { data: [], isError: false };
  });

  it('shows the empty state with its one button', async () => {
    await setup();
    expect(screen.getByText('No shared accounts')).toBeTruthy();
    expect(screen.getByText('Make a joint account')).toBeTruthy();
  });

  it('lists joint accounts with the full balance, who made them, and never a tombstone home', async () => {
    mockAccounts = [acct({ id: 'a1' }), acct({ id: 'a2', name: 'Former home', tombstone_of: 'u9' })];
    mockBalances = { data: [{ account_id: 'a1', balance: -2500, currency: 'GBP' }], isError: false };
    await setup();
    expect(screen.getByText('Bills')).toBeTruthy();
    expect(screen.getByText('Made by Sam')).toBeTruthy();
    expect(screen.getByTestId('shared-badge-a1')).toBeTruthy();
    expect(screen.queryByText('Former home')).toBeNull();
    expect(screen.getByText(/75\.00/)).toBeTruthy();
  });

  it('says so when the balances could not be loaded', async () => {
    mockAccounts = [acct({ id: 'a1' })];
    mockBalances = { data: undefined, isError: true };
    await setup();
    expect(screen.getByTestId('shared-balances-failed')).toBeTruthy();
  });
});
