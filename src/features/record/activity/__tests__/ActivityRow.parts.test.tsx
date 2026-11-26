// 10.1-20 (D-03, D-05): a split line is one Activity row with a "N categories" tag, shows a single part under a category filter,
// and carries the amber "Parts need placing" badge when its parts do not add up.
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

const parts = [
  { categoryId: 'dining', amount: -2500 },
  { categoryId: 'groc', amount: -1500 },
  { categoryId: 'misc', amount: -1000 },
];

function row(over: Partial<ActivityRowView> = {}): ActivityRowView {
  return {
    id: 'r1',
    account_id: 'a1',
    original_amount: -5000,
    original_currency: 'USD',
    local_date: '2026-09-20',
    name: 'Lunch at Pret',
    category_id: 'dining',
    status: 'paid',
    transfer_id: null,
    amountHome: -5000,
    overdue: false,
    pending: false,
    counterpartAccountId: null,
    parts,
    ...over,
  } as unknown as ActivityRowView;
}

async function renderRow(r: ActivityRowView, extra: Partial<React.ComponentProps<typeof ActivityRow>> = {}) {
  return render(
    <ThemeProvider>
      <ActivityRow
        row={r}
        categories={categories}
        accountName={() => 'Current'}
        formatter={formatter}
        homeCurrency="USD"
        onPress={jest.fn()}
        onMarkPaid={jest.fn()}
        today="2026-09-30"
        splitOn
        {...extra}
      />
    </ThemeProvider>
  );
}

describe('ActivityRow split lines (10.1-20)', () => {
  it('shows the tag, the full amount and an accessible label with the category count', async () => {
    const screen = await renderRow(row());
    expect(screen.getByText('3 categories')).toBeTruthy();
    expect(screen.getByText('-$50.00', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText(/Lunch at Pret, -\$50\.00, 3 categories/)).toBeTruthy();
    expect(screen.queryByText('Parts need placing')).toBeNull();
  });

  it('under a category filter shows that part and the full amount as "Part of"', async () => {
    const screen = await renderRow(row(), { filteredAmount: -2500 });
    expect(screen.getByText('-$25.00', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Part of -$50.00')).toBeTruthy();
    expect(screen.getByText('3 categories')).toBeTruthy();
  });

  it('shows the amber "Parts need placing" badge when the parts fall short of the total', async () => {
    const screen = await renderRow(row({ parts: [parts[0]!, parts[1]!] } as Partial<ActivityRowView>));
    expect(screen.getByText('Parts need placing')).toBeTruthy();
  });

  it('reads like an unsplit row below level 3', async () => {
    const screen = await renderRow(row(), { splitOn: false, filteredAmount: -2500 });
    expect(screen.queryByText('3 categories')).toBeNull();
    expect(screen.queryByText(/Part of/)).toBeNull();
    expect(screen.getByText('-$50.00', { includeHiddenElements: true })).toBeTruthy();
  });

  it('an unsplit line has no tag', async () => {
    const screen = await renderRow(row({ parts: null } as Partial<ActivityRowView>));
    expect(screen.queryByText(/categories/)).toBeNull();
  });
});
