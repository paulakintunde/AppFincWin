// SYN-02: proves the dev-only sync probe row queues a real foreign-currency transaction
// through the write-queue hooks -- creating the 'Sync test' account first only when one
// doesn't already exist, and always reusing it (never duplicating it) otherwise.
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DevSyncProbe } from '../components/DevSyncProbe';

const mockUser = { id: 'user-1' };
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: 'household-1' }),
}));

jest.mock('@/data/queries/moneyPrefs', () => ({
  useMoneyPrefs: () => ({
    prefs: { home_currency: 'USD', show_cents: false, lead_figure: 'home', region: null },
    loading: false,
  }),
}));

let mockAccountsData: { id: string; name: string }[] = [];
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({ data: mockAccountsData }),
}));

const mockAddAccount = jest.fn().mockReturnValue('new-account-id');
jest.mock('@/data/mutations/accounts', () => ({
  useAddAccount: () => ({ add: (...args: unknown[]) => mockAddAccount(...args) }),
}));

const mockAddTransaction = jest.fn();
jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: (...args: unknown[]) => mockAddTransaction(...args) }),
}));

async function renderProbe() {
  return render(
    <ThemeProvider>
      <DevSyncProbe />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAddAccount.mockReturnValue('new-account-id');
  mockAccountsData = [];
});

describe('DevSyncProbe', () => {
  it('renders the dev-only label', async () => {
    const { getByText } = await renderProbe();
    expect(getByText('Queue a test entry (dev)')).toBeTruthy();
  });

  it('creates the Sync test account and queues a transaction when no probe account exists', async () => {
    const { getByText } = await renderProbe();

    fireEvent.press(getByText('Queue a test entry (dev)'));

    expect(mockAddAccount).toHaveBeenCalledTimes(1);
    expect(mockAddAccount).toHaveBeenCalledWith({
      household_id: 'household-1',
      name: 'Sync test',
      kind: 'cash',
      currency: 'USD',
      opening_balance: 0,
    });

    expect(mockAddTransaction).toHaveBeenCalledTimes(1);
    expect(mockAddTransaction).toHaveBeenCalledWith({
      householdId: 'household-1',
      accountId: 'new-account-id',
      amount: -1000,
      currency: 'EUR',
      homeCurrency: 'USD',
      userId: 'user-1',
      note: 'sync probe',
    });
  });

  it('reuses the existing Sync test account and only queues the transaction when one already exists', async () => {
    mockAccountsData = [{ id: 'existing-account-id', name: 'Sync test' }];
    const { getByText } = await renderProbe();

    fireEvent.press(getByText('Queue a test entry (dev)'));

    expect(mockAddAccount).not.toHaveBeenCalled();
    expect(mockAddTransaction).toHaveBeenCalledTimes(1);
    expect(mockAddTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'existing-account-id' })
    );
  });
});
