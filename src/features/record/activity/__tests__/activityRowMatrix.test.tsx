/**
 * 05.3-50 F6: Activity rows at 320 / 402 wide x 1.0 / 2.0 (R18 matrix). Refund is never inside a one-line clamp; the
 * Expected tag, the New income chip and the refund hint chip carry no fixed width and wrap by word; past the D-76
 * stacking scale the figures drop under the text so the tags get the row's width.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, render, screen } from '@testing-library/react-native';
import type { TestInstance as ReactTestInstance } from 'test-renderer';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { ActivityRowView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { MATRIX, matrixName } from '@/features/decide/__tests__/helpers/r18Fit';
import { ActivityRow } from '../ActivityRow';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: true }) }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));

const categories = { all: [], active: [], byId: new Map(), transferCategoryId: 'tc', loading: false } as unknown as CategoryLookup;
const formatter = {
  locale: 'en-US',
  formatMoney: (m: { amount: number }) => `${m.amount < 0 ? '-' : ''}$${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

function row(over: Partial<ActivityRowView>): ActivityRowView {
  return {
    id: 'r1',
    account_id: 'a1',
    original_amount: 4000,
    original_currency: 'USD',
    local_date: '2026-10-10',
    name: 'Groceries',
    category_id: null,
    status: 'paid',
    transfer_id: null,
    deleted_at: null,
    is_refund: false,
    refund_of: null,
    amountHome: 4000,
    overdue: false,
    pending: false,
    counterpartAccountId: null,
    ...over,
  } as unknown as ActivityRowView;
}

const flat = (n: ReactTestInstance) => (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>;

/** No ancestor of the text clamps lines: the text can never be ellipsised away. */
function expectUnclamped(el: ReactTestInstance) {
  for (let p: ReactTestInstance | null = el; p; p = p.parent) {
    expect({ text: 'clamp', lines: p.props.numberOfLines }).toEqual({ text: 'clamp', lines: undefined });
  }
}

/** The chip and its ancestors up to the card carry no fixed width that would force letter breaks. */
function expectNoFixedWidth(el: ReactTestInstance, cardId: string) {
  for (let p: ReactTestInstance | null = el; p && p.props.testID !== cardId; p = p.parent) {
    if (typeof p.type !== 'string') continue;
    const s = flat(p);
    expect({ width: s.width, maxWidthNumber: typeof s.maxWidth === 'number' }).toEqual({ width: undefined, maxWidthNumber: false });
  }
}

async function renderAt(scale: number, node: React.ReactElement) {
  return render(
    <ThemeProvider>
      <FontScaleProvider value={scale}>{node}</FontScaleProvider>
    </ThemeProvider>,
  );
}

const base = {
  categories,
  accountName: () => 'Main',
  formatter,
  homeCurrency: 'USD',
  onPress: jest.fn(),
  onMarkPaid: jest.fn(),
  today: '2026-10-30',
};

afterEach(cleanup);

describe.each(MATRIX)('Activity row at $width wide x $scale', (m) => {
  beforeEach(() => {
    mockWidth = m.width;
    mockScale = m.scale;
  });

  it(`Refund is a tag of its own, never inside the one-line sub line (${matrixName(m)})`, async () => {
    await renderAt(m.scale, <ActivityRow {...base} row={row({ is_refund: true } as Partial<ActivityRowView>)} />);
    const refund = screen.getByText('Refund');
    expectUnclamped(refund);
    expect(screen.queryByText(/· Refund/)).toBeNull();
    // the tags row wraps instead of squeezing a word
    expect(flat(refund.parent!.parent!).flexWrap).toBe('wrap');
    // the sub line keeps only the meta (no category in this fixture)
    expect(screen.getByText('Main · 2026-10-10')).toBeTruthy();
  });

  it(`the Expected tag, New income chip and refund hint chip wrap by word (${matrixName(m)})`, async () => {
    await renderAt(
      m.scale,
      <>
        <ActivityRow {...base} row={row({ id: 'e1', status: 'pending', local_date: '2026-10-30' })} />
        <ActivityRow
          {...base}
          row={row({ id: 'n1', name: 'Transfer in' })}
          incomeChip={{ state: 'new' }}
          onIncomeChipPress={jest.fn()}
        />
        <ActivityRow
          {...base}
          row={row({ id: 'h1', name: 'IKEA' })}
          refundHint={{ purchaseId: 'p1', payee: 'IKEA' }}
          onRefundHintPress={jest.fn()}
        />
      </>,
    );
    const expected = screen.getByText('Expected');
    expectUnclamped(expected);
    expectNoFixedWidth(expected, 'activity-card-e1');

    const income = screen.getByText('New income · what is it?');
    expectUnclamped(income);
    expectNoFixedWidth(income, 'activity-card-n1');
    expect(flat(income.parent!).maxWidth).toBe('100%');

    const hint = screen.getByText('Refund of your IKEA purchase?');
    expectUnclamped(hint);
    expectNoFixedWidth(hint, 'activity-card-h1');
    expect(flat(hint.parent!).maxWidth).toBe('100%');
    // a one-line chip is about 24 high; its 10 + 10 slop reaches the 44 minimum (RefundHintChip)
    expect(screen.getByLabelText('Refund of your IKEA purchase? Opens the refund picker.').props.hitSlop).toMatchObject({ top: 10, bottom: 10 });
  });

  it(`stacks the figures under the text past the stacking scale (${matrixName(m)})`, async () => {
    await renderAt(
      m.scale,
      <ActivityRow
        {...base}
        row={row({ id: 'h1', name: 'IKEA' })}
        refundHint={{ purchaseId: 'p1', payee: 'IKEA' }}
        onRefundHintPress={jest.fn()}
      />,
    );
    const card = screen.getByTestId('activity-card-h1');
    const stacked = m.scale > 1.3;
    expect(flat(card).flexDirection).toBe(stacked ? 'column' : 'row');
    const amounts = screen.getByTestId('activity-amounts-h1');
    if (stacked) {
      // the figures, then the chips, sit directly in the card at full width
      expect(amounts.parent).toBe(card);
      const hintChip = screen.getByLabelText('Refund of your IKEA purchase? Opens the refund picker.');
      expect(card.children.length).toBeGreaterThanOrEqual(3);
      expect(hintChip).toBeTruthy();
    }
  });
});
