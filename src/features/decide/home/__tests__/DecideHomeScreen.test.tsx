import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { perfReport, perfReset } from '../../perf/perfMarks';
import { DecideShellHost } from '../../DecideShellHost';
import type { DecideCheckRow } from '@/db/decideChecks';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import { TODAY, loggedSource, noneSource, roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import type { SnapshotResult } from '../../snapshot/types';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { DecideHomeScreen } from '../DecideHomeScreen';

jest.setTimeout(30000);

type Snap = { status: 'loading' | 'error' | 'ready'; result: SnapshotResult | null; source: unknown; retry: () => void };
let mockSnap: Snap;
let mockChecks: DecideCheckRow[] | undefined;
let mockChanges: unknown[] = [];
let mockSettings: DecideSettingsRow | null = null;
let mockSync = { isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null as number | null, inFlightOldestAt: null as number | null, oldestPendingAt: null as number | null };
let mockBasisSeen = true;
const mockMarkSeen = jest.fn((..._a: unknown[]) => Promise.resolve());
const mockQuickAction = jest.fn();
const mockChangedCount = { n: 0 };
const mockRetry = jest.fn();
const mockCreate = jest.fn();
const mockPush = jest.fn();
const mockRegisterFab = jest.fn();
const mockReconcile = jest.fn((..._a: unknown[]) => Promise.resolve());
const mockSeen: Record<string, Record<string, unknown>> = {};

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', ready: true }),
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideSnapshot: () => mockSnap,
  useDecideChecks: () => ({ data: mockChecks }),
  useOpenChecks: () => ({
    data: mockChecks
      ?.filter((c) => c.deleted_at == null && c.status === 'open')
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)),
  }),
  useDecideSettings: () => ({ data: mockSettings }),
  useDecideChanges: () => ({ data: mockChanges }),
  useDebts: () => ({ data: [] }),
}));
jest.mock('@/data/mutations/decideChanges', () => ({
  useAddChange: () => ({ add: jest.fn() }),
  useEditChange: () => ({ edit: jest.fn() }),
  useRemoveChange: () => ({ remove: jest.fn() }),
}));
const mockSettingsUpdate = jest.fn();
jest.mock('@/data/mutations/decideSettings', () => ({ useUpdateDecideSettings: () => ({ update: mockSettingsUpdate }) }));
jest.mock('@/data/mutations/decideChecks', () => ({ useCreateCheck: () => ({ create: mockCreate }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/mutations/decideLinks', () => ({ useSaveCardTerms: () => ({ save: jest.fn() }) }));
jest.mock('../../notifications/waitReminder', () => ({ reconcileWaitReminders: (...a: unknown[]) => mockReconcile(...a) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('@/shell/fab/FabProvider', () => ({
  useRegisterFab: (...a: unknown[]) => mockRegisterFab(...a),
  useProvideQuickAction: (...a: unknown[]) => mockQuickAction(...a),
}));
jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: () => mockSync }));
jest.mock('../../hints/decideHints', () => ({
  loadHomeBasisSeen: () => Promise.resolve(mockBasisSeen),
  markHomeBasisSeen: (...a: unknown[]) => mockMarkSeen(...a),
}));
jest.mock('../homeRowsModel', () => ({
  ...jest.requireActual('../homeRowsModel'),
  changedOpenCount: () => mockChangedCount.n,
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = require('react');
  const { View, Text } = require('react-native');
  return {
    TabRootScreen: (p: Record<string, unknown>) => {
      mockSeen.tab = p;
      return R.createElement(
        View,
        { testID: 'tab-root', refreshKeys: p.refreshKeys },
        R.createElement(Text, null, p.eyebrow),
        R.createElement(Text, null, p.title),
        p.children
      );
    },
  };
});
jest.mock('../../quick/QuickCheckForm', () => {
  const R = require('react');
  const { Text } = require('react-native');
  return {
    QuickCheckForm: (props: Record<string, unknown>) => {
      mockSeen.quick = props;
      const { Pressable } = require('react-native');
      return R.createElement(
        Text,
        { testID: 'probe-quick' },
        'quick',
        props.sourceStatus === 'error'
          ? R.createElement(Pressable, { accessibilityRole: 'button', onPress: props.onRetry }, R.createElement(Text, null, 'Try again'))
          : null
      );
    },
  };
});
function row(id: string, over: Partial<DecideCheckRow> = {}): DecideCheckRow {
  return {
    id,
    household_id: 'h1',
    created_by: 'u1',
    kind: 'buy',
    name: 'Sofa',
    inputs: {},
    status: 'open',
    furthest_step: 1,
    last_seen_state: null,
    last_seen_basis: null,
    reopened_from: null,
    decided_at: null,
    verdict_at_decision: null,
    estimate_day_one: null,
    estimate_monthly: null,
    wait_monthly: null,
    ready_by: null,
    broke_line: false,
    cooling_off_at: null,
    estimate_monthly_payment: null,
    estimate_running: null,
    is_sample: false,
    deleted_at: null,
    version: 1,
    updated_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

function ready(result: SnapshotResult): Snap {
  return { status: 'ready', result, source: null, retry: mockRetry };
}

async function renderScreen() {
  return wrap(<DecideHomeScreen />); // the info sheets need the safe-area provider
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSnap = ready(loggedSource());
  mockChecks = [];
  mockChanges = [];
  mockSettings = null;
  mockSync = { isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null, inFlightOldestAt: null, oldestPendingAt: null };
  mockBasisSeen = true;
  mockChangedCount.n = 0;
  perfReset();
  delete process.env.EXPO_PUBLIC_PERF;
});


const labelsOnScreen = (labels: string[]) => labels.filter((l) => screen.queryByLabelText(l) !== null);

describe('DecideHomeScreen', () => {
  it('D-95 the home renders the dark card first', async () => {
    mockChecks = [row('o', { status: 'open' }), row('d', { status: 'bought' })];
    mockChanges = [{ id: 'c1' }];
    await renderScreen();
    const tree = JSON.stringify(screen.toJSON());
    const order = ['probe-quick', 'Open checks', 'Changes coming up', 'Past decisions', 'Lines you will not cross'].map((n) => tree.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(tree.indexOf('home-summary-card')).toBeLessThan(tree.indexOf('Open checks'));
    // The old inline lists and the add row are gone from the home.
    expect(screen.queryByText('Your month')).toBeNull();
    expect(screen.queryByLabelText('Check an investment')).toBeNull();
  });

  it('D-95 the header is lean: no eyebrow or subtitle, the header sync line dropped, no pull to refresh', async () => {
    await renderScreen();
    expect(mockSeen.tab).toMatchObject({ title: 'Can I afford it', hideSyncLine: true });
    expect((mockSeen.tab as Record<string, unknown>).eyebrow).toBeUndefined();
    expect((mockSeen.tab as Record<string, unknown>).refreshKeys).toBeUndefined();
    expect(screen.queryByText('Judged on your real accounts, not the price tag.')).toBeNull();
  });

  it('D-95 at most four rows show', async () => {
    mockChecks = [row('o', { status: 'open' }), row('d', { status: 'bought' })];
    mockChanges = [{ id: 'c1' }];
    await renderScreen();
    const all = ['Open checks, 1', 'Changes coming up, 1', 'Past decisions, 1', 'Lines you will not cross, All at their defaults'];
    expect(labelsOnScreen(all)).toEqual(all);
    expect(screen.getByTestId('home-rows').children).toHaveLength(4);
  });

  it('D-99 Open checks and Past decisions hide at zero; Changes reads as its add row', async () => {
    await renderScreen();
    expect(screen.getByTestId('home-rows').children).toHaveLength(2);
    expect(screen.queryByLabelText(/^Open checks/)).toBeNull();
    expect(screen.queryByLabelText(/^Past decisions/)).toBeNull();
    expect(screen.queryByLabelText(/^Changes coming up/)).toBeNull();
    expect(screen.getByLabelText('Add a change coming up')).toBeTruthy();
    expect(screen.getByLabelText('Lines you will not cross, All at their defaults')).toBeTruthy();
    // Deleted checks do not count as open.
    mockChecks = [row('d', { status: 'open', deleted_at: '2026-10-02T00:00:00Z' })];
    await renderScreen();
    expect(screen.queryByLabelText(/^Open checks/)).toBeNull();
  });

  it('D-99 the add row opens the change sheet in add mode', async () => {
    await renderScreen();
    expect(screen.queryByText('Add a change')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Add a change coming up'));
    expect(screen.getByText('Add a change')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('D-99 the rows open their own screens', async () => {
    mockChecks = [row('o', { status: 'open' }), row('a', { status: 'bought' }), row('b', { status: 'passed' })];
    mockChanges = [{ id: 'c1' }, { id: 'c2' }];
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Open checks, 1'));
    expect(mockPush).toHaveBeenLastCalledWith('/decide/open');
    await fireEvent.press(screen.getByLabelText('Changes coming up, 2'));
    expect(mockPush).toHaveBeenLastCalledWith('/decide/changes');
    await fireEvent.press(screen.getByLabelText('Past decisions, 2'));
    expect(mockPush).toHaveBeenLastCalledWith('/decide/past');
    await fireEvent.press(screen.getByLabelText('Lines you will not cross, All at their defaults'));
    expect(mockPush).toHaveBeenLastCalledWith('/decide/lines');
  });

  it('D-99 Open checks carries the changed line, and Lines counts what the user set', async () => {
    mockChecks = [row('o', { status: 'open' })];
    mockChangedCount.n = 2;
    mockSettings = { currency: 'USD', reserve: 100_000, investing_floor: null, saving_floor: null, dsr_line: 36, housing_line: null, unsecured_multiple: null } as unknown as DecideSettingsRow;
    await renderScreen();
    expect(screen.getByText('2 changed since you looked')).toBeTruthy();
    expect(screen.getByLabelText('Lines you will not cross, 2 of 6 set by you')).toBeTruthy();
    mockChangedCount.n = 0;
    await renderScreen();
    expect(screen.queryByText(/changed since you looked/)).toBeNull();
  });

  it('D-96 the notice row shows with counted problems, opens Needs a look, and is absent for a first-run user', async () => {
    mockSnap = ready(noneSource());
    await renderScreen();
    expect(screen.queryByTestId('home-notice-row')).toBeNull();
    mockSnap = ready(loggedSource());
    mockSync = { ...mockSync, failed: 2 };
    await renderScreen();
    expect(screen.getByLabelText('1 item needs a look')).toBeTruthy();
    expect(screen.queryByText('Needs a look')).toBeNull();
    await fireEvent.press(screen.getByTestId('home-notice-row'));
    expect(screen.getByText('Needs a look')).toBeTruthy();
    expect(screen.getByText('2 changes didn’t save')).toBeTruthy();
  });

  it('D-96 offline with nothing else reads as its own text in the notice row', async () => {
    mockSync = { ...mockSync, isOnline: false };
    await renderScreen();
    expect(screen.getByLabelText('Offline')).toBeTruthy();
  });

  it('D-100 Details opens Month details titled Net free cash flow, with the basis and the sources note', async () => {
    await renderScreen();
    expect(screen.queryByText(/4 months of logged income/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Month details'));
    expect(screen.getByText(/4 months of logged income/)).toBeTruthy();
    expect(screen.getAllByText('Net free cash flow').length).toBeGreaterThan(0);
    expect(screen.getByText('Worked out on your average month.')).toBeTruthy();
  });

  it('D-95 the rough sources note shows in Month details for rough figures', async () => {
    mockSnap = ready(roughSource());
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Month details'));
    expect(screen.getByText(/Rough figures you entered/)).toBeTruthy();
  });

  it('D-95 the quick-check field gets the home screen-reader label', async () => {
    await renderScreen();
    expect(mockSeen.quick).toMatchObject({ surface: 'home', variant: 'dark', fieldA11yLabel: 'Quick check, something and a price' });
  });

  it('D-95 the switch label is marked seen once and holds for the rest of the visit', async () => {
    mockBasisSeen = false;
    mockSettings = { currency: 'USD', rough_income: 400_000, rough_spending: 250_000 } as unknown as DecideSettingsRow;
    const view = await renderScreen();
    await waitFor(() => expect(mockMarkSeen).toHaveBeenCalledTimes(1));
    expect(mockMarkSeen).toHaveBeenCalledWith('u1');
    expect(screen.getByLabelText(/^Net free cash flow: .* now from your logged months,/)).toBeTruthy();
    await view.rerender(<DecideHomeScreen />);
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/^Net free cash flow: .* now from your logged months,/)).toBeTruthy();
  });

  it('D-95 a user who has seen the basis neither writes the flag nor sees the switch label', async () => {
    mockBasisSeen = true;
    mockSettings = { currency: 'USD', rough_income: 400_000, rough_spending: 250_000 } as unknown as DecideSettingsRow;
    await renderScreen();
    await act(async () => {});
    expect(mockMarkSeen).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/^Net free cash flow: .* now from your logged months,/)).toBeNull();
  });

  it('D-98 no FAB on Decide home', async () => {
    await renderScreen();
    expect(mockRegisterFab).toHaveBeenCalledWith(null);
    expect(mockRegisterFab.mock.calls.every((c) => c[0] === null)).toBe(true);
  });

  // The "FAB still shows on another tab root" test is in src/shell/fab/__tests__/Fab.test.tsx against the real provider.
  it('D-98 You Add still offers New check', async () => {
    await act(async () => {
      render(<DecideShellHost />);
    });
    const [id, run] = mockQuickAction.mock.calls[0] as [string, () => void];
    expect(id).toBe('newCheck');
    run();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/check/[id]', params: { id: 'new-id', kind: 'buy' } });
  });

  it('D-95 the budget probe marks the card and rows bottoms only with EXPO_PUBLIC_PERF=1', async () => {
    await renderScreen();
    const layout = (y: number, height: number) => ({ nativeEvent: { layout: { x: 0, y, width: 358, height } } });
    await fireEvent(screen.getByTestId('home-card-wrap'), 'layout', layout(100, 300));
    await fireEvent(screen.getByTestId('home-rows'), 'layout', layout(432, 208));
    expect(perfReport()).toEqual({});
    process.env.EXPO_PUBLIC_PERF = '1';
    await fireEvent(screen.getByTestId('home-card-wrap'), 'layout', layout(100, 300));
    await fireEvent(screen.getByTestId('home-rows'), 'layout', layout(432, 208));
    const report = perfReport();
    expect(report['home.cardBottom']).toMatchObject({ count: 1, median: 400 });
    expect(report['home.rowsBottom']).toMatchObject({ count: 1, median: 640 });
  });

  it('add rough figures opens the sheet', async () => {
    mockSnap = ready(noneSource());
    await wrap(<DecideHomeScreen />);
    expect(screen.queryByText('Rough figures')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Add rough figures'));
    expect(screen.getByText('Rough figures')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByText('Rough figures')).toBeNull();
    // The quick check's own button opens the same sheet.
    await act(async () => {
      (mockSeen.quick!.onAddRough as () => void)();
    });
    expect(screen.getByText('Rough figures')).toBeTruthy();
  });

  it('try again retries the reads', async () => {
    mockSnap = { status: 'error', result: null, source: null, retry: mockRetry };
    await renderScreen();
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('passes the retry through to the quick check', async () => {
    mockSnap = { status: 'error', result: null, source: null, retry: mockRetry };
    await renderScreen();
    (mockSeen.quick!.onRetry as () => void)();
    expect(mockRetry).toHaveBeenCalled();
  });

  it('Run the full check saves the quick fields as a new check and opens it at step 2', async () => {
    await renderScreen();
    const inputs = { ...emptyCheckInputs('buy', TODAY), name: 'Car', advertised: 1_450_000, method: 'cash' as const };
    (mockSeen.quick!.onRunFull as (i: typeof inputs) => void)(inputs);
    expect(mockCreate).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'new-id',
      householdId: 'h1',
      kind: 'buy',
      name: 'Car',
      inputs,
      furthestStep: 2,
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/check/[id]', params: { id: 'new-id', step: '2' } });
  });

  it('Full check starts a new purchase check', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Full check'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/check/[id]', params: { id: 'new-id', kind: 'buy' } });
  });

  it('reconciles reminders once with the waiting ready-by dates and the decided cooling-off dates', async () => {
    mockChecks = [
      row('w', { status: 'waiting', ready_by: '2026-11-01', cooling_off_at: null }),
      row('b', { status: 'bought', cooling_off_at: '2026-10-17T09:00:00Z' }),
      row('o', { status: 'open' }),
    ];
    const view = await renderScreen();
    await view.rerender(<DecideHomeScreen />);
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledWith(
      [{ id: 'w', readyBy: '2026-11-01' }],
      '2026-10-15',
      [
        { id: 'w', coolingOffAt: null },
        { id: 'b', coolingOffAt: '2026-10-17T09:00:00Z' },
      ]
    );
  });

  it('does not reconcile before the snapshot is ready', async () => {
    mockSnap = { status: 'loading', result: null, source: null, retry: mockRetry };
    await renderScreen();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('reconcile leaves out a reopened decision', async () => {
    mockChecks = [
      row('old', { status: 'waiting', ready_by: '2026-11-01', cooling_off_at: '2026-10-20T09:00:00Z' }),
      row('child', { status: 'open', reopened_from: 'old' }),
    ];
    const view = await renderScreen();
    expect(mockReconcile).toHaveBeenLastCalledWith([], '2026-10-15', []);
    mockChecks = [
      row('old', { status: 'waiting', ready_by: '2026-11-01', cooling_off_at: '2026-10-20T09:00:00Z' }),
      row('child', { status: 'open', reopened_from: 'old', deleted_at: '2026-10-16T00:00:00Z' }),
    ];
    await view.rerender(<DecideHomeScreen />);
    expect(mockReconcile).toHaveBeenLastCalledWith(
      [{ id: 'old', readyBy: '2026-11-01' }],
      '2026-10-15',
      [{ id: 'old', coolingOffAt: '2026-10-20T09:00:00Z' }]
    );
  });
});
