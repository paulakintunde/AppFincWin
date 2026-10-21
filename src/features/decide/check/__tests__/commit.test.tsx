import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { minorUnits } from '@/engine/money';
import type { DecideCheckRow } from '@/db/decideChecks';
import { buildGoAheadWrite } from '@/data/mutations/decideGoAhead';
import { hapticMedium } from '@/ui/haptics';
import * as computeModule from '../../snapshot/computeCheck';
import { CheckFlowScreen } from '../CheckFlowScreen';
import { CommitMutationsContext, type CommitMutations } from '../commitMutations';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import { EMPTY_STACK, type CheckComputation, type CheckInputs, type SnapshotResult } from '../../snapshot/types';
import { TODAY, loggedSource, month } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { wrap } from '../steps/__tests__/helpers/stepProps';

jest.setTimeout(60000);

// ── controllable doubles (names start with `mock` so the jest.mock factories may read them) ──
let mockRow: DecideCheckRow | null = null;
let mockInitial: CheckInputs;
let mockSource: SnapshotResult | null = null;
let mockBought: { status: string; computation: CheckComputation | null } = { status: 'idle', computation: null };
let mockBuiltin = new Map<string, string>();
const mockStack = EMPTY_STACK;
let mockSeries: { id: string; name: string; version: number }[] | undefined = [];
const mockToast = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReopen = jest.fn(() => 'new-check');
const mockCancelReminders = jest.fn(() => Promise.resolve());
const mockGoAhead = jest.fn(() => 'step-1');
const mockWait = jest.fn((_a: unknown) => Promise.resolve({ reminder: 'set' as 'set' | 'off' | 'none' }));
const mockPass = jest.fn();
const mockAccounts = [{ id: 'a1', name: 'Everyday', kind: 'checking', currency: 'USD', archived_at: null, deleted_at: null }];

jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticLight: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: jest.fn(), focusAccessibility: jest.fn() }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  router: { back: (...a: unknown[]) => mockBack(...a), canGoBack: () => true, replace: jest.fn(), navigate: jest.fn() },
}));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', timeZone: 'UTC', ready: true, showCents: false }),
}));
jest.mock('../useCheckDraft', () => {
  const R = require('react');
  return {
    useCheckDraft: () => {
      const [inputs, setInputs] = R.useState(mockInitial);
      const update = R.useCallback((patch: Partial<CheckInputs>) => setInputs((p: CheckInputs) => ({ ...p, ...patch })), []);
      return { status: 'ready', row: mockRow, inputs, update, saveNow: () => Promise.resolve(), isNew: mockRow === null };
    },
  };
});
jest.mock('../useBoughtCheckComputation', () => ({ useBoughtCheckComputation: () => mockBought }));
jest.mock('../useEstimateBias', () => ({ useEstimateBias: () => ({ running: null, payment: null, dayOne: null }) }));
jest.mock('@/data/queries/decide', () => ({
  useDecideSnapshot: () => ({ status: 'ready', result: mockSource, source: null, retry: jest.fn() }),
  useOtherChecks: () => mockStack,
  useDebts: () => ({ data: [] }),
  useSavingsGoals: jest.fn(),
  useGoalLines: jest.fn(),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: new Map(), isLoading: false }),
  useHouseholdMemberNames: () => new Map(),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: mockSeries }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategories: () => ({ data: [] }),
  useCategoryLookup: () => ({ builtinIds: mockBuiltin, transferCategoryId: 'cat-transfer' }),
}));
jest.mock('@/data/mutations/decideChecks', () => ({
  useMarkCheckSeen: () => ({ markSeen: jest.fn() }),
  useReopenCheck: () => ({ reopen: (...a: unknown[]) => (mockReopen as (...x: unknown[]) => string)(...a) }),
}));
jest.mock('@/data/mutations/decideLinks', () => ({ useSaveCardRate: () => ({ save: jest.fn() }), useSaveCardTerms: () => ({ save: jest.fn() }) }));
jest.mock('../../notifications/waitReminder', () => ({ cancelCheckReminders: (...a: unknown[]) => (mockCancelReminders as (...x: unknown[]) => Promise<void>)(...a) }));
jest.mock('@/features/record/entry/entryHost', () => ({ openEntry: jest.fn() }));
jest.mock('../../charts/CashPathChart', () => ({ CashPathChart: () => null }));

// The real builder is the check (a throwaway-id dry run), exactly as the app's provider does it.
const mutations: CommitMutations = {
  goAhead: (a) => (mockGoAhead as (x: unknown) => string)(a),
  canWrite: (a) => {
    try {
      let n = 0;
      buildGoAheadWrite({ ...a, mint: () => `dry-${++n}` });
      return true;
    } catch {
      return false;
    }
  },
  waitAndSave: (a) => mockWait(a),
  pass: (a) => mockPass(a),
};

// ── fixtures ──
function paySource(cash = 4_000_000): SnapshotResult {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 500_000, 300_000));
  const pay = { seriesId: 's-pay', confirmed: true, freq: 'monthly', anchorDate: '2026-04-01', endDate: null, occurrenceCount: null, latestAmount: 500_000, currency: 'USD', lastPaidDate: '2026-10-01' } as never;
  const limits = { reserve: null, dsrLine: null, unsecuredIncomeMultiple: null, investingFloor: minorUnits(0), savingFloor: null, spareFloor: null };
  const base = loggedSource({ cashOnHand: minorUnits(cash), incomeSeries: [pay], months, monthlyInvesting: minorUnits(0), limits }, cash);
  return { ...base, meta: { ...base.meta, fullMonths: 6 } };
}

function inputsOf(over: Partial<CheckInputs> = {}): CheckInputs {
  return { ...emptyCheckInputs('buy', TODAY), name: 'Sofa', advertised: 20_000, method: 'cash', goAccountId: 'a1', ...over };
}

function rowOf(over: Partial<DecideCheckRow> = {}): DecideCheckRow {
  return { id: 'c1', household_id: 'h1', status: 'open', furthest_step: 5, last_seen_state: null, last_seen_basis: null, version: 1, created_by: 'u1', kind: 'buy', name: 'Sofa', inputs: {}, ...over } as unknown as DecideCheckRow;
}

async function open(over: Partial<CheckInputs> = {}, step: 3 | 5 = 5) {
  mockInitial = inputsOf(over);
  return wrap(
    <CommitMutationsContext.Provider value={mutations}>
      <CheckFlowScreen id="c1" initialStep={step} />
    </CommitMutationsContext.Provider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRow = rowOf();
  mockSource = paySource();
  mockBought = { status: 'idle', computation: null };
  mockBuiltin = new Map([
    ['Debt', 'cat-debt'],
    ['Savings', 'cat-savings'],
  ]);
  mockSeries = [];
});

/** The outcome card and the action bar's primary share the label; the primary (then the sheet's confirm) renders last. */
const lastGoAhead = () => screen.getAllByLabelText('Go ahead').at(-1) as ReturnType<typeof screen.getByLabelText>;

const CARD = { method: 'card' as const, advertised: 150_000 };
const cardInputs = (accountId: string | null, payoff: 'full' | 'months' = 'months'): Partial<CheckInputs> => ({
  ...CARD,
  card: { ...emptyCheckInputs('buy', TODAY).card, accountId, payoff },
});

describe('Go ahead', () => {
  it('asks once, listing what gets written, and Not yet writes nothing', async () => {
    await open({ outcome: 'go' });
    await fireEvent.press(lastGoAhead());
    expect(screen.getByText('Write this to your records?')).toBeTruthy();
    expect(screen.getAllByText(/A pending expense of/).length).toBeGreaterThanOrEqual(2);
    await fireEvent.press(screen.getByLabelText('Not yet'));
    expect(mockGoAhead).not.toHaveBeenCalled();
    expect(hapticMedium).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('confirming writes once with the resolved accounts, then medium haptic, toast with Undo and back to Decide', async () => {
    await open({ outcome: 'go' });
    await fireEvent.press(lastGoAhead());
    expect(mockGoAhead).not.toHaveBeenCalled();
    await fireEvent.press(lastGoAhead());
    expect(mockGoAhead).toHaveBeenCalledTimes(1);
    const args = (mockGoAhead.mock.calls[0] as unknown[])[0] as { checkId: string; ownerId: string; ctx: Record<string, unknown> };
    expect(args.checkId).toBe('c1');
    expect(args.ownerId).toBe('u1');
    expect(args.ctx).toEqual(expect.objectContaining({ householdId: 'h1', cashAccountId: 'a1', debtCategoryId: 'cat-debt', savingsCategoryId: 'cat-savings', transferCategoryId: 'cat-transfer', today: '2026-10-15', timeZone: 'UTC' }));
    expect(hapticMedium).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: expect.stringMatching(/^decide\.toast\.written(Broke)?$/) }, stepId: 'step-1' });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('CR-C07: a double tap on the confirm writes once', async () => {
    await open({ outcome: 'go' });
    await fireEvent.press(lastGoAhead());
    const confirm = lastGoAhead();
    await fireEvent.press(confirm);
    await fireEvent.press(confirm);
    expect(mockGoAhead).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
    await fireEvent.press(lastGoAhead());
    expect(screen.queryByText('Write this to your records?')).toBeNull();
  });

  it('CR-C05: a stored archived or other-currency account is never written to', async () => {
    mockAccounts.push(
      { id: 'a-eur', name: 'Euro', kind: 'checking', currency: 'EUR', archived_at: null, deleted_at: null },
      { id: 'a-old', name: 'Old', kind: 'checking', currency: 'USD', archived_at: '2026-09-01T00:00:00Z' as never, deleted_at: null }
    );
    try {
      for (const stale of ['a-eur', 'a-old']) {
        mockGoAhead.mockClear();
        const view = await open({ outcome: 'go', goAccountId: stale });
        await fireEvent.press(lastGoAhead());
        await fireEvent.press(lastGoAhead());
        const args = (mockGoAhead.mock.calls[0] as unknown[])[0] as { ctx: Record<string, unknown> };
        expect(args.ctx.cashAccountId).toBe('a1');
        await view.unmount();
      }
    } finally {
      mockAccounts.splice(1);
    }
  });

  it('a card paid over months resolves the card account and the Debt category before the confirm', async () => {
    await open({ outcome: 'go', ...cardInputs('acc-card') });
    await fireEvent.press(lastGoAhead());
    expect(screen.getByText('Write this to your records?')).toBeTruthy();
    await fireEvent.press(lastGoAhead());
    const args = (mockGoAhead.mock.calls[0] as unknown[])[0] as { ctx: Record<string, unknown> };
    expect(args.ctx).toEqual(expect.objectContaining({ cardAccountId: 'acc-card', debtCategoryId: 'cat-debt' }));
  });

  it('a missing Debt category disables Go ahead with a one-line reason and never throws', async () => {
    mockBuiltin = new Map([['Savings', 'cat-savings']]);
    await open({ outcome: 'go', ...cardInputs('acc-card') });
    expect(screen.getByText('The Debt category is archived or missing, so the payments can’t be written. Restore it in Categories first.')).toBeTruthy();
    expect(lastGoAhead().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(lastGoAhead());
    expect(screen.queryByText('Write this to your records?')).toBeNull();
    expect(mockGoAhead).not.toHaveBeenCalled();
  });

  it('CR-C04: a replaced bill waits for the series list before Go ahead, then the confirm lists the bill it closes', async () => {
    const replaces = [{ id: 'rp-1', name: 'Parking', amount: 5_000, note: '', counted: true, seriesId: 's-park', category: null }];
    mockSeries = undefined;
    const view = await open({ outcome: 'go', replaces });
    expect(screen.getByText('Go ahead is ready once your recurring bills have loaded.')).toBeTruthy();
    expect(lastGoAhead().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    mockSeries = [{ id: 's-park', name: 'Parking', version: 2 }];
    await view.rerender(
      <CommitMutationsContext.Provider value={mutations}>
        <CheckFlowScreen id="c1" initialStep={5} />
      </CommitMutationsContext.Provider>
    );
    await fireEvent.press(lastGoAhead());
    await fireEvent.press(lastGoAhead());
    const args = (mockGoAhead.mock.calls[0] as unknown[])[0] as { ctx: { replacedSeries: unknown } };
    expect(args.ctx.replacedSeries).toEqual([{ id: 's-park', version: 2 }]);
  });

  it('a card purchase with no card chosen is not writable and says so', async () => {
    await open({ outcome: 'go', ...cardInputs(null) });
    console.log(JSON.stringify(require('@testing-library/react-native').screen.toJSON()).match(/(Go ahead waits|can’t be written|Choose the card|Restore it)[^"]*/g));
    expect(screen.getByText('This can’t be written as it is set up. Check the price and how you pay.')).toBeTruthy();
    expect(lastGoAhead().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('a missing Savings category blocks a monthly investment', async () => {
    mockBuiltin = new Map([['Debt', 'cat-debt']]);
    await open({ ...emptyCheckInputs('invest', TODAY), name: 'Fund', advertised: 20_000, method: 'monthly', investTermMonths: 12, outcome: 'go', goAccountId: 'a1' });
    expect(screen.getByText('The Savings category is archived or missing, so the schedule can’t be written. Restore it in Categories first.')).toBeTruthy();
  });

  it('no full month yet: Go ahead waits', async () => {
    const base = paySource();
    mockSource = { ...base, meta: { ...base.meta, fullMonths: 0 } } as SnapshotResult;
    mockSource = { kind: 'rough', currency: base.currency, cash: base.cash, cards: base.cards, meta: base.meta, dealerCap: base.dealerCap, conversions: [], unconverted: null, figures: { currency: base.currency, cash: base.cash, monthlyIncome: minorUnits(400_000), monthlySpending: minorUnits(250_000) } } as unknown as SnapshotResult;
    await open({ outcome: 'go' });
    expect(screen.getByText('Go ahead waits for a full logged month. Until then this is a rough first read.')).toBeTruthy();
    expect(lastGoAhead().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('investment go ahead passes the account and categories', async () => {
    mockInitial = { ...emptyCheckInputs('invest', TODAY), name: 'Fund', advertised: 20_000, method: 'lump', outcome: 'go', goAccountId: 'a1', investAccountId: 'i1' };
    mockAccounts.push({ id: 'i1', name: 'Brokerage', kind: 'investment', currency: 'USD', archived_at: null, deleted_at: null });
    try {
      await wrap(
        <CommitMutationsContext.Provider value={mutations}>
          <CheckFlowScreen id="c1" initialStep={5} kind="invest" />
        </CommitMutationsContext.Provider>
      );
      await fireEvent.press(lastGoAhead());
      expect(screen.getAllByText(/Brokerage/).length).toBeGreaterThanOrEqual(2);
      await fireEvent.press(lastGoAhead());
      const args = (mockGoAhead.mock.calls[0] as unknown[])[0] as { ctx: Record<string, unknown> };
      expect(args.ctx).toEqual(expect.objectContaining({ investAccount: { id: 'i1', currency: 'USD' }, transferCategoryId: 'cat-transfer' }));
    } finally {
      mockAccounts.pop();
    }
  });
});

describe('D-67 a check typed in another currency (CR-C06, CR-B02)', () => {
  const RATES = [
    { quote: 'USD', rate: '1.0800000000', rate_date: '2026-10-14', source: 'frankfurter-v2' as const },
    { quote: 'GBP', rate: '0.8600000000', rate_date: '2026-10-12', source: 'frankfurter-v2' as const },
  ];

  it('is shown and written in the home currency at the latest stored rate, with a note', async () => {
    mockSource = { ...paySource(), fx: { rates: RATES, customs: [], today: '2026-10-15' } };
    await open({ outcome: 'go', currency: 'GBP', advertised: 20_000 });
    expect(screen.getByText('Typed in GBP, shown in USD at the latest stored rate.')).toBeTruthy();
    await fireEvent.press(lastGoAhead());
    await fireEvent.press(lastGoAhead());
    const args = (mockGoAhead.mock.calls[0] as unknown[])[0] as { inputs: CheckInputs; ctx: { currency: string } };
    expect(args.ctx.currency).toBe('USD');
    expect(args.inputs.advertised).toBe(25_116);
  });

  it('with no stored rate it is not judged and Go ahead is unavailable', async () => {
    mockSource = { ...paySource(), fx: { rates: RATES, customs: [], today: '2026-10-15' } };
    await open({ outcome: 'go', currency: 'JPY', advertised: 20_000 });
    expect(screen.queryByText(/Typed in JPY/)).toBeNull();
    expect(lastGoAhead().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });
});

describe('Wait and Pass', () => {
  it('Wait saves the plan with the commit haptic and toasts the reminder date', async () => {
    mockSource = paySource(100_000);
    await open({ outcome: 'wait', advertised: 500_000 });
    await fireEvent.press(screen.getByLabelText('Save the plan'));
    expect(mockWait).toHaveBeenCalledTimes(1);
    expect(mockWait.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ currency: 'USD', today: '2026-10-15', coolingOff: false }));
    expect(hapticMedium).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
    await screen.findByLabelText('Save the plan');
    await Promise.resolve();
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.toast.waitSaved', params: { date: expect.any(String) } } });
  });

  it('Wait with notifications off toasts that no reminder will arrive', async () => {
    mockWait.mockResolvedValueOnce({ reminder: 'off' });
    mockSource = paySource(100_000);
    await open({ outcome: 'wait', advertised: 500_000 });
    await fireEvent.press(screen.getByLabelText('Save the plan'));
    await Promise.resolve();
    await Promise.resolve();
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.toast.waitNoNotify' } });
  });

  it('CR-C07: a double tap on Pass or Wait commits once and leaves once', async () => {
    await open({ outcome: 'pass' });
    const pass = screen.getByLabelText('Record as passed');
    await fireEvent.press(pass);
    await fireEvent.press(pass);
    await fireEvent.press(screen.getByLabelText('Record as passed'));
    expect(mockPass).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Record as passed').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('CR-C07: a double tap on Wait saves once', async () => {
    mockSource = paySource(100_000);
    await open({ outcome: 'wait', advertised: 500_000 });
    const save = screen.getByLabelText('Save the plan');
    await fireEvent.press(save);
    await fireEvent.press(save);
    expect(mockWait).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('Pass saves with Passed. Nothing moved. and no commit haptic', async () => {
    await open({ outcome: 'pass' });
    await fireEvent.press(screen.getByLabelText('Record as passed'));
    expect(mockPass).toHaveBeenCalledWith(expect.objectContaining({ coolingOff: false, verdict: expect.any(String) }));
    expect(hapticMedium).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.toast.passed' } });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('decided checks', () => {
  const sofa = (): CheckInputs => inputsOf({ name: 'Sofa', advertised: 3_900_000, outcome: 'go' });

  it('a bought check is recalculated without its own writes', async () => {
    // The snapshot source still holds the check's own pending -180_000 row (less cash); the recalculation does not.
    const dirty = paySource(3_820_000);
    const clean = paySource(4_000_000);
    mockSource = dirty;
    const inputs = sofa();
    const recalculated = computeModule.computeCheck(clean, inputs, EMPTY_STACK.otherChecks);
    mockBought = { status: 'ready', computation: recalculated };
    mockRow = rowOf({ status: 'bought', decided_at: '2026-10-10T12:00:00Z', verdict_at_decision: 'adjust', estimate_day_one: 3_900_000, estimate_monthly: 0 });
    const core = jest.spyOn(computeModule, 'computeCore');
    const details = jest.spyOn(computeModule, 'computeDetails');
    mockInitial = inputs;
    await wrap(
      <CommitMutationsContext.Provider value={mutations}>
        <CheckFlowScreen id="c1" initialStep={3} />
      </CommitMutationsContext.Provider>
    );
    const chips = { fits: 'It fits', adjust: 'Needs adjustment', no: 'You cannot afford this' } as const;
    const state = recalculated.verdict?.state;
    expect(state).toBeDefined();
    // The step-3 chip is the recalculation's, the decided header carries the stored verdict and the date.
    expect(screen.getAllByText(chips[state as keyof typeof chips]).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Needs adjustment')).toBeTruthy();
    expect(screen.getByText(/^Decided on 2026-10-10$|^Decided /)).toBeTruthy();
    expect(screen.getByText('Estimated on the day')).toBeTruthy();
    expect(screen.getByText('Estimated a month')).toBeTruthy();
    // Neither engine call ran on the unfiltered snapshot for the bought row.
    expect(core.mock.calls.filter((c) => c[0] === dirty)).toHaveLength(0);
    expect(details.mock.calls).toHaveLength(0);
    // No Reopen on a bought check; the primary goes back to Decide.
    expect(screen.queryByLabelText('Reopen the check')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Back to Decide'));
    expect(mockBack).toHaveBeenCalled();
    core.mockRestore();
    details.mockRestore();
  });

  it('a cooling-off tap on a bought check opens the recalculated view', async () => {
    const inputs = sofa();
    mockSource = paySource(3_820_000);
    mockBought = { status: 'ready', computation: computeModule.computeCheck(paySource(4_000_000), inputs, EMPTY_STACK.otherChecks) };
    mockRow = rowOf({ status: 'bought', decided_at: '2026-10-10T12:00:00Z', verdict_at_decision: 'fits', estimate_day_one: 1, estimate_monthly: 2 });
    mockInitial = inputs;
    await wrap(
      <CommitMutationsContext.Provider value={mutations}>
        <CheckFlowScreen id="c1" initialStep={3} />
      </CommitMutationsContext.Provider>
    );
    expect(screen.getByText('Step 3 of 5')).toBeTruthy();
    expect(screen.getByText('Estimated on the day')).toBeTruthy();
    expect(screen.getByLabelText('Back to Decide')).toBeTruthy();
  });

  it.each(['waiting', 'passed'] as const)('a %s check opens read-only, recomputed, and Reopen the check starts a new one', async (status) => {
    mockRow = rowOf({ status, decided_at: '2026-10-10T12:00:00Z' });
    const core = jest.spyOn(computeModule, 'computeCore');
    await open({ outcome: status === 'waiting' ? 'wait' : 'pass' }, 3);
    expect(core).toHaveBeenCalled();
    expect(screen.queryByText('Estimated on the day')).toBeNull();
    const reopenButton = screen.getByLabelText('Reopen the check');
    // CR-C07: a double tap reopens one copy.
    await fireEvent.press(reopenButton);
    await fireEvent.press(reopenButton);
    expect(mockCancelReminders).toHaveBeenCalledWith('c1');
    expect(mockReopen).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/check/[id]', params: { id: 'new-check', step: '3' } });
    core.mockRestore();
  });
});
