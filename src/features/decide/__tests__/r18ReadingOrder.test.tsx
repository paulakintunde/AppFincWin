/**
 * 05-130 (R18.1 Accessibility, R18.7): the screen-reader order of the R18 surfaces, read from the rendered tree.
 * The home runs for real (card, quick check form, notice row, rows); only data hooks, the shell and navigation are stubbed.
 */
import React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideSettingsRow } from '@/db/decideSettings';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { carInputs, demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import { buildDecideSnapshot } from '../snapshot/buildSnapshot';
import { loggedSource, month } from '../snapshot/__tests__/helpers/snapshotFixtures';
import type { CheckInputs, SnapshotResult } from '../snapshot/types';
import { stepProps, wrap } from '../check/steps/__tests__/helpers/stepProps';
import { Step3Verdict } from '../check/steps/Step3Verdict';
import { DecideHomeScreen } from '../home/DecideHomeScreen';
import { goal } from '../past/__tests__/helpers/pastFixtures';
import { PotsScreen } from '../pots/PotsScreen';
import { allNodes } from './helpers/r18Fit';

jest.setTimeout(60000);

type Snap = { status: 'loading' | 'error' | 'ready'; result: SnapshotResult | null; source: unknown; retry: () => void };
let mockSnap: Snap;
let mockChecks: DecideCheckRow[] = [];
let mockGoals: SavingsGoalRow[] = [];
let mockSync = { isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null as number | null, inFlightOldestAt: null as number | null, oldestPendingAt: null as number | null };

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', timeZone: 'UTC', ready: true }),
}));
jest.mock('@/data/queries/decide', () => {
  const select = (rows: SavingsGoalRow[]) => {
    const live = rows.filter((r) => r.deleted_at == null && r.done_at == null);
    return { live, plain: live.filter((r) => r.kind === 'pot'), wait: live.filter((r) => r.kind === 'wait'), done: rows.filter((r) => r.deleted_at == null && r.done_at != null) };
  };
  return {
    useDecideSnapshot: () => mockSnap,
    useDecideChecks: () => ({ data: mockChecks }),
    useOpenChecks: () => ({ data: mockChecks.filter((c) => c.deleted_at == null && c.status === 'open') }),
    useDecideSettings: () => ({ data: null as DecideSettingsRow | null }),
    useDecideChanges: () => ({ data: [] }),
    useDebts: () => ({ data: [] }),
    useOtherChecks: () => ({ otherChecks: [], openCount: 0, leftOutIncomplete: 0, leftOutCurrency: 0 }),
    usePots: () => ({ data: select(mockGoals), isError: false, refetch: jest.fn() }),
    useGoalLines: () => ({ data: [] }),
    useLinkedLines: () => ({ data: [] }),
    useDecideLinks: () => ({ data: [] }),
    useSavingsGoals: () => ({ data: mockGoals }),
    useAttachCandidates: () => ({ data: [] }),
  };
});
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [] }) }));
jest.mock('@/data/mutations/decideChanges', () => ({
  useAddChange: () => ({ add: jest.fn() }),
  useEditChange: () => ({ edit: jest.fn() }),
  useRemoveChange: () => ({ remove: jest.fn() }),
}));
jest.mock('@/data/mutations/decideSettings', () => ({ useUpdateDecideSettings: () => ({ update: jest.fn() }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useCreateCheck: () => ({ create: jest.fn() }),
  useReopenCheck: () => ({ reopen: jest.fn() }),
  useRemoveDecision: () => ({ remove: jest.fn() }),
}));
jest.mock('@/data/mutations/decidePots', () => ({
  useDeletePot: () => ({ remove: jest.fn(() => 's') }),
  useSetPotDone: () => ({ setDone: jest.fn(() => 's') }),
  useAddPot: () => ({ add: jest.fn(() => ({ id: 'n', stepId: 's' })) }),
  useEditPot: () => ({ edit: jest.fn(() => 's') }),
}));
jest.mock('@/data/mutations/decideLinks', () => ({
  useSaveCardTerms: () => ({ save: jest.fn() }),
  useUnlinkLine: () => ({ unlink: jest.fn() }),
  useAttachLine: () => ({ attach: jest.fn() }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('../notifications/waitReminder', () => ({ reconcileWaitReminders: () => Promise.resolve(), cancelCheckReminders: () => Promise.resolve() }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('../judgeOn/useResolveJudgeOnDefault', () => ({ useResolveJudgeOnDefault: jest.fn() }));
jest.mock('../judgeOn/judgeOnStore', () => ({ useJudgeOn: () => ({ judgeOn: 'month', setJudgeOn: jest.fn() }) }));
jest.mock('../judgeOn/useChooseJudgeOn', () => ({ useChooseJudgeOn: () => ({ choose: jest.fn() }) }));
jest.mock('@/shell/fab/FabProvider', () => ({ useRegisterFab: jest.fn(), useProvideQuickAction: jest.fn() }));
jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: () => mockSync }));
jest.mock('../hints/decideHints', () => ({ loadHomeBasisSeen: () => Promise.resolve(true), markHomeBasisSeen: () => Promise.resolve(), loadJudgeOn: () => Promise.resolve(null), saveJudgeOn: () => Promise.resolve() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../home/checkHref', () => ({ openNewCheck: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: R.forwardRef((props: any, ref: any) => { R.useImperativeHandle(ref, () => ({ close: jest.fn() })); return <View>{props.children}</View>; }) };
});
jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = require('react');
  const { View, Text } = require('react-native');
  return { TabRootScreen: (p: Record<string, unknown>) => R.createElement(View, null, R.createElement(Text, { accessibilityRole: 'header' }, p.title), p.children) };
});
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = require('react');
  const { View, Text } = require('react-native');
  return { DetailScreen: (p: { title: string; children: React.ReactNode }) => R.createElement(View, null, R.createElement(Text, { accessibilityRole: 'header' }, p.title), p.children) };
});
jest.mock('@/ui/Sheet', () => {
  const R = require('react');
  return {
    Sheet: (p: { visible: boolean; children: React.ReactNode }) => (p.visible ? R.createElement(R.Fragment, null, p.children) : null),
    SheetScroll: (p: { children: React.ReactNode }) => R.createElement(R.Fragment, null, p.children),
  };
});

beforeEach(() => {
  mockChecks = [];
  mockGoals = [];
  mockSync = { isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null, inFlightOldestAt: null, oldestPendingAt: null };
});

/** What a screen reader lands on, in tree order: headers, then every accessible element by its label (or its text). */
function reads(): string[] {
  const out: string[] = [];
  const textOf = (n: { children: unknown[] }): string =>
    n.children.map((c) => (typeof c === 'string' ? c : textOf(c as { children: unknown[] }))).join('');
  for (const n of allNodes()) {
    if (typeof n.type !== 'string') continue;
    if (n.props.accessibilityRole === 'header' && n.type === 'Text') out.push(`header:${textOf(n)}`);
    else if (n.props.accessible === true || (n.type === 'TextInput' && n.props.accessibilityLabel)) out.push(String(n.props.accessibilityLabel ?? textOf(n)));
  }
  return out;
}

/** The expected labels appear in this order (other reads may sit between them). */
function expectOrder(all: string[], expected: (string | RegExp)[]): void {
  let from = 0;
  const found: number[] = [];
  for (const want of expected) {
    const at = all.findIndex((r, i) => i >= from && (typeof want === 'string' ? r === want || r.startsWith(want) : want.test(r)));
    expect({ want: String(want), at: at >= 0 }).toEqual({ want: String(want), at: true });
    found.push(at);
    from = at + 1;
  }
  expect([...found].sort((a, b) => a - b)).toEqual(found);
}

const months = (income: number[]) => income.map((inc, i) => month(`2026-0${6 + i}`, inc, 300_000));

describe('R18 reading order', () => {
  it('D-100 the card reads in the specified order', async () => {
    // fewer than three full months: the sub-line carries its own information button
    mockSnap = { status: 'ready', result: loggedSource({ months: months([500_000, 500_000]) }), source: null, retry: jest.fn() };
    mockSync = { ...mockSync, failed: 1 };
    mockChecks = [];
    await wrap(<DecideHomeScreen />);
    expectOrder(reads(), [
      'header:Can I afford it',
      /needs? a look/,
      /^Net free cash flow: .*\. In .*, out .*\.$/,
      /^About /,
      'Month details',
      'Quick check, something and a price',
      'Check it',
      'Full check',
    ]);
    const all = reads();
    const fullAt = all.indexOf('Full check');
    // the quiet rows follow the card and its Full check
    expect(all.findIndex((r) => /^Lines you will not cross/.test(r))).toBeGreaterThan(fullAt);
    await cleanup();

    // a quick result replaces Full check with the result group and its own Run the full check
    mockSnap = { status: 'ready', result: loggedSource({ months: months([500_000, 500_000, 500_000, 500_000]) }), source: null, retry: jest.fn() };
    mockSync = { ...mockSync, failed: 0 };
    await wrap(<DecideHomeScreen />);
    await fireEvent.changeText(screen.getByLabelText('Quick check, something and a price'), 'sofa 1800');
    await fireEvent.press(screen.getByText('Check it'));
    await screen.findByText('Run the full check');
    const withResult = reads();
    // D-107: the Judge-on dropdown sits between the summary group and Details
    expectOrder(withResult, ['header:Can I afford it', /^Net free cash flow: /, /^Judged on This month/, 'Month details', 'Quick check, something and a price', 'Check it', /Run the full check/]);
    expect(withResult).not.toContain('Full check');
    expect(withResult.findIndex((r) => /^Lines you will not cross/.test(r))).toBeGreaterThan(withResult.findIndex((r) => /Run the full check/.test(r)));
  });

  it('D-102 the key-figures group reads figures, then total cost, then invested', async () => {
    const car60: CheckInputs = { ...carInputs, loan: { ...carInputs.loan, termMonths: 60 }, projectionRates: ['0', '7'] };
    const src = buildDecideSnapshot(demoSource('2026-10-15'));
    await wrap(<Step3Verdict {...{ ...stepProps(car60, {}, src), lastSeenBasis: null, revealKey: 'k' }} />);
    const group = screen.getByLabelText(/^Overspent each month after this: .*Monthly cost: .*[.] Over 5.years, [0-9]+ dollars in all/);
    const label = group.props.accessibilityLabel as string;
    // one group, spoken in this order: the figures, the total cost, then the invested sentence and its projection note
    const at = ['Overspent each month after this', 'Cushion:', 'Monthly cost:', 'in all', 'Invested instead:', 'A projection, not a forecast'].map((n) => label.indexOf(n));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    // the information buttons follow in the same order
    expectOrder(reads(), [/^Overspent each month after this/, 'About Cushion', 'About Total cost', 'About Invested instead']);
  });

  it('D-107 Step 3 reads the verdict card, the basis row, then the outcome card, row by row', async () => {
    const src = buildDecideSnapshot(demoSource('2026-10-15'));
    await wrap(<Step3Verdict {...{ ...stepProps(carInputs, {}, src), lastSeenBasis: null, revealKey: 'k' }} />);
    expectOrder(reads(), [
      /^(It fits|Needs adjustment|Doesn’t fit right now)/,
      'header:The outcome on each basis',
      /^This month: .*(free|overspent)/,
      /^Worst month: .*(free|overspent)/,
      /^Average month: .*(free|overspent)/,
    ]);
    // exactly one stop per row: the chip and figure inside a row are not stops of their own
    expect(reads().filter((r) => /^(This month|Worst month|Average month): /.test(r))).toHaveLength(3);
  });

  it('D-101 Pots rows read their per-state labels', async () => {
    mockGoals = [
      goal('', { id: 'a', check_id: null, kind: 'pot', name: 'Car service', target: 60_000, monthly_amount: null, ready_by: '2027-03-31' }),
      goal('', { id: 'b', check_id: null, kind: 'pot', name: 'Holiday', target: 60_000, monthly_amount: null, ready_by: '2026-09-30', opening_saved: 10_000 }),
      goal('', { id: 'c', check_id: null, kind: 'pot', name: 'Tyres', target: 60_000, monthly_amount: null, ready_by: '2027-03-31', opening_saved: 60_000 }),
      goal('chk', { id: 'w1', name: 'Sofa' }),
    ];
    await wrap(<PotsScreen />);
    const rows = reads();
    expectOrder(rows, [
      'header:Pots',
      'Add a pot',
      /^Car service\. 0 US dollars of 600 US dollars saved\. 120 US dollars a month, by Mar 2027\.$/,
      /^Holiday\. .*Past its date/,
      /^Tyres\. .*Target reached/,
      /Sofa/,
    ]);
  });
});
