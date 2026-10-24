import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { TransactionRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DecisionDetailSheet } from '../DecisionDetailSheet';
import { PastDecisionsScreen } from '../PastDecisionsScreen';
import { GoalTagEditContext } from '../goalTagEdit';
import { decision, goal, inputs, line } from './helpers/pastFixtures';

jest.setTimeout(30000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

let mockChecks: DecideCheckRow[] = [];
let mockGoals: SavingsGoalRow[] = [];
let mockGoalLines: TransactionRow[] = [];
let mockCandidates: TransactionRow[] = [];
const mockEdit = jest.fn(() => true);
const mockToast = jest.fn();

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', timeZone: 'UTC', ready: true }),
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({ data: mockChecks }),
  useDecideLinks: () => ({ data: [] }),
  useLinkedLines: () => ({ data: [] }),
  useSavingsGoals: () => ({ data: mockGoals }),
  useGoalLines: () => ({ data: mockGoalLines }),
  useAttachCandidates: () => ({ data: mockCandidates }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [] }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useReopenCheck: () => ({ reopen: jest.fn() }),
  useRemoveDecision: () => ({ remove: jest.fn() }),
}));
jest.mock('@/data/mutations/decideLinks', () => ({
  useUnlinkLine: () => ({ unlink: jest.fn() }),
  useAttachLine: () => ({ attach: jest.fn() }),
}));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('../../notifications/waitReminder', () => ({ cancelCheckReminders: () => Promise.resolve() }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
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

const waiting = () =>
  decision('w', { status: 'waiting', name: 'Sofa', wait_monthly: 20_000, ready_by: '2027-01-15', inputs: inputs({ advertised: 90_000 }) });
const leg = (id: string, over: Partial<TransactionRow> = {}) =>
  line(id, { name: 'To savings', original_amount: 30_000, home_amount: 30_000, transfer_id: 't1', goal_id: null, version: 4, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockChecks = [];
  mockGoals = [goal('w')];
  mockGoalLines = [];
  mockCandidates = [];
});

describe('goal progress in Past decisions rows', () => {
  it('shows saved of target for a Waiting row, from the tagged lines', async () => {
    mockChecks = [waiting()];
    mockGoalLines = [leg('x1', { goal_id: 'g1' })];
    await render(
      <ThemeProvider>
        <GoalTagEditContext.Provider value={(...a: unknown[]) => mockEdit(...(a as []))}>
          <PastDecisionsScreen />
        </GoalTagEditContext.Provider>
      </ThemeProvider>
    );
    expect(screen.getByText('$300 of $900 saved')).toBeTruthy();
  });

  it('shows no progress on a Bought row', async () => {
    mockChecks = [decision('b')];
    await render(
      <ThemeProvider>
        <GoalTagEditContext.Provider value={(...a: unknown[]) => mockEdit(...(a as []))}>
          <PastDecisionsScreen />
        </GoalTagEditContext.Provider>
      </ThemeProvider>
    );
    expect(screen.queryByText(/saved$/)).toBeNull();
  });

  it('says Waiting for a rate when a tagged line has no stored rate', async () => {
    mockChecks = [waiting()];
    mockGoalLines = [leg('x1', { goal_id: 'g1', home_amount: null, original_currency: 'EUR' })];
    await render(
      <ThemeProvider>
        <GoalTagEditContext.Provider value={(...a: unknown[]) => mockEdit(...(a as []))}>
          <PastDecisionsScreen />
        </GoalTagEditContext.Provider>
      </ThemeProvider>
    );
    expect(screen.getByText('Waiting for a rate')).toBeTruthy();
  });
});

describe('tagging transfers from the detail sheet', () => {
  const renderSheet = (d: DecideCheckRow) =>
    render(
      <ThemeProvider>
        <GoalTagEditContext.Provider value={(...a: unknown[]) => mockEdit(...(a as []))}>
          <DecisionDetailSheet decision={d} links={[]} linkedLines={[]} onClose={jest.fn()} />
        </GoalTagEditContext.Provider>
      </ThemeProvider>
    );

  it('lists only untagged money-in transfer legs and tags one with Undo', async () => {
    mockCandidates = [
      leg('ok', { name: 'Move to goal' }),
      leg('plain', { name: 'Coffee', transfer_id: null }),
      leg('out', { name: 'Outgoing leg', original_amount: -30_000, home_amount: -30_000 }),
      leg('taken', { name: 'Already tagged', goal_id: 'other' }),
    ];
    await renderSheet(waiting());
    await fireEvent.press(screen.getByText('Tag a transfer'));
    expect(screen.queryByText('Coffee')).toBeNull();
    expect(screen.queryByText('Outgoing leg')).toBeNull();
    expect(screen.queryByText('Already tagged')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Move to goal/ }));
    expect(mockEdit).toHaveBeenCalledWith(
      { id: 'ok', householdId: 'h1', month: '2026-08', expectedVersion: 4, patch: { goal_id: 'g1' } },
      { stepId: 'step-1', ownerId: 'u1', labelKey: 'transferTagged', labelParams: { name: 'Move to goal' }, before: { goal_id: null } }
    );
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.depth.goal.tagged' }, stepId: 'step-1' });
  });

  it('says so when there are no transfers to tag', async () => {
    await renderSheet(waiting());
    await fireEvent.press(screen.getByText('Tag a transfer'));
    expect(screen.getByText('No transfers in the last 90 days.')).toBeTruthy();
  });

  it('untags a tagged transfer with Undo', async () => {
    mockGoalLines = [leg('x1', { goal_id: 'g1', name: 'Move to goal' })];
    await renderSheet(waiting());
    expect(screen.getByText('Move to goal')).toBeTruthy();
    // IN-B03: the x names its row
    await fireEvent.press(screen.getByRole('button', { name: 'Untag Move to goal' }));
    expect(mockEdit).toHaveBeenCalledWith(
      { id: 'x1', householdId: 'h1', month: '2026-08', expectedVersion: 4, patch: { goal_id: null } },
      { stepId: 'step-1', ownerId: 'u1', labelKey: 'transferUntagged', labelParams: { name: 'Move to goal' }, before: { goal_id: 'g1' } }
    );
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.depth.goal.untagged' }, stepId: 'step-1' });
  });

  it('offers no tagging for a Bought decision', async () => {
    await renderSheet(decision('b'));
    expect(screen.queryByText('Tag a transfer')).toBeNull();
  });
});
