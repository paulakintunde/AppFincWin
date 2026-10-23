import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideLinkRow } from '@/db/decideLinks';
import type { TransactionRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { PastDecisionsScreen } from '../PastDecisionsScreen';
import { TODAY, decision, goal, inputs, line, link } from './helpers/pastFixtures';

jest.setTimeout(30000);

let mockChecks: DecideCheckRow[] = [];
let mockLinks: DecideLinkRow[] = [];
let mockLines: TransactionRow[] = [];
let mockGoals: SavingsGoalRow[] = [];
const mockReopen = jest.fn(() => 'new-check');
const mockRemove = jest.fn(() => 'step-remove');
const mockSwipe: { props: Record<string, any> } = { props: {} };
const mockCancel = jest.fn(() => Promise.resolve());
const mockPush = jest.fn();
const mockToast = jest.fn();

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', timeZone: 'UTC', ready: true }),
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({ data: mockChecks }),
  useDecideLinks: () => ({ data: mockLinks }),
  useLinkedLines: () => ({ data: mockLines }),
  useSavingsGoals: () => ({ data: mockGoals }),
  useGoalLines: () => ({ data: [] }),
  useAttachCandidates: () => ({ data: [] }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [] }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useReopenCheck: () => ({ reopen: mockReopen }),
  useRemoveDecision: () => ({ remove: (...a: unknown[]) => mockRemove(...(a as [])) }),
}));
jest.mock('@/data/mutations/decideLinks', () => ({
  useUnlinkLine: () => ({ unlink: jest.fn() }),
  useAttachLine: () => ({ attach: jest.fn() }),
}));
jest.mock('../../notifications/waitReminder', () => ({ cancelCheckReminders: (...a: unknown[]) => mockCancel(...(a as [])) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: R.forwardRef((props: any, ref: any) => {
      mockSwipe.props = props;
      R.useImperativeHandle(ref, () => ({ close: jest.fn() }));
      return <View>{props.children}</View>;
    }),
  };
});
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = require('react');
  const { View, Text } = require('react-native');
  return { DetailScreen: (p: { title: string; children: React.ReactNode }) => R.createElement(View, null, R.createElement(Text, null, p.title), p.children) };
});
jest.mock('@/ui/Sheet', () => {
  const R = require('react');
  return {
    Sheet: (p: { visible: boolean; children: React.ReactNode }) => (p.visible ? R.createElement(R.Fragment, null, p.children) : null),
    SheetScroll: (p: { children: React.ReactNode }) => R.createElement(R.Fragment, null, p.children),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockChecks = [];
  mockLinks = [];
  mockLines = [];
  mockGoals = [];
});

async function renderScreen() {
  return render(
    <ThemeProvider>
      <PastDecisionsScreen />
    </ThemeProvider>
  );
}

describe('PastDecisionsScreen', () => {
  it('shows the empty state', async () => {
    await renderScreen();
    expect(screen.getByText('Past decisions')).toBeTruthy();
    expect(screen.getByText('Nothing decided yet')).toBeTruthy();
    expect(screen.getByText('Checks you act on, save for or pass on are kept here.')).toBeTruthy();
  });

  it('lists bought, waiting and passed decisions newest first, leaves out open ones, with the state in words', async () => {
    mockChecks = [
      decision('old', { name: 'Old bike', decided_at: '2026-07-01T12:00:00Z' }),
      decision('wait', {
        name: 'Sofa',
        status: 'waiting',
        decided_at: '2026-10-10T12:00:00Z',
        wait_monthly: 20_000,
        ready_by: '2027-01-15',
        inputs: inputs({ advertised: 90_000 }),
      }),
      decision('pass', { name: 'Watch', status: 'passed', decided_at: '2026-09-01T12:00:00Z', inputs: inputs({ advertised: 30_000, why: 'Too much' }) }),
      decision('open', { name: 'Draft thing', status: 'open', decided_at: null }),
    ];
    mockGoals = [goal('wait')];
    await renderScreen();
    expect(screen.queryByText('Draft thing')).toBeNull();
    const names = screen.getAllByText(/^(Old bike|Sofa|Watch)$/).map((n) => n.props.children);
    expect(names).toEqual(['Sofa', 'Watch', 'Old bike']);
    expect(screen.getByText('Bought')).toBeTruthy();
    expect(screen.getByText('Waiting')).toBeTruthy();
    expect(screen.getByText('Passed')).toBeTruthy();
    expect(screen.getByText(/\$900 target · \$200 a month · ready/)).toBeTruthy();
    expect(screen.getByText(/\$300 quoted · Too much · /)).toBeTruthy();
    expect(screen.queryByText(/twelve months|kept on file/i)).toBeNull();
  });

  it('shows a danger delta strip in words once day 30 is reached', async () => {
    mockChecks = [decision('b')];
    mockLinks = [link('l1', 'b', { entity: 'recurring_series', target_id: 's1', role: 'running_cost' })];
    mockLines = [line('r1', { recurring_series_id: 's1', local_date: '2026-08-15', home_amount: -12_000, original_amount: -12_000 })];
    await renderScreen();
    expect(screen.getByText('Estimated $100 a month to run, actually')).toBeTruthy();
    expect(screen.getByText('$120 (+$20 over)')).toBeTruthy();
  });

  it('WR-B06: a decision with no linked running cost shows no "under" strip after day 30', async () => {
    mockChecks = [decision('b')];
    mockLinks = [];
    mockLines = [];
    await renderScreen();
    expect(screen.queryByText(/to run, actually/)).toBeNull();
    expect(screen.queryByText(/under/)).toBeNull();
  });

  it('shows no delta before day 30', async () => {
    mockChecks = [decision('b', { decided_at: '2026-10-05T12:00:00Z' })];
    await renderScreen();
    expect(screen.queryByText(/to run, actually/)).toBeNull();
  });

  it('shows how many scheduled payments matched for a plan', async () => {
    mockChecks = [decision('b', { inputs: inputs({ method: 'instalment' }) })];
    mockLinks = [link('l1', 'b', { entity: 'recurring_series', target_id: 's1', role: 'payment' })];
    mockLines = [
      line('r1', { recurring_series_id: 's1', local_date: '2026-09-01', home_amount: -10_000 }),
      line('r2', { recurring_series_id: 's1', local_date: '2026-10-01', status: 'pending', home_amount: -10_000 }),
    ];
    await renderScreen();
    expect(screen.getByText('Payments matched the schedule for')).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  async function pressMenu(name: string, option: string) {
    await fireEvent.press(screen.getByLabelText(`More for ${name}`));
    await fireEvent.press(screen.getByLabelText(option));
  }

  it('D-73 Reopen is offered only for Waiting and Passed', async () => {
    mockChecks = [decision('b', { name: 'Laptop' })];
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('More for Laptop'));
    expect(screen.getByLabelText('Open')).toBeTruthy();
    expect(screen.queryByLabelText('Reopen')).toBeNull();
    expect(screen.getByLabelText('Delete')).toBeTruthy();
  });

  it('D-73 Reopen is offered for a Passed decision and reopens it as a new check, cancelling its reminders', async () => {
    mockChecks = [decision('p', { name: 'Watch', status: 'passed', decided_at: '2026-09-01T12:00:00Z' })];
    await renderScreen();
    await pressMenu('Watch', 'Reopen');
    expect(mockReopen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p' }), TODAY);
    expect(mockCancel).toHaveBeenCalledWith('p');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ text: { key: 'decide.toast.reopened' } }));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('IN-B05: Reopen writes one check; a second press opens the live check', async () => {
    mockChecks = [decision('p', { name: 'Watch', status: 'passed', decided_at: '2026-09-01T12:00:00Z' })];
    mockReopen.mockReturnValue('new-check');
    await renderScreen();
    await pressMenu('Watch', 'Reopen');
    await pressMenu('Watch', 'Reopen');
    expect(mockReopen).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/decide/check/[id]', params: { id: 'new-check' } });
  });

  it('IN-B05: a decision with a live reopened check opens that check instead of writing another', async () => {
    mockChecks = [
      decision('p', { name: 'Watch', status: 'passed', decided_at: '2026-09-01T12:00:00Z' }),
      decision('again', { name: 'Watch', status: 'open', reopened_from: 'p', decided_at: null }),
    ];
    await renderScreen();
    await pressMenu('Watch', 'Reopen');
    expect(mockReopen).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/check/[id]', params: { id: 'again' } });
  });

  it('D-73 a bought decision confirm says its written lines stay in Activity', async () => {
    mockChecks = [decision('b', { name: 'Laptop' })];
    mockLinks = [
      link('l1', 'b', { target_id: 'tx1' }),
      link('l2', 'b', { target_id: 'tx2' }),
      link('l3', 'b', { target_id: 'tx3', source: 'attached' }),
    ];
    await renderScreen();
    await pressMenu('Laptop', 'Delete');
    expect(screen.getByText('Delete this decision?')).toBeTruthy();
    expect(
      screen.getByText('It leaves Past decisions. The 2 lines Go ahead wrote stay in Activity, and every figure that uses them stays the same.')
    ).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('D-73 the bought confirm uses the singular for one written line', async () => {
    mockChecks = [decision('b', { name: 'Laptop' })];
    mockLinks = [link('l1', 'b')];
    await renderScreen();
    await pressMenu('Laptop', 'Delete');
    expect(screen.getByText(/The line Go ahead wrote stays in Activity/)).toBeTruthy();
  });

  it('D-73 Waiting and Passed confirms use their own copy', async () => {
    mockChecks = [
      decision('w', { name: 'Sofa', status: 'waiting', decided_at: '2026-10-10T12:00:00Z', wait_monthly: 20_000, ready_by: '2027-01-15' }),
      decision('p', { name: 'Watch', status: 'passed', decided_at: '2026-09-01T12:00:00Z' }),
    ];
    mockGoals = [goal('w')];
    await renderScreen();
    await pressMenu('Watch', 'Delete');
    expect(screen.getByText('It leaves Past decisions. Nothing else changes.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep it'));
    await pressMenu('Sofa', 'Delete');
    expect(screen.getByText(/with its savings goal and reminder/)).toBeTruthy();
  });

  it('D-73 deleting a Waiting decision deletes its goal in one step and cancels its reminders', async () => {
    mockChecks = [
      decision('w', { name: 'Sofa', status: 'waiting', decided_at: '2026-10-10T12:00:00Z', wait_monthly: 20_000, ready_by: '2027-01-15' }),
    ];
    mockGoals = [goal('w')];
    await renderScreen();
    await pressMenu('Sofa', 'Delete');
    expect(mockRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByText('Delete').at(-1)!);
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'w' }), mockGoals[0]);
    expect(mockCancel).toHaveBeenCalledWith('w');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'destructive', stepId: 'step-remove', text: { key: 'decide.delete.toastDecision' } })
    );
  });

  it('D-73 deleting a decision never touches a written line', async () => {
    mockChecks = [decision('b', { name: 'Laptop' })];
    mockLinks = [link('l1', 'b')];
    mockLines = [line('tx1')];
    await renderScreen();
    await pressMenu('Laptop', 'Delete');
    await fireEvent.press(screen.getAllByText('Delete').at(-1)!);
    // The only write is the remove call: the check row (and, for Waiting, its goal). No line, link or transfer is passed.
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), null);
  });

  it('D-73 a full swipe opens the confirm and does not delete', async () => {
    mockChecks = [decision('p', { name: 'Watch', status: 'passed', decided_at: '2026-09-01T12:00:00Z' })];
    await renderScreen();
    await act(async () => {
      mockSwipe.props.onSwipeableOpen('left');
    });
    expect(screen.getByText('Delete this decision?')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('opens the decision detail when a row is pressed', async () => {
    mockChecks = [decision('b', { name: 'Laptop' })];
    await renderScreen();
    await fireEvent.press(screen.getByLabelText(/^Laptop, Bought/));
    expect(screen.getByText('Final price')).toBeTruthy();
  });
});
