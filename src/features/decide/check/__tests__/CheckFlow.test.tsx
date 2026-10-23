import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { BackHandler, ScrollView } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { minorUnits } from '@/engine/money';
import type { DecideCheckRow } from '@/db/decideChecks';
import { interceptSwipeBack, setSwipeBackInterceptor } from '@/features/navigation/swipeBackGesture';
import * as decideHints from '../../hints/decideHints';
import { CheckFlowScreen, shareFor } from '../CheckFlowScreen';
import { SOLE_SHARE } from '@/engine/decide';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import { EMPTY_STACK, type CheckComputation, type CheckInputs, type SnapshotResult, type StackSelection } from '../../snapshot/types';
import { CARD_CHOICE, TODAY, loggedSource, month, noneSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { wrap } from '../steps/__tests__/helpers/stepProps';

jest.setTimeout(60000);

// ── controllable doubles (names start with `mock` so the jest.mock factories may read them) ──
let mockStatus: 'loading' | 'ready' | 'not_found' = 'ready';
let mockRow: DecideCheckRow | null = null;
let mockInitial: CheckInputs;
let mockSource: SnapshotResult | null = null;
let mockStack: StackSelection = EMPTY_STACK;
let mockAccounts: { id: string; name: string; kind: string; currency: string; archived_at: null; deleted_at: null }[] = [];
let mockMembers = new Map<string, string>();
let mockBought: { status: string; computation: CheckComputation | null } = { status: 'idle', computation: null };
const mockUpdate = jest.fn();
const mockSaveNow = jest.fn();
let mockSaveResult: 'saved' | 'nothing' | 'waiting' = 'saved';
const mockTrack = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockToast = jest.fn();
const mockMarkSeen = jest.fn();
const mockAbandon = jest.fn(() => 'step-1');
const mockDiscard = jest.fn();
const mockCallOrder: string[] = [];
let mockOnline = true;
let mockSaveStatus: 'saving' | 'offline' | 'saved' | 'failed' | null = null;
let mockChecks: { id: string; status: string; deleted_at: string | null }[] | undefined;
let mockPendingEdit = false;
let mockConfirm = { visible: false, lines: [] as string[], onConfirm: jest.fn(), onCancel: jest.fn() };
const mockSaveTerms = jest.fn();
const mockSaveRate = jest.fn();
const mockBoughtHook = jest.fn();
const mockRequestCommit = jest.fn();
const backHandlers: (() => boolean)[] = [];
let mockDebts: { id: string }[] = [];

jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticLight: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: jest.fn(), focusAccessibility: jest.fn() }));
// CR-D03: a focused screen runs the focus callback; mockSetFocus(false) blurs it (another screen pushed on top).
let mockSetFocus: ((focused: boolean) => void) | null = null;
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const R = jest.requireActual<typeof import('react')>('react');
    const [focused, setFocused] = R.useState(true);
    R.useEffect(() => {
      mockSetFocus = setFocused;
    }, []);
    R.useEffect(() => (focused ? cb() : undefined), [cb, focused]);
  },
  useRouter: () => ({ push: jest.fn() }),
  router: { back: (...a: unknown[]) => mockBack(...a), canGoBack: () => true, replace: (...a: unknown[]) => mockReplace(...a), navigate: jest.fn() },
}));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', ready: true, showCents: false }),
}));
jest.mock('../useCheckDraft', () => {
  const R = require('react');
  return {
    useCheckDraft: () => {
      const [inputs, setInputs] = R.useState(mockInitial);
      const update = R.useCallback((patch: Partial<CheckInputs>, opts?: unknown) => {
        mockUpdate(patch, opts);
        setInputs((p: CheckInputs) => ({ ...p, ...patch }));
      }, []);
      const saveNow = R.useCallback(() => {
        mockSaveNow();
        mockCallOrder.push('save');
        return Promise.resolve(mockSaveResult);
      }, []);
      return { status: mockStatus, row: mockRow, inputs, update, saveNow, isNew: mockRow === null, discard: mockDiscard, pendingEdit: mockPendingEdit, editedOffline: false };
    },
  };
});
jest.mock('../useCommitDecision', () => ({
  useCommitDecision: () => ({ requestCommit: (...a: unknown[]) => mockRequestCommit(...a), blockedKey: null, confirm: mockConfirm }),
}));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('../../notifications/waitReminder', () => ({ cancelCheckReminders: jest.fn(() => Promise.resolve()) }));
jest.mock('../useBoughtCheckComputation', () => ({ useBoughtCheckComputation: (...a: unknown[]) => (mockBoughtHook(...a), mockBought) }));
jest.mock('../useEstimateBias', () => ({ useEstimateBias: () => ({ running: null, payment: null, dayOne: null }) }));
jest.mock('@/data/queries/decide', () => ({
  useDecideSnapshot: () => ({ status: 'ready', result: mockSource, source: null, retry: jest.fn() }),
  useOtherChecks: () => mockStack,
  useDecideChecks: () => ({ data: mockChecks }),
  useDebts: () => ({ data: mockDebts }),
  useSavingsGoals: jest.fn(),
  useGoalLines: jest.fn(),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: new Map(), isLoading: false }),
  useHouseholdMemberNames: () => mockMembers,
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [] }) }));
let mockRedirect: string | null = null;
jest.mock('@/data/mutations/decideChecks', () => ({
  useMarkCheckSeen: () => ({ markSeen: (...a: unknown[]) => mockMarkSeen(...a) }),
  useReopenCheck: () => ({ reopen: jest.fn(() => 'new-id') }),
  useAbandonCheck: () => ({
    abandon: (...a: unknown[]) => {
      mockCallOrder.push('abandon');
      return (mockAbandon as (...x: unknown[]) => string)(...a);
    },
  }),
  useReopenRedirect: () => mockRedirect,
}));
jest.mock('@/data/mutations/decideLinks', () => ({
  useSaveCardRate: () => ({ save: (...a: unknown[]) => mockSaveRate(...a) }),
  useSaveCardTerms: () => ({ save: (...a: unknown[]) => mockSaveTerms(...a) }),
}));
jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: () => ({ isOnline: mockOnline, queued: 0, failed: 0, lastSyncedAt: null }) }));
jest.mock('../useCheckSaveStatus', () => ({ useCheckSaveStatus: () => mockSaveStatus, useAnnounceSaveStatus: jest.fn() }));
jest.mock('@/features/record/entry/entryHost', () => ({ openEntry: jest.fn() }));
// the chart is drawn by the day-by-day section; its geometry is covered by its own tests
jest.mock('../../charts/CashPathChart', () => ({ CashPathChart: () => null }));

// ── fixtures ──
function paySource(over: Partial<SnapshotResult['meta']> = {}): SnapshotResult {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 500_000, 300_000));
  const pay = { seriesId: 's-pay', confirmed: true, freq: 'monthly', anchorDate: '2026-04-01', endDate: null, occurrenceCount: null, latestAmount: 500_000, currency: 'USD', lastPaidDate: '2026-10-01' } as never;
  const limits = { reserve: null, dsrLine: null, unsecuredIncomeMultiple: null, investingFloor: minorUnits(0), savingFloor: null, spareFloor: null };
  const base = loggedSource({ cashOnHand: minorUnits(4_000_000), incomeSeries: [pay], months, monthlyInvesting: minorUnits(0), limits }, 4_000_000);
  return { ...base, meta: { ...base.meta, fullMonths: 6, ...over } };
}

/** A price that does not fit, so the options section has something to say and the warnings render. */
function inputsOf(over: Partial<CheckInputs> = {}): CheckInputs {
  return { ...emptyCheckInputs('buy', TODAY), name: 'Laptop', advertised: 150_000, method: 'cash', ...over };
}

function rowOf(over: Partial<DecideCheckRow> = {}): DecideCheckRow {
  return { id: 'c1', status: 'open', furthest_step: 1, last_seen_state: null, last_seen_basis: null, version: 1, created_by: 'u1', kind: 'buy', ...over } as unknown as DecideCheckRow;
}

async function open(over: Partial<CheckInputs> = {}, props: Partial<React.ComponentProps<typeof CheckFlowScreen>> = {}) {
  mockInitial = inputsOf(over);
  return wrap(<CheckFlowScreen id="c1" {...props} />);
}

const stepText = (n: number) => `Step ${n} of 5`;

async function editPrice(value: string) {
  const field = screen.getByLabelText('Price you have been quoted');
  await fireEvent.changeText(field, value);
  await fireEvent(field, 'blur');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = 'ready';
  mockSaveResult = 'saved';
  mockCallOrder.length = 0;
  mockOnline = true;
  mockSaveStatus = null;
  mockChecks = undefined;
  mockPendingEdit = false;
  mockConfirm = { visible: false, lines: [], onConfirm: jest.fn(), onCancel: jest.fn() };
  mockRow = null;
  mockSource = paySource();
  mockStack = EMPTY_STACK;
  mockAccounts = [];
  mockMembers = new Map();
  mockDebts = [];
  mockBought = { status: 'idle', computation: null };
  setSwipeBackInterceptor(null);
  mockRedirect = null;
  backHandlers.length = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
    backHandlers.push(handler as () => boolean);
    return { remove: () => { backHandlers.splice(backHandlers.indexOf(handler as () => boolean), 1); } };
  });
});

describe('the five steps', () => {
  it('walks item, price and payment, impact, alternatives and decision with Next', async () => {
    await open({}, { initialStep: 1 });
    expect(screen.getByText(stepText(1))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next: Price'));
    expect(screen.getByText(stepText(2))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next: Impact'));
    expect(screen.getByText(stepText(3))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next: Alternatives'));
    expect(screen.getByText(stepText(4))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next: Decide'));
    expect(screen.getByText(stepText(5))).toBeTruthy();
    expect(screen.getByLabelText('Pick an outcome').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(screen.queryByLabelText(/^Next:/)).toBeNull();
  });

  it('opens on step 3 when a price and a method already exist, else on step 1', async () => {
    await open();
    expect(screen.getByText(stepText(3))).toBeTruthy();
  });

  it('opens on step 1 with no price, and Next waits for one', async () => {
    await open({ advertised: null, method: null });
    expect(screen.getByText(stepText(1))).toBeTruthy();
    expect(screen.getByText('A price comes first.')).toBeTruthy();
    expect(screen.getByLabelText('Next: Price').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('Next on step 1 is disabled with a past need-by date', async () => {
    await open({ needBy: '2026-10-01' }, { initialStep: 1 });
    expect(screen.getByLabelText('Next: Price').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('records the furthest step when the user moves past it', async () => {
    mockRow = rowOf({ furthest_step: 2 });
    await open({}, { initialStep: 2 });
    await fireEvent.press(screen.getByLabelText('Next: Impact'));
    expect(mockUpdate).toHaveBeenCalledWith({}, { step: 3 });
  });

  it('a jump to step 3 without a price and a payment method lands on the first incomplete step with the hint', async () => {
    mockRow = rowOf({ furthest_step: 4 });
    await open({ advertised: null, method: null }, { initialStep: 1 });
    await fireEvent.press(screen.getByLabelText('Step 3, Impact'));
    expect(screen.getByText(stepText(1))).toBeTruthy();
    expect(screen.getByText('A price and a payment method come first.')).toBeTruthy();
  });

  it('a jump with a price but no method lands on step 2', async () => {
    mockRow = rowOf({ furthest_step: 4 });
    await open({ method: null }, { initialStep: 1 });
    await fireEvent.press(screen.getByLabelText('Step 4, Alternatives'));
    expect(screen.getByText(stepText(2))).toBeTruthy();
  });

  it('reached steps are tappable on the step bar', async () => {
    mockRow = rowOf({ furthest_step: 4 });
    await open({}, { initialStep: 4 });
    await fireEvent.press(screen.getByLabelText('Step 2, Price and how you pay'));
    expect(screen.getByText(stepText(2))).toBeTruthy();
  });
});

describe('back', () => {
  it('every step change resets the shared ScrollView to y = 0 with no animation', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    await open({}, { initialStep: 1 });
    scrollTo.mockClear();
    await fireEvent.press(screen.getByLabelText('Next: Price'));
    await fireEvent.press(screen.getByLabelText('Next: Impact'));
    await fireEvent.press(screen.getByLabelText('Next: Alternatives'));
    await fireEvent.press(screen.getByLabelText('Next: Decide'));
    expect(scrollTo).toHaveBeenCalledTimes(4);
    for (const call of scrollTo.mock.calls) expect(call[0]).toEqual({ y: 0, animated: false });
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(scrollTo).toHaveBeenCalledTimes(5);
    scrollTo.mockRestore();
  });

  it('the header back steps back before it leaves, and never prompts', async () => {
    await open({}, { initialStep: 3 });
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByText(stepText(2))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByText(stepText(1))).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('the Android back button steps back past step 1 and leaves the press to the system at step 1', async () => {
    await open({}, { initialStep: 2 });
    expect(backHandlers).toHaveLength(1);
    await act(async () => {
      expect(backHandlers[0]!()).toBe(true);
    });
    expect(screen.getByText(stepText(1))).toBeTruthy();
    expect(backHandlers).toHaveLength(0);
  });

  it('the edge swipe steps back while past step 1 and is not claimed at step 1', async () => {
    await open({}, { initialStep: 3 });
    let handled = false;
    await act(async () => {
      handled = interceptSwipeBack();
    });
    expect(handled).toBe(true);
    expect(screen.getByText(stepText(2))).toBeTruthy();
    await act(async () => {
      interceptSwipeBack();
    });
    expect(screen.getByText(stepText(1))).toBeTruthy();
    expect(interceptSwipeBack()).toBe(false);
  });

  it('CR-D03: a covered check gives up back and the edge swipe, and takes them back when uncovered', async () => {
    await open({}, { initialStep: 3 });
    expect(backHandlers).toHaveLength(1);
    await act(async () => {
      mockSetFocus?.(false);
    });
    expect(backHandlers).toHaveLength(0);
    expect(interceptSwipeBack()).toBe(false);
    expect(screen.getByText(stepText(3))).toBeTruthy();
    await act(async () => {
      mockSetFocus?.(true);
    });
    expect(backHandlers).toHaveLength(1);
    await act(async () => {
      expect(interceptSwipeBack()).toBe(true);
    });
    expect(screen.getByText(stepText(2))).toBeTruthy();
  });

  it('IN-B05: a reopen that found the decision already reopened opens that live check', async () => {
    mockRedirect = 'c6000000-0000-0000-0000-0000000000b1';
    await open({}, { initialStep: 3 });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/decide/check/[id]', params: { id: 'c6000000-0000-0000-0000-0000000000b1' } });
  });

  it('releases the swipe-back interceptor on unmount', async () => {
    const view = await open({}, { initialStep: 3 });
    await act(async () => {
      expect(interceptSwipeBack()).toBe(true);
    });
    await view.unmount();
    expect(interceptSwipeBack()).toBe(false);
  });

  it('Save and close flushes the draft, toasts Saved and leaves', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Save and close'));
    expect(mockSaveNow).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ text: { key: 'decide.flow.saved' } }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('WR-C09: a new check never edited leaves without saying Saved', async () => {
    mockSaveResult = 'nothing';
    await open();
    await fireEvent.press(screen.getByLabelText('Save and close'));
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('WR-C09: an edit held until the account loads keeps the screen open and says so', async () => {
    mockSaveResult = 'waiting';
    await open();
    await fireEvent.press(screen.getByLabelText('Save and close'));
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.flow.saveWaiting' } });
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('analytics and the seen state', () => {
  it('fires check_step_viewed once per step with the step as a string', async () => {
    await open({}, { initialStep: 1 });
    await fireEvent.press(screen.getByLabelText('Next: Price'));
    await fireEvent.press(screen.getByLabelText('Back'));
    const views = mockTrack.mock.calls.filter((c) => c[0] === 'check_step_viewed');
    expect(views).toEqual([
      ['check_step_viewed', { step: '1' }],
      ['check_step_viewed', { step: '2' }],
    ]);
  });

  it('fires check_completed with the state the first time step 3 shows a verdict, and stores what was seen', async () => {
    mockRow = rowOf({ furthest_step: 3 });
    await open({}, { initialStep: 3 });
    const done = mockTrack.mock.calls.filter((c) => c[0] === 'check_completed');
    expect(done).toHaveLength(1);
    expect(['fits', 'adjust', 'no', 'missing']).toContain((done[0] as [string, { state: string }])[1].state);
    expect(Object.keys((done[0] as [string, object])[1])).toEqual(['state']);
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockMarkSeen).toHaveBeenCalledWith(mockRow, (done[0] as [string, { state: string }])[1].state, 'logged_months');
    await fireEvent.press(screen.getByLabelText('Back'));
    await fireEvent.press(screen.getByLabelText('Next: Impact'));
    expect(mockTrack.mock.calls.filter((c) => c[0] === 'check_completed')).toHaveLength(1);
  });

  it('WR-C03: returning to step 3 after the verdict changed records the newly seen state', async () => {
    mockRow = rowOf({ furthest_step: 3 });
    await open({}, { initialStep: 3 });
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    const first = mockMarkSeen.mock.calls[0]![1];
    await fireEvent.press(screen.getByLabelText('Back'));
    await fireEvent.press(screen.getByLabelText('Back'));
    const price = screen.getByLabelText('Price you have been quoted');
    await fireEvent.changeText(price, '200000');
    await fireEvent(price, 'blur');
    await fireEvent.press(screen.getByLabelText('Next: Price'));
    await fireEvent.press(screen.getByLabelText('Next: Impact'));
    expect(mockMarkSeen).toHaveBeenCalledTimes(2);
    expect(mockMarkSeen.mock.calls[1]![1]).not.toBe(first);
  });

  it('never fires check_completed before step 3', async () => {
    await open({}, { initialStep: 1 });
    expect(mockTrack.mock.calls.some((c) => c[0] === 'check_completed')).toBe(false);
  });
});

describe('step 3', () => {
  const ORDER = [
    'What breaks',
    'The month, line by line',
    'Cash path, next 90 days',
    'Where it lands',
    'If something goes wrong',
    'What would make it work',
    'If it went into investing instead',
    'With the expected income',
    'Who pays what',
    'Assumptions in play',
  ];
  const foldRow = (title: string) => screen.getByLabelText(new RegExp(`^${title}, `));
  const expandedOf = (title: string) => foldRow(title).props.accessibilityState.expanded as boolean;

  it('D-74 step 3 folds follow the R2 order', async () => {
    // a price that breaks a line (options), a raise (expected income) and two household members (who pays what)
    mockSource = paySource();
    mockMembers = new Map([
      ['u1', 'Alex'],
      ['u2', 'Sam'],
    ]);
    await open(
      {
        advertised: 9_000_000,
        scope: 'household',
        incomeChange: { direction: 'raises', amount: 100_000, startDate: '2026-12-01', likelihood: 'likely' },
      },
      { initialStep: 3 }
    );
    const labels = screen.getAllByRole('button').map((b) => String(b.props.accessibilityLabel ?? ''));
    const seen = ORDER.filter((title) => labels.some((l) => l.startsWith(`${title}, `)));
    expect(seen).toEqual(ORDER);
    const at = ORDER.map((title) => labels.findIndex((l) => l.startsWith(`${title}, `)));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('D-74 What breaks is open on arrival when there are warnings', async () => {
    await open({ advertised: 9_000_000 }, { initialStep: 3 });
    expect(expandedOf('What breaks')).toBe(true);
    expect(expandedOf('The month, line by line')).toBe(false);
    expect(screen.getByText('Cash cushion broken')).toBeTruthy();
  });

  it('D-74 every fold is closed on arrival when nothing breaks', async () => {
    await open({ advertised: 150_000 }, { initialStep: 3 });
    expect(foldRow('What breaks').props.accessibilityState.expanded).toBe(false);
    expect(screen.getByLabelText('What breaks, Nothing breaks')).toBeTruthy();
    expect(screen.queryByText('Every line')).toBeNull();
  });

  it('D-74 only one fold is open and the choice is kept between steps', async () => {
    await open({ advertised: 9_000_000 }, { initialStep: 3 });
    await fireEvent.press(foldRow('The month, line by line'));
    expect(expandedOf('The month, line by line')).toBe(true);
    expect(expandedOf('What breaks')).toBe(false);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByText(stepText(2))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next: Impact'));
    expect(screen.getByText(stepText(3))).toBeTruthy();
    expect(expandedOf('The month, line by line')).toBe(true);
    expect(expandedOf('What breaks')).toBe(false);
    // closing every fold is a choice too: it is kept, and the default does not reopen What breaks
    await fireEvent.press(foldRow('The month, line by line'));
    expect(expandedOf('The month, line by line')).toBe(false);
    expect(expandedOf('What breaks')).toBe(false);
  });

  it('D-75 the first fold tap dismisses the hint for good', async () => {
    const load = jest.spyOn(decideHints, 'loadFoldHintSeen').mockResolvedValue(false);
    const mark = jest.spyOn(decideHints, 'markFoldHintSeen').mockResolvedValue(undefined);
    await open({ advertised: 9_000_000 }, { initialStep: 3 });
    expect(await screen.findByText('Tap a row to see the detail')).toBeTruthy();
    await fireEvent.press(foldRow('Where it lands'));
    expect(screen.queryByText('Tap a row to see the detail')).toBeNull();
    expect(mark).toHaveBeenCalledWith('u1');
    expect(load).toHaveBeenCalledWith('u1');
  });

  it('D-75 a user who has seen the hint never gets it again', async () => {
    jest.spyOn(decideHints, 'loadFoldHintSeen').mockResolvedValue(true);
    await open({ advertised: 9_000_000 }, { initialStep: 3 });
    await act(async () => undefined);
    expect(screen.queryByText('Tap a row to see the detail')).toBeNull();
  });

  it('D-74 the investing section is on step 3, not step 4', async () => {
    await open({ advertised: 150_000, projectionRates: ['5'] }, { initialStep: 3 });
    expect(screen.getByLabelText(/^If it went into investing instead, /)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next: Alternatives'));
    expect(screen.getByText(stepText(4))).toBeTruthy();
    expect(screen.queryByText('If it went into investing instead')).toBeNull();
  });

  it('leaves out who pays what for one member and the expected income without a raise', async () => {
    await open({ advertised: 9_000_000 }, { initialStep: 3 });
    expect(screen.queryByText('Who pays what')).toBeNull();
    expect(screen.queryByText('With the expected income')).toBeNull();
    expect(screen.getByText('Assumptions in play')).toBeTruthy();
  });

  it('no figures on step 3 says there is nothing to judge', async () => {
    mockSource = noneSource();
    await open({}, { initialStep: 3 });
    expect(screen.getByText('There is nothing to judge this against yet.')).toBeTruthy();
    expect(screen.queryByText('The month, line by line')).toBeNull();
    expect(screen.queryByText('What would make it work')).toBeNull();
  });
});

describe('step 5', () => {
  it('step 5 gets the investment accounts', async () => {
    mockAccounts = [{ id: 'i1', name: 'Brokerage', kind: 'investment', currency: 'USD', archived_at: null, deleted_at: null }];
    await open({ ...emptyCheckInputs('invest', TODAY), name: 'Fund', advertised: 100_000, method: 'lump', outcome: 'go', goAccountId: 'a1' }, { initialStep: 5, kind: 'invest' });
    expect(screen.getByText('Into')).toBeTruthy();
    expect(screen.getByLabelText('Brokerage')).toBeTruthy();
  });

  it('the primary button hands the chosen outcome to useCommitDecision', async () => {
    await open({ outcome: 'pass' }, { initialStep: 5 });
    await fireEvent.press(screen.getByLabelText('Record as passed'));
    expect(mockRequestCommit).toHaveBeenCalledWith('pass');
  });

  it('names the outcome on the primary button', async () => {
    await open({ outcome: 'wait' }, { initialStep: 5 });
    expect(screen.getByLabelText('Save the plan')).toBeTruthy();
    expect(screen.getByText('Waiting and passing leave every balance exactly as it is.')).toBeTruthy();
  });
});

describe('open checks together (D-24)', () => {
  it('shows the With other checks pill only with another open check, and flipping it autosaves', async () => {
    await open({}, { initialStep: 3 });
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('flipping the pill updates combine', async () => {
    mockStack = { ...EMPTY_STACK, openCount: 1 };
    await open({}, { initialStep: 3 });
    await fireEvent.press(screen.getByRole('switch'));
    expect(mockUpdate).toHaveBeenCalledWith({ combine: false }, undefined);
  });

  it('a decided check has no pill', async () => {
    mockStack = { ...EMPTY_STACK, openCount: 1 };
    mockRow = rowOf({ status: 'passed', furthest_step: 5 });
    await open({ outcome: 'pass' }, { initialStep: 3 });
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('card terms (D-40)', () => {
  const NO_TERMS = { ...CARD_CHOICE.terms, debtId: 'card-debt', source: 'none' as const, percentText: null, interestAdded: null, floor: null, version: null };

  function cardSource(): SnapshotResult {
    const base = paySource({ cardsWithoutMinimum: 1, cardsWithoutMinimumIds: ['acc-card'] });
    return { ...base, cards: [{ ...CARD_CHOICE, terms: NO_TERMS }] };
  }

  beforeEach(() => {
    mockAccounts = [{ id: 'acc-card', name: 'Visa', kind: 'credit', currency: 'USD', archived_at: null, deleted_at: null }];
    mockDebts = [{ id: 'card-debt' }];
  });

  it('card terms save to the card debt', async () => {
    mockSource = cardSource();
    await open({ method: 'card', card: { ...inputsOf().card, accountId: 'acc-card', payoff: 'minimum' } }, { initialStep: 2 });
    await fireEvent.press(screen.getByLabelText(/^Minimum payment, /));
    await fireEvent.changeText(screen.getByLabelText('Percent of the balance, percent'), '3');
    const floor = screen.getByLabelText('At least');
    await fireEvent.changeText(floor, '30');
    await fireEvent(floor, 'blur');
    await fireEvent.press(screen.getByLabelText('Plus that month’s interest'));
    await fireEvent.press(screen.getByLabelText('Save terms'));
    expect(mockSaveTerms).toHaveBeenCalledTimes(1);
    expect(mockSaveTerms).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        householdId: 'h1',
        accountId: 'acc-card',
        existing: { id: 'card-debt' },
        currency: 'USD',
        accountName: 'Visa',
        terms: expect.objectContaining({ percentText: '3', floor: 3_000 }),
      })
    );
  });

  it('the card minimum notes on step 3 open the card terms', async () => {
    mockSource = cardSource();
    await open({}, { initialStep: 3 });
    // the basis row opens the sheet
    await fireEvent.press(screen.getByRole('button', { name: /Card payments not counted until the minimum is set/ }));
    expect(screen.getByText('Card minimum payment')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Percent of the balance, percent'), '2');
    const floor = screen.getByLabelText('At least');
    await fireEvent.changeText(floor, '25');
    await fireEvent(floor, 'blur');
    await fireEvent.press(screen.getByLabelText('Save terms'));
    expect(mockSaveTerms).toHaveBeenCalledTimes(1);
    expect(mockSaveTerms).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-card' }));
    expect(screen.queryByText('Card minimum payment')).toBeNull();
    // the expanded Assumptions row opens the same sheet
    await fireEvent.press(screen.getByText('Assumptions in play'));
    await fireEvent.press(screen.getByRole('button', { name: /^Card payments(?! not counted until)/ }));
    expect(screen.getByText('Card minimum payment')).toBeTruthy();
  });

  it('with no such card neither note has a button role', async () => {
    mockSource = paySource();
    await open({}, { initialStep: 3 });
    expect(screen.queryByRole('button', { name: /Card payments/ })).toBeNull();
  });
});

describe('not found and bought', () => {
  it('shows the not-found state for a vanished check', async () => {
    mockStatus = 'not_found';
    await open();
    expect(screen.getByText('This check isn’t here')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back to Decide'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('a bought check computes through useBoughtCheckComputation', async () => {
    mockRow = rowOf({ status: 'bought', furthest_step: 5 });
    mockBought = { status: 'loading', computation: null };
    await open({ outcome: 'go' }, { initialStep: 3 });
    expect(mockBoughtHook).toHaveBeenCalledWith(mockRow, expect.objectContaining({ name: 'Laptop' }));
    expect(screen.queryByText('Where it lands')).toBeNull();
  });
});

describe('D-56 debounced recompute', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const alternatives = jest.requireActual('@/engine/decide/alternatives') as typeof import('@/engine/decide/alternatives');
  const views = jest.requireActual('@/engine/decide/investmentViews') as typeof import('@/engine/decide/investmentViews');
  const decision = jest.requireActual('@/engine/decide/decision') as typeof import('@/engine/decide/decision');

  it('the verdict recomputes on every keystroke', async () => {
    const decide = jest.spyOn(decision, 'decide');
    const buildAlternatives = jest.spyOn(alternatives, 'buildAlternatives');
    await open({}, { initialStep: 1 });
    decide.mockClear();
    buildAlternatives.mockClear();
    await editPrice('1600');
    // the verdict ran at once, the slow details did not
    expect(decide).toHaveBeenCalled();
    expect(buildAlternatives).not.toHaveBeenCalled();
    decide.mockClear();
    await editPrice('1700');
    expect(decide).toHaveBeenCalled();
    decide.mockRestore();
    buildAlternatives.mockRestore();
  });

  it('the details settle 150 ms after typing stops', async () => {
    const buildAlternatives = jest.spyOn(alternatives, 'buildAlternatives');
    await open({}, { initialStep: 1 });
    buildAlternatives.mockClear();
    await editPrice('1600');
    expect(buildAlternatives).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(149);
    });
    expect(buildAlternatives).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(buildAlternatives).toHaveBeenCalledTimes(1);
    buildAlternatives.mockRestore();
  });

  it('rapid edits do not run the detail engine calls', async () => {
    const buildAlternatives = jest.spyOn(alternatives, 'buildAlternatives');
    const investmentViews = jest.spyOn(views, 'investmentViews');
    await open({}, { initialStep: 1 });
    buildAlternatives.mockClear();
    investmentViews.mockClear();
    for (const v of ['1510', '1520', '1530', '1540', '1550']) {
      await editPrice(v);
      await act(async () => {
        jest.advanceTimersByTime(50);
      });
    }
    expect(buildAlternatives).not.toHaveBeenCalled();
    expect(investmentViews).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    expect(buildAlternatives).toHaveBeenCalledTimes(1);
    expect(investmentViews).toHaveBeenCalledTimes(1);
    buildAlternatives.mockRestore();
    investmentViews.mockRestore();
  });

  it('a snapshot change recomputes the verdict and the details at once', async () => {
    const buildAlternatives = jest.spyOn(alternatives, 'buildAlternatives');
    const view = await open({}, { initialStep: 3 });
    buildAlternatives.mockClear();
    mockSource = paySource({ fullMonths: 5 });
    await view.rerender(<CheckFlowScreen id="c1" initialStep={3} />);
    expect(buildAlternatives).toHaveBeenCalled();
    buildAlternatives.mockRestore();
  });
});

describe('shareFor (IN-C06)', () => {
  it('a user not found among the household members gets the whole, never member 0’s share', () => {
    const household = { ...inputsOf(), scope: 'household' as const, split: { kind: 'weight' as const, weights: [3, 1], amounts: [] } };
    expect(shareFor(household, 2, -1)).toBe(SOLE_SHARE);
    expect(shareFor(household, 2, 1)).not.toBe(SOLE_SHARE);
  });
});

describe('Clear, the save status and the Go ahead list (05-75)', () => {
  const checkHrefOf = (call: unknown[]) => call[0] as { pathname: string; params: Record<string, string> };

  it('D-77 Clear flushes, then deletes, then disarms and opens an empty check', async () => {
    mockRow = rowOf();
    await open({}, { initialStep: 3 });
    await fireEvent.press(screen.getByLabelText('Clear this check'));
    await act(async () => undefined);
    expect(mockCallOrder).toEqual(['save', 'abandon']);
    expect(mockAbandon).toHaveBeenCalledWith(mockRow, 'cleared');
    expect(mockDiscard).toHaveBeenCalledTimes(1);
    expect(mockAbandon.mock.invocationCallOrder[0]).toBeLessThan(mockDiscard.mock.invocationCallOrder[0]!);
    const href = checkHrefOf(mockReplace.mock.calls[0]!);
    expect(href.params).toEqual(expect.objectContaining({ step: '1', kind: 'buy', cleared: 'c1', clearedStep: '3' }));
    expect(href.params.id).not.toBe('c1');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'destructive', text: { key: 'decide.clear.toast' }, stepId: 'step-1' }));
  });

  it('D-73 Clear is absent on a new unedited check and on a decided check', async () => {
    mockRow = null;
    const view = await open();
    expect(screen.queryByLabelText('Clear this check')).toBeNull();
    await view.unmount();
    mockRow = rowOf({ status: 'bought' });
    await open();
    expect(screen.queryByLabelText('Clear this check')).toBeNull();
  });

  it('D-77 Undo on the untouched empty check returns to the restored check', async () => {
    mockRow = null;
    mockChecks = [{ id: 'old', status: 'open', deleted_at: '2026-10-15T00:00:00Z' }];
    const view = await open({}, { initialStep: 1, cleared: 'old', clearedStep: 4 } as never);
    expect(mockReplace).not.toHaveBeenCalled();
    mockChecks = [{ id: 'old', status: 'open', deleted_at: null }];
    await view.rerender(<CheckFlowScreen id="c1" initialStep={1} cleared="old" clearedStep={4} />);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(checkHrefOf(mockReplace.mock.calls[0]!).params).toEqual({ id: 'old', step: '4' });
  });

  it('D-77 Undo does nothing once the empty check was edited', async () => {
    mockRow = null;
    mockChecks = [{ id: 'old', status: 'open', deleted_at: '2026-10-15T00:00:00Z' }];
    const view = await open({}, { initialStep: 1 });
    mockPendingEdit = true;
    mockChecks = [{ id: 'old', status: 'open', deleted_at: null }];
    await view.rerender(<CheckFlowScreen id="c1" initialStep={1} cleared="old" clearedStep={4} />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('D-77 the header shows the save status', async () => {
    mockRow = rowOf();
    mockSaveStatus = 'offline';
    await open({}, { initialStep: 3 });
    expect(screen.getByText('Offline, will save')).toBeTruthy();
  });

  it('D-77 Save and close says Offline, will save when offline', async () => {
    mockRow = rowOf();
    mockOnline = false;
    await open({}, { initialStep: 3 });
    await fireEvent.press(screen.getByLabelText('Save and close'));
    await act(async () => undefined);
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.save.offline' } });
  });

  it('D-76 the Go ahead confirm lists what gets written as rows', async () => {
    mockRow = rowOf();
    mockConfirm = { visible: true, lines: ['Records a $1,500 purchase', 'Marks the check as bought'], onConfirm: jest.fn(), onCancel: jest.fn() };
    await open({}, { initialStep: 3 });
    expect(screen.getByText('Records a $1,500 purchase')).toBeTruthy();
    expect(screen.getByText('Marks the check as bought')).toBeTruthy();
    expect(screen.queryByText(/purchase\sMarks/)).toBeNull();
    expect(screen.getByText('Write this to your records?')).toBeTruthy();
    expect(screen.getByLabelText('About What gets written')).toBeTruthy();
  });
});
