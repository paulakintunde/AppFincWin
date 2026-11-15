// 06.1-27 (UX-20, CO-D-64 (6)): the Your decisions list with its look-back card, and the decision detail with the check history and the
// read-only "as it was" answer. Hooks are stubbed; the answer comes from a real engine run (D-15).
import React from 'react';
import { fireEvent, renderHook, screen } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideCheckHistoryRow } from '@/db/decideCheckHistory';
import en from '@/i18n/locales/en';
import { wrap } from '@/test/stepProps';
import { ledgerRun } from '../../answer/__tests__/fixtures';
import { AsCheckedAnswer, readStoredResult } from '../AsCheckedAnswer';
import { DecisionDetailScreen } from '../DecisionDetailScreen';
import { PastDecisionsScreen } from '../PastDecisionsScreen';
import { howClosePercent } from '../lookBack';

const P = en.decide.screens.past;
const fill = (s: string, p: Record<string, string | number>): string => s.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(p[k]));

jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/shell/screen/DetailScreen', () => ({
  DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => {
    const { Text, View } = jest.requireActual('react-native');
    return (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    );
  },
}));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({ router: { canGoBack: () => false, back: jest.fn(), navigate: (...a: unknown[]) => mockNavigate(...a), dismissTo: (...a: unknown[]) => mockDismissTo(...a) } }));
const mockSetMonth = jest.fn();
jest.mock('@/state/activityFocus', () => ({ setSelectedMonth: (m: string) => mockSetMonth(m) }));
// 06.1-77: the real useDeleteDecision (for its copy) needs its write and reminder edges stubbed.
jest.mock('@/data/mutations/decideChecks', () => ({ useRemoveDecision: () => ({ remove: jest.fn(() => 'step-1') }) }));
jest.mock('@/features/decide/notifications/waitReminder', () => ({ cancelCheckReminders: () => Promise.resolve() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/decide/entitlements', () => ({ canUse: () => true }));

const mockAttach = jest.fn(() => 'link-1');
const mockUnlink = jest.fn();
jest.mock('@/data/mutations/decideLinks', () => ({
  useAttachLine: () => ({ attach: mockAttach }),
  useUnlinkLine: () => ({ unlink: mockUnlink }),
}));
let mockCandidates: unknown[] = [];
jest.mock('@/data/queries/decide', () => ({ useAttachCandidates: () => ({ data: mockCandidates }) }));
jest.mock('@/data/queries/homeAmount', () => ({ homeAmountFor: (l: { original_amount: number }) => l.original_amount }));
let mockHistory: DecideCheckHistoryRow[] | undefined;
jest.mock('@/data/queries/decideHistory', () => ({ useCheckHistory: () => ({ data: mockHistory }) }));
const mockDelete = jest.fn();
const mockConfirmCopy = jest.fn((_d: unknown, written: number, kept?: { amount: string; withPayments: boolean } | null) => ({
  title: 'Delete this decision?',
  body: kept ? `Stays: ${kept.amount}${kept.withPayments ? ' +payments' : ''}` : `Kept: ${written}`,
}));
jest.mock('../data/useDeleteDecision', () => ({
  writtenCount: (links: unknown[] | undefined) => (links ?? []).length,
  useDeleteDecision: () => ({ deleteDecision: mockDelete, confirmCopy: (d: unknown, w: number, k?: unknown) => mockConfirmCopy(d, w, k as never) }),
}));

let mockDecisions: DecideCheckRow[] = [];
let mockMonthly = new Map<string, { estimate: number; actual: number; diff: number }>();
// 06.1-77: the detail's links, linked lines (home amounts) and their loading state.
let mockLinks = new Map<string, unknown[]>();
let mockLines: unknown[] | null = null;
let mockLinesLoading = false;
jest.mock('../data/usePastDecisions', () => ({
  localDateOf: (stamp: string) => stamp.slice(0, 10),
  estimateInputFor: () => (mockLines === null ? null : { decidedDate: '2026-11-11', estimateDayOne: 1200, estimateMonthly: 0, lines: mockLines }),
  deltaFor: (d: DecideCheckRow) => {
    const m = mockMonthly.get(d.id);
    return m === undefined ? null : { kind: 'monthly', tone: m.diff > 0 ? 'over' : m.diff < 0 ? 'under' : 'at', ...m };
  },
  usePastDecisions: () => ({
    decisions: mockDecisions,
    linksByCheck: mockLinks,
    linesByCheck: new Map(),
    linesLoading: mockLinesLoading,
    goalByCheck: new Map(),
    goalLines: [],
    ctx: { home: 'USD', rates: [], customs: [], today: '2026-11-11', timeZone: 'UTC' },
    userId: 'u1',
    householdId: 'h1',
    today: '2026-11-11',
    whole: (n: number) => `$${n / 100}`,
    wholeIn: () => (n: number) => `$${n / 100}`,
    formatDate: (d: string) => d,
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { showToast } = require('@/state/undoToast') as { showToast: jest.Mock };

function decision(id: string, over: Partial<DecideCheckRow> = {}): DecideCheckRow {
  return {
    id,
    household_id: 'h1',
    created_by: 'u1',
    kind: 'buy',
    name: `Item ${id}`,
    inputs: { currency: 'USD', advertised: 50000 },
    status: 'bought',
    furthest_step: 5,
    decided_at: '2026-08-01T10:00:00Z',
    estimate_day_one: 50000,
    estimate_monthly: 2000,
    deleted_at: null,
    updated_at: '2026-08-01T10:00:00Z',
    ...over,
  } as unknown as DecideCheckRow;
}

function historyRow(id: string, saidOn: string, result: Record<string, unknown>): DecideCheckHistoryRow {
  return { id, check_id: 'c1', created_by: 'u1', said_on: saidOn, code: String(result['code']), variant: (result['variant'] as string | null) ?? null, result, created_at: `${saidOn}T09:00:00Z` };
}

const storedResult = (): Record<string, unknown> => JSON.parse(JSON.stringify(ledgerRun('N02').evaluation.result)) as Record<string, unknown>;

beforeEach(() => {
  mockDecisions = [];
  mockMonthly = new Map();
  mockCandidates = [];
  mockHistory = undefined;
  mockLinks = new Map();
  mockLines = null;
  mockLinesLoading = false;
  jest.clearAllMocks();
});

describe('Your decisions', () => {
  it('shows the empty state with a way back', async () => {
    await wrap(<PastDecisionsScreen />);
    expect(screen.getByText(P.list.emptyTitle)).toBeTruthy();
    expect(screen.getByText(P.list.emptyBody)).toBeTruthy();
    expect(screen.getByText(en.decide.screens.common.backToDecide)).toBeTruthy();
    // 06.1-64 (CN-4): back to the Decide home already in the stack, never a pushed copy.
    fireEvent.press(screen.getByText(en.decide.screens.common.backToDecide));
    expect(mockDismissTo).toHaveBeenCalledWith('/decide');
  });

  it('Yes, count it attaches the line once and offers Undo', async () => {
    mockDecisions = [decision('d1')];
    mockMonthly.set('d1', { estimate: 2000, actual: 2600, diff: 600 });
    mockCandidates = [{ id: 'tx1', household_id: 'h1', deleted_at: null, transfer_id: null, recurring_series_id: null, original_amount: -1200, local_date: '2026-08-01', name: 'Cable' }];
    await wrap(<PastDecisionsScreen />);
    expect(screen.getByText(P.list.costQ)).toBeTruthy();
    expect(screen.getByText(P.list.expected)).toBeTruthy();
    expect(screen.getByText(P.list.recordsShow)).toBeTruthy();
    expect(screen.getByText(P.list.difference)).toBeTruthy();
    await fireEvent.press(screen.getByText(P.list.yes));
    expect(mockAttach).toHaveBeenCalledTimes(1);
    expect(mockAttach).toHaveBeenCalledWith(expect.objectContaining({ checkId: 'd1', targetId: 'tx1', entity: 'transactions' }));
    const toast = showToast.mock.calls[0]?.[0] as { text: { key: string }; onUndo: unknown };
    expect(toast.text.key).toBe('decide.screens.past.list.savedToast');
    expect(typeof toast.onUndo).toBe('function');
  });

  it('No writes nothing, names the amount left out and offers Undo', async () => {
    mockDecisions = [decision('d1')];
    mockMonthly.set('d1', { estimate: 2000, actual: 2600, diff: 600 });
    mockCandidates = [{ id: 'tx1', household_id: 'h1', deleted_at: null, transfer_id: null, recurring_series_id: null, original_amount: -1200, local_date: '2026-08-01', name: 'Cable' }];
    await wrap(<PastDecisionsScreen />);
    await fireEvent.press(screen.getByText(P.list.no));
    expect(mockAttach).not.toHaveBeenCalled();
    const toast = showToast.mock.calls[0]?.[0] as { text: { key: string; params: { amount: string } }; onUndo: unknown };
    expect(toast.text.key).toBe('decide.screens.past.list.leftOutToast');
    expect(toast.text.params.amount).toBe('$12');
    expect(typeof toast.onUndo).toBe('function');
    expect(screen.queryByTestId('past-lookback')).toBeNull();
  });

  it('shows the how-close line from 3 look-backs, not before', async () => {
    const mk = (n: number) => {
      mockDecisions = Array.from({ length: n }, (_v, i) => decision(`d${i}`));
      mockMonthly = new Map(mockDecisions.map((d) => [d.id, { estimate: 2000, actual: 2200, diff: 200 }]));
    };
    mk(2);
    const first = await wrap(<PastDecisionsScreen />);
    expect(screen.queryByTestId('past-how-close')).toBeNull();
    await first.unmount();
    mk(3);
    await wrap(<PastDecisionsScreen />);
    expect(screen.getByTestId('past-how-close')).toBeTruthy();
    expect(screen.getByText(fill(P.list.howClose, { count: 3, percent: 10 }))).toBeTruthy();
  });

  it('averages the gap as a percent of each estimate', () => {
    expect(howClosePercent([{ expected: 100, actual: 90, diff: -10 }, { expected: 100, actual: 130, diff: 30 }])).toBeNull();
    expect(
      howClosePercent([
        { expected: 100, actual: 90, diff: -10 },
        { expected: 100, actual: 130, diff: 30 },
        { expected: 0, actual: 5, diff: 5 },
      ])
    ).toEqual({ count: 3, percent: 20 });
  });
});

describe('Decision detail', () => {
  it('lists what Decide said, newest first, and opens the check as it was', async () => {
    mockDecisions = [decision('c1', { status: 'passed' })];
    mockHistory = [historyRow('h2', '2026-08-02', storedResult()), historyRow('h1', '2026-08-01', storedResult())];
    await wrap(<DecisionDetailScreen id="c1" />);
    const rows = screen.getAllByText(/^What Decide said on/);
    expect(rows.map((r) => String(r.props.children))).toEqual([fill(P.detail.saidOn, { date: '2026-08-02' }), fill(P.detail.saidOn, { date: '2026-08-01' })]);
    await fireEvent.press(screen.getByText(P.detail.asItWas));
    expect(screen.getByText(fill(P.detail.asChecked, { date: '2026-08-02' }))).toBeTruthy();
    expect(screen.queryByTestId('answer-actions')).toBeNull();
    expect(screen.queryByTestId('answer-topbar')).toBeNull();
    expect(screen.getByTestId('answer-footer')).toBeTruthy();
    expect(screen.getByTestId('answer-verdict')).toBeTruthy();
  });

  it("the cant-see link on the check as it was opens the About sheet (06.1-23)", async () => {
    mockDecisions = [decision('c1', { status: 'passed' })];
    mockHistory = [historyRow('h1', '2026-08-01', storedResult())];
    await wrap(<DecisionDetailScreen id="c1" />);
    await fireEvent.press(screen.getByText(P.detail.asItWas));
    expect(screen.queryByText('About this answer')).toBeNull();
    await fireEvent.press(screen.getByTestId('answer-cant-see'));
    expect(screen.getByText('About this answer')).toBeTruthy();
  });

  it('fails soft when the history cannot be read: nothing listed, no error', async () => {
    mockDecisions = [decision('c1', { status: 'passed' })];
    mockHistory = undefined;
    await wrap(<DecisionDetailScreen id="c1" />);
    expect(screen.queryByText(/^What Decide said on/)).toBeNull();
    expect(screen.queryByText(P.detail.asItWas)).toBeNull();
    expect(screen.getByText(P.detail.remove)).toBeTruthy();
  });

  it('06.1-63 (CC-3): Remove asks first with the confirm copy; Keep it deletes nothing', async () => {
    mockDecisions = [decision('c1', { status: 'bought' })];
    mockDelete.mockClear();
    await wrap(<DecisionDetailScreen id="c1" />);
    expect(screen.queryByText('Delete this decision?')).toBeNull();
    await fireEvent.press(screen.getByTestId('past-remove'));
    expect(screen.getByText('Delete this decision?')).toBeTruthy();
    expect(screen.getByText('Kept: 0')).toBeTruthy();
    expect(mockConfirmCopy.mock.calls.at(-1)?.[0]).toMatchObject({ id: 'c1', status: 'bought' });
    await fireEvent.press(screen.getByText(en.decide.delete.keep));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('06.1-63 (CC-3): confirming removes once through the shared delete path, which carries the Undo toast', async () => {
    mockDecisions = [decision('c1', { status: 'passed' })];
    mockDelete.mockClear();
    await wrap(<DecisionDetailScreen id="c1" />);
    await fireEvent.press(screen.getByTestId('past-remove'));
    expect(mockDelete).not.toHaveBeenCalled();
    const removes = screen.getAllByText(P.detail.remove);
    await fireEvent.press(removes[removes.length - 1] as never);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  // 06.1-77 (DS-17, DC-4 / OQ-77-1 A): a bought decision's day-one record, written by "I bought it" on Nov 11.
  const link = (id: string, role: string, entity = 'transactions') => ({ id: `l-${id}`, check_id: 'c1', entity, target_id: id, source: 'written', role, deleted_at: null });
  const boughtMug = (status: 'paid' | 'pending' = 'paid') => {
    mockDecisions = [decision('c1', { status: 'bought', decided_at: '2026-11-11T10:00:00Z', estimate_day_one: 1200, estimate_monthly: 0 })];
    mockLinks = new Map([['c1', [link('tx-mug', 'day_one')]]]);
    mockLines = [{ id: 'tx-mug', date: '2026-11-11', amount: 1200, status, seriesId: null }];
  };

  it('06.1-77 (DS-17): right after the add, the records show the up-front amount, not a dash', async () => {
    boughtMug();
    await wrap(<DecisionDetailScreen id="c1" />);
    expect(screen.getByText(P.detail.recordsSoFar)).toBeTruthy();
    expect(screen.getAllByText('$12')).toHaveLength(2); // what Decide counted, and what the records show
    expect(screen.getAllByText('\u2014')).toHaveLength(1); // running costs only: nothing to look back on yet
  });

  it('06.1-77 (DS-17): while the added line is read it says so; with no line it stays a dash', async () => {
    boughtMug();
    mockLines = [];
    mockLinesLoading = true;
    const view = await wrap(<DecisionDetailScreen id="c1" />);
    expect(screen.getByText(P.detail.upFrontLoading)).toBeTruthy();
    mockLinesLoading = false;
    await view.rerender(<DecisionDetailScreen id="c1" />);
    expect(screen.queryByText(P.detail.upFrontLoading)).toBeNull();
    expect(screen.getAllByText('\u2014')).toHaveLength(2);
  });

  it('06.1-77 (DC-4, OQ-77-1 A): Remove says the $12 stays in the records and links to it in Activity on that month', async () => {
    boughtMug();
    await wrap(<DecisionDetailScreen id="c1" />);
    await fireEvent.press(screen.getByTestId('past-remove'));
    expect(screen.getByText('Stays: $12')).toBeTruthy();
    expect(mockConfirmCopy.mock.calls.at(-1)?.[2]).toEqual({ amount: '$12', withPayments: false });
    await fireEvent.press(screen.getByText(P.remove.recordLink));
    expect(mockSetMonth).toHaveBeenCalledWith('2026-11');
    expect(mockNavigate).toHaveBeenCalledWith('/activity');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('06.1-77: a plan says its planned payments stay too; a skipped line names no amount and shows no link', async () => {
    boughtMug();
    mockLinks = new Map([['c1', [link('tx-mug', 'day_one'), link('s-1', 'payment', 'recurring_series')]]]);
    const view = await wrap(<DecisionDetailScreen id="c1" />);
    await fireEvent.press(screen.getByTestId('past-remove'));
    expect(screen.getByText('Stays: $12 +payments')).toBeTruthy();
    mockLines = [{ id: 'tx-mug', date: '2026-11-11', amount: 1200, status: 'skipped', seriesId: null }];
    await view.rerender(<DecisionDetailScreen id="c1" />);
    expect(screen.getByText('Kept: 2')).toBeTruthy();
    expect(screen.queryByText(P.remove.recordLink)).toBeNull();
  });

  it('06.1-77: the real Remove copy names the amount that stays (OQ-77-1 A), and keeps the old copy when it is unknown', async () => {
    const real = jest.requireActual('../data/useDeleteDecision') as typeof import('../data/useDeleteDecision');
    const { result } = await renderHook(() => real.useDeleteDecision());
    const d = decision('c1', { status: 'bought' });
    expect(result.current.confirmCopy(d, 1, { amount: '$12', withPayments: false }).body).toBe(fill(P.remove.recordStays, { amount: '$12' }));
    expect(result.current.confirmCopy(d, 3, { amount: '$12', withPayments: true }).body).toBe(fill(P.remove.recordStaysPlan, { amount: '$12' }));
    expect(result.current.confirmCopy(d, 1).body).toBe(en.decide.delete.boughtBody_one);
    expect(result.current.confirmCopy(decision('c2', { status: 'passed' }), 0, { amount: '$12', withPayments: false }).body).toBe(en.decide.delete.passedBody);
  });

  it('reads an unknown id as not here', async () => {
    await wrap(<DecisionDetailScreen id={null} />);
    expect(screen.getByText(P.detail.notFoundTitle)).toBeTruthy();
  });
});

describe('As checked', () => {
  it('shows one plain line for a stored result this build cannot read (T-06.1-27-02)', async () => {
    expect(readStoredResult({ code: 'not_a_code' })).toBeNull();
    expect(readStoredResult({ code: 'fits_month', facts: 'x' })).toBeNull();
    await wrap(<AsCheckedAnswer stored={{ code: 'not_a_code' }} dateText="2026-08-01" currency="USD" today="2026-08-01" once={false} onCantSee={() => undefined} />);
    expect(screen.getByTestId('past-as-checked-unreadable')).toBeTruthy();
    expect(screen.queryByTestId('answer-verdict')).toBeNull();
  });
});
