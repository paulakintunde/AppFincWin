import { renderHook } from '@testing-library/react-native';
import type { ActivityRowView } from '@/data/queries/activity';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { useRowActions } from '../useRowActions';

const mockMarkPaid = jest.fn((): string | null => 'paid-step');
const mockMarkUnpaid = jest.fn((): string => 'unpaid-step');
const mockApply = jest.fn((): string => 'bulk-step');
const mockRemove = jest.fn((): string | null => 'del-step');
const mockRemoveTransfer = jest.fn((): string => 'tdel-step');
const mockEnd = jest.fn((): string => 'end-step');

jest.mock('@/data/mutations/transactions', () => ({
  useMarkPaid: () => ({ markPaid: mockMarkPaid }),
  useDeleteTransaction: () => ({ remove: mockRemove }),
}));
jest.mock('@/data/mutations/patches', () => ({
  useBulkMarkUnpaid: () => ({ markUnpaid: mockMarkUnpaid }),
  useBulkPatch: () => ({ apply: mockApply }),
}));
jest.mock('@/data/mutations/transfers', () => ({ useDeleteTransfer: () => ({ remove: mockRemoveTransfer }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({ useEndSeries: () => ({ end: mockEnd }) }));
jest.mock('@/data/queries/recurringSeries', () => ({
  useRecurringSeries: () => ({ data: [{ id: 's1', name: 'Rent', version: 3 }] }),
}));

function row(over: Partial<ActivityRowView>): ActivityRowView {
  return {
    id: 'r1',
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -1250,
    original_currency: 'GBP',
    local_date: '2026-08-31',
    name: 'Coffee',
    category_id: 'c1',
    payment_type: null,
    status: 'pending',
    transfer_id: null,
    recurring_series_id: null,
    is_refund: false,
    is_automatic: false,
    version: 1,
    counterpartAccountId: null,
    ...over,
  } as ActivityRowView;
}

async function setup(over: Partial<Parameters<typeof useRowActions>[0]> = {}) {
  return (await renderHook(() =>
    useRowActions({ householdId: 'h1', ownerId: 'u1', today: '2026-10-09', selectionActive: false, accountName: () => 'Savings', ...over })
  )).result;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
});

describe('useRowActions', () => {
  it('pay marks a pending line paid with an Undo toast', async () => {
    const r = await setup();
    r.current.pay(row({}));
    expect(mockMarkPaid).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'u1', '2026-10-09');
    expect(getToast()?.stepId).toBe('paid-step');
  });

  it('unpay sends a paid line back through the bulk unpaid path', async () => {
    const r = await setup();
    r.current.unpay(row({ status: 'paid' }));
    expect(mockMarkUnpaid).toHaveBeenCalledWith([expect.objectContaining({ id: 'r1' })], { householdId: 'h1', ownerId: 'u1' });
  });

  it('pay on a transfer patches both legs in one bulk step', async () => {
    const out = row({ id: 'o', transfer_id: 't1', counterpartAccountId: 'a2' });
    const inn = row({ id: 'i', transfer_id: 't1', original_amount: 1250, account_id: 'a2' });
    const r = await setup({ rows: [out, inn] });
    r.current.pay(out);
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalledTimes(1);
    const arg = (mockApply.mock.calls[0] as unknown as [{ items: { id: string; patch: unknown }[]; undo: { labelKey: string } }])[0];
    expect(arg.items.map((i) => i.id)).toEqual(['o', 'i']);
    expect(arg.items[0]!.patch).toEqual({ status: 'paid' });
    expect(arg.undo.labelKey).toBe('transferEdited');
  });

  it('a transfer without its partner loaded writes nothing', async () => {
    const out = row({ id: 'o', transfer_id: 't1' });
    const r = await setup({ rows: [out] });
    r.current.unpay({ ...out, status: 'paid' });
    expect(mockApply).not.toHaveBeenCalled();
    expect(getToast()?.kind).toBe('info');
  });

  it('remove deletes a plain line at once and prompts for series and transfers', async () => {
    const r = await setup();
    expect(r.current.remove(row({}))).toBeNull();
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(getToast()?.kind).toBe('destructive');
    expect(r.current.remove(row({ recurring_series_id: 's1' }))).toEqual({ prompt: 'scope' });
    expect(r.current.remove(row({ transfer_id: 't1' }))).toEqual({ prompt: 'transferDelete' });
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('this and future ends the series and deletes the row; this one only deletes', async () => {
    const r = await setup();
    const occ = row({ recurring_series_id: 's1' });
    r.current.deleteThisOne(occ);
    expect(mockEnd).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledTimes(1);
    r.current.deleteThisAndFuture(occ);
    expect(mockEnd).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', expectedVersion: 3, endDate: '2026-08-31' }));
    expect(mockRemove).toHaveBeenCalledTimes(2);
  });

  it('deleteTransfer removes the pair', async () => {
    const out = row({ id: 'o', transfer_id: 't1' });
    const inn = row({ id: 'i', transfer_id: 't1' });
    const r = await setup({ rows: [out, inn] });
    r.current.deleteTransfer(out);
    expect(mockRemoveTransfer).toHaveBeenCalledWith(out, { ownerId: 'u1', labelName: '' }, inn);
  });

  it('cloneMode dates today for the current month and clamps the day elsewhere', async () => {
    const r = await setup();
    const src = row({ local_date: '2026-08-31', original_amount: 500, is_refund: false });
    expect(r.current.cloneMode(src, '2026-10')).toMatchObject({ kind: 'new', direction: 'in', localDate: '2026-10-09' });
    expect(r.current.cloneMode(src, '2026-09')).toMatchObject({ localDate: '2026-09-30' });
    expect(r.current.cloneMode(row({ is_refund: true, original_amount: 500 }), '2026-09')).toMatchObject({ direction: 'out' });
  });

  it('is disabled during bulk selection', async () => {
    const r = await setup({ selectionActive: true });
    expect(r.current.enabled).toBe(false);
    r.current.pay(row({}));
    r.current.unpay(row({ status: 'paid' }));
    expect(r.current.remove(row({}))).toBeNull();
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(mockMarkUnpaid).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
