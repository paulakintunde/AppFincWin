import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors, shadows } from '@/theme/tokens';
import { radii, space } from '@/theme/layout';
import type { ActivityRowView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ACCENTS } from '@/theme/accents';
import { ActivityRow, ProjectionRow, type CardPosition } from '../ActivityRow';

jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));
const mockSwipe: { props: Record<string, any> } = { props: {} };
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: R.forwardRef((props: any, ref: any) => {
      mockSwipe.props = props;
      R.useImperativeHandle(ref, () => ({ close: jest.fn() }));
      return <View>{props.children}</View>;
    }),
  };
});

const categories: CategoryLookup = {
  all: [],
  active: [],
  byId: new Map(),
  transferCategoryId: 'tc',
  loading: false,
} as unknown as CategoryLookup;

const formatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number }) => `${m.amount < 0 ? '-' : ''}£${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d: string) => d,
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

async function renderRow(
  r: ActivityRowView,
  cardPosition?: CardPosition,
  onMarkPaid = jest.fn(),
  extra: Partial<React.ComponentProps<typeof ActivityRow>> = {}
) {
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
        today="2026-09-30"
        {...extra}
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

  it('keeps Mark paid in the row card, not in a second block below it', async () => {
    const { screen } = await renderRow(row({ status: 'pending', local_date: '2026-09-28' }), 'only');
    const card = within(screen.getByTestId('activity-card-r1'));
    expect(card.getByLabelText('Mark paid')).toBeTruthy();
  });
});

describe('ActivityRow large-text layout (02-polish item 3)', () => {
  it('truncates the name to one line and never lets the amount column shrink', async () => {
    const { screen } = await renderRow(row({ name: 'A very long merchant name that would squeeze the amount at large text sizes' }), 'only');
    const name = screen.getByText(/A very long merchant name/);
    expect(name.props.numberOfLines).toBe(1);
    const card = screen.getByTestId('activity-card-r1');
    const amount = screen.getByText('-£12.50', { includeHiddenElements: true });
    expect(amount.props.numberOfLines).toBe(1);
    // Text column: flex 1 + minWidth 0 so it gives way; amount column: flexShrink 0.
    const textCol = name.parent as { props: { style?: unknown } };
    expect(flat(textCol).flex).toBe(1);
    expect(flat(textCol).minWidth).toBe(0);
    const amountsCol = amount.parent?.parent as { props: { style?: unknown } };
    expect(flat(amountsCol).flexShrink).toBe(0);
    expect(card).toBeTruthy();
  });
});

describe('ActivityRow colours (02-polish item 5, UI-SPEC amendment 2026-10-07)', () => {
  const colourOf = (el: { props: { style?: unknown } }) => flat(el).color;

  it('shows income in the accent colour with a leading +, while the spoken label is unchanged', async () => {
    const { screen } = await renderRow(row({ original_amount: 5000, amountHome: 5000, name: 'Salary' }), 'only');
    const amount = screen.getByText('+£50.00', { includeHiddenElements: true });
    expect(colourOf(amount)).toBe(ACCENTS.green);
    expect(screen.getByTestId('activity-row-r1').props.accessibilityLabel).toBe('Salary, £50.00, Received');
  });

  it('keeps an expense in ink with no sign added', async () => {
    const { screen } = await renderRow(row({}), 'only');
    expect(colourOf(screen.getByText('-£12.50', { includeHiddenElements: true }))).toBe(colors.ink);
  });

  it('keeps a transfer leg in inkDim, even when it is the incoming leg', async () => {
    const { screen } = await renderRow(row({ original_amount: 5000, transfer_id: 't1', counterpartAccountId: 'a2' }), 'only');
    const amount = screen.getByText('£50.00', { includeHiddenElements: true });
    expect(colourOf(amount)).toBe(colors.inkDim);
  });

  it('colours Due and Overdue tags in danger, with their words intact', async () => {
    const due = await renderRow(row({ status: 'pending', local_date: '2026-09-30' }), 'only');
    expect(colourOf(due.screen.getByText('Due'))).toBe(colors.danger);
    const overdue = await renderRow(row({ id: 'r2', status: 'pending', overdue: true, local_date: '2026-09-29' }), 'only');
    expect(colourOf(overdue.screen.getByText('Overdue'))).toBe(colors.danger);
  });

  it('keeps the queued sync tag neutral', async () => {
    const { screen } = await renderRow(row({ pending: true } as Partial<ActivityRowView>), 'only');
    expect(colourOf(screen.getByText('queued'))).toBe(colors.inkMuted);
  });

  it('colours the Expected tag of a projection in danger', async () => {
    const screen = await render(
      <ThemeProvider>
        <ProjectionRow
          projection={{ key: 's1:2026-09-30', seriesId: 's1', date: '2026-09-30', name: 'Netflix', amount: -999, currency: 'GBP', categoryId: null, accountId: 'a1', amountHome: -999 }}
          categories={categories}
          accountName={() => 'Current'}
          formatter={formatter}
          homeCurrency="GBP"
        />
      </ThemeProvider>
    );
    expect(flat(screen.getByText('Expected')).color).toBe(colors.danger);
  });
});

describe('ActivityRow tags, refunds, swipe and balance note (02.2-21)', () => {
  const colourOf = (el: { props: { style?: unknown } }) => flat(el).color;

  it('tags paid expense Paid and paid income Received in accent', async () => {
    const a = await renderRow(row({}), 'only');
    expect(colourOf(a.screen.getByText('Paid'))).toBe(ACCENTS.green);
    const b = await renderRow(row({ id: 'r2', original_amount: 5000, amountHome: 5000 }), 'only');
    expect(colourOf(b.screen.getByText('Received'))).toBe(ACCENTS.green);
  });

  it('tags a pending expense dated yesterday Overdue, and pending income today Expected, in danger', async () => {
    const a = await renderRow(row({ status: 'pending', local_date: '2026-09-29' }), 'only');
    expect(colourOf(a.screen.getByText('Overdue'))).toBe(colors.danger);
    const b = await renderRow(row({ id: 'r2', status: 'pending', original_amount: 5000, local_date: '2026-09-30' }), 'only');
    expect(colourOf(b.screen.getByText('Expected'))).toBe(colors.danger);
  });

  it('tags a future line Scheduled in inkMuted on fill1', async () => {
    const { screen } = await renderRow(row({ status: 'pending', local_date: '2026-10-05' }), 'only');
    const word = screen.getByText('Scheduled');
    expect(colourOf(word)).toBe(colors.inkMuted);
    expect(flat(word.parent as never).backgroundColor).toBe(colors.fill1);
  });

  it('shows a paid refund with + in accent, Paid, a Refund sub-label and no income wording', async () => {
    const { screen } = await renderRow(row({ original_amount: 2999, amountHome: 2999, is_refund: true, name: 'Return' } as Partial<ActivityRowView>), 'only');
    expect(colourOf(screen.getByText('+£29.99', { includeHiddenElements: true }))).toBe(ACCENTS.green);
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(colourOf(screen.getByText(/· Refund/))).toBe(ACCENTS.green);
    const label = screen.getByTestId('activity-row-r1').props.accessibilityLabel as string;
    expect(label).toBe('Return, £29.99, Paid, Refund');
    expect(label).not.toMatch(/Received|income/);
  });

  async function actionWords() {
    const left = mockSwipe.props.renderLeftActions?.();
    const right = mockSwipe.props.renderRightActions?.();
    const view = await render(<ThemeProvider>{left}{right}</ThemeProvider>);
    return view;
  }

  it('exposes PAID / RECEIVED / UNPAY / DELETE swipe actions and disables them when selectable', async () => {
    const handlers = { onSwipePay: jest.fn(), onSwipeUnpay: jest.fn(), onSwipeDelete: jest.fn() };
    const hidden = { includeHiddenElements: true };
    await renderRow(row({ status: 'pending', local_date: '2026-09-30' }), 'only', jest.fn(), handlers);
    expect(mockSwipe.props.enabled).toBe(true);
    let words = await actionWords();
    expect(words.getByText('PAID', hidden)).toBeTruthy();
    expect(words.getByText('DELETE', hidden)).toBeTruthy();
    await renderRow(row({ id: 'r2', status: 'pending', original_amount: 900, local_date: '2026-09-30' }), 'only', jest.fn(), handlers);
    words = await actionWords();
    expect(words.getByText('RECEIVED', hidden)).toBeTruthy();
    await renderRow(row({ id: 'r3' }), 'only', jest.fn(), handlers);
    words = await actionWords();
    expect(words.getByText('UNPAY', hidden)).toBeTruthy();
    await renderRow(row({ id: 'r4' }), 'only', jest.fn(), { ...handlers, selectable: true });
    expect(mockSwipe.props.enabled).toBe(false);
  });

  it('renders the balance note in place of the sub-label', async () => {
    const { screen } = await renderRow(row({}), 'only', jest.fn(), { balanceNote: { kind: 'after', text: 'Oct 3 · balance £75.00 after' } });
    expect(screen.getByText('Oct 3 · balance £75.00 after')).toBeTruthy();
  });

  it('shows not yet counted with name and amount in inkMuted and speaks it', async () => {
    const { screen } = await renderRow(row({ status: 'pending', local_date: '2026-09-30' }), 'only', jest.fn(), { balanceNote: { kind: 'notCounted' } });
    expect(screen.getByText('not yet counted')).toBeTruthy();
    expect(colourOf(screen.getByText('Coffee'))).toBe(colors.inkMuted);
    expect(colourOf(screen.getByText('-£12.50', { includeHiddenElements: true }))).toBe(colors.inkMuted);
    expect((screen.getByTestId('activity-row-r1').props.accessibilityLabel as string).endsWith('not yet counted in the balance')).toBe(true);
  });

  it('keeps the queued tag alongside the status tag', async () => {
    const { screen } = await renderRow(row({ pending: true } as Partial<ActivityRowView>), 'only');
    expect(screen.getByText('queued')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
  });
});
