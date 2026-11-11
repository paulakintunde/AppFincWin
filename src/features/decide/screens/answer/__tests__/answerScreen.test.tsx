// 06.1-23: the answer route body on engine-run fixtures. The data hooks are mocked at their edges (stored check, engine, sync); the
// frame, rows, cards and sheets are the real ones. Covers the gate, the crossed-rule haptic, "pre-filled, not checked", in-place pay and
// date changes, error and offline, the analytics payload, and the missing-figure Fix rows.
import React from 'react';
import { Pressable } from 'react-native';
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
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => {
  const router = {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => true,
  };
  return { router, useRouter: () => router, useLocalSearchParams: () => ({}) };
});
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('@/features/decide/check/CheckFlowScreen', () => ({ CheckNotFound: () => null }));

const mockMarkSeen = jest.fn(() => true);
const mockHistory = jest.fn(() => true);
const mockAnswered = jest.fn();
const mockPending: { rows: unknown[] } = { rows: [] };
jest.mock('@/data/mutations/decideChecks', () => ({
  useMarkCheckSeen: () => ({ markSeen: mockMarkSeen }),
  useCreateCheck: () => ({ pendingRows: mockPending.rows }),
}));
jest.mock('@/data/mutations/decideHistory', () => ({ useRecordCheckHistory: () => ({ mutate: mockHistory }) }));
jest.mock('@/data/mutations/decideSetup', () => ({ useSetDecideAnswered: () => ({ set: mockAnswered }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', name: 'Everyday', deleted_at: null }] }) }));

const mockState = {
  run: undefined as unknown as Run,
  evaluation: null as Evaluation | null,
  check: null as CheckV2 | null,
  status: 'ready' as 'ready' | 'error' | 'loading',
  online: true,
  update: jest.fn(),
  flush: jest.fn(),
  refetch: jest.fn(),
};

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: true, region: 'US', today: '2026-11-05' }),
}));
const mockList: { rows: unknown[] | null } = { rows: null };
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({
    isLoading: false,
    data: mockList.rows ?? [{ id: 'c1', name: 'Laptop', created_by: 'u1', household_id: 'h1', version: 1, inputs: {}, deleted_at: null, last_seen_state: null, last_seen_basis: null }],
  }),
}));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ inputs: mockState.run.inputs, status: 'ready' }) }));
jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: () => ({ isOnline: mockState.online }) }));
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
    paydays: () => ['2026-11-20'],
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
jest.mock('../../sheets/DatePickerSheet', () => ({ DatePickerSheet: () => null }));
jest.mock('../../sheets/InstallmentPlanSheet', () => ({ InstallmentPlanSheet: () => null }));

const writes = { notBuying: jest.fn(() => 'step-1') };

function load(run: Run, over: Partial<typeof mockState> = {}): void {
  mockState.run = run;
  mockState.evaluation = run.evaluation;
  mockState.check = run.check;
  mockState.status = 'ready';
  mockState.online = true;
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

async function open(renderGate: (onDone: () => void) => React.ReactNode = noGate) {
  return wrap(<AnswerScreen id="c1" renderGate={renderGate} writes={writes} />);
}

/** A copy of a run's evaluation with the result changed. */
const withResult = (run: Run, change: (r: Evaluation['result']) => Evaluation['result']): Evaluation => ({ ...run.evaluation, result: change(run.evaluation.result) });

beforeEach(() => {
  jest.clearAllMocks();
  mockPending.rows = [];
  mockList.rows = null;
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
  it('shows the gate before any verdict, then the verdict once it is done', async () => {
    load(ledgerRun('N02'));
    await open(withGate);
    expect(screen.getByTestId('gate')).toBeTruthy();
    expect(screen.queryByTestId('answer-frame')).toBeNull();
    expect(screen.queryByTestId('answer-verdict-badge')).toBeNull();
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
    view.rerender(<AnswerScreen id="c1" renderGate={noGate} writes={writes} />);
    expect(mockHaptic).toHaveBeenCalledTimes(1);
  });

  it('no crossed rule, no buzz', async () => {
    load(ledgerRun('N02'));
    await open();
    expect(mockHaptic).not.toHaveBeenCalled();
  });
});

describe('What you told Decide (D21, D21b)', () => {
  it('lists the three rows after the stepper, and marks a skipped costs step "pre-filled, not checked"', async () => {
    const run = ledgerRun('N02');
    load(run, { check: { ...run.check, layerAnswers: { ...run.check.layerAnswers, 'L0.skipped_steps': [3] } } });
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

  it('is not shown for a check that did not come through the stepper', async () => {
    load(ledgerRun('N02'));
    await open();
    expect(screen.queryByTestId('answer-told')).toBeNull();
  });
});

describe('pay mode and date change in place (UX-23)', () => {
  it('When: Next payday saves the draft and re-judges without navigating', async () => {
    load(ledgerRun('N02'));
    await open();
    await act(async () => {
      fireEvent.press(screen.getByText('Next payday'));
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
    view.rerender(<AnswerScreen id="c1" renderGate={noGate} writes={writes} />);
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

  it('a not-ready answer is neither counted nor remembered', async () => {
    load(notReadyRun());
    await open();
    expect(screen.getByText('Finish setup')).toBeTruthy();
    expect(mockTrack).not.toHaveBeenCalled();
    expect(mockMarkSeen).not.toHaveBeenCalled();
    expect(mockHistory).not.toHaveBeenCalled();
  });
});

describe('missing figures (N21, CO-D-38, CO-D-43)', () => {
  const asks = (run: Run, missing: readonly string[], extra: Evaluation['result']['facts'] = []): Evaluation =>
    withResult(run, (r) => ({ ...r, code: 'needs_input', variant: null, missing: missing as never, facts: [...r.facts, ...extra] }));

  it('shows each missing figure on its own row with a Fix link', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: asks(run, ['no_income_figures', 'unspent_not_confirmed', 'everyday_unknown']) });
    await open();
    expect(screen.getAllByText('Fix')).toHaveLength(3);
    for (const code of ['no_income_figures', 'unspent_not_confirmed', 'everyday_unknown']) expect(screen.getByTestId(`answer-fix-${code}`)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-fix-no_income_figures'));
    });
    expect(mockPush).toHaveBeenCalledWith('/decide/setup/pay');
  });

  it('a price fix opens the price step of this check', async () => {
    const run = ledgerRun('N02');
    load(run, { evaluation: asks(run, ['no_price']) });
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('answer-fix-no_price'));
    });
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/decide/check/price' }));
  });

  it('no overdraft limit offers Add limit and No overdraft, both opening that account', async () => {
    const run = ledgerRun('N05');
    load(run);
    await open();
    expect(screen.getByText('Add limit')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('No overdraft'));
    });
    expect(mockPush).toHaveBeenCalledWith('/accounts/a1');
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
    expect(mockRouter.replace).toHaveBeenCalledWith('/decide');
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
