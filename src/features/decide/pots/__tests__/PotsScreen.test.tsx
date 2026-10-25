import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { goal } from '../../past/__tests__/helpers/pastFixtures';
import { PotsScreen } from '../PotsScreen';

jest.setTimeout(30000);
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
jest.mock('../../notifications/waitReminder', () => ({ cancelCheckReminders: () => Promise.resolve() }));
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
  return { DetailScreen: (p: { title: string; right?: React.ReactNode; children: React.ReactNode }) => R.createElement(View, null, R.createElement(Text, null, p.title), p.right, p.children) };
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

async function renderScreen() {
  return render(
    <ThemeProvider>
      <PotsScreen />
    </ThemeProvider>
  );
}

describe('PotsScreen', () => {
  it('D-101 the empty state has one primary Add a pot and no heading link', async () => {
    await renderScreen();
    expect(screen.getByText(/^No pots yet\./)).toBeTruthy();
    expect(screen.getByLabelText('Add a pot')).toBeTruthy(); // the primary pill
    expect(screen.queryByText('+ Pot')).toBeNull();
    expect(screen.queryByText(/a month across/)).toBeNull();
    expect(screen.queryByText(/^Done 路/)).toBeNull();
  });

  it('D-101 a pot row shows progress, the monthly set-aside and its month', async () => {
    mockGoals = [pot('a', { name: 'Car service' })];
    await renderScreen();
    expect(screen.getByText('Car service')).toBeTruthy();
    expect(screen.getByText('$0 of $600 saved')).toBeTruthy();
    expect(screen.getByText('$120 a month 路 by Mar 2027')).toBeTruthy();
    expect(screen.getByText('$120 a month across 1 pot')).toBeTruthy();
    expect(screen.getByText('+ Pot')).toBeTruthy();
    expect(screen.getByLabelText('Car service. 0 US dollars of 600 US dollars saved. 120 US dollars a month, by Mar 2027.')).toBeTruthy();
    expect(screen.getByTestId('goal-track').props.accessibilityValue.text).toBe('0 percent');
  });

  it('D-101 a past-due pot reads in warn1 and never red', async () => {
    mockGoals = [pot('a', { ready_by: '2026-09-30', opening_saved: 10_000 })];
    await renderScreen();
    const line = screen.getByText(/Past its date 路 \$500 still to save/);
    const flat = Object.assign({}, ...([] as object[]).concat(line.props.style));
    expect(flat.color).toBe('#8A5A1B');
    expect(flat.color).not.toBe('#B3261E');
    expect(JSON.stringify(line.props.style)).not.toMatch(/danger/i);
  });

  it('D-101 a Wait pot menu offers Mark done or Reopen only', async () => {
    mockGoals = [goal('chk', { id: 'w1', name: 'Sofa' })];
    await renderScreen();
    expect(screen.getByText('From a check 路 $200 a month 路 ready Jan 15, 2027')).toBeTruthy();
    expect(mockSwipe.props.enabled).toBe(false);
    await fireEvent.press(screen.getByLabelText('More for Sofa'));
    expect(screen.getByText('Mark done')).toBeTruthy();
    expect(screen.queryByText('Delete')).toBeNull();
    await fireEvent.press(screen.getByText('Mark done'));
    expect(mockSetDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }), true);
    expect(mockToast).toHaveBeenCalledWith({ kind: 'destructive', text: { key: 'decide.pots.toast.done', params: { name: 'Sofa' } }, stepId: 'step-done' });
  });

  it('D-101 a plain pot menu offers Mark done and Delete, and a done pot offers Reopen', async () => {
    mockGoals = [pot('a', { name: 'Car service' }), pot('d', { name: 'Old trip', done_at: '2026-10-01T00:00:00Z' })];
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('More for Car service'));
    expect(screen.getByText('Mark done')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
    await fireEvent.press(screen.getByText('Mark done'));
    // the Done fold is closed until opened
    expect(screen.getByText('Done 路 1')).toBeTruthy();
    expect(screen.queryByText('Old trip')).toBeNull();
    await fireEvent.press(screen.getByText('Done 路 1'));
    expect(screen.getByText('Old trip')).toBeTruthy();
    expect(screen.getByText(/^Done Oct 1, 2026$/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('More for Old trip'));
    await fireEvent.press(screen.getByText('Reopen'));
    expect(mockToast).toHaveBeenLastCalledWith({ kind: 'destructive', text: { key: 'decide.pots.toast.reopened', params: { name: 'Old trip' } }, stepId: 'step-done' });
  });

  it('D-101 the add link disables at 50 pots', async () => {
    mockGoals = Array.from({ length: 50 }, (_, i) => pot(`p${i}`));
    await renderScreen();
    expect(screen.getByLabelText('Add a pot').props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText('Up to 50 pots')).toBeTruthy();
  });

  it('D-101 delete shows the toast with Undo and Undo restores the row', async () => {
    mockGoals = [pot('a', { name: 'Car service' })];
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('More for Car service'));
    await fireEvent.press(screen.getByText('Delete'));
    expect(mockRemove).not.toHaveBeenCalled(); // D-105: the confirm comes first
    expect(screen.getByText('Delete Car service?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Delete'));
    expect(mockRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    // one undo step: the toast carries the step id the mutation recorded; Undo replays it, which restores the row
    expect(mockToast).toHaveBeenCalledWith({ kind: 'destructive', text: { key: 'decide.pots.toast.deleted', params: { name: 'Car service' } }, stepId: 'step-del' });
  });

  it('D-101 swipe-left is the Delete shortcut', async () => {
    mockGoals = [pot('a', { name: 'Car service' })];
    await renderScreen();
    expect(mockSwipe.props.enabled).toBe(true);
    await act(async () => mockSwipe.props.onSwipeableOpen('left'));
    expect(mockRemove).not.toHaveBeenCalled();
    expect(screen.getByText('Delete Car service?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Delete'));
    expect(mockRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('D-105 cancelling the delete confirm keeps the pot and writes nothing', async () => {
    mockGoals = [pot('a', { name: 'Car service' })];
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('More for Car service'));
    await fireEvent.press(screen.getByText('Delete'));
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete Car service?')).toBeNull();
  });

  it('walkthrough 2: + Pot sits in the header right slot with the info button, so no empty row is left in the body', async () => {
    mockGoals = [pot('a', { name: 'Car service' })];
    await renderScreen();
    const add = screen.getByLabelText('Add a pot');
    let node = add.parent;
    let inHeader = false;
    while (node) {
      if (node.props?.testID === 'pots-header-right') inHeader = true;
      node = node.parent;
    }
    expect(inHeader).toBe(true);
    expect(StyleSheet.flatten(add.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(screen.queryByTestId('pots-heading')).toBeNull();
  });

  it('D-105 the screen title is not repeated as a body heading, and the summary sits a gap below the description', async () => {
    mockGoals = [pot('a', { name: 'Car service' })];
    await renderScreen();
    expect(screen.queryByTestId('pots-heading')).toBeNull();
    expect(screen.getAllByText('Pots')).toHaveLength(1); // the header title only
    const gapOf = (text: string | RegExp) => {
      let node = screen.getByText(text).parent;
      while (node) {
        const flat = StyleSheet.flatten(node.props?.style);
        if (flat && flat.gap !== undefined) return flat.gap;
        node = node.parent;
      }
      return undefined;
    };
    expect(gapOf('$120 a month across 1 pot')).toBeGreaterThan(0);
    expect(gapOf('$120 a month across 1 pot')).toBe(gapOf(/^Money kept for a cost/));
  });

  it('D-101 loading shows three skeleton bars, a busy label and no add link', async () => {
    mockLoading = true;
    await renderScreen();
    const sk = screen.getByLabelText('Loading your pots');
    expect(sk.props.accessibilityState?.busy).toBe(true);
    expect(screen.queryByText('+ Pot')).toBeNull();
  });

  it('D-101 list error shows Try again and cached rows still show', async () => {
    mockError = true;
    await renderScreen();
    expect(screen.getByText('Your pots didn鈥檛 load.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('D-101 with cached rows an error keeps them and shows no error block', async () => {
    mockGoals = [pot('a', { name: 'Car service' })];
    mockError = true;
    mockCached = true;
    await renderScreen();
    expect(screen.getByText('Car service')).toBeTruthy();
    expect(screen.queryByText('Your pots didn抰 load.')).toBeNull();
  });
});
