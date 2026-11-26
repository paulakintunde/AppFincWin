// 10.1-23 (D-09): a row whose receipt is still on the phone shows the savedOffline glyph and "Receipt waiting to upload" under
// the name, and its spoken label ends with ", receipt waiting to upload".
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ActivityRowView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ActivityRow } from '../ActivityRow';

jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn() }));

const categories = { all: [], active: [], byId: new Map(), transferCategoryId: 'tc', loading: false } as unknown as CategoryLookup;
const formatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number }) => `${m.amount < 0 ? '-' : ''}$${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

function row(over: Partial<ActivityRowView> = {}): ActivityRowView {
  return {
    id: 'r1',
    account_id: 'a1',
    original_amount: -5000,
    original_currency: 'USD',
    local_date: '2026-09-20',
    name: 'Lunch at Pret',
    category_id: null,
    status: 'paid',
    transfer_id: null,
    amountHome: -5000,
    overdue: false,
    pending: false,
    counterpartAccountId: null,
    ...over,
  } as unknown as ActivityRowView;
}

async function renderRow(extra: Partial<React.ComponentProps<typeof ActivityRow>> = {}) {
  return render(
    <ThemeProvider>
      <ActivityRow
        row={row()}
        categories={categories}
        accountName={() => 'Current'}
        formatter={formatter}
        homeCurrency="USD"
        onPress={jest.fn()}
        onMarkPaid={jest.fn()}
        today="2026-09-30"
        {...extra}
      />
    </ThemeProvider>
  );
}

describe('ActivityRow receipt waiting (10.1-23)', () => {
  it('shows the glyph and the words under the name, and says so last', async () => {
    const screen = await renderRow({ receiptWaiting: true });
    expect(screen.getByTestId('activity-receipt-waiting-r1', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('glyph-savedOffline', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Receipt waiting to upload', { includeHiddenElements: true })).toBeTruthy();
    const label = screen.getByTestId('activity-row-r1').props.accessibilityLabel as string;
    expect(label.endsWith(', receipt waiting to upload')).toBe(true);
  });

  it('shows nothing when no receipt is waiting', async () => {
    const screen = await renderRow();
    expect(screen.queryByTestId('activity-receipt-waiting-r1', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('activity-row-r1').props.accessibilityLabel).not.toMatch(/receipt/);
  });
});
