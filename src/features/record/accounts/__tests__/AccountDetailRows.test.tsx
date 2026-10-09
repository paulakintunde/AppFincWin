import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors } from '@/theme/tokens';
import { ACCENTS, DEFAULT_ACCENT } from '@/theme/accents';

import type { AccountRow } from '@/db/rows';
import type { AccountBalanceView } from '@/data/queries/activity';
import { AccountDetailRows } from '../AccountDetailRows';

const ACCENT = ACCENTS[DEFAULT_ACCENT];

jest.setTimeout(30000);

let mockHome = 'GBP';

jest.mock('@/data/queries/fxLatest', () => ({
  useFxLatest: () => ({
    data: [{ quote: 'GBP', rate: '0.85000000', rate_date: '2026-10-01', source: 'frankfurter-v2' }],
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
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: mockHome,
    showCents: true,
    region: 'GB',
    timeZone: 'Europe/London',
    today: '2026-10-06',
  }),
}));

function account(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc1', deleted_at: null, is_sample: false, household_id: 'h1', created_by: null, name: 'Current',
    kind: 'checking', currency: 'GBP', opening_balance: 10000, archived_at: null, updated_by: null,
    overdraft_limit: null, credit_limit: null, version: 1, created_at: '', updated_at: '', ...over,
  };
}
const view = (balance: number): AccountBalanceView => ({
  balance, otherCurrencies: [], overflow: false, pendingSum: 0, standing: null,
});

function wrap(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

beforeEach(() => {
  mockHome = 'GBP';
});

describe('AccountDetailRows (ACT-17)', () => {
  it('shows the split, the after-pending balance and the line count', async () => {
    const { getByText } = await wrap(
      <AccountDetailRows
        account={account()}
        balance={view(10000)}
        split={{ pendingIn: '2500', pendingOut: '-4000', pendingCount: 3 }}
        horizonMonth="2026-11"
      />
    );
    expect(getByText('GBP · home')).toBeTruthy();
    expect(getByText('£25.00').props.style.color).toBe(ACCENT);
    expect(getByText('£40.00').props.style.color).toBe(colors.danger);
    expect(getByText('After pending through November')).toBeTruthy();
    expect(getByText('£85.00').props.style.color).toBe(ACCENT);
    expect(getByText('£100.00')).toBeTruthy();
    expect(getByText('3 lines')).toBeTruthy();
  });

  it('shows dashes and None with nothing pending', async () => {
    const { getAllByText, getByText } = await wrap(
      <AccountDetailRows account={account()} balance={view(10000)} split={undefined} horizonMonth={null} />
    );
    expect(getAllByText('—')).toHaveLength(2);
    expect(getByText('None')).toBeTruthy();
    expect(getByText('After pending through November')).toBeTruthy();
  });

  it('paints a negative after-pending balance danger', async () => {
    const { getByText } = await wrap(
      <AccountDetailRows
        account={account()}
        balance={view(1000)}
        split={{ pendingIn: '0', pendingOut: '-4000', pendingCount: 1 }}
        horizonMonth="2026-12"
      />
    );
    expect(getByText('After pending through December')).toBeTruthy();
    expect(getByText('−£30.00').props.style.color).toBe(colors.danger);
    expect(getByText('1 line')).toBeTruthy();
  });

  it('shows the home figure for a foreign-currency account', async () => {
    mockHome = 'GBP';
    const { getByText } = await wrap(
      <AccountDetailRows account={account({ currency: 'EUR' })} balance={view(10000)} split={undefined} horizonMonth={null} />
    );
    expect(getByText(/^EUR · £.* in GBP$/)).toBeTruthy();
  });
});
