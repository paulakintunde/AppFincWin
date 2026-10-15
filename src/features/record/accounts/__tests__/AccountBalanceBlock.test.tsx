// 02-48: a foreign account with no stored pair rate reads "Waiting for a rate", never a guessed
// figure, and rendering the block never reaches the fetch door (02-DECISION-fx-on-demand.md item 5).
import React from 'react';
import { render, renderHook } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { AccountRow } from '@/db/rows';
import type { AccountBalanceView } from '@/data/queries/activity';
import { AccountBalanceBlock, useCompactBalance } from '../AccountBalanceBlock';

let mockRates: Array<{ quote: string; rate: string; rate_date: string; source: string }> = [];
const mockInvoke = jest.fn();
const mockFetchDoor = jest.fn();

jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: mockRates }) }));
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
    homeCurrency: 'USD',
    showCents: true,
    region: 'US',
    timeZone: 'UTC',
    today: '2026-10-06',
  }),
}));
jest.mock('@/db/fxResolve', () => ({
  requestRateResolution: (...a: unknown[]) => mockFetchDoor(...a),
  requestRateResolutionBatch: (...a: unknown[]) => mockFetchDoor(...a),
  requestRatesForDate: (...a: unknown[]) => mockFetchDoor(...a),
  fetchRatePendingRows: (...a: unknown[]) => mockFetchDoor(...a),
}));
// Any supabase client a render path could reach: functions.invoke must stay untouched.
jest.mock('@supabase/supabase-js', () => ({
  ...jest.requireActual('@supabase/supabase-js'),
  createClient: () => ({ functions: { invoke: (...a: unknown[]) => mockInvoke(...a) } }),
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
function view(over: Partial<AccountBalanceView> = {}): AccountBalanceView {
  return { balance: 10000, otherCurrencies: [], overflow: false, pendingSum: 0, standing: null, ...over };
}
const rate = (quote: string, r: string) => ({ quote, rate: r, rate_date: '2026-10-01', source: 'frankfurter-v2' });
const wrap = (node: React.ReactElement) => render(<ThemeProvider>{node}</ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockRates = [];
});

describe('AccountBalanceBlock waiting for a rate', () => {
  it('shows the approximate home figure when both legs are stored', async () => {
    mockRates = [rate('GBP', '0.85000000'), rate('USD', '1.10000000')];
    const { getByText, queryByText } = await wrap(
      <AccountBalanceBlock account={account()} balance={view()} homeCurrency="USD" />
    );
    expect(getByText(/^≈ \$/)).toBeTruthy();
    expect(queryByText('Waiting for a rate')).toBeNull();
  });

  it.each([
    ['empty table', []],
    ['GBP leg missing', [rate('USD', '1.10000000')]],
    ['USD leg missing', [rate('GBP', '0.85000000')]],
  ])('shows Waiting for a rate and no guessed figure with %s', async (_n, rates) => {
    mockRates = rates as typeof mockRates;
    const { getByText, queryByText } = await wrap(
      <AccountBalanceBlock account={account()} balance={view()} homeCurrency="USD" />
    );
    expect(getByText('Waiting for a rate')).toBeTruthy();
    expect(queryByText(/≈/)).toBeNull();
    expect(getByText('£100.00')).toBeTruthy();
  });

  it('shows nothing extra for a home-currency account', async () => {
    const { queryByText } = await wrap(
      <AccountBalanceBlock account={account({ currency: 'USD' })} balance={view()} homeCurrency="USD" />
    );
    expect(queryByText('Waiting for a rate')).toBeNull();
    expect(queryByText(/≈/)).toBeNull();
  });

  it('shows the waiting line on the compact list card too', async () => {
    const { getByText } = await wrap(
      <AccountBalanceBlock account={account()} balance={view()} homeCurrency="USD" compact />
    );
    expect(getByText('Waiting for a rate')).toBeTruthy();
  });

  it('never calls the fetch door or functions.invoke while rendering', async () => {
    await wrap(<AccountBalanceBlock account={account()} balance={view()} homeCurrency="USD" />);
    expect(mockFetchDoor).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('D-39 compact block', () => {
  const usd = () => account({ currency: 'USD', name: 'Main' });
  it('foreign overdrawn: figure plus one home line, no sentence or attribution', async () => {
    mockRates = [rate('GBP', '0.85000000'), rate('USD', '1.10000000')];
    const { getByText, queryByText, toJSON } = await wrap(
      <AccountBalanceBlock account={account({ currency: 'USD' })} balance={view({ balance: -74000 })} homeCurrency="GBP" compact />
    );
    expect(getByText('−$740.00')).toBeTruthy();
    expect(getByText(/^≈ −?£/)).toBeTruthy();
    expect(queryByText(/Overdrawn by/)).toBeNull();
    expect(JSON.stringify(toJSON())).not.toMatch(/Frankfurter|Rate from|rate from/i);
  });
  it('domestic overdrawn-within: figure plus Overdrawn, no sentence', async () => {
    const { getByText, queryByText } = await wrap(
      <AccountBalanceBlock
        account={account()}
        balance={view({ balance: -2500, standing: { kind: 'overdrawn-within', overdrawnBy: 2500, limit: 50000 } as never })}
        homeCurrency="GBP"
        compact
      />
    );
    expect(getByText('Overdrawn')).toBeTruthy();
    expect(queryByText(/within a/)).toBeNull();
  });
  it('non-compact keeps Balance now and the home line', async () => {
    mockRates = [rate('GBP', '0.85000000'), rate('USD', '1.10000000')];
    const { getByText } = await wrap(
      <AccountBalanceBlock account={account({ currency: 'USD' })} balance={view({ balance: -74000 })} homeCurrency="GBP" />
    );
    expect(getByText('Balance now')).toBeTruthy();
    expect(getByText(/^≈ −?£/)).toBeTruthy();
  });
  it('useCompactBalance label', async () => {
    mockRates = [rate('GBP', '0.85000000'), rate('USD', '1.10000000')];
    const { result } = await renderHook(() => useCompactBalance(usd(), view({ balance: -74000 }), 'GBP'), {
      wrapper: ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.label).toMatch(/^−\$740\.00, ≈ −?£/);
    expect(result.current.negative).toBe(true);
  });
});
