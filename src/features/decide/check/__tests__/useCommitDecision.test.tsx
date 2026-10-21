import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import type { CheckComputation, CheckInputs } from '../../snapshot/types';
import { TODAY, loggedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { CommitMutationsContext, type CommitMutations } from '../commitMutations';
import { useCommitDecision, type CommitArgs } from '../useCommitDecision';

jest.mock('@/ui/haptics', () => ({ hapticMedium: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/i18n', () => ({ useT: () => (key: string) => key }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', timeZone: 'UTC' }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ builtinIds: new Map([['Debt', 'cat-debt']]), transferCategoryId: 'cat-transfer' }),
}));

const mockGoAhead = jest.fn(() => 'step-1');
const mockPass = jest.fn();
const mockWaitAndSave = jest.fn(() => Promise.resolve({ reminder: 'none' as const }));
const mutations: CommitMutations = { goAhead: mockGoAhead, canWrite: () => true, waitAndSave: mockWaitAndSave, pass: mockPass };

const fmt = { formatMoney: () => '', formatDate: (d: string) => d, locale: 'en-US' } as unknown as CommitArgs['whole'];
const row = { id: 'c1', household_id: 'h1', created_by: 'u1', name: 'Sofa', inputs: {}, status: 'open', version: 1 } as unknown as DecideCheckRow;
const computation = {
  status: 'logged',
  verdict: { state: 'fits', size: 'from_cash', plan: {}, mineDayOne: 1, mineMonthly: 0, mineRunning: 0, newMonthly: 0 },
  running: null,
  methodPlans: {},
  waitPlan: { monthlyAmount: 1_000, readyBy: '2027-01-01', target: 10_000 },
} as unknown as CheckComputation;

async function render(over: Partial<CheckInputs> = {}) {
  const onDone = jest.fn();
  const args: CommitArgs = {
    row,
    inputs: { ...emptyCheckInputs('buy', TODAY), advertised: 1_000, method: 'cash', goAccountId: 'a1', ...over },
    computation,
    source: loggedSource(),
    whole: fmt,
    exact: fmt,
    cashAccounts: [{ id: 'a1', name: 'Everyday', balance: 100 }],
    investAccounts: [],
    onDone,
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CommitMutationsContext.Provider value={mutations}>{children}</CommitMutationsContext.Provider>
  );
  const hook = await renderHook((p: Partial<CommitArgs>) => useCommitDecision({ ...args, ...p }), { wrapper, initialProps: {} });
  return { onDone, args, ...hook };
}

beforeEach(() => jest.clearAllMocks());

describe('useCommitDecision in-flight latch (CR-C07)', () => {
  it('two confirms in one frame write Go ahead once', async () => {
    const { result, onDone } = await render();
    await act(async () => result.current.requestCommit('go'));
    expect(result.current.confirm.visible).toBe(true);
    const confirm = result.current.confirm.onConfirm;
    await act(async () => {
      confirm();
      confirm();
    });
    expect(mockGoAhead).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.committing).toBe(true);
  });

  it('two Pass taps in one frame record once, and nothing commits after', async () => {
    const { result, onDone } = await render();
    const commit = result.current.requestCommit;
    await act(async () => {
      commit('pass');
      commit('pass');
      commit('wait');
    });
    expect(mockPass).toHaveBeenCalledTimes(1);
    expect(mockWaitAndSave).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => result.current.requestCommit('go'));
    expect(result.current.confirm.visible).toBe(false);
  });

  it('two Wait taps in one frame save once', async () => {
    const { result, onDone } = await render();
    const commit = result.current.requestCommit;
    await act(async () => {
      commit('wait');
      commit('wait');
    });
    expect(mockWaitAndSave).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('useCommitDecision refusals (WR-C10)', () => {
  it('a confirm after Go ahead became unavailable says why and writes nothing', async () => {
    const { showToast } = jest.requireMock('@/state/undoToast') as { showToast: jest.Mock };
    const { result, rerender, onDone } = await render();
    await act(async () => result.current.requestCommit('go'));
    await rerender({ cashAccounts: [] });
    await act(async () => result.current.confirm.onConfirm());
    expect(mockGoAhead).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.decision.goNeedsAccount' } });
  });

  it('a failing Wait save still toasts that it was saved', async () => {
    const { showToast } = jest.requireMock('@/state/undoToast') as { showToast: jest.Mock };
    mockWaitAndSave.mockImplementationOnce(() => Promise.reject(new Error('scheduler')));
    const { result } = await render();
    await act(async () => result.current.requestCommit('wait'));
    await act(async () => undefined);
    expect(showToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.toast.saved' } });
  });
});
