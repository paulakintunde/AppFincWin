import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
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
  useRemoveDecision: () => ({ remove: jest.fn() }),
}));
jest.mock('@/data/mutations/decideLinks', () => ({
  useUnlinkLine: () => ({ unlink: jest.fn() }),
  useAttachLine: () => ({ attach: jest.fn() }),
}));
jest.mock('../../notifications/waitReminder', () => ({ cancelCheckReminders: (...a: unknown[]) => mockCancel(...(a as [])) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
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

  it('reopens a passed decision as a new check, cancelling its reminders; a bought one has no Reopen', async () => {
    mockChecks = [
      decision('b', { name: 'Laptop' }),
      decision('p', { name: 'Watch', status: 'passed', decided_at: '2026-09-01T12:00:00Z' }),
    ];
    await renderScreen();
    expect(screen.getAllByText('Reopen')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Reopen'));
    expect(mockReopen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p' }), TODAY);
    expect(mockCancel).toHaveBeenCalledWith('p');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ text: { key: 'decide.toast.reopened' } }));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('IN-B05: Reopen writes one check; a second press, or a decision already reopened, opens the live check', async () => {
    mockChecks = [decision('p', { name: 'Watch', status: 'passed', decided_at: '2026-09-01T12:00:00Z' })];
    mockReopen.mockReturnValue('new-check');
    await renderScreen();
    await fireEvent.press(screen.getByText('Reopen'));
    await fireEvent.press(screen.getByText('Reopen'));
    expect(mockReopen).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/decide/check/[id]', params: { id: 'new-check' } });
  });

  it('IN-B05: a decision with a live reopened check opens that check instead of writing another', async () => {
    mockChecks = [
      decision('p', { name: 'Watch', status: 'passed', decided_at: '2026-09-01T12:00:00Z' }),
      decision('again', { name: 'Watch', status: 'open', reopened_from: 'p', decided_at: null }),
    ];
    await renderScreen();
    await fireEvent.press(screen.getByText('Reopen'));
    expect(mockReopen).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/check/[id]', params: { id: 'again' } });
  });

  it('opens the decision detail when a row is pressed', async () => {
    mockChecks = [decision('b', { name: 'Laptop' })];
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: /^Laptop, Bought/ }));
    expect(screen.getByText('Final price')).toBeTruthy();
  });
});
