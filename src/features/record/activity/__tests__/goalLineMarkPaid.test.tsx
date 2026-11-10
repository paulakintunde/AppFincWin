// 06-34 (D-32 check, D-25, ARC-15): marking a goal's Expected line paid in Activity goes through the same
// confirm_goal_contribution path as Grow's Confirm, so the goal grows once. A plain status patch would flip the line to
// paid without writing the paired leg. Row button, swipe and the detail sheet all call rowActions.pay; bulk Mark paid
// leaves goal lines alone.
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ActivityRowView } from '@/data/queries/activity';
import { useBulkMarkPaid } from '@/data/mutations/patches';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { useRowActions } from '../useRowActions';

const mockMarkPaid = jest.fn((): string | null => 'paid-step');
const mockConfirm = jest.fn((): string => 'confirm-step');
const mockGoalToast = jest.fn();
const LISBON = { id: 'g1', name: 'Lisbon', currency: 'GBP', account_id: 'a2' };
let mockGoals: (typeof LISBON)[] | undefined = [LISBON];

jest.mock('@/data/mutations/transactions', () => ({
  useMarkPaid: () => ({ markPaid: mockMarkPaid }),
  useDeleteTransaction: () => ({ remove: jest.fn() }),
}));
jest.mock('@/data/mutations/growGoals', () => ({
  useConfirmGoalContribution: () => ({ confirm: mockConfirm }),
}));
jest.mock('@/features/grow/goals/useGoalToast', () => ({ useGoalToast: () => mockGoalToast }));
jest.mock('@/data/mutations/transfers', () => ({ useDeleteTransfer: () => ({ remove: jest.fn() }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({ useEndSeries: () => ({ end: jest.fn() }) }));
jest.mock('@/data/queries/recurringSeries', () => ({
  useRecurringSeries: () => ({ data: [{ id: 's1', name: 'Lisbon', version: 3, goal_id: 'g1' }] }),
}));
jest.mock('@/data/queries/decide', () => ({
  useSavingsGoals: () => ({ data: mockGoals }),
}));

function row(over: Partial<ActivityRowView>): ActivityRowView {
  return {
    id: 'r1',
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -5000,
    original_currency: 'GBP',
    local_date: '2026-11-10',
    name: 'Lisbon',
    category_id: null,
    payment_type: null,
    status: 'pending',
    transfer_id: null,
    recurring_series_id: 's1',
    goal_id: 'g1',
    is_refund: false,
    is_automatic: false,
    version: 1,
    counterpartAccountId: null,
    ...over,
  } as ActivityRowView;
}

const goalLine = row({});
const billLine = row({ id: 'b1', name: 'Phone', goal_id: null, recurring_series_id: null });

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

async function setup() {
  return (await renderHook(
    () => useRowActions({ householdId: 'h1', ownerId: 'u1', today: '2026-11-10', selectionActive: false }),
    { wrapper: makeWrapper(new QueryClient()) }
  )).result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGoals = [LISBON];
  resetToastForTests();
});

describe('goal Expected lines in Activity', () => {
  it('row Mark paid confirms once through confirm_goal_contribution and never patches status', async () => {
    const r = await setup();
    r.current.pay(goalLine);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith({
      ownerId: 'u1',
      line: expect.objectContaining({ id: 'r1', version: 1 }),
      goal: { id: 'g1', name: 'Lisbon', currency: 'GBP', account_id: 'a2' },
    });
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(mockGoalToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'confirm-step', undoLabel: 'goalContributionConfirmed' }));
  });

  it('swipe and the detail sheet use the same pay action, so the same single confirm', async () => {
    // ActivityScreen wires onSwipePay, onMarkPaid and the detail sheet's onStatus('paid') all to rowActions.pay.
    const r = await setup();
    r.current.pay(goalLine);
    r.current.pay(goalLine);
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });

  it('a plain bill line still uses markPaid', async () => {
    const r = await setup();
    r.current.pay(billLine);
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('bulk Mark paid with a goal line and a bill line patches only the bill line', async () => {
    const qc = new QueryClient();
    const { result } = await renderHook(() => useBulkMarkPaid(), { wrapper: makeWrapper(qc) });
    result.current.markPaid([goalLine, billLine], { householdId: 'h1', ownerId: 'u1' }, '2026-11-10');
    const vars = qc.getMutationCache().getAll().map((m) => m.state.variables as { items: { id: string }[] });
    const ids = vars.flatMap((v) => v.items.map((i) => i.id));
    expect(ids).toEqual(['b1']);
  });

  it.each([
    ['still loading', undefined],
    ['not in the loaded list', []],
  ])('06-37 a goal line whose goal is %s writes nothing and shows the not-ready hint', async (_label, goals) => {
    mockGoals = goals;
    const r = await setup();
    r.current.pay(goalLine);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(mockGoalToast).not.toHaveBeenCalled();
    expect(getToast()?.text).toEqual({ key: 'record.sheet.goalLineNotReady' });
  });
});
