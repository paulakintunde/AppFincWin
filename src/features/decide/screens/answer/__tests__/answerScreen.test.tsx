// 06.1-23: the answer route body on engine-run fixtures. The data hooks are mocked at their edges (stored check, engine, sync); the
// frame, rows, cards and sheets are the real ones. Covers the gate, the crossed-rule haptic, "pre-filled, not checked", in-place pay and
// date changes, error and offline, the analytics payload, and the missing-figure Fix rows.
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { CheckV2, Evaluation } from '@/engine/decide/v3';
import { wrap } from '@/test/stepProps';
import { AnswerScreen } from '../AnswerScreen';
import { ledgerRun, notReadyRun, type Run } from './fixtures';

jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000000' }));

const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
const mockHaptic = jest.fn();
jest.mock('@/ui/haptics', () => ({ ...jest.requireActual('@/ui/haptics'), hapticWarning: () => mockHaptic() }));
const mockPush = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true, dismissTo: jest.fn() };
jest.mock('expo-router', () => {
  const router = {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => true,
    dismissTo: (...a: unknown[]) => mockRouter.dismissTo(...a),
  };
  return { router, useRouter: () => router, useLocalSearchParams: () => ({}) };
});
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('@/features/decide/screens/ui/CheckNotFound', () => ({ CheckNotFound: () => null }));

const mockMarkSeen = jest.fn(() => true);
const mockSaveAnswer = jest.fn(() => true);
const mockHistory = jest.fn(() => true);
const mockAnswered = jest.fn((..._a: unknown[]): { stepId: string } | null => ({ stepId: 'step-none' }));
const mockPending: { rows: unknown[] } = { rows: [] };
const mockRemove = jest.fn((..._a: unknown[]) => 'step-del');
jest.mock('@/data/mutations/decideChecks', () => ({
  useRemoveDecision: () => ({ remove: (...a: unknown[]) => mockRemove(...a) }),
  useMarkCheckSeen: () => ({ markSeen: mockMarkSeen }),
  useSaveCheckAnswer: () => ({ save: mockSaveAnswer }),
  useCreateCheck: () => ({ pendingRows: mockPending.rows }),
}));
jest.mock('@/data/mutations/decideHistory', () => ({ useRecordCheckHistory: () => ({ mutate: mockHistory }) }));
jest.mock('@/data/mutations/decideSetup', () => ({ useSetDecideAnswered: () => ({ set: mockAnswered }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', name: 'Everyday', deleted_at: null }] }) }));
// 06.1-44: the readiness answer writers and the cached transactions the skip reads.
const mockSave = jest.fn((..._a: unknown[]): { id: string; stepId: string } | null => ({ id: 'ans-1', stepId: 'step-ans' }));
const mockSkip = jest.fn((..._a: unknown[]): string | null => 'step-skip');
const mockToast = jest.fn();
const mockCache: { lists: [readonly unknown[], unknown][] } = { lists: [] };
jest.mock('@/data/mutations/decideAnswers', () => ({ useSaveDecideAnswer: () => ({ save: (...a: unknown[]) => mockSave(...a) }) }));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ getQueriesData: () => mockCache.lists }),
}));
jest.mock('@/state/undoToast', () => ({ ...jest.requireActual('@/state/undoToast'), showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('../../sheets/EnvelopeAccountSheet', () => {
  const { Text } = jest.requireActual('react-native');
  type MockProps = { goalId: string; visible: boolean; setAccount: (g: unknown, a: string, o: string) => string };
  return {
    EnvelopeAccountSheet: ({ goalId, visible, setAccount }: MockProps) =>
      visible ? (
        <Text testID="envelope-sheet" onPress={() => setAccount({ id: goalId }, 'a1', 'u1')}>
          {goalId}
        </Text>
      ) : null,
  };
});

const mockPaydays = { list: ['2026-11-20'] as string[] };
const mockState = {
  run: undefined as unknown as Run,
  inputs: undefined as Run['inputs'] | undefined,
  evaluation: null as Evaluation | null,
  check: null as CheckV2 | null,
  status: 'ready' as 'ready' | 'error' | 'loading',
  online: true,
  update: jest.fn(),
  flush: jest.fn(),
  refetch: jest.fn(),
  // 06.1-68: the engine's "updating" flag and the live answers (decide_answers, not deleted).
  updating: false,
  answers: [] as { kind: string; key: string }[],
};

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: true, region: 'US', today: '2026-11-05' }),
}));
const mockList: { rows: unknown[] | null } = { rows: null };
// 06.1-82: the settings row (answered flags) and the savings goals (check_id) the answer reads.
const mockSettings: { row: Record<string, unknown> | null } = { row: null };
const mockGoals: { rows: unknown[] } = { rows: [] };
jest.mock('@/data/queries/decide', () => ({
  useDecideSettings: () => ({ data: mockSettings.row }),
  useSavingsGoals: () => ({ data: mockGoals.rows }),
  useDecideChecks: () => ({
    isLoading: false,
    data: mockList.rows ?? [{ id: 'c1', name: 'Laptop', created_by: 'u1', household_id: 'h1', version: 1, inputs: {}, deleted_at: null, last_seen_state: null, last_seen_basis: null }],
  }),
}));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ inputs: mockState.inputs ?? mockState.run.inputs, status: 'ready', v3: { answers: mockState.answers } }) }));
jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: () => ({ isOnline: mockState.online }) }));
jest.mock('@/data/sync/useIsOnline', () => ({ useIsOnline: () => mockState.online }));
jest.mock('../../engine/useMonthPicture', () => ({ useMonthPicture: () => ({ picture: null, bars: [] }) }));
jest.mock('../../engine/useCheckEngine', () => ({
  useCheckEngine: () => ({
    status: mockState.status,
    errorKind: null,
    missingReads: [],
    refetch: mockState.refetch,
    evaluation: mockState.status === 'ready' ? mockState.evaluation : null,
    both: () => null,
    futures: () => null,
    readyDate: () => null,
    timeline: () => null,
    judgeOn: () => null,
    paydays: () => mockPaydays.list,
    updating: mockState.updating,
  }),
}));
jest.mock('../../check/useStepCheck', () => ({
  ...jest.requireActual('../../check/useStepCheck'),
  useStepCheck: (_id: string, fallback: unknown) => ({
    status: fallback === null ? 'not_found' : 'ready',
    check: mockState.check,
    name: 'Laptop',
    update: mockState.update,
    flush: mockState.flush,
    markVisited: jest.fn(),
    finish: jest.fn(),
  }),
  useStepData: () => ({ currency: 'USD', today: '2026-11-05', country: 'US', subdivision: null, bills: [], billChoices: [], categories: [], debts: [], status: 'ready' }),
}));
// 06.1-66 (FQ5): whether the safety-net question is still unanswered (the answer's net line).
const mockNet = { unanswered: false };
jest.mock('../../firstAnswer/useFirstAnswerGate', () => ({ useNetUnanswered: () => mockNet.unanswered }));
jest.mock('../../sheets/DatePickerSheet', () => ({ DatePickerSheet: () => null }));
jest.mock('../../sheets/InstallmentPlanSheet', () => {
  const { Text } = jest.requireActual('react-native');
  // 06.1-68: "plan-use" stands in for "Use this plan" with a typed plan name.
  type MockProps = { visible: boolean; onUse: (pay: unknown, name: string | null) => void };
  return {
    InstallmentPlanSheet: ({ visible, onUse }: MockProps) =>
      visible ? (
        <>
          <Text testID="plan-sheet" />
          <Text testID="plan-use" onPress={() => onUse({ mode: 'plan', count: 24 }, 'Car loan')} />
        </>
      ) : null,
  };
});

const mockNoOverdraft = jest.fn((..._a: unknown[]): string | null => 'step-od');
const writes = {
  notBuying: jest.fn(() => 'step-1'),
  setEnvelopeAccount: jest.fn(() => 'step-env'),
  skipLine: (...a: unknown[]) => mockSkip(...a),
  setNoOverdraft: (...a: unknown[]) => mockNoOverdraft(...a),
};

function load(run: Run, over: Partial<typeof mockState> = {}): void {
  mockState.run = run;
  mockState.evaluation = run.evaluation;
  mockState.check = run.check;
  mockState.status = 'ready';
  mockState.online = true;
  mockState.inputs = undefined;
  mockState.updating = false;
  mockState.answers = [];
  Object.assign(mockState, over);
}

/** The gate stand-in: a button that finishes it, as "Got it" does. */
const withGate = (onDone: () => void) => (
  <Pressable testID="gate" accessibilityRole="button" onPress={onDone}>
    {null}
  </Pressable>
);
function AutoDone({ onDone }: { onDone: () => void }): null {
  React.useEffect(() => {
    onDone();
  }, [onDone]);
  return null;
}
const noGate = (onDone: () => void) => <AutoDone onDone={onDone} />;

/** The bound net question stand-in: "answer" closes it answered, "away" closes it unanswered (a swipe). */
const renderNetQuestion = (onClose: (answered: boolean) => void) => (
  <>
    <Pressable testID="net-answer" accessibilityRole="button" onPress={() => onClose(true)}>
      {null}
    </Pressable>
    <Pressable testID="net-away" accessibilityRole="button" onPress={() => onClose(false)}>
      {null}
    </Pressable>
  </>
);

async function open(renderGate: (onDone: () => void) => React.ReactNode = noGate) {
  return wrap(<AnswerScreen id="c1" renderGate={renderGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
}

/** A copy of a run's evaluation with the result changed. */
const withResult = (run: Run, change: (r: Evaluation['result']) => Evaluation['result']): Evaluation => ({ ...run.evaluation, result: change(run.evaluation.result) });

beforeEach(() => {
  jest.clearAllMocks();
  mockPending.rows = [];
  mockList.rows = null;
  mockSettings.row = null;
  mockGoals.rows = [];
  mockCache.lists = [];
  mockNet.unanswered = false;
  mockPaydays.list = ['2026-11-20'];
});

describe('a check that exists only optimistically', () => {
  it('renders from the pending row instead of not-found', async () => {
    load(ledgerRun('N02'));
    mockList.rows = [];
    mockPending.rows = [{ id: 'c1', name: 'Laptop', created_by: 'u1', household_id: 'h1', version: 1, inputs: {}, deleted_at: null }];
    await open();
    expect(screen.getByTestId('answer-verdict-badge')).toBeTruthy();
  });
});

describe('first answer gate (D-14)', () => {
  it('shows the gate over the frame and its loading state, then the verdict once it is done (06.1-66 FQ5, CN-11)', async () => {
    load(ledgerRun('N02'));
    await open(withGate);
    expect(screen.getByTestId('gate')).toBeTruthy();
    // Never the gate alone over a blank page: the top bar with the item, and "Working out the answer".
    expect(screen.getByTestId('answer-frame')).toBeTruthy();
    expect(screen.getByText('Laptop')).toBeTruthy();
    expect(screen.getByText('Working out the answer…')).toBeTruthy();
    expect(screen.queryByTestId('answer-verdict-badge')).toBeNull();
    expect(screen.queryByTestId('answer-actions')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('gate'));
    });
    expect(screen.getByTestId('answer-verdict-badge')).toBeTruthy();
    expect(screen.queryByTestId('gate')).toBeNull();
  });

  it('a later answer goes straight through', async () => {
    load(ledgerRun('N02'));
    await open(noGate);
    expect(screen.getByTestId('answer-verdict-badge')).toBeTruthy();
  });
});

describe('a crossed rule (N15, D-19, UX-16)', () => {
  const crossed = (run: Run): Evaluation =>
    withResult(run, (r) => ({ ...r, facts: [{ code: 'line_crossed', values: { lineId: 'l1', unit: 'money', value: 50000, limit: 40000 } }, ...r.facts] }));

  it('says rule, never line, and buzzes once across re-renders', async () => {
    const run = ledgerRun('N04');
    load(run, { evaluation: crossed(run) });
    const view = await open();
    expect(screen.getByText('This brings it to $500.00; your rule is $400.00.')).toBeTruthy();
    expect(screen.queryByText(/\bline\b/i)).toBeNull();
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    view.rerender(<AnswerScreen id="c1" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    expect(mockHaptic).toHaveBeenCalledTimes(1);
  });

  it('no crossed rule, no buzz', async () => {
    load(ledgerRun('N02'));
    await open();
    expect(mockHaptic).not.toHaveBeenCalled();
  });
});

describe('What you told Decide (D21, D21b)', () => {
  /** A check through the stepper with a kind, the costs step skipped and running costs counted (every row applies). */
  const stepped = (run: Run): Partial<typeof mockState> => ({
    check: { ...run.check, layerAnswers: { ...run.check.layerAnswers, 'L0.kind': 'tech', 'L0.skipped_steps': [3] } },
    evaluation: { ...run.evaluation, purchase: { ...(run.evaluation.purchase as NonNullable<Evaluation['purchase']>), runningMonthly: 2500 as never } },
  });

  it('lists the three rows after the stepper, and marks a skipped costs step "pre-filled, not checked"', async () => {
    const run = ledgerRun('N02');
    load(run, stepped(run));
    await open();
    expect(screen.getByTestId('answer-told')).toBeTruthy();
    for (const n of [1, 2, 3]) expect(screen.getByTestId(`answer-told-${n}`)).toBeTruthy();
    expect(screen.getByText('Kind')).toBeTruthy();
    expect(screen.getByText('Price and how you pay')).toBeTruthy();
    expect(screen.getByTestId('answer-told-prefilled-3')).toBeTruthy();
    expect(screen.getAllByText('pre-filled, not checked')).toHaveLength(1);
    expect(screen.queryByTestId('answer-told-prefilled-1')).toBeNull();
    expect(screen.getByTestId('answer-told-quick')).toBeTruthy();
  });

  it('opens each step with from=answer by push, so Back returns to this answer (06.1-64 H-3, FQ2, DN-3)', async () => {
    const run = ledgerRun('N02');
    load(run, stepped(run));
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-told-1'));
    });
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/decide/check/kind', params: { id: 'c1', dir: 'back', from: 'answer' } });
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-told-3'));
    });
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/decide/check/costs', params: { id: 'c1', dir: 'back', from: 'answer' } });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('06.1-66 (CS-2): shows on the home path too, with only the rows that apply, in the same section order', async () => {
    const run = ledgerRun('N02');
    load(run);
    await open();
    expect(screen.getByTestId('answer-told')).toBeTruthy();
    expect(screen.getByTestId('answer-told-2')).toBeTruthy();
    // No running costs counted: no Running costs row.
    expect(screen.queryByTestId('answer-told-3')).toBeNull();
    const ids = screen
      .getAllByTestId(/^answer-(verdict|facts|told|detail-running|basis|actions)$/)
      .map((n) => String(n.props.testID))
      .filter((x, i, all) => all.indexOf(x) === i);
    expect(ids).toEqual(['answer-verdict', 'answer-facts', 'answer-told', 'answer-detail-running', 'answer-basis', 'answer-actions']);
  });

  it('06.1-66 (DC-1): the price row says Change and opens the Price step from=answer', async () => {
    load(ledgerRun('N02'));
    await open();
    expect(within(screen.getByTestId('answer-told-2')).getByText('Change')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-told-2'));
    });
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/decide/check/price', params: { id: 'c1', dir: 'back', from: 'answer' } });
  });
});

describe('pay mode and date change in place (UX-23)', () => {
  it('When: the payday chip (its short date) saves the draft and re-judges without navigating', async () => {
    load(ledgerRun('N02'));
    await open();
    expect(screen.queryByText('Next payday')).toBeNull();
    expect(screen.getByLabelText('Next payday, Nov 20')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Nov 20'));
    });
    expect(mockState.update).toHaveBeenCalledTimes(1);
    const next = (mockState.update.mock.calls[0] as [(c: CheckV2) => CheckV2])[0](mockState.check as CheckV2);
    expect(next.purchaseDate).toBe('2026-11-20');
    expect(mockState.flush).toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('How you pay: Cash sets the payment to once in place', async () => {
    const base = ledgerRun('N09');
    const plan = { mode: 'plan', cadence: { unit: 'month', every: 1 }, count: 12, termMonths: 12, apr: null, fees: { setup: 0, perPeriod: 0, end: 0 }, deposit: 0, tradeIn: 0, quotedPayment: null, firstPayment: null, deferredInterestTerm: false };
    const run = { ...base, check: { ...base.check, pay: plan as unknown as CheckV2['pay'] } };
    load(run);
    await open();
    expect(run.check.pay.mode).toBe('plan');
    await act(async () => {
      fireEvent.press(screen.getByText('Cash'));
    });
    const next = (mockState.update.mock.calls[0] as [(c: CheckV2) => CheckV2])[0](run.check);
    expect(next.pay).toEqual({ mode: 'once' });
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('error and offline (APP-01, APP-10)', () => {
  it('an error shows no figure and offers to try the check again for the item', async () => {
    load(ledgerRun('N02'), { status: 'error' });
    await open();
    expect(within(screen.getByTestId('answer-error')).queryByText(/\d/)).toBeNull();
    expect(screen.getByLabelText('Try the check again for Laptop')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Try the check again for Laptop'));
    });
    expect(mockState.refetch).toHaveBeenCalled();
    expect(screen.queryByTestId('answer-verdict-badge')).toBeNull();
  });

  it('offline answers from the cache and says which records it used', async () => {
    const run = ledgerRun('N02');
    load(run, { online: false, evaluation: withResult(run, (r) => ({ ...r, recordsAsOf: '2026-11-03' as never })) });
    await open();
    expect(screen.getByTestId('answer-offline')).toBeTruthy();
    expect(screen.getByText(/Using records up to/)).toBeTruthy();
    expect(screen.getByTestId('answer-verdict-badge')).toBeTruthy();
  });
});

describe('analytics, seen and history (CMP-F03, CO-D-124)', () => {
  it('sends the code and variant only, once', async () => {
    const run = ledgerRun('N04');
    load(run);
    const view = await open();
    view.rerender(<AnswerScreen id="c1" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    const [name, payload] = mockTrack.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('decide_answer_shown');
    expect(Object.keys(payload).sort()).toEqual(['code', 'variant']);
    expect(payload).toEqual({ code: 'fits_unspent', variant: 'tight' });
  });

  it('remembers what was seen and records the day, and nothing for a not-ready answer', async () => {
    load(ledgerRun('N02'));
    await open();
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockHistory).toHaveBeenCalledTimes(1);
    expect((mockHistory.mock.calls[0] as unknown as [{ checkId: string }])[0].checkId).toBe('c1');
  });

  it('06.1-78: stores the shown answer once, so the open check on Decide home leaves Draft', async () => {
    const run = ledgerRun('N02');
    load(run);
    const view = await open();
    view.rerender(<AnswerScreen id="c1" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    expect(mockSaveAnswer).toHaveBeenCalledTimes(1);
    const [row, seen] = mockSaveAnswer.mock.calls[0] as unknown as [{ id: string }, { v: number; code: string }];
    expect(row.id).toBe('c1');
    expect(seen).toMatchObject({ v: 3, code: run.evaluation.result.code, inputsKey: expect.stringMatching(/^[0-9a-z]+-[0-9a-f]{8}$/) });
  });

  it('a not-ready answer is neither counted nor remembered', async () => {
    load(notReadyRun());
    await open();
    expect(screen.getByText('Finish setup')).toBeTruthy();
    expect(mockTrack).not.toHaveBeenCalled();
    expect(mockMarkSeen).not.toHaveBeenCalled();
    expect(mockHistory).not.toHaveBeenCalled();
    expect(mockSaveAnswer).not.toHaveBeenCalled();
  });
});

describe('missing figures (N21, CO-D-38, CO-D-43)', () => {
  const asks = (run: Run, missing: readonly string[], extra: Evaluation['result']['facts'] = []): Evaluation =>
    withResult(run, (r) => ({ ...r, code: 'needs_input', variant: null, missing: missing as never, facts: [...r.facts, ...extra] }));

  it('06.1-66 (OQ-66-2, DS-2): a More needed answer is the one Not ready layout, naming its first missing figure with a Fix link', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: asks(run, ['no_income_figures', 'unspent_not_confirmed', 'everyday_unknown']) });
    await open();
    expect(screen.getByTestId('answer-not-ready')).toBeTruthy();
    expect(screen.getAllByText('Fix')).toHaveLength(1);
    expect(screen.getByTestId('answer-fix-no_income_figures')).toBeTruthy();
    expect(screen.getByText(/^First: /)).toBeTruthy();
    // 06.1-67 (G-10): the caveat opens under the card's More row.
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-not-ready-more'));
    });
    expect(screen.getByText('More may follow once this is done.')).toBeTruthy();
    // No verdict, no buy or save, no pay or When controls, and never "Bought today." (DS-4).
    expect(screen.queryByTestId('answer-verdict')).toBeNull();
    expect(screen.queryByTestId('answer-actions')).toBeNull();
    expect(screen.queryByText('I bought it')).toBeNull();
    expect(screen.queryByText('Cash')).toBeNull();
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.queryByText(/Bought today/)).toBeNull();
    expect(screen.getByTestId('answer-told')).toBeTruthy();
    expect(screen.getByTestId('answer-not-ready-exits')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-fix-no_income_figures'));
    });
    expect(mockPush).toHaveBeenCalledWith('/decide/setup/pay');
  });

  it('06.1-71 (DN-6): Fix next to What is <account> for? opens Setup > Records on that account, from=answer', async () => {
    const run = ledgerRun('N02');
    const ev = asks(run, ['account_use_question']);
    load(run, { evaluation: { ...ev, result: { ...ev.result, notices: [...ev.result.notices, { code: 'account_use_unknown', values: { accountId: 'a1', count: 1 } }] } } });
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-fix-account_use_question'));
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/setup/records', params: { account: 'a1', from: 'answer' } });
  });

  it('06.1-71: with only the safety net’s account unknown, Fix opens Safety net', async () => {
    const run = ledgerRun('N02');
    const ev = asks(run, ['account_use_question']);
    load(run, { evaluation: { ...ev, result: { ...ev.result, notices: [...ev.result.notices, { code: 'fund_account_unknown', values: {} }] } } });
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-fix-account_use_question'));
    });
    expect(mockPush).toHaveBeenCalledWith('/decide/setup/net?from=answer');
  });

  it('a price fix opens the price step of this check', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: asks(run, ['no_price']) });
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-fix-no_price'));
    });
    // 06.1-64 (H-3, FQ2): the step carries from=answer, so its Back and "See the answer" return to this answer.
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/check/price', params: { id: 'c1', dir: 'back', from: 'answer' } });
  });

  it('06.1-71 (CB-12): No overdraft records a 0 limit in place with Undo and stays on the answer', async () => {
    const run = ledgerRun('N05');
    load(run);
    await open();
    mockNoOverdraft.mockClear();
    await act(async () => {
      fireEvent.press(screen.getByText('No overdraft'));
    });
    expect(mockNoOverdraft).toHaveBeenCalledTimes(1);
    expect(mockNoOverdraft).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), 'u1');
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      kind: 'ordinary',
      text: { key: 'decide.screens.answer.fact.noOverdraftSaved', params: { account: 'Everyday' } },
      stepId: 'step-od',
    });
    // T-06.1-71-02: a second tap while the fact still shows writes nothing more.
    await act(async () => {
      fireEvent.press(screen.getByText('No overdraft'));
    });
    expect(mockNoOverdraft).toHaveBeenCalledTimes(1);
  });

  it('06.1-71: Add limit still opens that account', async () => {
    const run = ledgerRun('N05');
    load(run);
    await open();
    await act(async () => {
      fireEvent.press(screen.getByText('Add limit'));
    });
    expect(mockPush).toHaveBeenCalledWith('/accounts/a1');
    expect(mockNoOverdraft).not.toHaveBeenCalled();
  });

  it('06.1-71: No overdraft for an account that is not loaded opens the accounts instead', async () => {
    const run = ledgerRun('N05');
    load(run, { evaluation: withResult(run, (r) => ({ ...r, facts: r.facts.map((f) => (f.code === 'no_overdraft_limit' ? { ...f, values: { ...f.values, accountId: 'gone' } } : f)) })) });
    await open();
    await act(async () => {
      fireEvent.press(screen.getByText('No overdraft'));
    });
    expect(mockNoOverdraft).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/accounts/gone');
  });

  it('None on the debts question records that the person has none', async () => {
    const run = ledgerRun('N02');
    const ask = withResult(run, (r) => ({ ...r, facts: [{ code: 'ask_debts_not_recorded', values: { kind: 'all' } }, ...r.facts] }));
    load(run, { evaluation: ask });
    await open();
    await act(async () => {
      fireEvent.press(screen.getByText('None'));
    });
    expect(mockAnswered).toHaveBeenCalledWith({ flag: 'no_debts', on: true });
  });

  it('a locked safety net links to its settings', async () => {
    const run = ledgerRun('N05');
    load(run);
    await open();
    // 06.1-67 (CS-1): every fact after the first opens under Why?.
    expect(screen.queryByTestId('answer-unlock-net')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-facts-why'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-unlock-net'));
    });
    expect(mockPush).toHaveBeenCalledWith('/decide/safety-net');
  });
});

describe('action bar and rows', () => {
  it('routes I bought it and Save for it to their screens, and I am not buying it to the writer', async () => {
    load(ledgerRun('N02'));
    await open();
    await act(async () => {
      fireEvent.press(screen.getByText('I bought it'));
    });
    expect(mockPush).toHaveBeenCalledWith('/decide/bought/c1');
    await act(async () => {
      fireEvent.press(screen.getByText('Save for it'));
    });
    expect(mockPush).toHaveBeenCalledWith('/decide/save/c1');
    await act(async () => {
      fireEvent.press(screen.getByText('I’m not buying it'));
    });
    expect(writes.notBuying).toHaveBeenCalledTimes(1);
    // 06.1-64 (CN-4): the Decide home already in the stack, never a replaced copy.
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/decide');
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/decide');
  });

  it('keeps Costs that stop out unless the check replaces something, and opens the About sheet from the cant-see link', async () => {
    load(ledgerRun('N02'));
    await open();
    expect(screen.queryByTestId('answer-detail-stops')).toBeNull();
    expect(screen.getByTestId('answer-detail-running')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-cant-see'));
    });
    expect(screen.getByText('About this answer')).toBeTruthy();
  });
});

describe('the Not ready card on the answer screen (06.1-44, G-1, C-1, C-2)', () => {
  const ITEM_BASE = { code: 'past_month_missing', month: '2026-10', seriesId: null, envelopeId: null, lineId: null, name: null, amount: null, date: null } as const;
  const BILL = { ...ITEM_BASE, kind: 'bill', seriesId: 's-net', lineId: 'l-net', name: 'Netflix', amount: 1199, date: '2026-10-03' } as const;
  const PAY = { ...ITEM_BASE, kind: 'pay', seriesId: 's-pay', name: 'Salary', amount: 250000, date: '2026-10-03' } as const;
  const ENVELOPE = { ...ITEM_BASE, kind: 'envelopes', code: 'envelopes_unconfirmed', month: '2026-11', envelopeId: 'g1', name: 'Holiday' } as const;
  const LINE = { id: 'l-net', household_id: 'h1', local_date: '2026-10-03', version: 2, name: 'Netflix', status: 'pending', deleted_at: null };

  /** A not-ready run naming `items`, for a person whose records hold October (so quick estimates cannot count). */
  function notReadyWith(items: readonly unknown[]): void {
    const run = notReadyRun();
    const evaluation = withResult(run, (r) => ({ ...r, readiness: { ready: false, missing: ['past_month_missing'], items: items as never, waived: [] } }));
    const months = [{ ...(ledgerRun('N02').inputs.months[0] as object), month: '2026-10' }];
    load(run, { evaluation, inputs: { ...run.inputs, months: months as never } });
  }
  const press = async (node: Parameters<typeof fireEvent.press>[0]): Promise<void> => {
    await act(async () => {
      fireEvent.press(node);
    });
  };

  it('with records: names the first item, says more may follow, and never offers quick estimates (F-1 loop gone; 06.1-66 OQ-66-1)', async () => {
    notReadyWith([BILL, PAY]);
    await open();
    expect(screen.getByText('Not ready yet')).toBeTruthy();
    expect(screen.queryByText(/things? to finish/)).toBeNull();
    expect(screen.getByText(/^First: Netflix, \$11\.99 due .*, isn’t in your records yet\.$/)).toBeTruthy();
    // 06.1-67 (G-10): the caveat opens under the card's More row.
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-not-ready-more'));
    });
    expect(screen.getByText('More may follow once this is done.')).toBeTruthy();
    expect(screen.queryByTestId('readiness-row-1')).toBeNull();
    expect(screen.queryByText(/quick estimates/i)).toBeNull();
    expect(screen.queryByTestId('answer-verdict')).toBeNull();
    expect(screen.queryByTestId('answer-actions')).toBeNull();
  });

  it('with no earlier month: quick estimates are the primary and open the quick-estimates setup (A-ANS-3)', async () => {
    load(notReadyRun());
    await open();
    await press(screen.getByText('Answer from quick estimates'));
    expect(mockPush).toHaveBeenCalledWith(`/decide/setup/quick-estimates?returnTo=${encodeURIComponent('/decide/answer/c1')}`);
  });

  it('an answer with a waiver is saved as a readiness_waiver dated today, with one Undo', async () => {
    notReadyWith([BILL]);
    await open();
    await press(within(screen.getByTestId('readiness-row-0')).getByText('Someone else paid it'));
    expect(mockSave).toHaveBeenCalledWith({ kind: 'readiness_waiver', waiver: { kind: 'paid_by_other', seriesId: 's-net', date: '2026-10-03' }, at: '2026-11-05' });
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.answer.notReady.saved' }, stepId: 'step-ans' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('an answer that is already saved shows no second toast', async () => {
    notReadyWith([PAY]);
    mockSave.mockReturnValueOnce(null);
    await open();
    await press(screen.getByText('Income comes in elsewhere'));
    expect(mockSave).toHaveBeenCalledWith({ kind: 'readiness_waiver', waiver: { kind: 'income_elsewhere' }, at: '2026-11-05' });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('"It didn’t happen" on a cached pending line skips that line', async () => {
    mockCache.lists = [
      [['transactions', 'h1', 'categorised-names', 'u1'], { not: 'a list' }],
      [['transactions', 'h1', '2026-10'], [LINE]],
    ];
    notReadyWith([BILL]);
    await open();
    await press(screen.getByText('It didn’t happen'));
    expect(mockSkip).toHaveBeenCalledWith(LINE, 'u1');
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-skip' }));
  });

  it('a skip that records no step shows no toast', async () => {
    mockCache.lists = [[['transactions', 'h1', '2026-10'], [LINE]]];
    mockSkip.mockReturnValueOnce(null);
    notReadyWith([BILL]);
    await open();
    await press(screen.getByText('It didn’t happen'));
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('"It didn’t happen" with the line not cached answers the occurrence by its waiver instead', async () => {
    mockCache.lists = [[['transactions', 'h1', '2026-10'], [{ ...LINE, status: 'paid' }]]];
    notReadyWith([BILL, { ...PAY, lineId: 'l-pay' }]);
    const view = await open();
    await press(within(screen.getByTestId('readiness-row-0')).getByText('It didn’t happen'));
    expect(mockSkip).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith({ kind: 'readiness_waiver', waiver: { kind: 'didnt_happen', seriesId: 's-net', date: '2026-10-03' }, at: '2026-11-05' });
    // Answered: the screen re-judges and the next item comes first.
    notReadyWith([{ ...PAY, lineId: 'l-pay' }]);
    await act(async () => {
      view.rerender(<AnswerScreen id="c1" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    });
    await press(within(screen.getByTestId('readiness-row-0')).getByText('It didn’t happen'));
    expect(mockSave).toHaveBeenLastCalledWith({ kind: 'readiness_waiver', waiver: { kind: 'no_pay', seriesId: 's-pay', date: '2026-10-03' }, at: '2026-11-05' });
  });

  it('the records fix opens Activity on that month; the envelope fix opens Which account? for that envelope (D-54)', async () => {
    notReadyWith([BILL]);
    const view = await open();
    await press(screen.getByText('Records for October'));
    // 06.1-71 (FQ10, CN-9): the month and what is missing travel to Activity's banner.
    expect(mockPush).toHaveBeenCalledWith('/activity?month=2026-10&why=bill');
    expect(screen.queryByTestId('envelope-sheet')).toBeNull();
    notReadyWith([ENVELOPE]);
    await act(async () => {
      view.rerender(<AnswerScreen id="c1" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    });
    await press(screen.getByText('Which account?'));
    expect(screen.getByTestId('envelope-sheet')).toHaveTextContent('g1');
    // The shell's Grow writer is what the sheet saves through (depcruise: no Grow goal write from features/decide).
    await press(screen.getByTestId('envelope-sheet'));
    expect(writes.setEnvelopeAccount).toHaveBeenCalledWith({ id: 'g1' }, 'a1', 'u1');
  });

  it('once the answer lands the screen re-judges in place: the Not ready card, then the verdict, with no navigation', async () => {
    notReadyWith([BILL]);
    const view = await open();
    expect(screen.getByTestId('answer-not-ready')).toBeTruthy();
    load(ledgerRun('N02'));
    await act(async () => {
      view.rerender(<AnswerScreen id="c1" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    });
    expect(await screen.findByTestId('answer-verdict-badge')).toBeTruthy();
    expect(screen.queryByTestId('answer-not-ready')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('06.1-66 (FQ6, CS-3, CS-11): Not ready keeps the details and the two exits', () => {
  const press = async (node: Parameters<typeof fireEvent.press>[0]): Promise<void> => {
    await act(async () => {
      fireEvent.press(node);
    });
  };

  it('shows What you told Decide with the price, and no pay or When controls', async () => {
    load(notReadyRun());
    await open();
    expect(screen.getByTestId('answer-not-ready')).toBeTruthy();
    expect(screen.getByTestId('answer-told')).toBeTruthy();
    expect(within(screen.getByTestId('answer-told-2')).getByText(/up front, cash/)).toBeTruthy();
    expect(screen.queryByTestId('answer-when-today')).toBeNull();
    expect(screen.queryByLabelText('How you pay')).toBeNull();
    expect(screen.queryByTestId('answer-actions')).toBeNull();
  });

  it('I’m not buying it goes through the bound writer and back to Decide home', async () => {
    load(notReadyRun());
    await open();
    await press(screen.getByTestId('answer-not-ready-not-buying'));
    expect(writes.notBuying).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/decide');
  });

  it('Delete this check removes it with one Undo and returns to Decide home', async () => {
    load(notReadyRun());
    await open();
    await press(screen.getByText('Delete this check'));
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect((mockRemove.mock.calls[0] as unknown as [{ id: string }])[0].id).toBe('c1');
    expect(mockToast).toHaveBeenCalledWith({ kind: 'destructive', text: { key: 'decide.screens.common.toast.deleted', params: { item: 'Laptop' } }, stepId: 'step-del' });
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/decide');
  });

  it('an error and the loading state carry no pay or When controls either', async () => {
    load(ledgerRun('N02'), { status: 'error' });
    await open();
    expect(screen.queryByTestId('answer-when-today')).toBeNull();
    load(ledgerRun('N02'), { status: 'loading' });
    await open();
    expect(screen.queryByTestId('answer-when-today')).toBeNull();
  });
});

describe('06.1-66 (CB-7, A-ANS-4): the When chips', () => {
  it('no payday found: no payday chip', async () => {
    load(ledgerRun('N02'));
    mockPaydays.list = [];
    await open();
    expect(screen.getByTestId('answer-when-today')).toBeTruthy();
    expect(screen.queryByTestId('answer-when-payday')).toBeNull();
    expect(screen.getByTestId('answer-when-pick')).toBeTruthy();
  });

  it('a picked date shows as its own selected chip beside Pick a date', async () => {
    const run = ledgerRun('N02');
    load(run, { check: { ...run.check, purchaseDate: '2026-12-03' as never } });
    await open();
    const picked = screen.getByTestId('answer-when-picked');
    expect(within(picked).getByText('Dec 3')).toBeTruthy();
    expect(picked.props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('answer-when-pick').props.accessibilityState).toEqual({ checked: false });
    expect(screen.getByTestId('answer-when-payday').props.accessibilityState).toEqual({ checked: false });
  });
});

describe('06.1-66 (FQ8, CC-2, DS-5): a decided check shows its outcome, never the buy buttons', () => {
  const decided = (status: string, over: Record<string, unknown> = {}) => [
    { id: 'c1', name: 'Laptop', created_by: 'u1', household_id: 'h1', version: 2, inputs: {}, deleted_at: null, status, decided_at: '2026-11-12T15:00:00Z', updated_at: '2026-11-12T15:00:00Z', ...over },
  ];

  it.each([
    ['bought', 'Bought on Nov 12.'],
    ['waiting', 'Saving for it since Nov 12.'],
    ['passed', 'Not buying, Nov 12.'],
  ])('%s: the outcome line and a link to Past decisions; no action bar', async (status, text) => {
    load(ledgerRun('N02'));
    mockList.rows = decided(status);
    await open();
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByTestId('answer-actions')).toBeNull();
    expect(screen.queryByText('I bought it')).toBeNull();
    expect(screen.queryByText('Save for it')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('See it in Past decisions'));
    });
    expect(mockPush).toHaveBeenCalledWith('/decide/past/c1');
  });

  it('a decided check with no decided_at dates the outcome by its last change', async () => {
    load(ledgerRun('N02'));
    mockList.rows = decided('bought', { decided_at: null, updated_at: '2026-11-10T15:00:00Z' });
    await open();
    expect(screen.getByText('Bought on Nov 10.')).toBeTruthy();
  });

  it('DS-5: after Add to records the next render shows the outcome line, not a stale action bar', async () => {
    load(ledgerRun('N02'));
    mockList.rows = decided('open', { decided_at: null });
    const view = await open();
    expect(screen.getByTestId('answer-actions')).toBeTruthy();
    mockList.rows = decided('bought');
    await act(async () => {
      view.rerender(<AnswerScreen id="c1" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    });
    expect(screen.getByTestId('answer-outcome')).toBeTruthy();
    expect(screen.queryByTestId('answer-actions')).toBeNull();
  });

  it('a decided Not ready check shows the outcome in place of the exits', async () => {
    load(notReadyRun());
    mockList.rows = decided('passed');
    await open();
    expect(screen.getByText('Not buying, Nov 12.')).toBeTruthy();
    expect(screen.queryByTestId('answer-not-ready-exits')).toBeNull();
  });
});

describe('06.1-66 (FQ5, CS-8): the safety-net line', () => {
  it('shows while the question is unanswered, opens the bound question, and hides once answered there', async () => {
    mockNet.unanswered = true;
    load(ledgerRun('N02'));
    await open();
    expect(screen.getByText('Safety net: not answered yet.')).toBeTruthy();
    expect(screen.queryByTestId('net-answer')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Safety net: not answered yet.'));
    });
    // Put away again: the line stays.
    await act(async () => {
      fireEvent.press(screen.getByTestId('net-away'));
    });
    expect(screen.queryByTestId('net-away')).toBeNull();
    expect(screen.getByText('Safety net: not answered yet.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Safety net: not answered yet.'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('net-answer'));
    });
    expect(screen.queryByText('Safety net: not answered yet.')).toBeNull();
  });

  it('is absent once the question is answered', async () => {
    load(ledgerRun('N02'));
    await open();
    expect(screen.queryByTestId('answer-net-line')).toBeNull();
  });
});

describe('06.1-63 (CN-13): a side picked on Compare comes back to this same answer', () => {
  it('a later installments side opens the plan sheet; a later cash side pays once', async () => {
    const base = ledgerRun('N09');
    const plan = { mode: 'plan', cadence: { unit: 'month', every: 1 }, count: 12, termMonths: 12, apr: null, fees: { setup: 0, perPeriod: 0, end: 0 }, deposit: 0, tradeIn: 0, quotedPayment: null, firstPayment: null, deferredInterestTerm: false };
    const run = { ...base, check: { ...base.check, pay: plan as unknown as CheckV2['pay'] } };
    load(run);
    const view = await wrap(<AnswerScreen id="c1" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    expect(screen.queryByTestId('plan-sheet')).toBeNull();
    await view.rerender(<AnswerScreen id="c1" side="installments" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    expect(screen.getByTestId('plan-sheet')).toBeTruthy();
    expect(mockState.update).not.toHaveBeenCalled();
    await view.rerender(<AnswerScreen id="c1" side="cash" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    expect(mockState.update).toHaveBeenCalledTimes(1);
    const next = (mockState.update.mock.calls[0] as [(c: CheckV2) => CheckV2])[0](run.check);
    expect(next.pay).toEqual({ mode: 'once' });
    expect(mockState.flush).toHaveBeenCalled();
  });
});

describe('06.1-68 (H-7): answers show at once and can be taken back', () => {
  const S1 = '11111111-1111-4111-8111-111111111111';
  const S2 = '22222222-2222-4222-8222-222222222222';
  const ITEM_BASE = { code: 'past_month_missing', month: '2026-10', seriesId: null, envelopeId: null, lineId: null, name: null, amount: null, date: null } as const;
  const BILL = { ...ITEM_BASE, kind: 'bill', seriesId: S1, name: 'Netflix', amount: 1199, date: '2026-10-03' } as const;
  const PAY = { ...ITEM_BASE, kind: 'pay', seriesId: S2, name: 'Salary', amount: 250000, date: '2026-10-03' } as const;
  const LINE = { id: 'l-net', household_id: 'h1', local_date: '2026-10-03', version: 2, name: 'Netflix', status: 'pending', deleted_at: null };
  const KEY = `paid-by-other:${S1}:2026-10-03`;

  function notReadyWith(items: readonly unknown[], answers: { kind: string; key: string }[] = []): void {
    const run = notReadyRun();
    const evaluation = withResult(run, (r) => ({ ...r, readiness: { ready: false, missing: ['past_month_missing'], items: items as never, waived: [] } }));
    const months = [{ ...(ledgerRun('N02').inputs.months[0] as object), month: '2026-10' }];
    load(run, { evaluation, inputs: { ...run.inputs, months: months as never }, answers });
  }
  const press = async (node: Parameters<typeof fireEvent.press>[0]): Promise<void> => {
    await act(async () => {
      fireEvent.press(node);
    });
  };
  const again = async (view: Awaited<ReturnType<typeof open>>): Promise<void> => {
    await act(async () => {
      view.rerender(<AnswerScreen id="c1" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    });
  };

  it('CB-11 / CF-2: a tap reads "Saved, updating…" at once, the other choices are off, and the next item is First', async () => {
    notReadyWith([BILL, PAY]);
    await open();
    await press(within(screen.getByTestId('readiness-row-0')).getByText('Someone else paid it'));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('readiness-saved-0')).toHaveTextContent('Saved, updating…');
    const row0 = within(screen.getByTestId('readiness-row-0'));
    const other = row0.getByRole('button', { name: 'Someone else always pays it' });
    expect(other.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    // T-06.1-68-01: a second tap writes nothing
    await press(other);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId('readiness-row-1')).getByText(/^First: Salary/)).toBeTruthy();
  });

  it('the row leaves once the engine drops it; the next item is the only one shown', async () => {
    notReadyWith([BILL, PAY]);
    const view = await open();
    await press(within(screen.getByTestId('readiness-row-0')).getByText('Someone else paid it'));
    notReadyWith([PAY], [{ kind: 'readiness_waiver', key: KEY }]);
    await again(view);
    expect(screen.queryByText('Saved, updating…')).toBeNull();
    expect(screen.getByText(/^First: Salary/)).toBeTruthy();
    expect(screen.queryByTestId('readiness-row-1')).toBeNull();
  });

  it('Undo (the answer gone from the live answers after it was seen) brings the row back open', async () => {
    notReadyWith([BILL, PAY]);
    const view = await open();
    await press(within(screen.getByTestId('readiness-row-0')).getByText('Someone else paid it'));
    // the answer lands in the cache, but the engine still names the bill
    notReadyWith([BILL, PAY], [{ kind: 'readiness_waiver', key: KEY }]);
    await again(view);
    expect(screen.getByTestId('readiness-saved-0')).toBeTruthy();
    // Undo soft-deletes it: the live answers no longer hold the key
    notReadyWith([BILL, PAY], []);
    await again(view);
    expect(screen.queryByText('Saved, updating…')).toBeNull();
    expect(screen.getByText(/^First: Netflix/)).toBeTruthy();
    const pill = within(screen.getByTestId('readiness-row-0')).getByRole('button', { name: 'Someone else paid it' });
    expect(pill.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it('a skipped line shows at once and comes back open when the line is pending again (Undo)', async () => {
    mockCache.lists = [[['transactions', 'h1', '2026-10'], [LINE]]];
    notReadyWith([{ ...BILL, lineId: 'l-net' }]);
    const view = await open();
    await press(screen.getByText('It didn’t happen'));
    expect(mockSkip).toHaveBeenCalledWith(LINE, 'u1');
    expect(screen.getByTestId('readiness-saved-0')).toBeTruthy();
    // the skip lands (the line is no longer pending), then Undo puts it back
    mockCache.lists = [[['transactions', 'h1', '2026-10'], [{ ...LINE, status: 'skipped' }]]];
    await again(view);
    expect(screen.getByTestId('readiness-saved-0')).toBeTruthy();
    mockCache.lists = [[['transactions', 'h1', '2026-10'], [LINE]]];
    await again(view);
    await again(view);
    expect(screen.queryByTestId('readiness-saved-0')).toBeNull();
  });

  it('an answer that writes nothing does not mark the row', async () => {
    notReadyWith([PAY]);
    mockSave.mockReturnValueOnce(null);
    await open();
    await press(screen.getByText('Income comes in elsewhere'));
    expect(screen.queryByTestId('readiness-saved-0')).toBeNull();
  });

  it('CF-3: while the engine is updating, the verdict dims and says "Updating…"', async () => {
    load(ledgerRun('N02'), { updating: true });
    const view = await open();
    expect(screen.getByTestId('answer-updating')).toHaveTextContent('Updating…');
    const area = screen.getByTestId('answer-verdict-area');
    expect(area.props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
    expect(StyleSheet.flatten(area.props.style).opacity).toBeLessThan(1);
    mockState.updating = false;
    await again(view);
    expect(screen.queryByTestId('answer-updating')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('answer-verdict-area').props.style).opacity).toBeUndefined();
  });

  it('CF-4: None on the debts question shows "Saved: no other debts." with its Undo step', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: withResult(run, (r) => ({ ...r, facts: [{ code: 'ask_debts_not_recorded', values: { kind: 'all' } }, ...r.facts] })) });
    await open();
    await press(screen.getByText('None'));
    expect(mockAnswered).toHaveBeenCalledWith({ flag: 'no_debts', on: true });
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.answer.fact.noneSaved' }, stepId: 'step-none' });
  });

  it('CF-4: None already saved shows no toast', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: withResult(run, (r) => ({ ...r, facts: [{ code: 'ask_debts_not_recorded', values: { kind: 'all' } }, ...r.facts] })) });
    mockAnswered.mockReturnValueOnce(null);
    await open();
    await press(screen.getByText('None'));
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('CC-8: Change my answer flips the cover answer with "Answer changed." and an Undo that puts it back', async () => {
    const run = ledgerRun('N02');
    load(run, {
      evaluation: withResult(run, (r) => ({ ...r, facts: [{ code: 'rests_on_your_answer', values: { monthly: 5000, months: 6 } }, ...r.facts] })),
      check: { ...run.check, volatileCover: true },
    });
    await open();
    await press(screen.getByText('Change my answer'));
    const flip = (mockState.update.mock.calls[0] as [(c: CheckV2) => CheckV2])[0];
    expect(flip({ ...run.check, volatileCover: true }).volatileCover).toBe(false);
    const toast = mockToast.mock.calls[0]?.[0] as { kind: string; text: { key: string }; onUndo: () => void };
    expect(toast).toEqual(expect.objectContaining({ kind: 'ordinary', text: { key: 'decide.screens.answer.fact.coverChanged' } }));
    await act(async () => {
      toast.onUndo();
    });
    const back = (mockState.update.mock.calls[1] as [(c: CheckV2) => CheckV2])[0];
    expect(back({ ...run.check, volatileCover: false }).volatileCover).toBe(true);
  });

  it('a plan named in the plan sheet is stored as L0.plan_name with the pay change, in one update', async () => {
    const run = ledgerRun('N02');
    load(run);
    await wrap(<AnswerScreen id="c1" side="installments" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    await press(screen.getByTestId('plan-use'));
    expect(mockState.update).toHaveBeenCalledTimes(1);
    const next = (mockState.update.mock.calls[0] as [(c: CheckV2) => CheckV2])[0](run.check);
    expect(next.pay).toEqual({ mode: 'plan', count: 24 });
    expect(next.layerAnswers['L0.plan_name']).toBe('Car loan');
    expect(next.layerAnswers).not.toHaveProperty('plan_name');
    expect(mockState.flush).toHaveBeenCalledTimes(1);
  });
});

describe('06.1-67 (H-6): the answer, short line first', () => {
  const tap = async (node: Parameters<typeof fireEvent.press>[0]): Promise<void> => {
    await act(async () => {
      fireEvent.press(node);
    });
  };

  it('DN-4: Full cost, with tax opens the Full cost sheet, never a stepper step', async () => {
    load(ledgerRun('N02'));
    await open();
    await tap(screen.getByTestId('answer-detail-fullCost'));
    expect(screen.getByTestId('fullcost-item')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('DN-4: while the answer updates, a tap on a More detail row opens nothing', async () => {
    load(ledgerRun('N02'), { updating: true });
    await open();
    await tap(screen.getByTestId('answer-detail-fullCost'));
    await tap(screen.getByTestId('answer-detail-running'));
    expect(screen.queryByTestId('fullcost-item')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('CS-4 / CS-5: the missing-figures line opens Give it more to go on, which lists as many lines as its row counts', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: withResult(run, (r) => ({ ...r, missing: ['everyday_unknown', 'records_look_behind'] as never })) });
    await open();
    const row = screen.getByTestId('answer-detail-giveMore');
    const counted = Number(/^(\d+)/.exec(String(row.props.accessibilityLabel))?.[1]);
    await tap(screen.getByTestId('answer-missing-more'));
    const listed = [...screen.queryAllByTestId('give-more-next'), ...screen.queryAllByTestId('give-more-readiness'), ...screen.queryAllByTestId('give-more-missing')];
    expect(screen.getAllByTestId('give-more-missing')).toHaveLength(2);
    expect(listed).toHaveLength(counted);
    expect(screen.queryByText(/Remind me/)).toBeNull();
  });

  it('CS-7: Running costs and Side by side carry the chevron; the rows that open a sheet do not', async () => {
    load(ledgerRun('N02'));
    await open();
    const chevrons = screen.getAllByTestId(/^answer-detail-.+-chevron$/).map((n) => String(n.props.testID));
    expect(chevrons).toEqual(['answer-detail-running-chevron', 'answer-detail-sideBySide-chevron']);
  });
});

describe('06.1-82: device-check gaps G-61-8, G-61-11, G-61-3', () => {
  const ask = (run: Run) => withResult(run, (r) => ({ ...r, facts: [{ code: 'ask_debts_not_recorded', values: { kind: 'card' } }, ...r.facts] }));

  it('G-61-8: with "None" already answered the debts ask is not shown, so it never sits unanswerable', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: ask(run) });
    mockSettings.row = { answered_no_debts_at: '2026-11-01T00:00:00Z' };
    await open();
    expect(screen.queryByTestId('answer-fact-actions-ask_debts_not_recorded')).toBeNull();
    expect(screen.queryByText('No card is recorded. Do you have one?')).toBeNull();
    expect(screen.getByTestId('answer-verdict')).toBeTruthy();
  });

  it('G-61-8: not answered yet, the ask shows and None records it', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: ask(run) });
    mockSettings.row = { answered_no_debts_at: null };
    await open();
    expect(screen.getByTestId('answer-fact-actions-ask_debts_not_recorded')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('None'));
    });
    expect(mockAnswered).toHaveBeenCalledWith({ flag: 'no_debts', on: true });
  });

  it('G-61-11: "Price and how you pay" shows the plan payment alone; running costs are their own row', async () => {
    const base = ledgerRun('N09');
    const purchase = { ...(base.evaluation.purchase as NonNullable<Evaluation['purchase']>), monthly: 73417 as never, runningMonthly: 32300 as never };
    load(base, { evaluation: { ...base.evaluation, purchase } });
    await open();
    expect(base.check.pay.mode).toBe('plan');
    const told = within(screen.getByTestId('answer-told-2'));
    expect(told.getByText('$411.17 a month on a plan')).toBeTruthy();
    expect(screen.queryByText('$734.17 a month on a plan')).toBeNull();
  });

  const envelopeReadiness = (run: Run, goalId: string): Evaluation =>
    withResult(run, (r) => ({
      ...r,
      readiness: {
        ready: false,
        missing: ['envelopes_unconfirmed'],
        items: [{ kind: 'envelopes', code: 'envelopes_unconfirmed', month: '2026-11', seriesId: null, envelopeId: goalId, lineId: null, name: 'laptop', amount: null, date: null }],
        waived: [],
      },
    }));
  const waiting = [{ id: 'c1', name: 'Laptop', created_by: 'u1', household_id: 'h1', version: 2, inputs: {}, deleted_at: null, status: 'waiting', decided_at: '2026-11-12T15:00:00Z', updated_at: '2026-11-12T15:00:00Z' }];

  it('G-61-3: a decided check is not Not ready because of the goal Save for it made for it', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: envelopeReadiness(run, 'g1') });
    mockList.rows = waiting;
    mockGoals.rows = [{ id: 'g1', check_id: 'c1', deleted_at: null }];
    await open();
    expect(screen.queryByTestId('answer-not-ready')).toBeNull();
    expect(screen.getByTestId('answer-verdict')).toBeTruthy();
    expect(screen.getByText('Saving for it since Nov 12.')).toBeTruthy();
  });

  it('G-61-3: another goal with no account still makes it Not ready', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: envelopeReadiness(run, 'g2') });
    mockList.rows = waiting;
    mockGoals.rows = [{ id: 'g1', check_id: 'c1', deleted_at: null }, { id: 'g2', check_id: null, deleted_at: null }];
    await open();
    expect(screen.getByTestId('answer-not-ready')).toBeTruthy();
  });

  it('G-61-3: an open check keeps the Not ready card, and a deleted goal is not its own', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: envelopeReadiness(run, 'g1') });
    mockGoals.rows = [{ id: 'g1', check_id: 'c1', deleted_at: null }];
    const view = await open();
    expect(screen.getByTestId('answer-not-ready')).toBeTruthy();
    mockList.rows = waiting;
    mockGoals.rows = [{ id: 'g1', check_id: 'c1', deleted_at: '2026-11-12T16:00:00Z' }];
    await act(async () => {
      view.rerender(<AnswerScreen id="c1" renderGate={noGate} renderNetQuestion={renderNetQuestion} writes={writes} />);
    });
    expect(screen.getByTestId('answer-not-ready')).toBeTruthy();
  });
});
