import React from 'react';
import { cleanup, screen } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { wrap } from '../check/steps/__tests__/helpers/stepProps';
import { MATRIX, expectFits, expectTargets, matrixName } from './helpers/r18Fit';
import { goal } from '../past/__tests__/helpers/pastFixtures';
import { PotsScreen } from '../pots/PotsScreen';
import { PotSheet } from '../pots/PotSheet';

jest.setTimeout(60000);
let mockScale = 1;
let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

let mockGoals: SavingsGoalRow[] = [];
let mockLoading = false;
let mockError = false;
let mockCached = false;
const mockRefetch = jest.fn();
const mockRemove = jest.fn(() => 'step-del');
const mockSetDone = jest.fn(() => 'step-done');
const mockToast = jest.fn();
const mockSwipe: { props: Record<string, any> } = { props: {} };

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', timeZone: 'UTC', ready: true }),
}));
jest.mock('@/data/queries/decide', () => {
  // the real selector lives beside the Supabase client, which a unit test must not load; this mirrors selectPots
  const select = (rows: SavingsGoalRow[]) => {
    const live = rows.filter((r) => r.deleted_at == null && r.done_at == null);
    return {
      live,
      plain: live.filter((r) => r.kind === 'pot'),
      wait: live.filter((r) => r.kind === 'wait'),
      done: rows.filter((r) => r.deleted_at == null && r.done_at != null),
    };
  };
  return {
    usePots: () => ({
      data: mockLoading || (mockError && !mockCached) ? undefined : select(mockGoals),
      isError: mockError,
      refetch: mockRefetch,
    }),
    useGoalLines: () => ({ data: [] }),
    useDecideChecks: () => ({ data: [] }),
    useDecideLinks: () => ({ data: [] }),
    useLinkedLines: () => ({ data: [] }),
    useSavingsGoals: () => ({ data: mockGoals }),
    useAttachCandidates: () => ({ data: [] }),
  };
});
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [] }) }));
jest.mock('@/data/mutations/decidePots', () => ({
  useDeletePot: () => ({ remove: (...a: unknown[]) => (mockRemove as (...x: unknown[]) => unknown)(...a) }),
  useSetPotDone: () => ({ setDone: (...a: unknown[]) => (mockSetDone as (...x: unknown[]) => unknown)(...a) }),
  useAddPot: () => ({ add: jest.fn(() => ({ id: 'n', stepId: 's' })) }),
  useEditPot: () => ({ edit: jest.fn(() => 's') }),
}));
jest.mock('@/data/mutations/decideChecks', () => ({
  useReopenCheck: () => ({ reopen: jest.fn() }),
  useRemoveDecision: () => ({ remove: jest.fn() }),
}));
jest.mock('@/data/mutations/decideLinks', () => ({
  useUnlinkLine: () => ({ unlink: jest.fn() }),
  useAttachLine: () => ({ attach: jest.fn() }),
}));
jest.mock('../notifications/waitReminder', () => ({ cancelCheckReminders: () => Promise.resolve() }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
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

function pot(id: string, over: Partial<SavingsGoalRow> = {}): SavingsGoalRow {
  return goal('', { id, check_id: null, kind: 'pot', name: `Pot ${id}`, target: 60_000, monthly_amount: null, ready_by: '2027-03-31', ...over });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGoals = [];
  mockLoading = false;
  mockError = false;
  mockCached = false;
});


const longName = 'Replace the boiler and the radiators in the old house before the cold weather arrives next winter';

/** Runs the body at every cell of the R6 matrix, clearing the tree between cells. */
async function eachCell(body: (m: { width: number; scale: number }) => Promise<void>): Promise<void> {
  for (const m of MATRIX) {
    mockWidth = m.width;
    mockScale = m.scale;
    try {
      await body(m);
    } catch (e) {
      throw new Error(`${matrixName(m)}: ${(e as Error).message}`);
    }
    await cleanup();
  }
}

// The pot name and the Wait pot name are the user-typed text rule T clamps at two lines (full name in the a11y label).
const NAME = { clamped: [new RegExp(longName.slice(0, 20))] };

describe('R18 matrix, Pots', () => {
  it('D-101 the Pots screen and sheet hold at the matrix', async () => {
    await eachCell(async (m) => {
      // empty
      mockGoals = [];
      await wrap(<PotsScreen />, m.scale);
      expect(screen.getByText(/^No pots yet\./)).toBeTruthy();
      expectFits();
      expectTargets('Add a pot');
      await cleanup();

      // populated: a long name, a past-due pot, a reached pot, a Wait pot and a done fold
      mockGoals = [
        pot('a', { name: longName }),
        pot('b', { name: 'Holiday', ready_by: '2026-09-30', opening_saved: 10_000 }),
        pot('c', { name: 'Tyres', opening_saved: 60_000 }),
        goal('chk', { id: 'w1', name: 'Sofa' }),
        pot('d', { name: 'Old trip', done_at: '2026-10-01T00:00:00Z' }),
      ];
      await wrap(<PotsScreen />, m.scale);
      expect(screen.getByText(longName).props.numberOfLines).toBe(2);
      expect(screen.getByText(/Past its date . \$500 still to save/)).toBeTruthy();
      expect(screen.getByText('Done · 1')).toBeTruthy();
      expectFits({ ...NAME, clampCount: 5 });
      expectTargets('Add a pot');
      expectTargets(`More for ${longName}`);
      await cleanup();

      // the sheet: new and edit
      for (const editing of [null, pot('a', { name: longName })]) {
        await wrap(<PotSheet visible pot={editing} onClose={jest.fn()} />, m.scale);
        expect(screen.getByLabelText('Name')).toBeTruthy();
        expectFits({ ...NAME });
        await cleanup();
      }
    });
  });

  it('D-101 the done fold speaks its title alone and opens whole', async () => {
    await eachCell(async (m) => {
      mockGoals = [pot('d', { name: 'Old trip', done_at: '2026-10-01T00:00:00Z' })];
      await wrap(<PotsScreen />, m.scale);
      expect(screen.getByLabelText('Done · 1')).toBeTruthy();
      expectFits();
    });
  });
});
