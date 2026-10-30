import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ActivityRowView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ActivityRow } from '../ActivityRow';
import { RefundHintChip } from '../RefundHintChip';

const mockAccess = { v3: true };
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => mockAccess }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));
jest.setTimeout(60000);

const categories = { all: [], active: [], byId: new Map(), transferCategoryId: 'tc', loading: false } as unknown as CategoryLookup;
const formatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number }) => `£${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

const moneyIn = {
  id: 'r1',
  account_id: 'a1',
  original_amount: 4000,
  original_currency: 'GBP',
  local_date: '2026-10-20',
  name: 'IKEA Refund',
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
} as unknown as ActivityRowView;

const hint = { purchaseId: 'p1', payee: 'IKEA' };
const A11Y = 'Refund of your IKEA purchase? Opens the refund picker.';

beforeEach(() => {
  mockAccess.v3 = true;
});

async function renderRow(extra: Partial<React.ComponentProps<typeof ActivityRow>>) {
  return render(
    <ThemeProvider>
      <ActivityRow
        row={moneyIn}
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

describe('RefundHintChip', () => {
  it('reads the spec copy and presses', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <RefundHintChip payee="IKEA" onPress={onPress} />
      </ThemeProvider>
    );
    expect(screen.getByText('Refund of your IKEA purchase?')).toBeTruthy();
    const button = screen.getByLabelText(A11Y);
    expect(button.props.accessibilityRole).toBe('button');
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ActivityRow refund hint', () => {
  it('press hands back the row and the purchase to preselect', async () => {
    const onRefundHintPress = jest.fn();
    const screen = await renderRow({ refundHint: hint, onRefundHintPress });
    await fireEvent.press(screen.getByLabelText(A11Y));
    expect(onRefundHintPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'p1');
  });

  it('is hidden with the switch off', async () => {
    mockAccess.v3 = false;
    const screen = await renderRow({ refundHint: hint, onRefundHintPress: jest.fn() });
    expect(screen.queryByText('Refund of your IKEA purchase?')).toBeNull();
  });

  it('is hidden while the row is selectable', async () => {
    const screen = await renderRow({ refundHint: hint, onRefundHintPress: jest.fn(), selectable: true });
    expect(screen.queryByText('Refund of your IKEA purchase?')).toBeNull();
  });

  it('is hidden when the row already has a refund tag', async () => {
    const purchase = { ...moneyIn, id: 'p1', original_amount: -4000, name: 'IKEA' } as unknown as ActivityRowView;
    const screen = await renderRow({
      refundHint: hint,
      onRefundHintPress: jest.fn(),
      refundTag: { kind: 'refundOf', purchase },
      onRefundTagPress: jest.fn(),
    });
    expect(screen.queryByText('Refund of your IKEA purchase?')).toBeNull();
  });

  it('is hidden when there is no hint', async () => {
    const screen = await renderRow({ refundHint: null, onRefundHintPress: jest.fn() });
    expect(screen.queryByText('Refund of your IKEA purchase?')).toBeNull();
  });
});
