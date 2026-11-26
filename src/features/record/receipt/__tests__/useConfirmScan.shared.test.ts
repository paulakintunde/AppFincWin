// 10.1-26 (SCN-06, SCN-07; D-14..D-17): confirming the review on a shared line. With "Split items between people" on, the
// items, people and extras go through the split-by-item mutation with the line's version; "Split saved" offers Undo through
// restore_line_split; a version conflict names who changed the line and keeps the draft. With it off, only the parts are set.
import { act, renderHook } from '@testing-library/react-native';
import type { ParsedReceipt } from '@/engine/receipt';
import type { TransactionRow } from '@/db/rows';
import { VersionConflictError } from '@/db/errors';
import { fromParsed, setByItem, togglePerson, withMembers, type ReviewDraft } from '../scanModel';
import { useConfirmScan } from '../useConfirmScan';

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'me', homeCurrency: 'USD', today: '2026-11-26', timeZone: 'UTC', showCents: true }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', currency: 'USD', archived_at: null }] }) }));
const mockAdd = jest.fn((_i: unknown) => 'new-id');
const mockEdit = jest.fn();
jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: mockAdd }),
  useEditTransaction: () => ({ edit: mockEdit }),
}));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
const mockSave = jest.fn();
const mockRemove = jest.fn();
jest.mock('@/features/record/split/useSaveSplit', () => ({
  useSaveSplit: () => ({ save: mockSave, remove: mockRemove, pending: false, conflict: null }),
}));
type Handlers = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void };
const mockSplitMutate = jest.fn((_v: unknown, _h: Handlers) => undefined);
const mockRestoreMutate = jest.fn();
jest.mock('@/data/mutations/itemSplit', () => ({
  ...jest.requireActual('@/data/mutations/itemSplit'),
  useSetSplitByItem: () => ({ mutate: mockSplitMutate, isPaused: false }),
  useRestoreLineSplit: () => ({ mutate: mockRestoreMutate }),
}));
jest.mock('@/features/household/useMemberLabel', () => ({
  useMemberLabel: () => (id: string | null) => (id === 'B' ? 'Sam' : 'Someone'),
}));
jest.mock('@/services/receipts/outbox', () => ({ enqueueReceipt: jest.fn(), drainOutbox: jest.fn(async () => ({})) }));
const mockToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/state/justSaved', () => ({ markJustSaved: jest.fn() }));

const MEMBERS = [
  { id: 'A', name: 'Alex' },
  { id: 'B', name: 'Sam' },
];
const receipt: ParsedReceipt = {
  store: { value: 'Corner Market', unsure: false },
  date: { value: '2026-11-20', unsure: false },
  total: { value: 2420, unsure: false },
  items: [
    { key: 'a', name: 'Bread', price: 1000, discount: 0, unsure: false, frame: null },
    { key: 'b', name: 'Soap', price: 500, discount: 0, unsure: false, frame: null },
    { key: 'c', name: 'Milk', price: 700, discount: 0, unsure: false, frame: null },
  ],
  extras: [{ key: 't', kind: 'tax', name: 'Tax', amount: 220, unsure: false, frame: null }],
  currency: 'USD',
};
const suggest = (name: string) => ({ categoryId: name === 'Soap' ? 'household' : 'groceries', source: 'item' });

const line = (over: Partial<TransactionRow> = {}): TransactionRow =>
  ({
    id: 'tx1',
    household_id: 'h',
    original_amount: -2420,
    original_currency: 'USD',
    category_id: 'shopping',
    local_date: '2026-11-20',
    version: 3,
    category_parts: null,
    is_shared: true,
    ...over,
  }) as TransactionRow;

function draft(l: TransactionRow, shared = true): ReviewDraft {
  const d = fromParsed({ readable: true, receipt }, { mode: 'existing', images: [], suggest, lineTotal: l.original_amount, lineCategoryId: l.category_id });
  if (!shared) return d;
  let s = withMembers(d, MEMBERS, ['A', 'B']);
  s = togglePerson(s, s.items[0]!.key, 'B'); // Bread: Alex only
  s = togglePerson(s, s.items[2]!.key, 'A'); // Milk: Sam only
  return s;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useConfirmScan, shared line split by item', () => {
  it('sends the items with their people, the extras and the parts at the line version; success shows Split saved with Undo', async () => {
    const l = line();
    const { result } = await renderHook(() => useConfirmScan({ mode: 'existing', line: l, householdId: 'h' }));
    let pending: Promise<unknown> | undefined;
    await act(async () => {
      pending = result.current.confirm(draft(l));
    });
    expect(mockSplitMutate).toHaveBeenCalledTimes(1);
    const [vars, handlers] = mockSplitMutate.mock.calls[0]!;
    expect(vars).toEqual({
      householdId: 'h',
      month: '2026-11',
      id: 'tx1',
      expectedVersion: 3,
      items: [
        { name: 'Bread', price: 1000, discount: 0, c: 'groceries', people: ['A'] },
        { name: 'Soap', price: 500, discount: 0, c: 'household', people: ['A', 'B'] },
        { name: 'Milk', price: 700, discount: 0, c: 'groceries', people: ['B'] },
      ],
      extras: { tax: 220, tip: 0, discounts: 0 },
      parts: [
        { categoryId: 'groceries', amount: -1700 },
        { categoryId: 'household', amount: -500 },
        { categoryId: 'shopping', amount: -220, label: 'taxTip' },
      ],
      category: null,
      store: 'Corner Market',
      date: '2026-11-20',
    });
    expect(vars).not.toHaveProperty('shares'); // T-10.1-26-01: shares are never sent

    const before = { split: { rule: 'even', participants: ['A', 'B'], shares: { A: 1210, B: 1210 } }, rule: 'even', manual: false, parts: null, category_id: 'shopping', item_split: null };
    let res: unknown;
    await act(async () => {
      handlers.onSuccess!({ version: 4, before, shares: { A: 1375, B: 1045 } });
      res = await pending;
    });
    expect(res).toEqual({ ok: true, lineId: 'tx1' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ordinary', text: { key: 'scan.byItem.saved' } }));
    const toast = mockToast.mock.calls[0]![0] as { onUndo: () => void };
    toast.onUndo();
    expect(mockRestoreMutate).toHaveBeenCalledWith({ householdId: 'h', month: '2026-11', id: 'tx1', expectedVersion: 4, before });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('a version conflict names who changed the line and keeps the draft', async () => {
    const l = line();
    const { result } = await renderHook(() => useConfirmScan({ mode: 'existing', line: l, householdId: 'h' }));
    const d = draft(l);
    const snapshot = JSON.stringify(d);
    let pending: Promise<unknown> | undefined;
    await act(async () => {
      pending = result.current.confirm(d);
    });
    let res: unknown;
    await act(async () => {
      mockSplitMutate.mock.calls[0]![1].onError!(new VersionConflictError('transactions', 'tx1', { version: 5, updated_by: 'B' }));
      res = await pending;
    });
    expect(res).toEqual({ ok: false, reason: 'version_conflict', updatedBy: 'B' });
    expect(result.current.conflict).toBe('Sam changed this line. Review and save again.');
    expect(JSON.stringify(d)).toBe(snapshot);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('with the toggle off on a shared line, only the parts are set (the 10.1-24 path)', async () => {
    const l = line();
    const { result } = await renderHook(() => useConfirmScan({ mode: 'existing', line: l, householdId: 'h' }));
    mockSave.mockImplementation((_p: unknown, h: { onDone: () => void }) => h.onDone());
    let res: unknown;
    await act(async () => {
      res = await result.current.confirm(setByItem(draft(l), false));
    });
    expect(res).toEqual({ ok: true, lineId: 'tx1' });
    expect(mockSplitMutate).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('a private line never sends people', async () => {
    const l = line({ is_shared: false });
    const { result } = await renderHook(() => useConfirmScan({ mode: 'existing', line: l, householdId: 'h' }));
    mockSave.mockImplementation((_p: unknown, h: { onDone: () => void }) => h.onDone());
    const d = draft(l, false);
    expect(d.items.every((i) => i.people === null)).toBe(true);
    await act(async () => {
      await result.current.confirm(d);
    });
    expect(mockSplitMutate).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('a draft with people on a line that is no longer shared falls back to the parts path', async () => {
    const l = line({ is_shared: false });
    const { result } = await renderHook(() => useConfirmScan({ mode: 'existing', line: l, householdId: 'h' }));
    mockSave.mockImplementation((_p: unknown, h: { onDone: () => void }) => h.onDone());
    await act(async () => {
      await result.current.confirm(draft(l));
    });
    expect(mockSplitMutate).not.toHaveBeenCalled();
  });

  it('any other refusal resolves with its reason', async () => {
    const l = line();
    const { result } = await renderHook(() => useConfirmScan({ mode: 'existing', line: l, householdId: 'h' }));
    let pending: Promise<unknown> | undefined;
    await act(async () => {
      pending = result.current.confirm(draft(l));
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HouseholdRejectedError } = require('@/data/mutations/householdSharing') as typeof import('@/data/mutations/householdSharing');
    let res: unknown;
    await act(async () => {
      mockSplitMutate.mock.calls[0]![1].onError!(new HouseholdRejectedError('items_not_total', { diff: 20 }));
      res = await pending;
    });
    expect(res).toEqual({ ok: false, reason: 'items_not_total' });
  });
});
