/**
 * Plan 05.2-32: the host registers real actions for the setup steps' editor buttons, so none is a silent no-op.
 */
import { renderHook, act } from '@testing-library/react-native';
import type { TransactionRow } from '@/db/rows';
import { setupSheetActions } from '@/features/decide/setup/steps/setupSheetHost';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { pickEditRow, useSetupSheetHost } from '../SetupSheetHost';

const mockOpenEntry = jest.fn();
const mockPush = jest.fn();
const mockFetch = jest.fn();
const mockOpenDebtSheet = jest.fn();

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ householdId: 'h1', today: '2026-10-15' }) }));
jest.mock('@/features/record/entry/entryHost', () => ({ openEntry: (m: unknown) => mockOpenEntry(m) }));
jest.mock('@/features/decide/setup/debtSheetHost', () => ({ openDebtSheet: (r: unknown) => mockOpenDebtSheet(r) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
jest.mock('@/db/transactions', () => ({ fetchTransactionsInRange: (...a: unknown[]) => mockFetch(...a) }));

const row = (over: Partial<TransactionRow>): TransactionRow => ({ id: 'r', recurring_series_id: null, local_date: '2026-09-01', status: 'paid', ...over }) as TransactionRow;

beforeEach(() => {
  [mockOpenEntry, mockPush, mockFetch, mockOpenDebtSheet].forEach((m) => m.mockReset());
  resetToastForTests();
});

describe('pickEditRow', () => {
  const rows = [
    row({ id: 'a', recurring_series_id: 's1', local_date: '2026-08-05' }),
    row({ id: 'b', recurring_series_id: 's1', local_date: '2026-09-05' }),
    row({ id: 'c', recurring_series_id: 's1', local_date: '2026-10-20', status: 'pending' }),
    row({ id: 'd', recurring_series_id: 's2', local_date: '2026-10-21', status: 'pending' }),
  ];
  it('opens a series on its next pending occurrence, else its latest', () => {
    expect(pickEditRow(rows, { seriesId: 's1' }, '2026-10-15')?.id).toBe('c');
    expect(pickEditRow(rows.slice(0, 2), { seriesId: 's1' }, '2026-10-15')?.id).toBe('b');
    expect(pickEditRow(rows, { seriesId: 'nope' }, '2026-10-15')).toBeNull();
  });
  it('opens a found payment on its latest row', () => {
    expect(pickEditRow(rows, { rowIds: ['a', 'b'] }, '2026-10-15')?.id).toBe('b');
  });
});

describe('useSetupSheetHost', () => {
  it('Add a regular payment opens a new expense in the entry sheet', async () => {
    await renderHook(() => useSetupSheetHost());
    setupSheetActions().addRegular('rent');
    expect(mockOpenEntry).toHaveBeenCalledWith({ kind: 'new', direction: 'out' });
  });

  it('Edit on a confirmed series opens the entry sheet on the series row', async () => {
    mockFetch.mockResolvedValue([row({ id: 'c', recurring_series_id: 's1', local_date: '2026-10-20', status: 'pending' })]);
    await renderHook(() => useSetupSheetHost());
    await act(async () => {
      setupSheetActions().editRegular({ series: { id: 's1' } as never });
    });
    expect(mockOpenEntry).toHaveBeenCalledWith({ kind: 'edit', row: expect.objectContaining({ id: 'c' }) });
  });

  it('Edit on a found payment opens its latest row; a missing row says so instead of doing nothing', async () => {
    mockFetch.mockResolvedValue([row({ id: 'x' })]);
    await renderHook(() => useSetupSheetHost());
    await act(async () => {
      setupSheetActions().editRegular({ candidate: { rowIds: ['x'] } as never });
    });
    expect(mockOpenEntry).toHaveBeenCalledWith({ kind: 'edit', row: expect.objectContaining({ id: 'x' }) });
    mockOpenEntry.mockClear();
    await act(async () => {
      setupSheetActions().editRegular({ candidate: { rowIds: ['gone'] } as never });
    });
    expect(mockOpenEntry).not.toHaveBeenCalled();
    expect(getToast()?.text?.key).toBe('decide.setup.shell.editorUnavailable');
  });

  it('Set them opens the account-use step on its own', async () => {
    await renderHook(() => useSetupSheetHost());
    setupSheetActions().editAccountUse();
    expect(mockPush).toHaveBeenCalledWith('/decide/setup?only=accountUse');
  });

  it('loan Edit and Add open the loan and card sheet, not the editor-unavailable toast', async () => {
    await renderHook(() => useSetupSheetHost());
    const debt = { id: 'd1', name: 'Visa' } as never;
    setupSheetActions().editDebt(debt);
    expect(mockOpenDebtSheet).toHaveBeenLastCalledWith({ mode: 'edit', debt });
    setupSheetActions().addDebt('card');
    expect(mockOpenDebtSheet).toHaveBeenLastCalledWith({ mode: 'add', kind: 'card' });
    expect(getToast()).toBeNull();
  });

  it('removes its actions on unmount', async () => {
    const { unmount } = await renderHook(() => useSetupSheetHost());
    await unmount();
    setupSheetActions().addRegular('rent');
    expect(mockOpenEntry).not.toHaveBeenCalled();
  });
});
