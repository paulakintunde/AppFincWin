import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideLinkRow } from '@/db/decideLinks';
import type { TransactionRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DecisionDetailSheet } from '../DecisionDetailSheet';
import { decision, goal, inputs, line, link } from './helpers/pastFixtures';

jest.setTimeout(30000);

let mockGoals: SavingsGoalRow[] = [];
let mockCandidates: TransactionRow[] = [];
const mockRemove = jest.fn(() => 'step-remove');
const mockUnlink = jest.fn(() => 'step-unlink');
const mockAttach = jest.fn(() => 'link-new');
const mockReopen = jest.fn(() => 'new-check');
const mockCancel = jest.fn(() => Promise.resolve());
const mockToast = jest.fn();
const mockPush = jest.fn();

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', ready: true }),
}));
jest.mock('@/data/queries/decide', () => ({
  useSavingsGoals: () => ({ data: mockGoals }),
  useGoalLines: () => ({ data: [] }),
  useAttachCandidates: () => ({ data: mockCandidates }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [] }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useReopenCheck: () => ({ reopen: mockReopen }),
  useRemoveDecision: () => ({ remove: mockRemove }),
}));
jest.mock('@/data/mutations/decideLinks', () => ({
  useUnlinkLine: () => ({ unlink: mockUnlink }),
  useAttachLine: () => ({ attach: mockAttach }),
}));
jest.mock('../../notifications/waitReminder', () => ({ cancelCheckReminders: (...a: unknown[]) => mockCancel(...(a as [])) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('@/ui/Sheet', () => {
  const R = require('react');
  return {
    Sheet: (p: { visible: boolean; children: React.ReactNode }) => (p.visible ? R.createElement(R.Fragment, null, p.children) : null),
    SheetScroll: (p: { children: React.ReactNode }) => R.createElement(R.Fragment, null, p.children),
  };
});

const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockGoals = [];
  mockCandidates = [];
});

async function renderSheet(d: DecideCheckRow | null, links: DecideLinkRow[] = [], lines: TransactionRow[] = []) {
  return render(
    <ThemeProvider>
      <DecisionDetailSheet decision={d} links={links} linkedLines={lines} onClose={onClose} />
    </ThemeProvider>
  );
}

describe('DecisionDetailSheet', () => {
  it('renders nothing without a decision', async () => {
    await renderSheet(null);
    expect(screen.queryByText('Final price')).toBeNull();
  });

  it('before day 30 says when the comparison will happen and shows no delta', async () => {
    await renderSheet(decision('b', { decided_at: '2026-10-05T12:00:00Z' }));
    expect(screen.getByText(/Compared at 30 days — /)).toBeTruthy();
    expect(screen.queryByText(/ at 30 days: /)).toBeNull();
    expect(screen.getByText('Compared at 30 and 90 days')).toBeTruthy();
    expect(screen.getByText('Linked lines (0)')).toBeTruthy();
  });

  it('at 30 days compares estimate with the linked lines, in words, with a neutral note', async () => {
    const links = [
      link('l1', 'b', { target_id: 'tx1' }),
      link('l2', 'b', { entity: 'recurring_series', target_id: 's1', role: 'running_cost' }),
    ];
    const lines = [
      line('tx1', { local_date: '2026-08-01', home_amount: -50_000 }),
      line('r1', { recurring_series_id: 's1', local_date: '2026-08-15', home_amount: -12_000, name: 'Insurance' }),
    ];
    await renderSheet(decision('b'), links, lines);
    expect(screen.getByText('On the day at 30 days: $500 against $500 (at)')).toBeTruthy();
    expect(screen.getByText('A month at 30 days: $120 against $100 (+$20 over)')).toBeTruthy();
    expect(screen.getByText('Running $20 a month over the estimate.')).toBeTruthy();
    expect(screen.getByText(/Compared at 90 days — /)).toBeTruthy();
    expect(screen.getByText('Linked lines (2)')).toBeTruthy();
    expect(screen.queryByText(/you should|worth confirming/i)).toBeNull();
  });

  it('unlinks a line with an Undo toast', async () => {
    const links = [link('l1', 'b', { target_id: 'tx1' })];
    await renderSheet(decision('b'), links, [line('tx1')]);
    await fireEvent.press(screen.getByRole('button', { name: 'Unlink Laptop' }));
    expect(mockUnlink).toHaveBeenCalledWith(links[0], 'Laptop');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'destructive', stepId: 'step-unlink', text: { key: 'decide.toast.unlinked' } })
    );
  });

  it('attaches a line from the last 90 days, passing the decision date and the line date', async () => {
    mockCandidates = [line('c1', { name: 'Gadget', local_date: '2026-10-02', home_amount: -4_000 })];
    await renderSheet(decision('b'));
    await fireEvent.press(screen.getByText('Attach a line'));
    await fireEvent.press(screen.getByRole('button', { name: /^Gadget/ }));
    expect(mockAttach).toHaveBeenCalledWith({
      userId: 'u1',
      checkId: 'b',
      householdId: 'h1',
      entity: 'transactions',
      targetId: 'c1',
      decidedAt: '2026-08-01T12:00:00Z',
      lineDate: '2026-10-02',
    });
  });

  it('leaves out lines that are already linked and says when none remain', async () => {
    mockCandidates = [line('tx1', { name: 'Laptop' })];
    await renderSheet(decision('b'), [link('l1', 'b', { target_id: 'tx1' })], [line('tx1')]);
    await fireEvent.press(screen.getByText('Attach a line'));
    expect(screen.getByText('No lines in the last 90 days.')).toBeTruthy();
  });

  it('removes only after asking once, takes the live goal with it, cancels reminders and offers Undo', async () => {
    mockGoals = [goal('w')];
    const d = decision('w', { status: 'waiting', wait_monthly: 20_000, ready_by: '2027-01-15' });
    await renderSheet(d);
    await fireEvent.press(screen.getByText('Remove'));
    expect(mockRemove).not.toHaveBeenCalled();
    expect(screen.getByText('Remove this decision?')).toBeTruthy();
    expect(screen.getByText('It leaves Past decisions. Lines it wrote stay in Activity.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep it'));
    expect(mockRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Remove'));
    await fireEvent.press(screen.getAllByText('Remove').at(-1)!);
    expect(mockRemove).toHaveBeenCalledWith(d, mockGoals[0]);
    expect(mockCancel).toHaveBeenCalledWith('w');
    expect(onClose).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'destructive', stepId: 'step-remove', text: { key: 'decide.toast.removed' } })
    );
  });

  it('shows a passed decision with its why, no expiry wording and a Reopen action', async () => {
    const d = decision('p', { status: 'passed', inputs: inputs({ advertised: 30_000, why: 'Too much' }) });
    await renderSheet(d);
    expect(screen.getByText('Quoted')).toBeTruthy();
    expect(screen.getByText('$300')).toBeTruthy();
    expect(screen.getByText('Too much')).toBeTruthy();
    expect(screen.getByText(/^Decided /)).toBeTruthy();
    expect(screen.getByText('Kept until you delete it')).toBeTruthy();
    expect(screen.queryByText(/twelve months|kept on file/i)).toBeNull();
    await fireEvent.press(screen.getByText('Reopen the check'));
    expect(mockReopen).toHaveBeenCalledWith(d, '2026-10-15');
    expect(mockCancel).toHaveBeenCalledWith('p');
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('offers no Reopen on a bought decision', async () => {
    await renderSheet(decision('b'));
    expect(screen.queryByText('Reopen the check')).toBeNull();
  });
});
