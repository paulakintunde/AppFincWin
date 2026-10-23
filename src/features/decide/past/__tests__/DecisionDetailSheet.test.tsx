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
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

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
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', timeZone: 'UTC', ready: true }),
}));
jest.mock('@/data/queries/decide', () => ({
  useSavingsGoals: () => ({ data: mockGoals }),
  useDecideChecks: () => ({ data: [] }),
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

  it('D-81 the decision detail shows the custom name', async () => {
    const custom = inputs({ itemType: 'vehicle', customItemType: { name: 'Drone', treatLike: 'vehicle' } });
    await renderSheet(decision('b', { inputs: custom }));
    const name = screen.getByText('Drone');
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe('tail');
    expect(screen.getByText('treated like Vehicle')).toBeTruthy();
    expect(screen.getByLabelText('Item type, Drone, treated like Vehicle')).toBeTruthy();
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

  it('WR-B07: Final price is the price after fees and trade-ins, in the currency the check was typed in', async () => {
    const adjustments = [
      { id: 'fee', name: 'Delivery', amount: 5_000, note: '', counted: true, effect: 'adds', onDay: true, taxPercentText: null },
      { id: 'trade', name: 'Trade-in', amount: 20_000, note: '', counted: true, effect: 'takes_off', onDay: false, taxPercentText: null },
    ];
    await renderSheet(decision('b', { inputs: inputs({ currency: 'EUR', advertised: 100_000, adjustments: adjustments as never }) }));
    expect(screen.getByText('Final price')).toBeTruthy();
    expect(screen.getByText(/^€\s?850$/)).toBeTruthy();
    expect(screen.queryByText(/^\$1,?000$/)).toBeNull();
  });

  it('WR-B06: with no linked line of a kind the actual is a dash and nothing says "under"', async () => {
    const links = [link('l1', 'b', { target_id: 'tx1' })];
    await renderSheet(decision('b'), links, [line('tx1', { local_date: '2026-08-01', home_amount: -50_000 })]);
    expect(screen.getByText('On the day at 30 days: $500 against $500 (at)')).toBeTruthy();
    expect(screen.queryByText(/A month at \d+ days/)).toBeNull();
    expect(screen.queryByText(/under/)).toBeNull();
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

  it('IN-B03: a nameless linked line is named by its date and amount in the Unlink label', async () => {
    const links = [link('l1', 'b', { target_id: 'tx1' })];
    await renderSheet(decision('b'), links, [line('tx1', { name: null, note: null })]);
    expect(screen.getByRole('button', { name: /^Unlink .+, \$500$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unlink ' })).toBeNull();
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
      timeZone: 'UTC',
    });
  });

  it('leaves out lines that are already linked and says when none remain', async () => {
    mockCandidates = [line('tx1', { name: 'Laptop' })];
    await renderSheet(decision('b'), [link('l1', 'b', { target_id: 'tx1' })], [line('tx1')]);
    await fireEvent.press(screen.getByText('Attach a line'));
    expect(screen.getByText('No lines in the last 90 days.')).toBeTruthy();
  });

  it('D-73 the detail sheet deletes through the per-outcome confirm', async () => {
    mockGoals = [goal('w')];
    const d = decision('w', { status: 'waiting', wait_monthly: 20_000, ready_by: '2027-01-15' });
    await renderSheet(d);
    expect(screen.queryByText('Remove')).toBeNull();
    await fireEvent.press(screen.getByText('Delete'));
    expect(mockRemove).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this decision?')).toBeTruthy();
    expect(screen.getByText(/with its savings goal and reminder/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep it'));
    expect(mockRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Delete'));
    await fireEvent.press(screen.getAllByText('Delete').at(-1)!);
    expect(mockRemove).toHaveBeenCalledWith(d, mockGoals[0]);
    expect(mockCancel).toHaveBeenCalledWith('w');
    expect(onClose).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'destructive', stepId: 'step-remove', text: expect.objectContaining({ key: 'decide.delete.toastDecision' }) })
    );
  });

  it('D-73 a bought decision confirm counts only the lines Go ahead wrote', async () => {
    const links = [link('l1', 'b', { target_id: 'tx1' }), link('l2', 'b', { target_id: 'tx2', source: 'attached' })];
    await renderSheet(decision('b'), links, [line('tx1'), line('tx2')]);
    await fireEvent.press(screen.getByText('Delete'));
    expect(screen.getByText(/The line Go ahead wrote stays in Activity/)).toBeTruthy();
  });

  it('D-75 linked lines beyond 3 sit behind Show details', async () => {
    const ids = ['a', 'b2', 'c', 'd', 'e'];
    const links = ids.map((id) => link(`l-${id}`, 'b', { target_id: `tx-${id}` }));
    const lines = ids.map((id, i) => line(`tx-${id}`, { name: `Item ${id}`, local_date: `2026-08-0${i + 1}` }));
    await renderSheet(decision('b'), links, lines);
    expect(screen.getByText('Item a')).toBeTruthy();
    expect(screen.getByText('Item c')).toBeTruthy();
    expect(screen.queryByText('Item d')).toBeNull();
    await fireEvent.press(screen.getByText('Show details'));
    expect(screen.getByText('Item d')).toBeTruthy();
    expect(screen.getByText('Item e')).toBeTruthy();
    await fireEvent.press(screen.getByText('Hide details'));
    expect(screen.queryByText('Item e')).toBeNull();
  });

  it('D-75 three or fewer linked lines show no Show details', async () => {
    await renderSheet(decision('b'), [link('l1', 'b')], [line('tx1')]);
    expect(screen.queryByText('Show details')).toBeNull();
  });

  it('D-70 the linked lines heading carries whatGetsWritten', async () => {
    await renderSheet(decision('b'));
    await fireEvent.press(screen.getByLabelText('About What gets written'));
    expect(screen.getByText(/The lines Go ahead adds to your records/)).toBeTruthy();
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
