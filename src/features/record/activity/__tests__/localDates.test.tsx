import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { formatLocalDate } from '@/engine/money/formatDate';
import type { TransactionRow } from '@/db/rows';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { IncomeTagSheet } from '../IncomeTagSheet';
import { RefundPickerSheet } from '../RefundPickerSheet';

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('@/data/mutations/incomeTags', () => ({ useTagIncome: () => ({ tag: jest.fn() }) }));
jest.mock('@/data/mutations/refundLinks', () => ({
  useLinkRefund: () => ({ link: jest.fn() }),
  useUnlinkRefund: () => ({ unlink: jest.fn() }),
}));
jest.mock('@/db/transactions', () => ({
  fetchTransactionsSearch: jest.fn().mockResolvedValue([]),
  fetchTransactionsInRange: jest.fn().mockResolvedValue([
    {
      id: 'p1', name: 'Shop', note: null, original_amount: -10000, original_currency: 'GBP', local_date: '2026-09-01',
      transfer_id: null, deleted_at: null, is_refund: false, refund_of: null, recurring_series_id: null, category_id: null, version: 1,
    },
  ]),
  fetchLinkedRefunds: jest.fn().mockResolvedValue([]),
  fetchTransactionsByIds: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/db/decideLinks', () => ({ fetchWrittenRowLinks: jest.fn().mockResolvedValue([]) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ byId: new Map() }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ ready: true, userId: 'u1', householdId: 'h1', today: '2026-10-28' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.setTimeout(20000);

const ISO = /\d{4}-\d{2}-\d{2}/;

// A formatter whose dates come from the real engine formatter, so the style the
// component asks for is what decides the output.
const formatterFor = (locale: string) =>
  ({
    locale,
    formatMoney: (m: { amount: number }) => `£${(Math.abs(m.amount) / 100).toFixed(2)}`,
    formatDate: (d: string, style?: 'short' | 'medium' | 'long') => formatLocalDate(d, locale, style),
  }) as unknown as MoneyFormatter;

const income = {
  id: 't1', name: 'Acme Ltd', original_amount: 250000, original_currency: 'GBP', local_date: '2026-10-28',
  transfer_id: null, deleted_at: null, is_refund: false, income_kind: null, counts_as: null, recurring_series_id: null, version: 1,
} as unknown as TransactionRow;

const refund = {
  ...income, id: 'ref', name: 'Shop', original_amount: 4000, is_refund: true, refund_of: null, category_id: null,
} as unknown as TransactionRow;

const wrap = async (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>{ui}</ThemeProvider>
    </QueryClientProvider>
  );
};

describe.each([
  ['en-CA', 'Oct 28, 2026'],
  ['en-GB', '28 Oct 2026'],
])('dates on income and refund surfaces under %s', (locale, expected) => {
  it('income tag sheet subline is medium style, never ISO', async () => {
    const screen = await wrap(<IncomeTagSheet visible tx={income} newPayer formatter={formatterFor(locale)} onClose={jest.fn()} />);
    expect(screen.getByText(new RegExp(expected))).toBeTruthy();
    expect(screen.queryByText(ISO)).toBeNull();
  });

  it('refund picker rows are medium style, never ISO', async () => {
    const screen = await wrap(
      <RefundPickerSheet visible direction="refund->purchase" anchor={refund} formatter={formatterFor(locale)} onClose={jest.fn()} />
    );
    expect(await screen.findByText(new RegExp(expected))).toBeTruthy();
    expect(screen.queryByText(ISO)).toBeNull();
  });
});
