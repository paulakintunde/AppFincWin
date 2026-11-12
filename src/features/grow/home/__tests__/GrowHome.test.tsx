// 06-15 (G01): the Grow home shell and the Goals segment. Data comes from a mocked useGoalsRead (the LEDGER shape); the scaffold,
// FAB registry and router are stubbed so the tests read what the screen decides, not the shell around it.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import en from '@/i18n/locales/en';
import { availableTabs, tabRoutes } from '@/shell/tabBar/availableTabs';
import { minorUnits } from '@/engine/money';
import type { GoalsRead } from '../../goals/useGoalsRead';
import { GrowHome } from '../GrowHome';

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
const mockFab: Array<{ label: string; onPress: () => void } | null> = [];
jest.mock('@/shell/fab/FabProvider', () => ({
  useRegisterFab: (c: { label: string; onPress: () => void } | null) => {
    mockFab.push(c);
  },
}));
jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = require('react');
  const { View, Text: RNText } = require('react-native');
  return {
    TabRootScreen: (p: { title: string; children?: React.ReactNode; overlay?: React.ReactNode }) =>
      R.createElement(View, null, R.createElement(RNText, null, p.title), p.children, p.overlay),
  };
});
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', today: '2026-11-05', userId: 'u1', householdId: 'h1', ready: true }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: { saving_floor: 15000 } }) }));

// 06-22: the sheet itself is covered in goals/__tests__/newGoalSheet.test.tsx; here only that the FAB opens it.
jest.mock('@/features/grow/goals/NewGoalSheet', () => {
  const R = require('react');
  const { Text: RNText } = require('react-native');
  return {
    NewGoalSheet: (p: { visible: boolean; goal?: { id: string } }) =>
      p.visible ? R.createElement(RNText, { testID: p.goal === undefined ? 'new-goal-sheet' : 'edit-goal-sheet' }, 'goal sheet') : null,
  };
});

// 06-31: the row actions. The sheet, queries, remove hook and toast are stubs; what is asserted is what the row decides.
jest.mock('@/features/grow/goals/MoneyMoveSheet', () => {
  const R = require('react');
  const { Text: RNText } = require('react-native');
  return { MoneyMoveSheet: (p: { visible: boolean }) => (p.visible ? R.createElement(RNText, { testID: 'money-move-sheet' }, 'move sheet') : null) };
});
const mockGoalRows = [
  { id: 'g1', name: 'Trip to Lisbon', household_id: 'h1', account_id: 'a1', deleted_at: null, version: 1, icon: 'transport' },
  { id: 'g2', name: 'Laptop', household_id: 'h1', account_id: null, deleted_at: null, version: 1 },
];
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: mockGoalRows }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', name: 'Everyday checking' }] }) }));
const mockRemove = jest.fn(() => 'step-1');
jest.mock('@/data/mutations/growGoals', () => ({ useEditGoal: () => ({ edit: jest.fn(), remove: mockRemove }) }));
const mockToast = jest.fn();
jest.mock('@/features/grow/goals/useGoalToast', () => ({ useGoalToast: () => mockToast }));

// 06-16: the FAB for each segment opens its own sheet; the sheets are covered by their own tests, so each is a marker here.
jest.mock('@/features/grow/debts/AddDebtSheet', () => {
  const R = require('react');
  const { Text: RNText } = require('react-native');
  return { AddDebtSheet: (p: { visible: boolean }) => (p.visible ? R.createElement(RNText, { testID: 'add-debt-sheet' }, 'add debt sheet') : null) };
});
jest.mock('@/features/grow/investing/AddHoldingSheet', () => {
  const R = require('react');
  const { Text: RNText } = require('react-native');
  return { AddHoldingSheet: (p: { visible: boolean }) => (p.visible ? R.createElement(RNText, { testID: 'add-holding-sheet' }, 'add holding sheet') : null) };
});
jest.mock('@/features/grow/safetyNet/FirstOpenNetSheet', () => ({ FirstOpenNetSheet: () => null }));

let mockRead: GoalsRead;
jest.mock('@/features/grow/goals/useGoalsRead', () => ({ useGoalsRead: () => mockRead }));
// 06-17: the Debts segment reads its own model; an empty ready one here (the Debts screens have their own tests).
jest.mock('@/features/grow/debts/useDebtsRead', () => {
  const actual = jest.requireActual('@/features/grow/debts/useDebtsRead');
  return {
    ...actual,
    useDebtsRead: () => ({ status: 'ready', model: actual.EMPTY_DEBTS_MODEL, refetch: jest.fn(), userId: 'u1', householdId: 'h1', today: '2026-11-05' }),
  };
});

// 06-18: the Investing segment reads its own model; an empty one shows the empty state.
jest.mock('@/features/grow/investing/useInvestingRead', () => ({
  useInvestingRead: () => ({
    status: 'ready',
    userId: 'u1',
    householdId: 'h1',
    today: '2026-11-05',
    refetch: jest.fn(),
    model: { holdings: [], totals: { value: 0, putIn: 0, gain: 0, gainPercentTenths: null }, monthlyIn: 0, unconverted: 0, anyStale: false },
  }),
}));
// 06-33: the segment also reads the raw holding rows for its row actions (edit, remove).
jest.mock('@/data/queries/growHoldings', () => ({
  useHoldingRows: () => ({ data: [] }),
  useHoldingLotRows: () => ({ data: [] }),
}));
jest.mock('@/data/mutations/growHoldings', () => ({ useEditHolding: () => ({ edit: jest.fn(), remove: jest.fn() }) }));
let mockFlags: Record<string, boolean> | null = null;
jest.mock('@/features/grow/growFeatureFlags', () => {
  const actual = jest.requireActual('@/features/grow/growFeatureFlags');
  return { ...actual, growFeatureFlags: () => ({ ...actual.growFeatureFlags(), ...(mockFlags ?? {}) }) };
});

const LEDGER: GoalsRead = {
  status: 'ready',
  userId: 'u1',
  householdId: 'h1',
  today: '2026-11-05',
  refetch: jest.fn(),
  model: {
    safetyNet: { goalId: 'net', size: minorUnits(230000), saved: minorUnits(130000), protect: true, locked: true, accountId: null, confirmedAt: '2026-11-01' },
    goals: [
      {
        id: 'g1', name: 'Trip to Lisbon', kind: 'pot', target: minorUnits(180000), saved: minorUnits(64000), monthlyAmount: minorUnits(5000),
        readyBy: null, locked: true, upFrontOnly: false, linkedCheckId: null, accountId: null, bucket: false, done: false,
      },
      {
        id: 'g2', name: 'Laptop', kind: 'wait', target: minorUnits(350000), saved: minorUnits(0), monthlyAmount: null,
        readyBy: null, locked: true, upFrontOnly: false, linkedCheckId: 'c1', accountId: null, bucket: false, done: false,
      },
    ],
    totalSaved: 194000,
    monthlyIntoGoals: 15000,
    needsNetConfirm: false,
    pendingByGoal: { g1: 1, net: 2 },
    goalCount: 2,
    netCounted: true,
    netReachesOn: '2027-08-01',
    netMonthly: 10000,
  },
};

async function renderHome(props: React.ComponentProps<typeof GrowHome> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>
          <GrowHome {...props} />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

const lastFab = () => mockFab[mockFab.length - 1];

beforeEach(() => {
  mockRead = LEDGER;
  mockFlags = null;
  mockFab.length = 0;
  mockParams = {};
  mockPush.mockClear();
  mockRemove.mockClear();
  mockToast.mockClear();
});

describe('Grow home shell', () => {
  it('FAB label follows the segment', async () => {
    await renderHome();
    expect(lastFab()?.label).toBe('New goal');
    await fireEvent.press(screen.getByTestId('grow-segment-debts'));
    expect(lastFab()?.label).toBe('Add a debt');
    await fireEvent.press(screen.getByTestId('grow-segment-investing'));
    expect(lastFab()?.label).toBe('Add a holding');
    await fireEvent.press(screen.getByTestId('grow-segment-goals'));
    expect(lastFab()?.label).toBe('New goal');
  });

  it('the segments are a tablist and the selected one is announced', async () => {
    await renderHome();
    expect(screen.getByTestId('grow-segments')).toBeTruthy();
    expect(screen.getAllByTestId(/grow-segment-/)).toHaveLength(3);
    expect(screen.getByTestId('grow-segment-goals').props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByTestId('grow-segment-debts'));
    expect(screen.getByTestId('grow-segment-debts').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('grow-segment-goals').props.accessibilityState).toEqual({ selected: false });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('Goals FAB press opens the new-goal hook point', async () => {
    const sheets = jest.fn(() => null);
    await renderHome({ sheets });
    expect(sheets).toHaveBeenLastCalledWith(expect.objectContaining({ newGoalOpen: false }));
    await act(async () => {
      lastFab()?.onPress();
    });
    expect(sheets).toHaveBeenLastCalledWith(expect.objectContaining({ newGoalOpen: true }));
  });

  it('06-22: the Goals FAB opens the NewGoalSheet', async () => {
    await renderHome();
    expect(screen.queryByTestId('new-goal-sheet')).toBeNull();
    await act(async () => {
      lastFab()?.onPress();
    });
    expect(screen.getByTestId('new-goal-sheet')).toBeTruthy();
  });

  it('the Debts FAB opens Add a debt', async () => {
    await renderHome();
    await fireEvent.press(screen.getByTestId('grow-segment-debts'));
    expect(screen.queryByTestId('add-debt-sheet')).toBeNull();
    await act(async () => {
      lastFab()?.onPress();
    });
    expect(screen.getByTestId('add-debt-sheet')).toBeTruthy();
    expect(screen.queryByTestId('add-holding-sheet')).toBeNull();
  });

  it('the Investing FAB opens Add a holding', async () => {
    await renderHome();
    await fireEvent.press(screen.getByTestId('grow-segment-investing'));
    expect(screen.queryByTestId('add-holding-sheet')).toBeNull();
    await act(async () => {
      lastFab()?.onPress();
    });
    expect(screen.getByTestId('add-holding-sheet')).toBeTruthy();
    expect(screen.queryByTestId('add-debt-sheet')).toBeNull();
  });

  it('Basics: only the safety net card and the Choose what to track card, no FAB', async () => {
    mockFlags = { goals: false, debts: false, investing: false };
    await renderHome();
    expect(screen.getByTestId('grow-safety-net-card')).toBeTruthy();
    expect(screen.getByText(en.grow.home.basicsBody)).toBeTruthy();
    expect(screen.queryByTestId('grow-segments')).toBeNull();
    expect(screen.queryByTestId('grow-goals-hero')).toBeNull();
    expect(lastFab()).toBeNull();
    await fireEvent.press(screen.getByText(en.grow.home.basicsButton));
    expect(mockPush).toHaveBeenCalledWith('/you');
  });

  it('loading shows grey blocks; error shows the generic card and Try again refetches', async () => {
    mockRead = { ...LEDGER, status: 'loading' };
    const first = await renderHome();
    expect(screen.getByTestId('grow-goals-loading')).toBeTruthy();
    await first.unmount();
    const refetch = jest.fn();
    mockRead = { ...LEDGER, status: 'error', refetch };
    await renderHome();
    expect(screen.getByText(en.grow.common.loadErrorTitle)).toBeTruthy();
    await fireEvent.press(screen.getByText(en.grow.common.tryAgain));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the footer', async () => {
    await renderHome();
    expect(screen.getByText(en.grow.home.footer)).toBeTruthy();
  });

  it('the Grow tab is on: 4 tabs, and the layout hides a tab only when it is not available', () => {
    expect(availableTabs()).toEqual(['home', 'activity', 'decide', 'grow']);
    expect(availableTabs()).toContain('grow');
    const layout = fs.readFileSync(path.join(__dirname, '../../../../../app/(app)/(tabs)/_layout.tsx'), 'utf8');
    // The layout maps tabRoutes() (no null children); a tab that is not available keeps its route with href null.
    expect(layout).toContain('tabRoutes()');
    expect(layout).toContain('href: null');
    expect(tabRoutes().map((r) => r.name)).toEqual(['home', 'activity', 'decide', 'grow']);
    expect(tabRoutes().every((r) => !r.hidden)).toBe(true);
  });
});

describe('Goals segment', () => {
  it('hero, safety net card and goal rows from the LEDGER read model', async () => {
    await renderHome();
    expect(screen.getByText('Saved across 2 goals and the safety net')).toBeTruthy();
    expect(screen.getByText('$1,940')).toBeTruthy();
    expect(screen.getByText('$150 a month goes into goals. Your rule is at least $150.')).toBeTruthy();
    const net = screen.getByTestId('grow-safety-net-card');
    expect(net.props.accessibilityLabel).toContain('Locked, no Decide answer spends it');
    expect(screen.getByText('$1,300 of $2,300')).toBeTruthy();
    expect(screen.getByText('Locked')).toBeTruthy();
    expect(screen.getByText('Trip to Lisbon')).toBeTruthy();
  });

  it('the Lisbon row reads saved of target, percent, monthly amount and the reach date', async () => {
    await renderHome();
    const row = screen.getByTestId('grow-goal-row-g1');
    expect(
      screen.getByLabelText(
        /^Trip to Lisbon, 640 dollars of 1,800 dollars, 36 percent, 50 dollars a month, reaches target [A-Z][a-z]+ 2028, 1 expected line to confirm$/,
      ),
    ).toBeTruthy();
    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith('/grow/goal/g1');
  });

  it('a goal with no monthly amount says so and carries the Linked to a check badge', async () => {
    await renderHome();
    expect(screen.getByText('$0 of $3,500 · no monthly amount yet')).toBeTruthy();
    expect(screen.getAllByText('Linked to a check').length).toBeGreaterThan(0);
  });

  it('a monthly amount that never reaches the target says so', async () => {
    mockRead = {
      ...LEDGER,
      model: { ...LEDGER.model, goals: [{ ...LEDGER.model.goals[0]!, monthlyAmount: minorUnits(100) }] },
    };
    await renderHome();
    expect(screen.getByText('$640 of $1,800 · $1 a month doesn’t reach the target')).toBeTruthy();
  });

  it('no size yet: the safety net card invites setting one and opens the safety net page', async () => {
    mockRead = { ...LEDGER, model: { ...LEDGER.model, safetyNet: null } };
    await renderHome();
    expect(screen.getByText(en.grow.safetyNet.emptyBody)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('grow-safety-net-card'));
    expect(mockPush).toHaveBeenCalledWith('/grow/safety-net');
  });

  it('no goals yet: the empty card offers New goal', async () => {
    mockRead = { ...LEDGER, model: { ...LEDGER.model, goals: [] } };
    await renderHome();
    expect(screen.getByText(en.grow.goals.emptyTitle)).toBeTruthy();
  });

  it('Tools row opens the Calculators page', async () => {
    await renderHome();
    await fireEvent.press(screen.getByText(en.grow.home.toolsCalculators));
    expect(mockPush).toHaveBeenCalledWith('/grow/calculators');
  });

  it('Tools row opens Your money rules', async () => {
    await renderHome();
    await fireEvent.press(screen.getByText(en.grow.lines.title));
    expect(mockPush).toHaveBeenCalledWith('/grow/lines');
  });

  it('Debts and Investing show their empty states and the Tools row', async () => {
    await renderHome();
    await fireEvent.press(screen.getByTestId('grow-segment-debts'));
    expect(screen.getByText(en.grow.debts.emptyTitle)).toBeTruthy();
    expect(screen.getByText(en.grow.home.toolsCalculators)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('grow-segment-investing'));
    expect(screen.getByText(en.grow.investing.emptyTitle)).toBeTruthy();
    expect(screen.getByText(en.grow.home.toolsCalculators)).toBeTruthy();
  });
});

describe('Goals segment, D-32 (06-31)', () => {
  it('hero: net only says Saved in the safety net; one goal and no net uses the plain label', async () => {
    mockRead = { ...LEDGER, model: { ...LEDGER.model, goals: [], goalCount: 0 } };
    const first = await renderHome();
    expect(screen.getByText('Saved in the safety net')).toBeTruthy();
    await first.unmount();
    mockRead = { ...LEDGER, model: { ...LEDGER.model, safetyNet: null, goals: [LEDGER.model.goals[0]!], goalCount: 1, netCounted: false } };
    await renderHome();
    expect(screen.getByText('Saved across 1 goal')).toBeTruthy();
    expect(screen.getByText('$1,940')).toBeTruthy();
  });

  it('a goal row and the net card with Expected lines show a to-confirm badge; the net label speaks it', async () => {
    await renderHome();
    expect(screen.getAllByText('1 to confirm')).toHaveLength(1);
    expect(screen.getAllByText('2 to confirm')).toHaveLength(1);
    expect(screen.getByTestId('grow-safety-net-card').props.accessibilityLabel).toContain('2 expected lines to confirm');
  });

  it('the more menu lists Add money, Edit then Delete; Add money and Edit open their sheets', async () => {
    await renderHome();
    await fireEvent.press(screen.getByLabelText('More for Trip to Lisbon'));
    expect(screen.getByText('Add money')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add money'));
    expect(screen.getByTestId('money-move-sheet')).toBeTruthy();
  });

  it('Edit opens the goal sheet in edit mode', async () => {
    await renderHome();
    await fireEvent.press(screen.getByLabelText('More for Trip to Lisbon'));
    await fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByTestId('edit-goal-sheet')).toBeTruthy();
    expect(screen.queryByTestId('new-goal-sheet')).toBeNull();
  });

  it('removing asks first, removes once and raises the Goal removed toast with Undo', async () => {
    await renderHome();
    await fireEvent.press(screen.getByLabelText('More for Trip to Lisbon'));
    expect(screen.queryByText(en.decide.delete.word)).toBeNull(); // 06-37 D-37: Grow rows say Remove
    await fireEvent.press(screen.getByText(en.grow.home.rowRemove));
    expect(mockRemove).not.toHaveBeenCalled();
    expect(screen.getByText('Remove Trip to Lisbon?')).toBeTruthy();
    await fireEvent.press(screen.getAllByText(en.grow.home.rowRemove).slice(-1)[0]!);
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'grow.goals.removedToast', stepId: 'step-1', undoLabel: 'goalRemoved', name: 'Trip to Lisbon' }),
    );
  });

  it('the safety net card has no swipe or more menu', async () => {
    await renderHome();
    expect(screen.queryByLabelText(/More for Safety net/)).toBeNull();
    const src = fs.readFileSync(path.join(__dirname, '../SafetyNetCard.tsx'), 'utf8');
    expect(src).not.toContain('DeletableRow');
  });

  it('the net card shows the date line and a muted of-size; without a monthly amount, the plain line', async () => {
    const first = await renderHome();
    expect(screen.getByText('No Decide answer spends it. $100 a month reaches $2,300 by Aug 2027.')).toBeTruthy();
    await first.unmount();
    mockRead = { ...LEDGER, model: { ...LEDGER.model, netMonthly: null, netReachesOn: null } };
    await renderHome();
    expect(screen.getByText(en.grow.safetyNet.cardLineNoPlan)).toBeTruthy();
  });

  it('P4-WR-02: a Wait goal (its plan is its Decide check) has no Edit in the more menu', async () => {
    await renderHome();
    await fireEvent.press(screen.getByLabelText('More for Laptop'));
    expect(screen.getByText('Add money')).toBeTruthy();
    expect(screen.queryByText('Edit')).toBeNull();
  });

  it('P4-IN-02: a goal row draws the icon the user picked', async () => {
    await renderHome();
    const hidden = { includeHiddenElements: true }; // the glyph is decorative (hidden from screen readers)
    const lisbon = screen.getByTestId('grow-goal-row-g1', hidden);
    expect(within(lisbon).getByTestId('grow-glyph-transport', hidden)).toBeTruthy();
    // no icon picked: the check glyph for a check's goal
    expect(within(screen.getByTestId('grow-goal-row-g2', hidden)).getByTestId('grow-glyph-checkbuy', hidden)).toBeTruthy();
  });

  it('a goal with no target draws no bar; one with a target does', async () => {
    mockRead = { ...LEDGER, model: { ...LEDGER.model, goals: [{ ...LEDGER.model.goals[1]!, target: null, linkedCheckId: null }] } };
    await renderHome();
    expect(screen.getByText('$0 saved · no set target')).toBeTruthy();
  });
});
