import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { PlanStatus } from '../types';
import { LockedSheetProvider } from '../useWriteGate';
import { ShellEntryHost } from '@/features/record/entry/ShellEntryHost';
import { DecideShellHost } from '@/features/decide/DecideShellHost';
import { QuickActions } from '@/features/home/QuickActions';
import { FabQuickMenu } from '@/shell/fab/FabQuickMenu';

jest.setTimeout(30000);

jest.mock('@/ui/Sheet', () => {
  const { View } = require('react-native');
  return { Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null) };
});
jest.mock('@/ui/SheetHeader', () => ({ SheetHeader: () => null }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), navigate: jest.fn() } }));
const mockPushOnce = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPushOnce(...a) }));
const mockOpenEntry = jest.fn();
jest.mock('@/features/record/entry/entryHost', () => ({
  openEntry: (...a: unknown[]) => mockOpenEntry(...a),
  closeEntry: jest.fn(),
  useEntryHostMode: () => null,
}));
jest.mock('@/features/record/entry/TransactionSheet', () => ({ TransactionSheet: () => null }));
jest.mock('@/features/record/entry/SeriesStatusSheet', () => ({ SeriesStatusHost: () => null }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ current: null }) }));
jest.mock('@/state/activityFocus', () => ({ requestActivityFocus: jest.fn() }));
// 10.1-25: ShellEntryHost registers "Scan a receipt" at level 2 (receipts on); the scan flow itself is not under test here.
jest.mock('@/features/levels/useFeatureAccess', () => ({ useFeatureAccess: () => ({ visible: true, on: true }) }));
jest.mock('@/features/record/receipt/ScanEntryFlow', () => ({ ScanEntryFlow: () => null }));

const mockProvided: Record<string, () => void> = {};
let mockQuickActions: { id: string; label: string; run: () => void }[] = [];
jest.mock('@/shell/fab/FabProvider', () => ({
  useProvideDefaultFabAction: (fn: () => void) => {
    mockProvided.default = fn;
  },
  useProvideQuickAction: (id: string, fn: () => void) => {
    mockProvided[id] = fn;
  },
  useHideFab: jest.fn(),
  useFab: () => ({ quickMenuOpen: true, closeQuickMenu: jest.fn(), quickActions: mockQuickActions }),
}));

let mockPlan: { status: PlanStatus; writable: boolean; loading: boolean } = { status: 'active', writable: true, loading: false };
jest.mock('../usePlanState', () => ({ usePlanState: () => mockPlan }));

const LOCKED = { status: 'locked' as PlanStatus, writable: false, loading: false };
const SAMPLE = { status: 'sample' as PlanStatus, writable: false, loading: false };
const WRITABLE = { status: 'active' as PlanStatus, writable: true, loading: false };

function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider>
      <LockedSheetProvider>{node}</LockedSheetProvider>
    </ThemeProvider>,
  );
}

describe('write gate wiring (09-17)', () => {
  beforeEach(() => {
    mockOpenEntry.mockClear();
    mockPushOnce.mockClear();
    mockPush.mockClear();
    for (const k of Object.keys(mockProvided)) delete mockProvided[k];
  });

  it.each([
    ['addExpense'],
    ['addIncome'],
    ['transfer'],
    ['scanReceipt'],
    ['default'],
  ])('locked: the %s quick action opens the adding sheet and does not open the entry', async (id) => {
    mockPlan = LOCKED;
    const { queryByText, findByText } = await wrap(<ShellEntryHost />);
    expect(queryByText('Adding a transaction needs a plan')).toBeNull();
    mockProvided[id]!();
    expect(await findByText('Adding a transaction needs a plan')).toBeTruthy();
    expect(mockOpenEntry).not.toHaveBeenCalled();
  });

  it('locked: Import statement names importing', async () => {
    mockPlan = LOCKED;
    const { findByText } = await wrap(<ShellEntryHost />);
    mockProvided.importStatement!();
    expect(await findByText('Importing a statement needs a plan')).toBeTruthy();
    expect(mockPushOnce).not.toHaveBeenCalled();
  });

  it('locked: a new Decide check names the check and starts nothing', async () => {
    mockPlan = LOCKED;
    const { findByText } = await wrap(<DecideShellHost />);
    mockProvided.newCheck!();
    expect(await findByText('A new Decide check needs a plan')).toBeTruthy();
    expect(mockPushOnce).not.toHaveBeenCalled();
  });

  it('writable: every quick action behaves as before', async () => {
    mockPlan = WRITABLE;
    await wrap(
      <>
        <ShellEntryHost />
        <DecideShellHost />
      </>,
    );
    mockProvided.addIncome!();
    expect(mockOpenEntry).toHaveBeenCalledWith({ kind: 'new', direction: 'in' });
    mockProvided.importStatement!();
    mockProvided.newCheck!();
    expect(mockPushOnce).toHaveBeenCalledTimes(2);
  });

  it('sample: opens the own-records sheet', async () => {
    mockPlan = SAMPLE;
    const { findByText } = await wrap(<ShellEntryHost />);
    mockProvided.addExpense!();
    expect(await findByText('That needs your own records')).toBeTruthy();
    expect(mockOpenEntry).not.toHaveBeenCalled();
  });

  it('Home quick actions: Add and Import carry the lock mark and name the action', async () => {
    mockPlan = LOCKED;
    const { getByLabelText, getByTestId, findByText } = await wrap(<QuickActions month="2026-11" />);
    expect(getByTestId('quick-lock-add', { includeHiddenElements: true })).toBeTruthy();
    expect(getByTestId('quick-lock-import', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(getByLabelText('Add a transaction, needs a plan'));
    expect(await findByText('Adding a transaction needs a plan')).toBeTruthy();
    expect(mockOpenEntry).not.toHaveBeenCalled();
  });

  it('Home quick actions: writable shows no lock and opens the entry', async () => {
    mockPlan = WRITABLE;
    const { queryByTestId, getByLabelText } = await wrap(<QuickActions month="2026-11" />);
    expect(queryByTestId('quick-lock-add', { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(getByLabelText('Add a transaction'));
    expect(mockOpenEntry).toHaveBeenCalledTimes(1);
  });

  it('FAB menu: locked rows stay in place with the lock mark and a spoken suffix', async () => {
    mockPlan = LOCKED;
    mockQuickActions = [
      { id: 'addExpense', label: 'Add expense', run: jest.fn() },
      { id: 'newCheck', label: 'New check', run: jest.fn() },
    ];
    const { getByTestId, getByLabelText } = await wrap(<FabQuickMenu />);
    expect(getByTestId('quick-menu-lock-addExpense', { includeHiddenElements: true })).toBeTruthy();
    expect(getByTestId('quick-menu-lock-newCheck', { includeHiddenElements: true })).toBeTruthy();
    expect(getByLabelText('Add expense, needs a plan')).toBeTruthy();
  });

  it('FAB menu: a locked Scan a receipt is marked like Add expense (10.1-25)', async () => {
    mockPlan = LOCKED;
    mockQuickActions = [{ id: 'scanReceipt', label: 'Scan a receipt', run: jest.fn() }];
    const { getByTestId, getByLabelText } = await wrap(<FabQuickMenu />);
    expect(getByTestId('quick-menu-lock-scanReceipt', { includeHiddenElements: true })).toBeTruthy();
    expect(getByLabelText('Scan a receipt, needs a plan')).toBeTruthy();
  });

  it('FAB menu: writable rows have no lock mark', async () => {
    mockPlan = WRITABLE;
    mockQuickActions = [{ id: 'addExpense', label: 'Add expense', run: jest.fn() }];
    const { queryByTestId } = await wrap(<FabQuickMenu />);
    expect(queryByTestId('quick-menu-lock-addExpense', { includeHiddenElements: true })).toBeNull();
  });
});
