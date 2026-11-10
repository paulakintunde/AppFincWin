// 06.1-42: the Past decisions data hooks, tested from their new home in screens/past/data. The cases that render the
// old PastDecisionsScreen and DecisionDetailSheet stay in features/decide/past/__tests__/goalTagging.test.tsx until
// plan 36 deletes that folder; these cases need no old screen, so they outlive it.
import React, { type ReactNode } from 'react';
import { renderHook } from '@testing-library/react-native';
import type { DecideLinkRow } from '@/db/decideLinks';
import {
  GoalTagEditContext,
  useGoalTagEdit,
  type GoalTagEdit,
  type GoalTagEditVars,
  type GoalTagUndo,
} from '@/features/decide/screens/past/data/goalTagEdit';
import { writtenCount } from '@/features/decide/screens/past/data/useDeleteDecision';
import { localDateOf } from '@/features/decide/screens/past/data/usePastDecisions';
import * as oldGoalTagEdit from '@/features/decide/past/goalTagEdit';
import * as oldDelete from '@/features/decide/past/useDeleteDecision';
import * as oldPast from '@/features/decide/past/usePastDecisions';

jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({}) }));
jest.mock('@/data/queries/decide', () => ({}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [] }) }));
jest.mock('@/data/queries/fxConvert', () => ({ convertLatest: () => null }));
jest.mock('@/data/queries/homeAmount', () => ({ homeAmountFor: () => null }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useRemoveDecision: () => ({ remove: jest.fn() }),
  useReopenCheck: () => ({ reopen: jest.fn() }),
}));
jest.mock('@/features/decide/notifications/waitReminder', () => ({ cancelCheckReminders: () => Promise.resolve() }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

const vars: GoalTagEditVars = { id: 't1', householdId: 'h1', month: '2026-10', expectedVersion: 1, patch: { goal_id: 'g1' } };
const undo: GoalTagUndo = {
  stepId: 'step-1',
  ownerId: 't1',
  labelKey: 'transferTagged',
  labelParams: { name: 'Bike' },
  before: { goal_id: null },
};

function linkRow(id: string, over: Partial<DecideLinkRow> = {}): DecideLinkRow {
  return {
    id,
    household_id: 'h1',
    created_by: 'u1',
    check_id: 'c1',
    entity: 'transactions',
    target_id: `t-${id}`,
    source: 'written',
    role: null,
    deleted_at: null,
    version: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

describe('goal tag edit context', () => {
  it('does nothing and records no undo step when no provider supplies the edit', async () => {
    const { result } = await renderHook(() => useGoalTagEdit());
    expect(result.current(vars, undo)).toBe(false);
  });

  it('hands the provided edit to the reader, with its vars and undo step', async () => {
    const edit = jest.fn<boolean, Parameters<GoalTagEdit>>(() => true);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <GoalTagEditContext.Provider value={edit}>{children}</GoalTagEditContext.Provider>
    );
    const { result } = await renderHook(() => useGoalTagEdit(), { wrapper });
    expect(result.current(vars, undo)).toBe(true);
    expect(edit).toHaveBeenCalledWith(vars, undo);
  });
});

describe('past decisions helpers', () => {
  it('counts only the live lines Go ahead wrote', () => {
    const links = [
      linkRow('a'),
      linkRow('b', { source: 'attached' }),
      linkRow('c', { deleted_at: '2026-10-02T00:00:00Z' }),
      linkRow('d'),
    ];
    expect(writtenCount(links)).toBe(2);
    expect(writtenCount(undefined)).toBe(0);
  });

  it('reads the decided date in the app time zone, not UTC', () => {
    expect(localDateOf('2026-10-15T02:00:00Z', 'America/Los_Angeles')).toBe('2026-10-14');
    expect(localDateOf('2026-10-15T02:00:00Z', 'Europe/London')).toBe('2026-10-15');
  });
});

describe('old paths (06.1-07 shims until plan 36)', () => {
  it('re-export the same modules', () => {
    expect(oldGoalTagEdit.GoalTagEditContext).toBe(GoalTagEditContext);
    expect(oldDelete.writtenCount).toBe(writtenCount);
    expect(oldPast.localDateOf).toBe(localDateOf);
  });
});
