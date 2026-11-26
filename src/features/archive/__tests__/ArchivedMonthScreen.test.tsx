import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ArchivedMonthScreen } from '../ArchivedMonthScreen';
import { MONTH_PARAM } from '../monthLabel';

jest.setTimeout(30000);

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() }, Redirect: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/ui/Sheet', () => {
  const { View } = require('react-native');
  return { Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null) };
});
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn() }));

const mockRestore = jest.fn();
jest.mock('../useArchiveState', () => ({
  useArchiveState: () => ({ enabled: true, archived: new Set(['2026-08']), count: 1, shared: true, archive: jest.fn(), restore: mockRestore }),
}));
const mockSetSelectedMonth = jest.fn();
jest.mock('@/state/activityFocus', () => ({ setSelectedMonth: (m: string) => mockSetSelectedMonth(m) }));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockShowToast(t) }));

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', homeCurrency: 'USD', showCents: false, today: '2026-10-05', userId: 'u1' }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ all: [], active: [], byId: new Map(), transferCategoryId: null }) }));
jest.mock('@/features/record/entry/TransactionSheet', () => ({ TransactionSheet: () => null }));
jest.mock('@/features/record/activity/useRowActions', () => ({ useRowActions: () => ({ pay: jest.fn(), unpay: jest.fn() }) }));

// The two row components are replaced by thin stand-ins: this test is about the archive scope, not row drawing.
jest.mock('@/features/record/activity/ActivityRow', () => {
  const { Pressable, Text } = require('react-native');
  return {
    ActivityRow: ({ row, onPress, onMarkPaid }: { row: { id: string; name: string }; onPress: (r: unknown) => void; onMarkPaid: (r: unknown) => void }) => (
      <Pressable testID={`row-${row.id}`} onPress={() => onPress(row)} onLongPress={() => onMarkPaid(row)}>
        <Text>{row.name}</Text>
      </Pressable>
    ),
  };
});
const mockWrite = jest.fn();
jest.mock('@/features/record/activity/TransactionDetailSheet', () => {
  const { Pressable, Text, View } = require('react-native');
  const { useWriteGate } = require('@/features/plans/useWriteGate');
  return {
    TransactionDetailSheet: ({ row, visible }: { row: { id: string } | null; visible: boolean }) => {
      const gate = useWriteGate('editRecord');
      if (!visible || row === null) return null;
      return (
        <View testID={`detail-${row.id}`}>
          <Pressable testID={`edit-${row.id}`} onPress={() => gate.run(mockWrite)}>
            <Text>{`Edit ${gate.gated ? 'locked' : 'open'}`}</Text>
          </Pressable>
        </View>
      );
    },
  };
});
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => ({ status: 'active', writable: true, loading: false, members: 2 }) }));

const mine = { id: 'a', name: 'Coffee', is_shared: false };
const shared = { id: 'b', name: 'Rent', is_shared: true };
jest.mock('@/data/queries/activity', () => ({
  useMonthView: () => ({ rows: [mine, shared], projections: [], isLoading: false }),
}));

describe('ArchivedMonthScreen (UI-SPEC 4c, D-14, D-15)', () => {
  beforeEach(() => jest.clearAllMocks());

  const setup = () =>
    render(
      <ThemeProvider>
        <ArchivedMonthScreen month="2026-08" />
      </ThemeProvider>,
    );

  it('shows the archived badge, the notice and a Restore month button', async () => {
    const { getByText } = await setup();
    expect(getByText('August 2026')).toBeTruthy();
    expect(getByText('Archived')).toBeTruthy();
    expect(getByText('This month is archived. Restore it to change it.')).toBeTruthy();
    expect(getByText('Restore month')).toBeTruthy();
  });

  it('Restore month is instant: restores, toasts and returns to Activity for that month', async () => {
    const { getByText } = await setup();
    await fireEvent.press(getByText('Restore month'));
    expect(mockRestore).toHaveBeenCalledWith('2026-08');
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ text: { key: 'system.archive.restoredToast', params: { month: 'August 2026' } } }));
    expect(mockSetSelectedMonth).toHaveBeenCalledWith('2026-08');
    expect(router.replace).toHaveBeenCalledWith('/activity');
  });

  it('a personal row opens a gated detail: edit explains the restore step and does not write', async () => {
    const { getByTestId, getByText, queryByText } = await setup();
    await fireEvent.press(getByTestId('row-a'));
    expect(getByText('Edit locked')).toBeTruthy();
    await fireEvent.press(getByTestId('edit-a'));
    expect(mockWrite).not.toHaveBeenCalled();
    expect(getByText('Restore to change this month')).toBeTruthy();
    await fireEvent.press(getByText('Keep reading'));
    expect(queryByText('Restore to change this month')).toBeNull();
  });

  it('a shared row stays editable and is labelled', async () => {
    const { getByTestId, getByText, queryByTestId } = await setup();
    expect(getByText('Shared row. Still editable.')).toBeTruthy();
    expect(queryByTestId('archived-shared-a')).toBeNull();
    expect(getByTestId('archived-shared-b')).toBeTruthy();
    await fireEvent.press(getByTestId('row-b'));
    expect(getByText('Edit open')).toBeTruthy();
    await fireEvent.press(getByTestId('edit-b'));
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it('the route param guard accepts only a real YYYY-MM', () => {
    expect(MONTH_PARAM.test('2026-08')).toBe(true);
    expect(MONTH_PARAM.test('2026-13')).toBe(false);
    expect(MONTH_PARAM.test('2026-00')).toBe(false);
    expect(MONTH_PARAM.test('2026-08/../x')).toBe(false);
    expect(MONTH_PARAM.test('')).toBe(false);
  });
});
