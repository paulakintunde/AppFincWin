// 10.1-24 (SCN-03, SCN-05; D-13, D-20): the only writes of the scan flow, made on confirm.
import { act, renderHook } from '@testing-library/react-native';
import type { ParsedReceipt } from '@/engine/receipt';
import type { TransactionRow } from '@/db/rows';
import { applyItemsTotal, fromParsed, type ReviewDraft } from '../scanModel';
import { toLocalFile, useConfirmScan } from '../useConfirmScan';

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'me', homeCurrency: 'USD', today: '2026-11-26', timeZone: 'UTC', showCents: true }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({ data: [{ id: 'old', currency: 'EUR', archived_at: '2026-01-01' }, { id: 'a1', currency: 'USD', archived_at: null }] }),
}));
const mockAdd = jest.fn((_i: unknown) => 'new-id');
const mockEdit = jest.fn();
jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: mockAdd }),
  useEditTransaction: () => ({ edit: mockEdit }),
}));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
const mockSave = jest.fn();
const mockRemove = jest.fn();
let mockConflict: string | null = null;
jest.mock('@/features/record/split/useSaveSplit', () => ({
  useSaveSplit: () => ({ save: mockSave, remove: mockRemove, pending: false, conflict: mockConflict }),
}));
const mockEnqueue = jest.fn(async (_i: unknown) => ({ ok: true, items: [] }));
const mockDrain = jest.fn(async () => ({}));
jest.mock('@/services/receipts/outbox', () => ({
  enqueueReceipt: (i: unknown) => mockEnqueue(i),
  drainOutbox: () => mockDrain(),
}));
const mockToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/state/justSaved', () => ({ markJustSaved: jest.fn() }));

const receipt = (over: Partial<ParsedReceipt> = {}): ParsedReceipt => ({
  store: { value: 'Corner Market', unsure: false },
  date: { value: '2026-11-20', unsure: false },
  total: { value: 1620, unsure: false },
  items: [
    { key: 'a', name: 'Bread', price: 1000, discount: 0, unsure: false, frame: null },
    { key: 'b', name: 'Soap', price: 500, discount: 0, unsure: false, frame: null },
  ],
  extras: [{ key: 't', kind: 'tax', name: 'Tax', amount: 120, unsure: false, frame: null }],
  currency: 'USD',
  ...over,
});
const suggest = (name: string) => ({ categoryId: name === 'Bread' ? 'groceries' : 'household', source: 'item' });
const images = [
  { uri: 'file:///p1.jpg', mime: 'image/jpeg' },
  { uri: 'file:///p2.jpg', mime: 'image/jpeg' },
];

function draft(mode: 'new' | 'existing', r: ParsedReceipt = receipt(), line?: TransactionRow, imgs = images): ReviewDraft {
  return fromParsed({ readable: true, receipt: r }, { mode, images: imgs, suggest, lineTotal: line?.original_amount, lineCategoryId: line?.category_id ?? null });
}

const line = (over: Partial<TransactionRow> = {}): TransactionRow =>
  ({ id: 'tx1', household_id: 'h', original_amount: -1620, original_currency: 'USD', category_id: 'shopping', local_date: '2026-11-20', version: 3, category_parts: null, ...over }) as TransactionRow;

beforeEach(() => {
  jest.clearAllMocks();
  mockConflict = null;
});

describe('useConfirmScan, new line', () => {
  it('inserts one line with its parts and queues the pages as one scan receipt', async () => {
    const { result } = await renderHook(() => useConfirmScan({ mode: 'new', householdId: 'h' }));
    let res: unknown;
    await act(async () => {
      res = await result.current.confirm(draft('new'));
    });
    expect(res).toEqual({ ok: true, lineId: 'new-id' });
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0]![0]).toMatchObject({
      householdId: 'h',
      accountId: 'a1',
      amount: -1620,
      currency: 'USD',
      localDate: '2026-11-20',
      name: 'Corner Market',
      categoryId: 'groceries',
      categoryParts: [
        { c: 'groceries', a: -1000 },
        { c: 'household', a: -500 },
        { c: 'groceries', a: -120, l: 'taxTip' },
      ],
      undo: { stepId: 'step-1', labelKey: 'added', labelParams: { name: 'Corner Market' } },
    });
    expect(mockEnqueue).toHaveBeenCalledWith({
      transactionId: 'new-id',
      kind: 'scan',
      files: [
        { uri: 'file:///p1.jpg', mime: 'image/jpeg', ext: 'jpg', bytes: 0, width: null, height: null },
        { uri: 'file:///p2.jpg', mime: 'image/jpeg', ext: 'jpg', bytes: 0, width: null, height: null },
      ],
    });
    expect(mockDrain).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ordinary', stepId: 'step-1' }));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('one photo, no store, no date, one category: default name, today, a photo receipt and no parts', async () => {
    const { result } = await renderHook(() => useConfirmScan({ mode: 'new', householdId: 'h' }));
    const r = receipt({
      store: { value: null, unsure: true },
      date: { value: null, unsure: true },
      items: [{ key: 'a', name: 'Bread', price: 1000, discount: 0, unsure: false, frame: null }],
      extras: [],
      total: { value: 1000, unsure: false },
    });
    await act(async () => {
      await result.current.confirm(draft('new', r, undefined, [images[0]!]));
    });
    expect(mockAdd.mock.calls[0]![0]).toMatchObject({ name: 'Receipt', localDate: '2026-11-26', categoryId: 'groceries', categoryParts: null, amount: -1000 });
    expect(mockEnqueue.mock.calls[0]![0]).toMatchObject({ kind: 'photo' });
  });

  it('writes nothing when the review is not complete', async () => {
    const { result } = await renderHook(() => useConfirmScan({ mode: 'new', householdId: 'h' }));
    let res: unknown;
    await act(async () => {
      res = await result.current.confirm(draft('new', receipt({ total: { value: 1700, unsure: false } })));
    });
    expect(res).toEqual({ ok: false, reason: 'mismatch' });
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('keeps the line when the receipt copy fails', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('disk'));
    const { result } = await renderHook(() => useConfirmScan({ mode: 'new', householdId: 'h' }));
    let res: unknown;
    await act(async () => {
      res = await result.current.confirm(draft('new'));
    });
    expect(res).toEqual({ ok: true, lineId: 'new-id' });
  });
});

describe('useConfirmScan, existing line', () => {
  it('sets the parts and never changes the total', async () => {
    const l = line();
    mockSave.mockImplementation((_p, h: { onDone(): void }) => h.onDone());
    const { result } = await renderHook(() => useConfirmScan({ mode: 'existing', line: l, householdId: 'h' }));
    let res: unknown;
    await act(async () => {
      res = await result.current.confirm(draft('existing', receipt(), l));
    });
    expect(res).toEqual({ ok: true, lineId: 'tx1' });
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockSave.mock.calls[0]![0]).toEqual([
      { categoryId: 'groceries', amount: -1000 },
      { categoryId: 'household', amount: -500 },
      { categoryId: 'shopping', amount: -120, label: 'taxTip' },
    ]);
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('Use the items total changes the amount first, then sets the parts', async () => {
    const l = line({ original_amount: -1700 });
    mockSave.mockImplementation((_p, h: { onDone(): void }) => h.onDone());
    const { result } = await renderHook(() => useConfirmScan({ mode: 'existing', line: l, householdId: 'h' }));
    await act(async () => {
      await result.current.confirm(applyItemsTotal(draft('existing', receipt(), l)));
    });
    expect(mockEdit).toHaveBeenCalledWith({ id: 'tx1', householdId: 'h', month: '2026-11', expectedVersion: 3, patch: { original_amount: -1620 } });
    expect(mockEdit.mock.invocationCallOrder[0]!).toBeLessThan(mockSave.mock.invocationCallOrder[0]!);
  });

  it('one category on a split line removes the split, on a plain line sets the category', async () => {
    const r = receipt({ items: [{ key: 'a', name: 'Bread', price: 1620, discount: 0, unsure: false, frame: null }], extras: [] });
    const split = line({ category_parts: [{ c: 'x', a: -820 }, { c: 'y', a: -800 }] });
    mockRemove.mockImplementation((_k, h: { onDone(): void }) => h.onDone());
    const a = await renderHook(() => useConfirmScan({ mode: 'existing', line: split, householdId: 'h' }));
    await act(async () => {
      await a.result.current.confirm(draft('existing', r, split));
    });
    expect(mockRemove).toHaveBeenCalledWith('groceries', expect.anything());

    const plain = line();
    const b = await renderHook(() => useConfirmScan({ mode: 'existing', line: plain, householdId: 'h' }));
    let res: unknown;
    await act(async () => {
      res = await b.result.current.confirm(draft('existing', r, plain));
    });
    expect(res).toEqual({ ok: true, lineId: 'tx1' });
    expect(mockEdit).toHaveBeenCalledWith(expect.objectContaining({ patch: { category_id: 'groceries' } }));
  });

  it('a version conflict ends the wait without success', async () => {
    const l = line();
    mockSave.mockImplementation(() => undefined); // the save never reports done
    const hook = await renderHook(() => useConfirmScan({ mode: 'existing', line: l, householdId: 'h' }));
    let res: unknown;
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = hook.result.current.confirm(draft('existing', receipt(), l));
    });
    mockConflict = 'Sam changed this line. Review and save again.';
    await act(async () => {
      await hook.rerender({});
    });
    res = await pending;
    expect(res).toEqual({ ok: false, reason: 'conflict' });
  });
});

describe('toLocalFile', () => {
  it('keeps a picked file as it is and completes a bare one', () => {
    const picked = { uri: 'u', mime: 'image/png', ext: 'png' as const, bytes: 99, width: 1, height: 2 };
    expect(toLocalFile(picked)).toEqual(picked);
    expect(toLocalFile({ uri: 'p', mime: 'application/pdf' })).toMatchObject({ ext: 'pdf', bytes: 0 });
    expect(toLocalFile({ uri: 'x', mime: 'text/plain' })).toMatchObject({ mime: 'image/jpeg', ext: 'jpg' });
  });
});
