// 06.1-12 (D-14, D-28): the first-answer safety-net question writes through Grow's hooks and the setup write.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { queryKeys } from '@/data/keys';
import { useSafetyNetAnswer } from '../safetyNetAnswer';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

const mockSave = jest.fn((_a: unknown) => ({ id: 'new-net', stepId: 'step-new' }));
const mockEdit = jest.fn((..._a: unknown[]) => 'step-edit');
const mockSet = jest.fn((a: { flag: string; on: boolean; noUndo?: boolean }): { stepId: string } | null =>
  a.on ? { stepId: 'step-flag' } : null
);
jest.mock('../growGoals', () => ({
  useSaveGoalPlan: () => ({ save: mockSave }),
  useEditGoal: () => ({ edit: mockEdit, remove: jest.fn() }),
}));
jest.mock('../decideSetup', () => ({ useSetDecideAnswered: () => ({ set: mockSet }) }));

const net = (over: Partial<SavingsGoalRow> = {}): SavingsGoalRow =>
  ({ id: 'net1', household_id: 'hh1', name: 'Safety net', currency: 'USD', target: 100, is_safety_net: true, deleted_at: null, version: 2, ...over }) as SavingsGoalRow;

function setup(goals: SavingsGoalRow[] | undefined) {
  const qc = new QueryClient();
  if (goals !== undefined) qc.setQueryData(queryKeys.savingsGoals('u1', 'hh1'), goals);
  return renderHook(() => useSafetyNetAnswer('u1', 'hh1'), {
    wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
}

beforeEach(() => jest.clearAllMocks());

describe('useSafetyNetAnswer', () => {
  it('an amount with no net makes the flagged, locked, protected goal in Grow and clears the not-set flag without its own undo', async () => {
    const { result } = await setup([]);
    const out = result.current.answer({ kind: 'amount', amount: 230000, currency: 'USD', name: 'Safety net' });
    expect(out).toEqual({ status: 'created', stepId: 'step-new' });
    const arg = mockSave.mock.calls[0]![0] as { fields: Record<string, unknown>; series: unknown };
    expect(arg.fields).toMatchObject({ is_safety_net: true, locked: true, protect: true, target: 230000, currency: 'USD', opening_saved: 0 });
    expect(arg.series).toBeNull();
    expect(mockSet).toHaveBeenCalledWith({ flag: 'net_not_set', on: false, noUndo: true });
  });

  it('an amount with a net in the same currency sets its size only', async () => {
    const goal = net();
    const { result } = await setup([goal, net({ id: 'old', is_safety_net: false })]);
    const out = result.current.answer({ kind: 'amount', amount: 500, currency: 'USD', name: 'x', saved: 40 });
    expect(out).toEqual({ status: 'sized', stepId: 'step-edit' });
    expect(mockEdit).toHaveBeenCalledWith(goal, { target: 500 }, 'u1', 40);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('a deleted net does not count: a new one is made', async () => {
    const { result } = await setup([net({ deleted_at: '2026-01-01T00:00:00Z' })]);
    expect(result.current.answer({ kind: 'amount', amount: 5, currency: 'USD', name: 'x' }).status).toBe('created');
  });

  it('a net in another currency changes nothing and says so', async () => {
    const { result } = await setup([net({ currency: 'EUR' })]);
    expect(result.current.answer({ kind: 'amount', amount: 5, currency: 'USD', name: 'x' })).toEqual({ status: 'other_currency' });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('Not set yet creates nothing and sets the D-23 flag', async () => {
    const { result } = await setup([]);
    expect(result.current.answer({ kind: 'not_set' })).toEqual({ status: 'not_set', stepId: 'step-flag' });
    expect(mockSet).toHaveBeenCalledWith({ flag: 'net_not_set', on: true });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('Not set yet when already set returns a null step', async () => {
    mockSet.mockReturnValueOnce(null);
    const { result } = await setup([]);
    expect(result.current.answer({ kind: 'not_set' })).toEqual({ status: 'not_set', stepId: null });
  });

  it('no goals read yet is treated as no net', async () => {
    const { result } = await setup(undefined);
    expect(result.current.answer({ kind: 'amount', amount: 5, currency: 'USD', name: 'x' }).status).toBe('created');
  });
});
