import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import { TODAY, loggedSource, noneSource, roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import type { SnapshotResult } from '../../snapshot/types';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { DecideHomeScreen } from '../DecideHomeScreen';

jest.setTimeout(30000);

type Snap = { status: 'loading' | 'error' | 'ready'; result: SnapshotResult | null; source: unknown; retry: () => void };
let mockSnap: Snap;
let mockChecks: DecideCheckRow[] | undefined;
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
  useDecideSettings: () => ({ data: null }),
  useDecideChanges: () => ({ data: [] }),
}));
jest.mock('@/data/mutations/decideChanges', () => ({
  useAddChange: () => ({ add: jest.fn() }),
  useEditChange: () => ({ edit: jest.fn() }),
  useRemoveChange: () => ({ remove: jest.fn() }),
}));
const mockSettingsUpdate = jest.fn();
jest.mock('@/data/mutations/decideSettings', () => ({ useUpdateDecideSettings: () => ({ update: mockSettingsUpdate }) }));
jest.mock('@/data/mutations/decideChecks', () => ({ useCreateCheck: () => ({ create: mockCreate }) }));
jest.mock('../../notifications/waitReminder', () => ({ reconcileWaitReminders: (...a: unknown[]) => mockReconcile(...a) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('@/shell/fab/FabProvider', () => ({
  useRegisterFab: (...a: unknown[]) => mockRegisterFab(...a),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = require('react');
  const { View, Text } = require('react-native');
  return {
    TabRootScreen: (p: Record<string, unknown>) =>
      R.createElement(
        View,
        { testID: 'tab-root', refreshKeys: p.refreshKeys },
        R.createElement(Text, null, p.eyebrow),
        R.createElement(Text, null, p.title),
        p.children
      ),
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
jest.mock('../OpenChecksCard', () => {
  const R = require('react');
  const { Text } = require('react-native');
  return {
    OpenChecksCard: (props: Record<string, unknown>) => {
      mockSeen.open = props;
      return R.createElement(Text, { testID: 'probe-open' }, 'open');
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
  return render(
    <ThemeProvider>
      <DecideHomeScreen />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSnap = ready(loggedSource());
  mockChecks = [];
});

describe('DecideHomeScreen', () => {
  it('shows the cards in the UI-SPEC order', async () => {
    await renderScreen();
    const tree = JSON.stringify(screen.toJSON());
    const order = ['probe-quick', 'your-month-card', 'probe-open', 'Changes coming up', 'Past decisions', 'lines-card', '4 months of logged income'].map((needle) => tree.indexOf(needle));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('add rough figures opens the sheet', async () => {
    mockSnap = ready(noneSource());
    await wrap(<DecideHomeScreen />); // the sheet needs the safe-area provider
    expect(screen.queryByText('Rough figures')).toBeNull();
    await fireEvent.press(screen.getByText('Add rough figures'));
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

  it('renders the header, the quick check first, then open checks, the past row and the sources note', async () => {
    await renderScreen();
    expect(screen.getByText('Decide')).toBeTruthy();
    expect(screen.getByText('Can I afford it')).toBeTruthy();
    expect(screen.getByText('Judged on your real accounts, not the price tag.')).toBeTruthy();
    expect(screen.getByTestId('probe-quick')).toBeTruthy();
    expect(screen.getByTestId('probe-open')).toBeTruthy();
    expect(screen.getByText('Past decisions')).toBeTruthy();
    expect(screen.getByText('Nothing decided yet')).toBeTruthy();
    expect(screen.getByText(/4 months of logged income/)).toBeTruthy();
    expect(mockSeen.quick).toMatchObject({ surface: 'home', sourceStatus: 'ready', today: '2026-10-15', currency: 'USD' });
    expect(screen.getByTestId('tab-root').props.refreshKeys).toBeUndefined();
  });

  it('says rough figures were entered when the snapshot is rough, and nothing when there are none', async () => {
    mockSnap = ready(roughSource());
    const view = await renderScreen();
    expect(screen.getByText(/Rough figures you entered/)).toBeTruthy();
    mockSnap = ready(noneSource());
    await view.unmount();
    await renderScreen();
    expect(screen.queryByText(/Rough figures you entered/)).toBeNull();
    expect(screen.queryByText(/months of logged income/)).toBeNull();
  });

  it('counts decided checks on the Past decisions row and opens the past list', async () => {
    mockChecks = [row('a', { status: 'bought' }), row('b', { status: 'passed' }), row('c', { status: 'bought', deleted_at: '2026-10-02T00:00:00Z' })];
    await renderScreen();
    expect(screen.getByText('2 decisions')).toBeTruthy();
    await fireEvent.press(screen.getByText('Past decisions'));
    expect(mockPush).toHaveBeenCalledWith('/decide/past');
  });

  it('registers the New check FAB, which opens a new purchase check', async () => {
    await renderScreen();
    const config = mockRegisterFab.mock.calls[0]?.[0] as { label: string; accessibilityLabel: string; onPress: () => void };
    expect(config.label).toBe('New check');
    expect(config.accessibilityLabel).toBe('Start a new affordability check');
    config.onPress();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/check/[id]', params: { id: 'new-id', kind: 'buy' } });
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

  it('passes the retry through to the quick check', async () => {
    mockSnap = { status: 'error', result: null, source: null, retry: mockRetry };
    await renderScreen();
    (mockSeen.quick!.onRetry as () => void)();
    expect(mockRetry).toHaveBeenCalled();
  });

  it('reconciles reminders once with the waiting ready-by dates and the decided cooling-off dates', async () => {
    mockChecks = [
      row('w', { status: 'waiting', ready_by: '2026-11-01', cooling_off_at: null }),
      row('b', { status: 'bought', cooling_off_at: '2026-10-17T09:00:00Z' }),
      row('o', { status: 'open' }),
    ];
    const view = await renderScreen();
    await view.rerender(
      <ThemeProvider>
        <DecideHomeScreen />
      </ThemeProvider>
    );
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
    // The reopened child is soft-deleted (abandoned): the old decision's reminders are back.
    mockChecks = [
      row('old', { status: 'waiting', ready_by: '2026-11-01', cooling_off_at: '2026-10-20T09:00:00Z' }),
      row('child', { status: 'open', reopened_from: 'old', deleted_at: '2026-10-16T00:00:00Z' }),
    ];
    await view.rerender(
      <ThemeProvider>
        <DecideHomeScreen />
      </ThemeProvider>
    );
    expect(mockReconcile).toHaveBeenLastCalledWith(
      [{ id: 'old', readyBy: '2026-11-01' }],
      '2026-10-15',
      [{ id: 'old', coolingOffAt: '2026-10-20T09:00:00Z' }]
    );
  });
});
