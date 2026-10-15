import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
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

async function draw(over: Partial<React.ComponentProps<typeof ComingUpCard>> = {}, scale = 1) {
  const h = handlers();
  const utils = await render(
    <ThemeProvider>
      <FontScaleProvider value={scale}>
      <ComingUpCard
        items={items}
        total={items.length}
        month="2026-09"
        formatter={formatter}
        homeCurrency="GBP"
        categories={categories}
        state="ready"
        {...h}
        {...over}
      />
      </FontScaleProvider>
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

  it('shows the empty line with the long month and no See all', async () => {
    const { getByText, queryByText } = await draw({ items: [], total: 0 });
    expect(getByText('Coming up')).toBeTruthy();
    expect(getByText('Nothing outstanding in September.')).toBeTruthy();
    expect(queryByText('See all')).toBeNull();
  });

  it.each([
    ['error', 'Bills due couldn’t load.'],
    ['offline', 'Bills due will show once this month loads.'],
  ] as const)('G4: %s shows its line, not the empty line', async (state, line) => {
    const { getByText, queryByText } = await draw({ items: [], total: 0, state });
    expect(getByText('Coming up')).toBeTruthy();
    expect(getByText(line)).toBeTruthy();
    expect(queryByText(/Nothing outstanding/)).toBeNull();
    expect(queryByText('See all')).toBeNull();
  });

  it('never cuts the month to three letters and upper-cases by locale', async () => {
    const fr = { ...formatter, locale: 'fr-FR' } as MoneyFormatter;
    const { getByText } = await draw({
      formatter: fr,
      items: [{ kind: 'row', row: row({ id: 'j', name: 'Loyer' }), date: '2026-07-14' }],
      total: 1,
    });
    const expected = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' })
      .format(Date.UTC(2026, 6, 1))
      .toLocaleUpperCase('fr-FR');
    expect(expected.length).toBeGreaterThan(3);
    expect(getByText(expected, { hidden: true })).toBeTruthy();
  });

  it('a projected row keeps its amount aligned with a spacer where Pay would be', async () => {
    const { getByTestId } = await draw();
    expect(StyleSheet.flatten(getByTestId('coming-up-pay-spacer').props.style).width).toBe(48);
  });

  it('stacks Pay under the text above 1.3x and drops the spacer', async () => {
    const { getByLabelText, queryByTestId } = await draw({}, 2);
    expect(queryByTestId('coming-up-pay-spacer')).toBeNull();
    expect(StyleSheet.flatten(getByLabelText('Pay Rent, mark as paid').props.style).alignSelf).toBe('flex-end');
    expect(StyleSheet.flatten(getByLabelText(/^Rent,/).props.style).flexBasis).toBe('100%');
  });

  it('keeps the shadow on an outer view and clips on an inner one', async () => {
    const { getByText } = await draw({ items: [], total: 0 });
    const inner = getByText(/Nothing outstanding/).parent as unknown as { props: { style: unknown }; parent: { props: { style: unknown } } };
    expect((StyleSheet.flatten(inner.props.style as never) as Record<string, unknown>).overflow).toBe('hidden');
    const outer = StyleSheet.flatten(inner.parent.props.style as never) as Record<string, unknown>;
    expect(outer.overflow).toBeUndefined();
    expect(outer.shadowOpacity ?? outer.elevation).toBeDefined();
  });

  it('See all calls onSeeAll', async () => {
    const { getByText, h } = await draw({ total: 9 });
    await fireEvent.press(getByText('See all'));
    expect(h.onSeeAll).toHaveBeenCalledTimes(1);
  });
});
