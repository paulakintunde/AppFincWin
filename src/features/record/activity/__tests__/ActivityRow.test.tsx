import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors, shadows } from '@/theme/tokens';
import { radii, space } from '@/theme/layout';
import type { ActivityRowView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ActivityRow, type CardPosition } from '../ActivityRow';

const categories: CategoryLookup = {
  all: [],
  active: [],
  byId: new Map(),
  transferCategoryId: 'tc',
  loading: false,
} as unknown as CategoryLookup;

const formatter: MoneyFormatter = {
  locale: 'en-GB',
  formatMoney: (m) => `${m.amount < 0 ? '-' : ''}£${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d) => d,
} as unknown as MoneyFormatter;

function row(over: Partial<ActivityRowView>): ActivityRowView {
  return {
    id: 'r1',
    account_id: 'a1',
    original_amount: -1250,
    original_currency: 'GBP',
    local_date: '2026-09-20',
    name: 'Coffee',
    category_id: null,
    status: 'paid',
    transfer_id: null,
    amountHome: -1250,
    overdue: false,
    pending: false,
    counterpartAccountId: null,
    ...over,
  } as unknown as ActivityRowView;
}

async function renderRow(r: ActivityRowView, cardPosition?: CardPosition, onMarkPaid = jest.fn()) {
  const screen = await render(
    <ThemeProvider>
      <ActivityRow
        row={r}
        categories={categories}
        accountName={() => 'Current'}
        formatter={formatter}
        homeCurrency="GBP"
        cardPosition={cardPosition}
        onPress={jest.fn()}
        onMarkPaid={onMarkPaid}
      />
    </ThemeProvider>
  );
  return { screen, onMarkPaid };
}

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

describe('ActivityRow card styling (02-polish item 2)', () => {
  it('sits in a surface card with the card radius, shadows.card and prototype 13x18 padding', async () => {
    const { screen } = await renderRow(row({}), 'only');
    const card = flat(screen.getByTestId('activity-card-r1'));
    expect(card.backgroundColor).toBe(colors.surface);
    expect(card.borderRadius).toBe(radii.card);
    expect(card.shadowOpacity).toBe(shadows.card.shadowOpacity);
    expect(card.paddingVertical).toBe(space.rowPadDense);
    expect(card.paddingHorizontal).toBe(18);
  });

  it('rounds only the outer corners of a grouped card and separates rows with a 1px line', async () => {
    const first = flat((await renderRow(row({}), 'first')).screen.getByTestId('activity-card-r1'));
    expect(first.borderTopLeftRadius).toBe(radii.card);
    expect(first.borderBottomLeftRadius).toBe(0);
    expect(first.borderTopWidth).toBeUndefined();
    const middle = flat((await renderRow(row({}), 'middle')).screen.getByTestId('activity-card-r1'));
    expect(middle.borderTopLeftRadius).toBe(0);
    expect(middle.borderTopWidth).toBe(1);
    expect(middle.borderTopColor).toBe(colors.line1);
    const last = flat((await renderRow(row({}), 'last')).screen.getByTestId('activity-card-r1'));
    expect(last.borderBottomRightRadius).toBe(radii.card);
    expect(last.borderTopWidth).toBe(1);
  });

  it('Mark paid is compact (no taller than the row text) yet keeps a 44pt touch target', async () => {
    const { screen, onMarkPaid } = await renderRow(row({ status: 'pending', local_date: '2026-09-28' }), 'only');
    const button = screen.getByLabelText('Mark paid');
    const style = flat(button);
    const slop = button.props.hitSlop as { top: number; bottom: number };
    expect(style.minHeight as number).toBeLessThan(space.touchMin);
    expect((style.minHeight as number) + slop.top + slop.bottom).toBeGreaterThanOrEqual(space.touchMin);
    await fireEvent.press(button);
    expect(onMarkPaid).toHaveBeenCalledTimes(1);
  });

  it('keeps Mark paid in the row (not a second block below it)', async () => {
    const { screen } = await renderRow(row({ status: 'pending', local_date: '2026-09-28' }), 'only');
    const card = screen.getByTestId('activity-card-r1');
    expect(card.findAll((n) => n.props.accessibilityLabel === 'Mark paid').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('activity-markpaid-block')).toBeNull();
  });
});
