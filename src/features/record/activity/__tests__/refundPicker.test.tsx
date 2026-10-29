import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { RefundPickerSheet } from '../RefundPickerSheet';
import { monthsBefore, purchaseCandidates, refundCandidates, PICKER_CAP } from '../refundPickerModel';

const mockLink = jest.fn((_r: unknown, _p: unknown) => ({ stepId: 'step-1' }));
const mockUnlink = jest.fn((_r: unknown) => ({ stepId: 'step-2' }));
const mockShowToast = jest.fn();
const mockRange = jest.fn();
const mockLinkedRefunds = jest.fn();
const mockByIds = jest.fn();
const mockWritten = jest.fn();

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('@/data/mutations/refundLinks', () => ({
  useLinkRefund: () => ({ link: (r: unknown, p: unknown) => mockLink(r, p) }),
  useUnlinkRefund: () => ({ unlink: (r: unknown) => mockUnlink(r) }),
}));
jest.mock('@/db/transactions', () => ({
  fetchTransactionsInRange: (...a: unknown[]) => mockRange(...a),
  fetchLinkedRefunds: (...a: unknown[]) => mockLinkedRefunds(...a),
  fetchTransactionsByIds: (...a: unknown[]) => mockByIds(...a),
}));
jest.mock('@/db/decideLinks', () => ({ fetchWrittenRowLinks: (...a: unknown[]) => mockWritten(...a) }));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockShowToast(t) }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ byId: new Map([['c1', { id: 'c1', builtin_key: null, name: 'Shopping' }]]) }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ ready: true, userId: 'u1', householdId: 'h1', today: '2026-10-20' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.setTimeout(20000);

const formatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number }) => `£${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

function tx(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 't1',
    name: 'Shop',
    note: null,
    original_amount: -10000,
    original_currency: 'GBP',
    local_date: '2026-09-01',
    transfer_id: null,
    deleted_at: null,
    is_refund: false,
    refund_of: null,
    recurring_series_id: null,
    category_id: 'c1',
    version: 1,
    ...over,
  } as unknown as TransactionRow;
}

const refund = (over: Partial<TransactionRow> = {}) =>
  tx({ id: 'ref', name: 'Shop', original_amount: 4000, local_date: '2026-10-10', is_refund: true, ...over });

async function open(anchor: TransactionRow, direction: 'refund->purchase' | 'purchase->refund' = 'refund->purchase') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = jest.fn();
  const utils = await render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <RefundPickerSheet visible direction={direction} anchor={anchor} formatter={formatter} onClose={onClose} />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return { ...utils, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRange.mockResolvedValue([]);
  mockLinkedRefunds.mockResolvedValue([]);
  mockByIds.mockResolvedValue([]);
  mockWritten.mockResolvedValue([]);
});

describe('refund picker model', () => {
  it('monthsBefore clamps the day', () => {
    expect(monthsBefore('2026-03-31', 1)).toBe('2026-02-28');
    expect(monthsBefore('2026-01-15', 12)).toBe('2025-01-15');
  });

  it('caps both directions at 50 and puts the same payee first', () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      tx({ id: `p${String(i).padStart(2, '0')}`, name: i === 0 ? 'Shop' : 'Other', local_date: '2026-09-15' })
    );
    const out = purchaseCandidates({ anchor: refund(), rows: many, today: '2026-10-20', query: '', amountText: () => '' });
    expect(out).toHaveLength(PICKER_CAP);
    expect(out[0]?.id).toBe('p00');
    const ins = Array.from({ length: 80 }, (_, i) => refund({ id: `m${i}`, local_date: '2026-09-15', name: 'X' }));
    expect(refundCandidates({ anchor: tx(), rows: ins, today: '2026-10-20', query: '', amountText: () => '' })).toHaveLength(PICKER_CAP);
  });

  it('keeps to same-currency expenses inside the 12 months before the refund', () => {
    const rows = [
      tx({ id: 'ok' }),
      tx({ id: 'old', local_date: '2025-01-01' }),
      tx({ id: 'usd', original_currency: 'USD' }),
      tx({ id: 'after', local_date: '2026-10-11' }),
      tx({ id: 'gone', deleted_at: '2026-09-02T00:00:00Z' }),
      tx({ id: 'xfer', transfer_id: 'x' }),
      tx({ id: 'inflow', original_amount: 500 }),
    ];
    const out = purchaseCandidates({ anchor: refund(), rows, today: '2026-10-20', query: '', amountText: () => '' });
    expect(out.map((r) => r.id)).toEqual(['ok']);
  });

  it('reverse direction lists only unlinked money-in rows on or after the purchase', () => {
    const rows = [
      refund({ id: 'a' }),
      refund({ id: 'linked', refund_of: 'zz' }),
      refund({ id: 'before', local_date: '2026-08-01' }),
      tx({ id: 'spend' }),
    ];
    const out = refundCandidates({ anchor: tx(), rows, today: '2026-10-20', query: '', amountText: () => '' });
    expect(out.map((r) => r.id)).toEqual(['a']);
  });
});

describe('RefundPickerSheet', () => {
  it('lists purchases with title, sub-line, and links the chosen one with a toast', async () => {
    mockRange.mockResolvedValue([tx({ id: 'p1', name: 'Shop' }), tx({ id: 'p2', name: 'Cafe', original_amount: -500 })]);
    const { findByText, getByRole, getByLabelText, onClose } = await open(refund());
    expect(await findByText('Which purchase was refunded?')).toBeTruthy();
    expect(await findByText('Shop · +£40.00 · 2026-10-10')).toBeTruthy();
    const link = getByRole('button', { name: 'Link refund' });
    expect(link.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(getByLabelText(/^Shop, 2026-09-01 · Shopping, £100\.00$/));
    expect(await findByText('£60.00 of the purchase stays as spending in September.')).toBeTruthy();
    expect(await findByText('Your balances and records stay exactly as logged. Only Decide’s view changes.')).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'Link refund' }));
    expect(mockLink).toHaveBeenCalledTimes(1);
    expect((mockLink.mock.calls[0]?.[1] as TransactionRow).id).toBe('p1');
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'activity.refund.toastLinked' }, stepId: 'step-1' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the plan line for a recurring purchase and "Refunded so far" for a part-refunded one', async () => {
    mockRange.mockResolvedValue([tx({ id: 'p1', recurring_series_id: 's1' })]);
    mockLinkedRefunds.mockResolvedValue([refund({ id: 'other', refund_of: 'p1', original_amount: 1000, local_date: '2026-09-20' })]);
    const { findByText, getByLabelText } = await open(refund());
    expect(await findByText('Refunded £10.00 so far')).toBeTruthy();
    fireEvent.press(getByLabelText(/^Shop, /));
    expect(await findByText('Refunded so far: £50.00 of £100.00.')).toBeTruthy();
    expect(await findByText(/payment plan/)).toBeTruthy();
  });

  it('shows the plan line only for a day_one written link, not a running_cost one', async () => {
    mockRange.mockResolvedValue([tx({ id: 'p1' })]);
    mockLinkedRefunds.mockResolvedValue([]);
    mockWritten.mockResolvedValue([{ check_id: 'k1', target_id: 'p1', role: 'running_cost' }]);
    const a = await open(refund());
    await a.findByText('Shop');
    fireEvent.press(a.getByLabelText(/^Shop, /));
    await a.findByText(/Refunded so far|Link refund/);
    await waitFor(() => expect(mockWritten).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(a.queryByText(/payment plan/)).toBeNull();
  });

  it('shows the plan line for a day_one written link', async () => {
    mockRange.mockResolvedValue([tx({ id: 'p1' })]);
    mockLinkedRefunds.mockResolvedValue([]);
    mockWritten.mockResolvedValue([{ check_id: 'k1', target_id: 'p1', role: 'day_one' }]);
    const { findByText, getByLabelText } = await open(refund());
    await findByText('Shop');
    fireEvent.press(getByLabelText(/^Shop, /));
    expect(await findByText(/payment plan/)).toBeTruthy();
  });

  it('filters by payee, note and amount; empty shows the empty state; clear search resets', async () => {
    mockRange.mockResolvedValue([
      tx({ id: 'p1', name: 'Shop', original_amount: -12345 }),
      tx({ id: 'p2', name: 'Cafe', note: 'birthday cake', original_amount: -500 }),
    ]);
    const { findByText, getByLabelText, queryByText, getByRole } = await open(refund());
    await findByText('Cafe');
    fireEvent.changeText(getByLabelText('Search purchases'), 'birthday');
    await waitFor(() => expect(queryByText('Shop')).toBeNull());
    expect(queryByText('Cafe')).toBeTruthy();
    fireEvent.changeText(getByLabelText('Search purchases'), '123.45');
    await waitFor(() => expect(queryByText('Cafe')).toBeNull());
    expect(queryByText('Shop')).toBeTruthy();
    fireEvent.changeText(getByLabelText('Search purchases'), 'zzz');
    expect(await findByText('No purchases match')).toBeTruthy();
    expect(queryByText('Try a payee name or an amount.')).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'Clear search' }));
    expect(await findByText('Cafe')).toBeTruthy();
  });

  it('offers Remove link for a linked refund and unlinks with a toast', async () => {
    mockRange.mockResolvedValue([tx({ id: 'p1' })]);
    const { findByText, getByRole, onClose } = await open(refund({ refund_of: 'p1' }));
    await findByText('Shop');
    fireEvent.press(getByRole('button', { name: 'Remove link' }));
    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'activity.refund.toastUnlinked' }, stepId: 'step-2' });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps an older linked purchase in the list, selected, fetched by id', async () => {
    mockRange.mockResolvedValue([]);
    mockByIds.mockResolvedValue([tx({ id: 'old', name: 'Old Shop', local_date: '2024-01-05' })]);
    const { findByText, getByRole } = await open(refund({ refund_of: 'old' }));
    expect(await findByText('Old Shop')).toBeTruthy();
    expect(getByRole('radio', { checked: true })).toBeTruthy();
  });

  it('reverse direction: pick the refund for a purchase and link it', async () => {
    mockRange.mockResolvedValue([refund({ id: 'r1', original_amount: 10000 }), refund({ id: 'r2', refund_of: 'zz' })]);
    const { findByText, getByLabelText, getByRole } = await open(tx(), 'purchase->refund');
    expect(await findByText('Which payment was the refund?')).toBeTruthy();
    fireEvent.press(getByLabelText(/\+£100\.00$/));
    expect(await findByText(/This refunds the whole purchase/)).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'Link refund' }));
    expect((mockLink.mock.calls[0]?.[0] as TransactionRow).id).toBe('r1');
    expect((mockLink.mock.calls[0]?.[1] as TransactionRow).id).toBe('t1');
  });

  it('never renders more than 50 rows', async () => {
    mockRange.mockResolvedValue(Array.from({ length: 70 }, (_, i) => tx({ id: `p${i}`, name: `Shop ${i}` })));
    const { findAllByRole } = await open(refund());
    expect((await findAllByRole('radio')).length).toBeLessThanOrEqual(50);
  });
});
