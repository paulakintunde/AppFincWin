import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import type { ActivityRowView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { refundTotals } from '@/data/mutations/refundLinkModel';
import { ActivityRow } from '../ActivityRow';
import { RefundTag, refundTagFor } from '../RefundTag';

const mockAccess = { v3: true };
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => mockAccess }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));

const categories = { all: [], active: [], byId: new Map(), transferCategoryId: 'tc', loading: false } as unknown as CategoryLookup;
const formatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number }) => `£${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

function tx(over: Partial<ActivityRowView>): ActivityRowView {
  return {
    id: 'x',
    account_id: 'a1',
    original_amount: -8000,
    original_currency: 'GBP',
    local_date: '2026-10-01',
    name: 'Shoe Shop',
    category_id: null,
    status: 'paid',
    transfer_id: null,
    deleted_at: null,
    is_refund: false,
    refund_of: null,
    amountHome: null,
    overdue: false,
    pending: false,
    counterpartAccountId: null,
    ...over,
  } as unknown as ActivityRowView;
}

const purchase = tx({ id: 'p1', original_amount: -8000, name: 'Shoe Shop', local_date: '2026-09-20' });
const refund1 = tx({ id: 'r1', original_amount: 3000, is_refund: true, refund_of: 'p1', name: 'Shoe Shop', local_date: '2026-10-01' });
const refund2 = tx({ id: 'r2', original_amount: 1500, is_refund: true, refund_of: 'p1', name: 'Shoe Shop', local_date: '2026-10-02' });
const rows = [purchase, refund1, refund2];
const byId = new Map(rows.map((r) => [r.id, r] as const));
const totals = refundTotals(rows as unknown as TransactionRow[]);

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess.v3 = true;
});

describe('refundTagFor', () => {
  it('refund row points at its purchase; purchase carries the total of all linked refunds', () => {
    expect(refundTagFor(refund1, byId, totals)).toMatchObject({ kind: 'refundOf', purchase: { id: 'p1' } });
    expect(refundTagFor(purchase, byId, totals)).toMatchObject({ kind: 'refunded', total: 4500, currency: 'GBP' });
  });

  it('gives no tag for a plain row, or a refund whose purchase is not on screen', () => {
    expect(refundTagFor(tx({ id: 'z' }), byId, totals)).toBeNull();
    expect(refundTagFor(refund1, new Map(), totals)).toBeNull();
  });
});

describe('RefundTag', () => {
  it('reads the spec copy and labels, and presses', async () => {
    const onPress = jest.fn();
    const model = refundTagFor(refund1, byId, totals)!;
    const screen = await render(
      <ThemeProvider>
        <RefundTag model={model} row={refund1} formatter={formatter} onPress={onPress} />
      </ThemeProvider>
    );
    expect(screen.getByText('Refund of Shoe Shop · 2026-10-01')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Refund of Shoe Shop, 2026-10-01. Opens the purchase.'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

async function renderRow(r: ActivityRowView, extra: Partial<React.ComponentProps<typeof ActivityRow>>) {
  return render(
    <ThemeProvider>
      <ActivityRow
        row={r}
        categories={categories}
        accountName={() => 'Current'}
        formatter={formatter}
        homeCurrency="GBP"
        onPress={jest.fn()}
        onMarkPaid={jest.fn()}
        today="2026-10-30"
        {...extra}
      />
    </ThemeProvider>
  );
}

describe('ActivityRow refund tags', () => {
  it('purchase row shows Refunded and opens the purchase; amount is unchanged', async () => {
    const onRefundTagPress = jest.fn();
    const screen = await renderRow(purchase, { refundTag: refundTagFor(purchase, byId, totals), onRefundTagPress });
    expect(screen.getByText('Refunded £45.00')).toBeTruthy();
    expect(screen.getByTestId('activity-row-p1').props.accessibilityLabel).toContain('£80.00');
    await fireEvent.press(screen.getByLabelText('Refunded £45.00. Opens the purchase.'));
    expect(onRefundTagPress).toHaveBeenCalledWith('p1');
  });

  it('refund row shows Refund of and opens the purchase', async () => {
    const onRefundTagPress = jest.fn();
    const screen = await renderRow(refund1, { refundTag: refundTagFor(refund1, byId, totals), onRefundTagPress });
    await fireEvent.press(screen.getByLabelText('Refund of Shoe Shop, 2026-10-01. Opens the purchase.'));
    expect(onRefundTagPress).toHaveBeenCalledWith('p1');
  });

  it('draws no tag and no chip with the switch off', async () => {
    mockAccess.v3 = false;
    const screen = await renderRow(purchase, {
      refundTag: refundTagFor(purchase, byId, totals),
      onRefundTagPress: jest.fn(),
      incomeChip: { state: 'new' },
      onIncomeChipPress: jest.fn(),
    });
    expect(screen.queryByText('Refunded £45.00')).toBeNull();
    expect(screen.queryByText('New income · what is it?')).toBeNull();
  });

  it('money-in row shows the income chip and opens the income sheet', async () => {
    const onIncomeChipPress = jest.fn();
    const pay = tx({ id: 'i1', original_amount: 250000, name: 'Acme Ltd' });
    const screen = await renderRow(pay, { incomeChip: { state: 'new' }, onIncomeChipPress });
    await fireEvent.press(screen.getByLabelText('Income type not set. Opens income type.'));
    expect(onIncomeChipPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }));
  });
});
