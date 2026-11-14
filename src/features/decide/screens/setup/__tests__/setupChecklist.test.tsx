// 06.1-50 (A-SU-1): the checklist always has a Back in its top bar, not only "Back to Decide" when all six are done.
// 06.1-54 (C-20, DS-20, A-SU-2, A-SU-3): loading and error states never show a count; the bar fills from the done count; Pay and
// Net rows say why.
import React from 'react';
import { fireEvent, renderHook, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import { buildV3Inputs } from '@/features/decide/snapshot/v3/buildV3Inputs';
import { setupProgress, type SetupFacts } from '../../logic/setupProgress';
import { buildBillRows, decideBillSetOf, decideBillsTotal } from '../items/itemLogic';
import { SetupChecklist } from '../SetupChecklist';
import { sameFacts, setupFactsFrom, useSetupProgress } from '../useSetupProgress';

jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));
// 06.1-75: the pure setupFactsFrom is read from the hook module; its live reads are not used here.
let mockV3: { inputs: unknown; evaluation: unknown; status: string; refetch: () => void } = { inputs: null, evaluation: null, status: 'loading', refetch: () => undefined };
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: null, isError: false }), useDebts: () => ({ data: [] }) }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => mockV3 }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1' }) }));

const TODAY = '2026-11-20';
const NONE: SetupFacts = {
  hasPay: false, payAmountMinor: null, payDay: null,
  billsRightAnswered: false, billsCount: 0, billsMonthlyMinor: 0,
  debts: [], noDebtsAnswered: false,
  netSizeMinor: null, netNotSetAnswered: false,
  rulesOn: 0, noRulesAnswered: false,
  lastMonthComplete: false, newestEntryThisMonth: null, accountsAllHaveUse: false, recordsUpTo: '2026-11-15',
  readinessOpen: 0, readinessFirst: null,
};
const TWO: SetupFacts = { ...NONE, hasPay: true, payAmountMinor: 250000, payDay: 25, billsRightAnswered: true, billsCount: 3, billsMonthlyMinor: 120000 };
const ALL: SetupFacts = {
  ...NONE, hasPay: true, payAmountMinor: 250000, payDay: 25, billsRightAnswered: true, noDebtsAnswered: true, netNotSetAnswered: true,
  noRulesAnswered: true, lastMonthComplete: true, accountsAllHaveUse: true, newestEntryThisMonth: TODAY,
};

async function checklist(facts: SetupFacts) {
  const onOpen = jest.fn();
  const onBack = jest.fn();
  await wrap(<SetupChecklist progress={setupProgress(facts, TODAY)} currency="USD" onOpen={onOpen} onBack={onBack} />);
  return { onOpen, onBack };
}

describe('SetupChecklist Back (A-SU-1)', () => {
  it('with 2 of 6 done, the top-bar Back leaves setup', async () => {
    const { onBack, onOpen } = await checklist(TWO);
    expect(screen.getByText('2 of 6 done')).toBeTruthy();
    expect(screen.queryByText('Back to Decide')).toBeNull();
    const back = screen.getByTestId('checklist-back');
    expect(back.props.accessibilityLabel).toBe('Back');
    await fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('with nothing done, Back is still there', async () => {
    const { onBack } = await checklist(NONE);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('when all are done, both the top-bar Back and the Back to Decide button leave setup', async () => {
    const { onBack } = await checklist(ALL);
    await fireEvent.press(screen.getByTestId('checklist-back'));
    await fireEvent.press(screen.getByText('Back to Decide'));
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});

const EMPTY_PROGRESS = { items: [], doneCount: 0, next: null, allDone: false };

describe('SetupChecklist while reading (C-20)', () => {
  it('says it is loading, with no count and no Back to Decide', async () => {
    const onBack = jest.fn();
    await wrap(<SetupChecklist progress={{ ...EMPTY_PROGRESS, loading: true, error: false }} currency="USD" onOpen={jest.fn()} onBack={onBack} />);
    expect(screen.getByText('Loading your setup…')).toBeTruthy();
    expect(screen.queryByText(/of 6/)).toBeNull();
    expect(screen.queryByText('Back to Decide')).toBeNull();
    expect(screen.queryByTestId('setup-bar')).toBeNull();
    await fireEvent.press(screen.getByTestId('checklist-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a failed read shows the error card, and its button reads again', async () => {
    const retry = jest.fn();
    await wrap(<SetupChecklist progress={{ ...EMPTY_PROGRESS, loading: false, error: true, retry }} currency="USD" onOpen={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByTestId('answer-error')).toBeTruthy();
    expect(screen.queryByText(/of 6/)).toBeNull();
    expect(screen.queryByText('Back to Decide')).toBeNull();
    await fireEvent.press(screen.getByText('Try the check again'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('an error with no retry given does nothing on press', async () => {
    await wrap(<SetupChecklist progress={{ ...EMPTY_PROGRESS, error: true }} currency="USD" onOpen={jest.fn()} onBack={jest.fn()} />);
    await fireEvent.press(screen.getByText('Try the check again'));
    expect(screen.getByTestId('answer-error')).toBeTruthy();
  });

  it('with no state flags and nothing read, it still says loading', async () => {
    await wrap(<SetupChecklist progress={EMPTY_PROGRESS} currency="USD" onOpen={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByTestId('setup-loading')).toBeTruthy();
  });
});

describe('SetupChecklist bar (DS-20)', () => {
  it.each([[NONE, 0], [TWO, 2], [{ ...TWO, noDebtsAnswered: true }, 3], [ALL, 6]])('fills one segment per done item on the first render', async (facts, done) => {
    await checklist(facts as SetupFacts);
    expect(screen.getByText(`${done} of 6 done`)).toBeTruthy();
    expect(screen.queryAllByTestId('setup-segment-filled')).toHaveLength(done as number);
    expect(screen.queryAllByTestId('setup-segment-empty')).toHaveLength(6 - (done as number));
    expect(screen.getByTestId('setup-bar').props.accessibilityValue).toEqual({ min: 0, max: 6, now: done });
  });
});

describe('SetupChecklist Pay and Net rows (A-SU-2, A-SU-3)', () => {
  it('Pay found but how you are paid not set says so; no pay at all says so', async () => {
    await checklist({ ...NONE, payAmountMinor: 320000, payDay: 15, payTypesSet: false });
    expect(screen.getByText('How you’re paid isn’t set yet')).toBeTruthy();
  });

  it('no pay says no pay set yet', async () => {
    await checklist(NONE);
    expect(screen.getByText('No pay set yet')).toBeTruthy();
  });

  it('the net row shows the money in the net with the goal second', async () => {
    await checklist({ ...NONE, netSizeMinor: 500000, netSavedMinor: 5000 });
    expect(screen.getByText('$50 in it · goal $5,000')).toBeTruthy();
  });
});

// 06.1-75 (DS-6, DS-7): the device page listed 5 bills, $1,112, while the checklist said 2 bills, $79.95. Three of the five fed Grow
// goals (Decide counts them once, through the goal) and one was CA$5 summed as $5. Both now read one set from the v3 inputs.
describe('Bills page and checklist agree (DS-6, DS-7)', () => {
  const series = (id: string, name: string, amount: number, currency: string, over: Record<string, unknown> = {}) => ({
    id, name, account_id: 'demo-acct-everyday', amount, currency, freq: 'monthly' as const, anchor_date: '2026-10-09', end_date: null, end_reason: null,
    occurrence_count: null, category_id: null, deleted_at: null, income_kind: null, saving_mode: null, goal_id: null, version: 1, ...over,
  });
  const extra = [
    series('design', 'Extra on Design work', -7500, 'USD'),
    series('audit', 'audit bill', -500, 'CAD', { anchor_date: '2026-10-20' }),
    series('laptop', 'Laptop', -18000, 'USD', { goal_id: 'g-laptop' }),
    series('efund', 'Emergency funds', -80000, 'USD', { category_id: 'cat-savings' }),
  ];
  const goal = { id: 'g-laptop', kind: 'pot' as const, check_id: null, currency: 'USD', target: 120000, monthly_amount: 18000, ready_by: null, opening_saved: 0, done_at: null, deleted_at: null };
  const base = demoSource(TODAY);
  const source = {
    ...base,
    series: [...base.series, ...extra],
    goals: [goal],
    categories: { ...base.categories, 'cat-savings': 'Savings' },
    rates: [
      { quote: 'USD', rate: '1.0800000000', rate_date: '2026-11-19', source: 'frankfurter-v2' as const },
      { quote: 'CAD', rate: '1.5000000000', rate_date: '2026-11-19', source: 'frankfurter-v2' as const },
    ],
  };
  const flags = { noDebts: false, netNotSet: false, noRules: false, billsRight: false };

  it('the same count and the same converted total, and the goal and savings payments are named elsewhere', () => {
    const inputs = buildV3Inputs(source, null);
    const facts = setupFactsFrom(inputs, flags, new Map(), new Set());
    const set = decideBillSetOf(inputs);
    const rows = buildBillRows([], extra as never, set, false);
    const counted = rows.filter((r) => r.counted === 'bill');
    expect(counted.map((r) => r.name).sort()).toEqual(['Extra on Design work', 'audit bill']);
    expect(facts.billsCount).toBe(counted.length);
    expect(facts.billsMonthlyMinor).toBe(decideBillsTotal(set));
    // CA$5 counts at Decide's converted amount (5 / 1.5 x 1.08 = $3.60), never as $5.
    expect(set.monthly.get('audit')).toBe(360);
    expect(facts.billsMonthlyMinor).toBe(7500 + 360);
    // The row keeps its own currency and amount.
    expect(rows.find((r) => r.id === 'audit')).toMatchObject({ amount: 500, currency: 'CAD' });
    expect(rows.filter((r) => r.counted === 'elsewhere').map((r) => r.name).sort()).toEqual(['Emergency funds', 'Laptop']);
    // DS-15: with "These are right" not answered, both counted bills are to confirm and come first.
    expect(rows.slice(0, 2).every((r) => r.toConfirm)).toBe(true);
  });
});

describe('useSetupProgress holds equal facts (G-72-3)', () => {
  it('compares every field, debts and the first readiness item by value', () => {
    expect(sameFacts(TWO, { ...TWO })).toBe(true);
    expect(sameFacts(TWO, { ...TWO, billsCount: 4 })).toBe(false);
    expect(sameFacts({ ...TWO, debts: [{ name: 'Card', dueDay: 3 }] }, { ...TWO, debts: [{ name: 'Card', dueDay: 3 }] })).toBe(true);
    expect(sameFacts({ ...TWO, debts: [{ name: 'Card', dueDay: 3 }] }, { ...TWO, debts: [{ name: 'Card', dueDay: 4 }] })).toBe(false);
  });

  it('a refetch that rebuilds equal inputs keeps the same progress object; a real change gives a new one', async () => {
    const refetch = () => undefined;
    const base = demoSource(TODAY);
    mockV3 = { inputs: buildV3Inputs(base, null), evaluation: null, status: 'ready', refetch };
    const { result, rerender } = await renderHook(() => useSetupProgress());
    const first = result.current;
    expect(first.loading).toBe(false);
    mockV3 = { inputs: buildV3Inputs(base, null), evaluation: null, status: 'ready', refetch };
    await rerender({});
    expect(result.current).toBe(first);
    const phone = { id: 'phone', account_id: 'demo-acct-everyday', amount: -4500, currency: 'USD', freq: 'monthly' as const, anchor_date: '2026-10-09', end_date: null, occurrence_count: null, category_id: null, deleted_at: null };
    mockV3 = { inputs: buildV3Inputs({ ...base, series: [...base.series, phone] }, null), evaluation: null, status: 'ready', refetch };
    await rerender({});
    expect(result.current).not.toBe(first);
    expect(result.current.items.find((i) => i.id === 'bills')?.status.values).toMatchObject({ count: 1 });
  });
});
