// 06-20 (BO-07 Create from Decide): Grow's home reads the link params. newGoal=1 opens the new-goal sheet prefilled and linked to the
// check; segment picks the opening segment (the Decide setup steps link here). The sheet itself is covered in newGoalSheet.test.tsx.
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { GrowHome, prefillFromParams } from '../home/GrowHome';

jest.setTimeout(30000);

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/shell/fab/FabProvider', () => ({ useRegisterFab: () => undefined }));
jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { TabRootScreen: (p: { children?: React.ReactNode; overlay?: React.ReactNode }) => R.createElement(View, null, p.children, p.overlay) };
});
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', today: '2026-11-05', userId: 'u1', householdId: 'h1', ready: true }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: { saving_floor: 15000 } }) }));
// 06-31, 06-33: the Goals and Investing segments read their own rows for the row actions.
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: [] }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/mutations/growGoals', () => ({ useEditGoal: () => ({ edit: jest.fn(), remove: jest.fn() }) }));
jest.mock('@/data/queries/growHoldings', () => ({ useHoldingRows: () => ({ data: [] }), useHoldingLotRows: () => ({ data: [] }) }));
jest.mock('@/data/mutations/growHoldings', () => ({ useEditHolding: () => ({ edit: jest.fn(), remove: jest.fn() }) }));
jest.mock('@/features/grow/goals/useGoalToast', () => ({ useGoalToast: () => jest.fn() }));

const mockSheet = jest.fn();
jest.mock('@/features/grow/goals/NewGoalSheet', () => {
  const R = require('react');
  const { Text: RNText } = require('react-native');
  return {
    NewGoalSheet: (p: { visible: boolean; prefill?: unknown }) => {
      mockSheet(p);
      return p.visible ? R.createElement(RNText, { testID: 'new-goal-sheet' }, 'sheet') : null;
    },
  };
});
jest.mock('@/features/grow/debts/AddDebtSheet', () => ({ AddDebtSheet: () => null }));
jest.mock('@/features/grow/investing/AddHoldingSheet', () => ({ AddHoldingSheet: () => null }));
jest.mock('@/features/grow/safetyNet/FirstOpenNetSheet', () => ({ FirstOpenNetSheet: () => null }));
jest.mock('@/features/grow/goals/useGoalsRead', () => ({
  useGoalsRead: () => ({
    status: 'ready', userId: 'u1', householdId: 'h1', today: '2026-11-05', refetch: jest.fn(),
    model: { safetyNet: null, goals: [], totalSaved: 0, monthlyIntoGoals: 0, needsNetConfirm: false },
  }),
}));
jest.mock('@/features/grow/debts/useDebtsRead', () => {
  const actual = jest.requireActual('@/features/grow/debts/useDebtsRead');
  return { ...actual, useDebtsRead: () => ({ status: 'ready', model: actual.EMPTY_DEBTS_MODEL, refetch: jest.fn(), userId: 'u1', householdId: 'h1', today: '2026-11-05' }) };
});

async function renderHome() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>
          <GrowHome />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockParams = {};
  mockSheet.mockClear();
});

describe('Create from Decide', () => {
  it('newGoal=1 opens the new-goal sheet with the name, target and check id', async () => {
    mockParams = { newGoal: '1', name: 'Laptop', target: '350000', checkId: 'c1' };
    await renderHome();
    expect(screen.getByTestId('new-goal-sheet')).toBeTruthy();
    expect(mockSheet).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true, prefill: { name: 'Laptop', target: 350000, checkId: 'c1' } }));
  });

  it('without newGoal the sheet stays closed', async () => {
    mockParams = { name: 'Laptop' };
    await renderHome();
    expect(screen.queryByTestId('new-goal-sheet')).toBeNull();
  });

  it('segment=debts opens on Debts (the Loans setup step link)', async () => {
    mockParams = { segment: 'debts' };
    await renderHome();
    expect(screen.getByTestId('grow-segment-debts').props.accessibilityState).toEqual({ selected: true });
  });

  it('an unknown segment opens on Goals', async () => {
    mockParams = { segment: 'nonsense' };
    await renderHome();
    expect(screen.getByTestId('grow-segment-goals').props.accessibilityState).toEqual({ selected: true });
  });
});

describe('prefillFromParams', () => {
  it('keeps only a whole positive target and non-empty text', () => {
    expect(prefillFromParams({ name: '', target: '12.5', checkId: '' })).toEqual({});
    expect(prefillFromParams({ target: '0' })).toEqual({});
    expect(prefillFromParams({ name: 'Car', target: '1500000' })).toEqual({ name: 'Car', target: 1500000 });
  });
});
