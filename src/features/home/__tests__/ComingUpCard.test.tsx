import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors as base } from '@/theme/tokens';
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { ComingUpItem } from '../comingUp';
import { ComingUpCard } from '../ComingUpCard';

jest.setTimeout(30000);

const formatter: MoneyFormatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number; currency: string }) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currency }).format(m.amount / 100),
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

const categories = {
  all: [],
  active: [],
  byId: new Map(),
  builtinIds: new Map(),
  transferCategoryId: null,
  loading: false,
} as unknown as CategoryLookup;

function row(over: Partial<ActivityRowView> = {}): ActivityRowView {
  return {
    id: 'r1',
    name: 'Rent',
    category_id: null,
    original_amount: -90000,
    original_currency: 'GBP',
    amountHome: -90000,
    overdue: false,
    is_automatic: false,
    local_date: '2026-09-28',
    status: 'pending',
    transfer_id: null,
    counterpartAccountId: null,
    ...over,
  } as unknown as ActivityRowView;
}
const proj: ProjectionView = {
  key: 'p1',
  seriesId: 's1',
  date: '2026-09-29',
  name: 'Gym',
  amount: -3000,
  currency: 'GBP',
  categoryId: null,
  accountId: 'a1',
  amountHome: -3000,
};

const items: ComingUpItem[] = [
  { kind: 'row', row: row({ id: 'r0', name: 'Electric', overdue: true, local_date: '2026-09-02' }), date: '2026-09-02' },
  { kind: 'row', row: row(), date: '2026-09-28' },
  { kind: 'projection', projection: proj, date: '2026-09-29' },
];

const handlers = () => ({
  onPay: jest.fn(),
  onOpenRow: jest.fn(),
  onOpenProjection: jest.fn(),
  onSeeAll: jest.fn(),
});

async function draw(over: Partial<React.ComponentProps<typeof ComingUpCard>> = {}) {
  const h = handlers();
  const utils = await render(
    <ThemeProvider>
      <ComingUpCard
        items={items}
        total={items.length}
        month="2026-09"
        formatter={formatter}
        homeCurrency="GBP"
        categories={categories}
        loading={false}
        {...h}
        {...over}
      />
    </ThemeProvider>
  );
  return { ...utils, h };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ComingUpCard', () => {
  it('renders the rows in order with overdue flagged in danger', async () => {
    const { getByLabelText, getByText } = await draw();
    expect(getByLabelText(/^Electric, .*, overdue, was due 2026-09-02$/)).toBeTruthy();
    expect(getByLabelText(/^Rent, .*, due 2026-09-28$/)).toBeTruthy();
    expect(getByLabelText(/^Gym, .*, due 2026-09-29$/)).toBeTruthy();
    const overdue = getByText('Overdue');
    expect(StyleSheet.flatten(overdue.props.style).color).toBe(base.danger);
  });

  it('offers Pay on recorded rows only', async () => {
    const { getByLabelText, queryByLabelText, h } = await draw();
    await fireEvent.press(getByLabelText('Pay Rent, mark as paid'));
    expect(h.onPay).toHaveBeenCalledTimes(1);
    expect((h.onPay.mock.calls[0] as [ActivityRowView])[0].id).toBe('r1');
    expect(queryByLabelText('Pay Gym, mark as paid')).toBeNull();
  });

  it('opens a row or a projection from the row body', async () => {
    const { getByLabelText, h } = await draw();
    await fireEvent.press(getByLabelText(/^Rent,/));
    expect(h.onOpenRow).toHaveBeenCalledTimes(1);
    await fireEvent.press(getByLabelText(/^Gym,/));
    expect(h.onOpenProjection).toHaveBeenCalledWith(proj);
  });

  it('shows the native amount and Waiting for a rate when unconverted', async () => {
    const usd = row({ id: 'u1', name: 'Hosting', original_amount: -1500, original_currency: 'USD', amountHome: null });
    const { getByText } = await draw({
      items: [{ kind: 'row', row: usd, date: '2026-09-10' }],
      total: 1,
    });
    expect(getByText(/Waiting for a rate/)).toBeTruthy();
    expect(getByText(/\$15\.00/)).toBeTruthy();
  });

  it('shows the empty line with the 3-letter month and no See all', async () => {
    const { getByText, queryByText } = await draw({ items: [], total: 0 });
    expect(getByText('Coming up')).toBeTruthy();
    expect(getByText('Nothing outstanding in Sep.')).toBeTruthy();
    expect(queryByText('See all')).toBeNull();
  });

  it('See all calls onSeeAll', async () => {
    const { getByText, h } = await draw({ total: 9 });
    await fireEvent.press(getByText('See all'));
    expect(h.onSeeAll).toHaveBeenCalledTimes(1);
  });
});
