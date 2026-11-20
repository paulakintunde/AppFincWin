// 08.1-09 (D-09..D-11): what BoughtRoute reads for the tick rows and what it adds to the save. The data hooks are mocked at the edge; the
// screen is a stand-in that shows the props the route hands it. (Kept apart from decideRouting.test.tsx, which reads the app layout.)
import React from 'react';
import { wrap } from '@/test/stepProps';
import { BoughtRoute } from '../ActionRoutes';

const mockRouter = { dismissTo: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

type MockRead = { data: unknown[] | undefined };
const mockData: { checks: { data: unknown[]; isLoading: boolean; isError: boolean }; debts: MockRead; series: MockRead; goals: MockRead } = {
  checks: { data: [], isLoading: false, isError: false },
  debts: { data: [] },
  series: { data: [] },
  goals: { data: [] },
};
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: true, today: '2026-11-12', timeZone: 'UTC' }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideChecks: () => mockData.checks, useDebts: () => mockData.debts }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [], isError: false }) }));
jest.mock('@/data/queries/household', () => ({ useHouseholdMembers: () => ({ data: undefined }) }));
jest.mock('@/data/queries/householdBalances', () => ({ useSplitDefaults: () => ({ data: undefined }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => mockData.series }));
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => mockData.goals }));
jest.mock('@/features/decide/screens/engine/useCheckEngine', () => ({ useCheckEngine: () => ({ status: 'ready', evaluation: {}, readyDate: () => null }) }));
jest.mock('@/engine/decide/v3', () => ({ ...jest.requireActual('@/engine/decide/v3'), readStoredCheck: (inputs: unknown) => ({ check: inputs }) }));
jest.mock('@/ui/money/useMoneyFormatter', () => ({ useMoneyFormatter: () => ({ formatMoney: () => '$1', formatDate: (d: string) => d }) }));
const mockGoAhead = jest.fn();
jest.mock('@/data/mutations/decideGoAhead', () => ({ ...jest.requireActual('@/data/mutations/decideGoAhead'), useGoAheadV3: () => ({ goAhead: mockGoAhead }) }));
const mockBoughtProps = jest.fn();
jest.mock('@/features/decide/screens/actions/BoughtScreen', () => ({
  BoughtScreen: (p: unknown) => {
    mockBoughtProps(p);
    return null;
  },
}));
jest.mock('@/features/decide/screens/actions/SaveForItScreen', () => ({ SaveForItScreen: () => null }));
jest.mock('@/shell/screen/DetailScreen', () => ({ DetailScreen: ({ children }: { children: React.ReactNode }) => children }));

const ID = '123e4567-e89b-42d3-a456-426614174000';
const stop = (id: string, seriesId: string) => ({ id, amount: 8000, everyMonths: 1, stopDate: '2026-12-01', source: { kind: 'bill', seriesId } });
const checkOf = (replaces: unknown) => ({ data: [{ id: ID, name: 'Car', inputs: { v: 2, replaces }, deleted_at: null }], isLoading: false, isError: false });
const lastProps = () => mockBoughtProps.mock.calls.at(-1)?.[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockData.checks = checkOf({ stops: [], sale: null });
  mockData.debts = { data: [] };
  mockData.series = { data: [] };
  mockData.goals = { data: [] };
});

describe('BoughtRoute (08.1-09)', () => {
  it('offers only a recorded bill that will really end, the old loan the sale pays, and the open goal this check made', async () => {
    mockData.checks = checkOf({ stops: [stop('s1', 'gym'), stop('s2', 'gone')], sale: { amount: 900000, arrives: '2026-12-01', paysDebtId: 'd1' } });
    mockData.series = { data: [{ id: 'gym', name: 'Gym', version: 4, anchor_date: '2026-01-05', end_date: null, deleted_at: null }] };
    mockData.debts = { data: [{ id: 'd1', name: 'Car loan', balance: 600000, version: 3, deleted_at: null, paid_off_on: null }] };
    mockData.goals = {
      data: [
        { id: 'g-other', name: 'Other', check_id: 'someone-else', done_at: null, deleted_at: null, created_by: 'u1' },
        { id: 'g1', name: 'Car fund', check_id: ID, done_at: null, deleted_at: null, created_by: 'u1' },
      ],
    };
    await wrap(<BoughtRoute id={ID} />);
    expect(lastProps().stopRows).toEqual([{ id: 's1', name: 'Gym', date: '2026-12-01' }]);
    expect(lastProps().payoff).toEqual({ id: 'd1', version: 3, name: 'Car loan', amount: 600000 });
    expect(lastProps().goal).toEqual({ id: 'g1', name: 'Car fund' });
  });

  it('a check saved for later (waiting) is recorded from the same screen and offers its own goal to close (08.1-10)', async () => {
    mockData.checks = { data: [{ id: ID, name: 'Car', status: 'waiting', inputs: { v: 2, replaces: { stops: [], sale: null } }, deleted_at: null }], isLoading: false, isError: false };
    mockData.goals = { data: [{ id: 'g1', name: 'Car fund', check_id: ID, done_at: null, deleted_at: null, created_by: 'u1' }] };
    await wrap(<BoughtRoute id={ID} />);
    expect(lastProps().goal).toEqual({ id: 'g1', name: 'Car fund' });
    expect(lastProps().checkId).toBe(ID);
  });

  it('adds the recorded bills to the save, so the stops can end them', async () => {
    mockData.series = { data: [{ id: 'gym', name: 'Gym', version: 4, anchor_date: '2026-01-05', end_date: null, deleted_at: null }, { id: 'old', name: 'Old', version: 1, anchor_date: '2026-01-05', end_date: null, deleted_at: '2026-10-01' }] };
    await wrap(<BoughtRoute id={ID} />);
    lastProps().goAhead({ checkId: ID, extras: { runningCosts: [], stops: [], sale: null, payoff: null, goalId: null } });
    expect(mockGoAhead).toHaveBeenCalledTimes(1);
    expect(mockGoAhead.mock.calls[0][0].extras.recorded).toEqual([expect.objectContaining({ id: 'gym', version: 4 })]);
  });

  it('a loan that is paid off offers no payoff; a closed or deleted goal is not offered; a sale that pays no loan offers none', async () => {
    mockData.checks = checkOf({ stops: [], sale: { amount: 500, arrives: '2026-12-01', paysDebtId: 'd1' } });
    mockData.debts = { data: [{ id: 'd1', name: 'Car loan', balance: 600000, version: 3, deleted_at: null, paid_off_on: '2026-10-01' }] };
    mockData.goals = { data: [{ id: 'g1', name: 'Done', check_id: ID, done_at: '2026-11-01', deleted_at: null, created_by: 'u1' }, { id: 'g2', name: 'Gone', check_id: ID, done_at: null, deleted_at: '2026-11-02', created_by: 'u1' }] };
    await wrap(<BoughtRoute id={ID} />);
    expect(lastProps()).toMatchObject({ stopRows: [], payoff: null, goal: null });
    mockData.checks = checkOf({ stops: [], sale: { amount: 500, arrives: '2026-12-01', paysDebtId: null } });
    await wrap(<BoughtRoute id={ID} />);
    expect(lastProps().payoff).toBeNull();
  });

  it('what goes to the loan is the sale, up to what is owed', async () => {
    mockData.checks = checkOf({ stops: [], sale: { amount: 900000, arrives: '2026-12-01', paysDebtId: 'd1' } });
    mockData.debts = { data: [{ id: 'd1', name: 'Car loan', balance: 400000, version: 3, deleted_at: null, paid_off_on: null }] };
    await wrap(<BoughtRoute id={ID} />);
    expect(lastProps().payoff).toMatchObject({ amount: 400000 });
  });
});
