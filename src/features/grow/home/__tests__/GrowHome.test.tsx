// 06-15 (G01): the Grow home shell and the Goals segment. Data comes from a mocked useGoalsRead (the LEDGER shape); the scaffold,
// FAB registry and router are stubbed so the tests read what the screen decides, not the shell around it.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import en from '@/i18n/locales/en';
import { availableTabs } from '@/shell/tabBar/availableTabs';
import { minorUnits } from '@/engine/money';
import type { GoalsRead } from '../../goals/useGoalsRead';
import { GrowHome } from '../GrowHome';

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
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
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: { saving_floor: 15000 } }) }));

// 06-22: the sheet itself is covered in goals/__tests__/newGoalSheet.test.tsx; here only that the FAB opens it.
jest.mock('@/features/grow/goals/NewGoalSheet', () => {
  const R = require('react');
  const { Text: RNText } = require('react-native');
  return { NewGoalSheet: (p: { visible: boolean }) => (p.visible ? R.createElement(RNText, { testID: 'new-goal-sheet' }, 'new goal sheet') : null) };
});

let mockRead: GoalsRead;
jest.mock('@/features/grow/goals/useGoalsRead', () => ({ useGoalsRead: () => mockRead }));
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
  mockPush.mockClear();
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

  it('the Grow tab stays hidden: 4 tabs, and the layout gives grow href null', () => {
    expect(availableTabs()).toEqual(['home', 'activity', 'decide']);
    expect(availableTabs()).not.toContain('grow');
    const layout = fs.readFileSync(path.join(__dirname, '../../../../../app/(app)/(tabs)/_layout.tsx'), 'utf8');
    expect(layout).toContain("isTabAvailable('grow')");
    expect(layout).toContain('href: null');
  });
});

describe('Goals segment', () => {
  it('hero, safety net card and goal rows from the LEDGER read model', async () => {
    await renderHome();
    expect(screen.getByText('Saved across 3 goals')).toBeTruthy();
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
    expect(row.props.accessibilityLabel).toMatch(
      /^Trip to Lisbon, 640 dollars of 1,800 dollars, 36 percent, 50 dollars a month, reaches target [A-Z][a-z]+ 2028$/,
    );
    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith('/grow/goal/g1');
  });

  it('a goal with no monthly amount says so and carries the Linked to a check badge', async () => {
    await renderHome();
    expect(screen.getByText('$0 of $3,500 · no monthly amount yet')).toBeTruthy();
    expect(screen.getAllByText('Linked to a check').length).toBeGreaterThan(0);
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
