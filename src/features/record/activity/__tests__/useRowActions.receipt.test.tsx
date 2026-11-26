// 10.1-23 (D-08, T-10.1-23-03): deleting a line that has receipts says "Its receipts are deleted too." in the confirmation; a
// plain line with receipts asks first (it would otherwise go at once); a line without receipts keeps the flow it had.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ActivityRowView } from '@/data/queries/activity';
import { resetToastForTests } from '@/state/undoToast';
import { useRowActions } from '../useRowActions';
import { useRowFlow } from '../useActivityViewModel';

const mockRemove = jest.fn((): string | null => 'del-step');
jest.mock('@/data/mutations/transactions', () => ({
  useMarkPaid: () => ({ markPaid: jest.fn() }),
  useDeleteTransaction: () => ({ remove: mockRemove }),
}));
jest.mock('@/data/mutations/patches', () => ({
  useBulkMarkUnpaid: () => ({ markUnpaid: jest.fn() }),
  useBulkPatch: () => ({ apply: jest.fn() }),
}));
jest.mock('@/data/mutations/growGoals', () => ({ useConfirmGoalContribution: () => ({ confirm: jest.fn() }) }));
jest.mock('@/features/grow/goals/useGoalToast', () => ({ useGoalToast: () => jest.fn() }));
jest.mock('@/data/queries/decide', () => ({ useSavingsGoals: () => ({ data: [] }) }));
jest.mock('@/data/mutations/transfers', () => ({ useDeleteTransfer: () => ({ remove: jest.fn() }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({ useEndSeries: () => ({ end: jest.fn() }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
let mockHas: boolean | null | Promise<boolean | null> = false;
const mockLineHasReceipts = jest.fn((..._a: unknown[]) => mockHas);
jest.mock('@/features/record/receipt/lineHasReceipts', () => ({ lineHasReceipts: (...a: unknown[]) => mockLineHasReceipts(...a) }));

const NOTE = 'Its receipts are deleted too.';

function row(over: Partial<ActivityRowView> = {}): ActivityRowView {
  return {
    id: 'r1',
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -1250,
    original_currency: 'GBP',
    local_date: '2026-08-31',
    name: 'Coffee',
    category_id: 'c1',
    status: 'paid',
    transfer_id: null,
    recurring_series_id: null,
    is_refund: false,
    version: 1,
    counterpartAccountId: null,
    ...over,
  } as ActivityRowView;
}

async function setup(receiptsOn = true) {
  return (
    await renderHook(() => {
      const actions = useRowActions({ householdId: 'h1', ownerId: 'u1', today: '2026-10-09', selectionActive: false, receiptsOn });
      return { actions, flow: useRowFlow(actions, '2026-08') };
    })
  ).result;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  mockHas = false;
});

describe('deleting a line with receipts (10.1-23)', () => {
  it('a plain line with receipts asks first and the prompt carries the note', async () => {
    mockHas = true;
    const r = await setup();
    await act(async () => r.current.flow.requestDelete(row()));
    expect(mockLineHasReceipts).toHaveBeenCalledWith(undefined, 'h1', 'r1');
    expect(mockRemove).not.toHaveBeenCalled();
    expect(r.current.flow.pendingDelete).toMatchObject({ prompt: 'lineDelete', note: NOTE });
    await act(async () => r.current.flow.answerDelete('one'));
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('asks the server when nothing is cached, then shows the note', async () => {
    mockHas = Promise.resolve(true);
    const r = await setup();
    await act(async () => r.current.flow.requestDelete(row()));
    await waitFor(() => expect(r.current.flow.pendingDelete).toMatchObject({ prompt: 'lineDelete', note: NOTE }));
  });

  it('a repeating line keeps its scope prompt and gains the note', async () => {
    mockHas = true;
    const r = await setup();
    await act(async () => r.current.flow.requestDelete(row({ recurring_series_id: 's1' })));
    expect(r.current.flow.pendingDelete).toMatchObject({ prompt: 'scope', note: NOTE });
  });

  it('a line without receipts goes at once with Undo, as before', async () => {
    const r = await setup();
    await act(async () => r.current.flow.requestDelete(row()));
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(r.current.flow.pendingDelete).toBeNull();
  });

  it('a repeating line without receipts shows the scope prompt unchanged', async () => {
    const r = await setup();
    await act(async () => r.current.flow.requestDelete(row({ recurring_series_id: 's1' })));
    expect(r.current.flow.pendingDelete).toMatchObject({ prompt: 'scope', note: null });
  });

  it('unknown (offline, nothing cached) leaves the flow as it was', async () => {
    mockHas = null;
    const r = await setup();
    await act(async () => r.current.flow.requestDelete(row()));
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('never checks below level 2 or for a transfer', async () => {
    const off = await setup(false);
    expect(off.current.actions.deleteNote?.(row())).toBeNull();
    const on = await setup(true);
    expect(on.current.actions.deleteNote?.(row({ transfer_id: 't1' }))).toBeNull();
    expect(mockLineHasReceipts).not.toHaveBeenCalled();
  });
});
