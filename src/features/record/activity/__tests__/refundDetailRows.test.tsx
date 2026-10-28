import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ActivityRowView } from '@/data/queries/activity';
import type { TransactionRow } from '@/db/rows';
import { resetSheetStackForTests } from '@/state/sheetStack';
import { detailRowsFor } from '../detailRows';
import { TransactionDetailSheet } from '../TransactionDetailSheet';

let mockV3 = true;
let mockLinks: { rowsById: Map<string, TransactionRow>; totals: Map<string, number>; refunds: TransactionRow[] } = {
  rowsById: new Map(),
  totals: new Map(),
  refunds: [],
};

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.setTimeout(20000);
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('@/data/queries/refundLinks', () => ({ useRefundLinks: () => mockLinks }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', name: 'Everyday' }] }) }));
jest.mock('@/data/queries/transactions', () => ({ useLinkedFees: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: [], active: [], byId: new Map(), transferCategoryId: null, loading: false }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'Europe/London',
    today: '2026-09-30',
  }),
}));

function tx(over: Partial<ActivityRowView> = {}): ActivityRowView {
  return {
    id: 'r1',
    account_id: 'a1',
    original_amount: -10000,
    original_currency: 'GBP',
    home_currency: 'GBP',
    rate: null,
    rate_date: null,
    rate_source: null,
    rate_pending: false,
    local_date: '2026-05-10',
    name: 'Shop',
    category_id: null,
    payment_type: null,
    note: null,
    status: 'paid',
    transfer_id: null,
    recurring_series_id: null,
    is_refund: false,
    refund_of: null,
    income_kind: null,
    is_automatic: false,
    amountHome: -10000,
    overdue: false,
    counterpartAccountId: null,
    ...over,
  } as unknown as ActivityRowView;
}

const t = (key: string) => key;
const base = (row: ActivityRowView, decideV3: boolean) =>
  detailRowsFor({ row, today: '2026-09-30', accountName: 'Everyday', counterpartName: null, categoryName: null, paymentTypeLabel: null, repeatsLabel: null, decideV3, t });

function callbacks() {
  return { onRefundPicker: jest.fn(), onIncomeType: jest.fn(), onOpenRow: jest.fn() };
}

// The Sheet keeps a module-level stack; unmounting each render in order keeps the next test's sheet on top.
const mounted: { unmount: () => void }[] = [];
afterEach(async () => {
  await act(async () => {
    while (mounted.length > 0) mounted.pop()?.unmount();
  });
  jest.clearAllMocks();
});

async function renderSheet(row: ActivityRowView, cb = callbacks()) {
  const screen = await render(
    <ThemeProvider>
      <TransactionDetailSheet
        row={row}
        visible
        today="2026-09-30"
        onDismiss={jest.fn()}
        onStatus={jest.fn()}
        onEdit={jest.fn()}
        onClone={jest.fn()}
        onDelete={jest.fn()}
        refundCallbacks={cb}
      />
    </ThemeProvider>
  );
  mounted.push(screen);
  return { screen, cb };
}

beforeEach(() => {
  resetSheetStackForTests();
  mockV3 = true;
  mockLinks = { rowsById: new Map(), totals: new Map(), refunds: [] };
});

describe('detailRowsFor refund and income-type rows', () => {
  it('adds nothing with the switch off', () => {
    for (const row of [tx(), tx({ original_amount: 5000 }), tx({ original_amount: 5000, is_refund: true })]) {
      expect(base(row, false).some((s) => s.action !== undefined)).toBe(false);
    }
  });

  it('money in: Refund of... and Income type; a refund keeps Refund of... but has no income type', () => {
    expect(base(tx({ original_amount: 5000 }), true).filter((s) => s.action).map((s) => s.action)).toEqual(['refundOf', 'incomeType']);
    const linked = base(tx({ original_amount: 5000, is_refund: true, refund_of: 'p' }), true);
    expect(linked.filter((s) => s.action).map((s) => s.action)).toEqual(['refundOf']);
  });

  it('income type shows the name or Not set', () => {
    const none = base(tx({ original_amount: 5000 }), true).find((s) => s.key === 'incomeType');
    expect(none?.value).toBe('activity.incomeTag.detailNotSet');
    const named = detailRowsFor({
      row: tx({ original_amount: 5000 }), today: '2026-09-30', accountName: null, counterpartName: null, categoryName: null,
      paymentTypeLabel: null, repeatsLabel: null, decideV3: true, incomeTypeLabel: 'Salary or wages', t,
    }).find((s) => s.key === 'incomeType');
    expect(named?.value).toBe('Salary or wages');
  });

  it('a purchase gets the Refunds group; a transfer gets none', () => {
    expect(base(tx(), true).map((s) => s.action).filter(Boolean)).toEqual(['refundsGroup']);
    expect(base(tx({ transfer_id: 'x' }), true).some((s) => s.action !== undefined)).toBe(false);
  });
});

describe('TransactionDetailSheet refund rows', () => {
  it('a refund shows "Not linked" and opens the picker', async () => {
    const a = await renderSheet(tx({ original_amount: 4000, is_refund: true, name: 'Shop' }));
    expect(a.screen.getByText('Refund of...')).toBeTruthy();
    expect(a.screen.getByText('Not linked')).toBeTruthy();
    await fireEvent.press(a.screen.getByLabelText('Refund of..., Not linked'));
    expect(a.cb.onRefundPicker).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'refund->purchase');
  });

  it('a linked refund shows the purchase payee and date', async () => {
    mockLinks = {
      ...mockLinks,
      rowsById: new Map([['p9', tx({ id: 'p9', name: 'Big Store', local_date: '2026-05-10' }) as unknown as TransactionRow]]),
    };
    const b = await renderSheet(tx({ original_amount: 4000, is_refund: true, refund_of: 'p9' }));
    expect(await b.screen.findByText(/Big Store · /)).toBeTruthy();
  });

  it('a money-in row opens the income tag sheet from Income type', async () => {
    const { screen, cb } = await renderSheet(tx({ original_amount: 5000, income_kind: 'salary' }));
    expect(await screen.findByText('Income type')).toBeTruthy();
    expect(screen.getByText('Salary or wages')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Income type, Salary or wages'));
    expect(cb.onIncomeType).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('shows none of it when the switch is off', async () => {
    mockV3 = false;
    const { screen } = await renderSheet(tx({ original_amount: 5000 }));
    expect(await screen.findByText('Edit transaction')).toBeTruthy();
    expect(screen.queryByText('Refund of...')).toBeNull();
    expect(screen.queryByText('Income type')).toBeNull();
  });

  it('a purchase has no Refunds group when the switch is off', async () => {
    mockV3 = false;
    const { screen } = await renderSheet(tx());
    expect(await screen.findByText('Edit transaction')).toBeTruthy();
    expect(screen.queryByText('Refunds')).toBeNull();
  });

  it('a purchase lists every linked refund across months and + Link a refund', async () => {
    mockLinks = {
      ...mockLinks,
      refunds: [
        tx({ id: 'j', name: 'Shop', original_amount: 4000, local_date: '2026-07-01', refund_of: 'r1' }) as unknown as TransactionRow,
        tx({ id: 'u', name: 'Shop', original_amount: 1000, local_date: '2026-06-01', refund_of: 'r1' }) as unknown as TransactionRow,
        tx({ id: 'x', name: 'Elsewhere', original_amount: 700, local_date: '2026-06-01', refund_of: 'other' }) as unknown as TransactionRow,
      ],
    };
    const { screen, cb } = await renderSheet(tx());
    expect(await screen.findByText('Refunds')).toBeTruthy();
    expect(screen.getAllByText(/\+£/)).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText(/Refund from Shop, .*\+£40\.00\. Opens the refund\./));
    expect(cb.onOpenRow).toHaveBeenCalledWith(expect.objectContaining({ id: 'j' }));
    await fireEvent.press(screen.getByLabelText('+ Link a refund'));
    expect(cb.onRefundPicker).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'purchase->refund');
  });
});
