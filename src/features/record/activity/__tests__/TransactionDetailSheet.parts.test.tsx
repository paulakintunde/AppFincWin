// 10.1-20 (D-03, D-05): the detail sheet's Categories row expands into the parts view; a gap shows the info card with "Place it";
// Edit split and Place it open the split sheet (the latter with the gap highlighted).
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ActivityRowView } from '@/data/queries/activity';
import { TransactionDetailSheet } from '../TransactionDetailSheet';

jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => ({ status: 'active', writable: true, loading: false }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.setTimeout(30000);
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
let mockSplitOn = true;
jest.mock('@/features/levels/useFeatureAccess', () => ({ useFeatureAccess: () => ({ visible: mockSplitOn }) }));
const mockSplitSheet = jest.fn((_p: unknown) => null);
jest.mock('@/features/record/split/CategorySplitSheet', () => ({ CategorySplitSheet: (p: unknown) => mockSplitSheet(p) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', name: 'Everyday' }] }) }));
jest.mock('@/data/queries/transactions', () => ({ useLinkedFees: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/categories', () => {
  const mk = (id: string, name: string) => ({ id, builtin_key: null, name, color_key: 'teal', is_system: false, archived_at: null });
  const list = [mk('c1', 'Dining'), mk('c2', 'Groceries'), mk('c3', 'Gifts')];
  return {
    useCategoryLookup: () => ({
      all: list,
      active: list,
      byId: new Map<string, unknown>(list.map((c) => [c.id, c])),
      transferCategoryId: null,
      loading: false,
    }),
  };
});
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'USD',
    showCents: true,
    region: 'US',
    timeZone: 'America/New_York',
    today: '2026-09-30',
  }),
}));

const full = [
  { c: 'c1', a: -2500 },
  { c: 'c2', a: -1500 },
  { c: 'c3', a: -1000 },
];

function tx(over: Partial<ActivityRowView> = {}): ActivityRowView {
  return {
    id: 'r1',
    account_id: 'a1',
    original_amount: -5000,
    original_currency: 'USD',
    home_currency: 'USD',
    rate: null,
    rate_date: null,
    rate_source: null,
    rate_pending: false,
    local_date: '2026-09-20',
    name: 'Lunch at Pret',
    category_id: 'c1',
    payment_type: null,
    note: null,
    status: 'paid',
    transfer_id: null,
    recurring_series_id: null,
    is_refund: false,
    is_automatic: false,
    amountHome: -5000,
    overdue: false,
    counterpartAccountId: null,
    version: 3,
    category_parts: full,
    ...over,
  } as unknown as ActivityRowView;
}

async function renderSheet(row: ActivityRowView) {
  return render(
    <ThemeProvider>
      <TransactionDetailSheet row={row} visible today="2026-09-30" onDismiss={jest.fn()} onStatus={jest.fn()} onEdit={jest.fn()} onClone={jest.fn()} onDelete={jest.fn()} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockSplitOn = true;
  mockSplitSheet.mockClear();
});

describe('TransactionDetailSheet split lines (10.1-20)', () => {
  it('shows a Categories row that expands into one row per part with a Total and "Adds up"', async () => {
    const screen = await renderSheet(tx());
    expect(screen.getByText('3 categories')).toBeTruthy();
    expect(screen.queryByTestId('parts-view')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Categories, 3 categories'));
    expect(screen.getByTestId('parts-view')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Total $50.00')).toBeTruthy();
    expect(screen.getByText('Adds up')).toBeTruthy();
    expect(screen.queryByTestId('parts-gap-card')).toBeNull();
  });

  it('Edit split opens the split sheet without the gap highlight', async () => {
    const screen = await renderSheet(tx());
    await fireEvent.press(screen.getByLabelText('Categories, 3 categories'));
    await fireEvent.press(screen.getByLabelText('Edit split'));
    const last = mockSplitSheet.mock.calls.at(-1)?.[0] as { visible: boolean; highlightGap: boolean; month: string; householdId: string };
    expect(last).toMatchObject({ visible: true, highlightGap: false, month: '2026-09', householdId: 'h1' });
  });

  it('a gap shows the info card and Place it opens the sheet with the gap highlighted', async () => {
    const screen = await renderSheet(tx({ category_parts: [full[0]!, full[1]!] } as Partial<ActivityRowView>));
    expect(screen.getByText('The parts add up to $40.00, the total is $50.00. $10.00 left to place.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Place it'));
    const last = mockSplitSheet.mock.calls.at(-1)?.[0] as { visible: boolean; highlightGap: boolean };
    expect(last).toMatchObject({ visible: true, highlightGap: true });
    await fireEvent.press(screen.getByLabelText('Categories, 2 categories'));
    expect(screen.getByText('Uncategorised')).toBeTruthy();
    expect(screen.getAllByText('Parts need placing').length).toBeGreaterThan(0);
  });

  it('shows nothing about splits below level 3', async () => {
    mockSplitOn = false;
    const screen = await renderSheet(tx());
    expect(screen.queryByText('3 categories')).toBeNull();
    expect(screen.queryByTestId('parts-gap-card')).toBeNull();
  });
});
