import { renderHook } from '@testing-library/react-native';
import { useSetupFacts } from '../useSetupFacts';

const mockSettings = jest.fn();
const mockAccounts = jest.fn();
const mockSeries = jest.fn();
const mockV3 = jest.fn();

jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1' }) }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => mockSettings() }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => mockAccounts() }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => mockSeries() }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => mockV3() }));

const account = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({ id, kind, deleted_at: null, archived_at: null, ...extra });
const month = (full: boolean) => ({ month: '2026-01', full, mark: 'normal', lines: [] });

function setup(over: { settings?: unknown; accounts?: unknown; series?: unknown; v3?: unknown } = {}) {
  mockSettings.mockReturnValue({ data: 'settings' in over ? over.settings : null });
  mockAccounts.mockReturnValue({ data: 'accounts' in over ? over.accounts : [] });
  mockSeries.mockReturnValue({ data: 'series' in over ? over.series : [] });
  mockV3.mockReturnValue('v3' in over ? over.v3 : { status: 'ready', inputs: { months: [] } });
}

describe('useSetupFacts', () => {
  it('is null while any read is loading', async () => {
    setup({ settings: undefined });
    expect((await renderHook(() => useSetupFacts())).result.current).toBeNull();
    setup({ accounts: undefined });
    expect((await renderHook(() => useSetupFacts())).result.current).toBeNull();
    setup({ series: undefined });
    expect((await renderHook(() => useSetupFacts())).result.current).toBeNull();
    setup({ v3: { status: 'loading', inputs: null } });
    expect((await renderHook(() => useSetupFacts())).result.current).toBeNull();
  });

  it('reads an empty household as nothing answered', async () => {
    setup();
    const f = (await renderHook(() => useSetupFacts())).result.current;
    expect(f).toMatchObject({
      incomeTypes: null,
      hasRegularPaySeries: false,
      moneyAccountIds: [],
      accountIdsWithUse: [],
      fullMonthsOfRecords: 0,
      unspentAnchorSet: false,
      roughTyped: false,
      setupDoneAt: null,
    });
  });

  it('derives pay series, money accounts, use, full months and the unspent anchor', async () => {
    setup({
      settings: {
        income_types: ['salary_or_wages'],
        variable_method: 'spread',
        spread_months: 6,
        steady_amount: null,
        hold_months: null,
        everyday_override: 50000,
        unspent_anchor: 100,
        unspent_anchor_at: '2026-10-01',
        rough_income: 300000,
        rough_spending: null,
        rough_saving: null,
        rough_debt: null,
        rough_invest: null,
        setup_done_at: null,
      },
      accounts: [
        account('a', 'checking', { use: 'everyday' }),
        account('b', 'savings', { use: null }),
        account('c', 'credit'),
        account('d', 'loan'),
        account('e', 'checking', { archived_at: '2026-01-01' }),
      ],
      series: [
        { id: 's1', deleted_at: null, income_kind: 'salary', amount: 1000 },
        { id: 's2', deleted_at: null, income_kind: 'rent', amount: 500 },
      ],
      v3: { status: 'ready', inputs: { months: [month(true), month(true), month(false)] } },
    });
    const f = (await renderHook(() => useSetupFacts())).result.current;
    expect(f).toMatchObject({
      incomeTypes: ['salary_or_wages'],
      hasRegularPaySeries: true,
      method: 'spread',
      spreadMonths: 6,
      everydayOverride: 50000,
      moneyAccountIds: ['a', 'b'],
      accountIdsWithUse: ['a'],
      fullMonthsOfRecords: 2,
      unspentAnchorSet: true,
      roughTyped: true,
    });
  });

  it('a series of another kind is not regular pay, and rough figures with 3 full months are not rough', async () => {
    setup({
      settings: { rough_income: 1, rough_spending: null, rough_saving: null, rough_debt: null, rough_invest: null, unspent_anchor: 5, unspent_anchor_at: null },
      series: [{ id: 's2', deleted_at: null, income_kind: 'rent', amount: 500 }],
      v3: { status: 'ready', inputs: { months: [month(true), month(true), month(true)] } },
    });
    const f = (await renderHook(() => useSetupFacts())).result.current;
    expect(f?.hasRegularPaySeries).toBe(false);
    expect(f?.roughTyped).toBe(false);
    expect(f?.unspentAnchorSet).toBe(false);
  });
});
