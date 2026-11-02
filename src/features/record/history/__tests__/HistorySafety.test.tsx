// 05.3-111 (UAT gap 26): History has a back arrow, blocked rows say why, and Undo to here asks first.
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ShellTestProviders } from '@/shell/__tests__/testUtils';
import type { UndoLogRow } from '@/db/rows';
import { HistoryScreen } from '../HistoryScreen';

jest.setTimeout(20000);
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: jest.fn(), focusAccessibility: jest.fn() }));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

const mockRollbackTo = jest.fn();
let mockLog: UndoLogRow[] = [];
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));
jest.mock('@/data/mutations/undo', () => ({
  useUndo: () => ({ undo: jest.fn() }),
  useRollbackUndo: () => ({ rollbackTo: mockRollbackTo }),
}));
jest.mock('@/data/queries/undoLog', () => ({ useUndoLog: () => ({ data: mockLog }) }));
jest.mock('@/data/queries/activity', () => ({ useHouseholdMemberNames: () => new Map() }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'me', householdId: 'h1', timeZone: 'UTC' }),
}));

beforeEach(() => {
  mockRollbackTo.mockClear();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
});
afterEach(() => jest.restoreAllMocks());

function row(id: string, status: 'available' | 'refused'): UndoLogRow {
  return {
    id,
    owner_id: 'me',
    label_key: 'added',
    label_params: { name: id },
    status,
    refusal: null,
    created_at: '2026-10-01T09:30:00Z',
    resolved_at: null,
  };
}

const renderIt = () =>
  render(
    <ShellTestProviders>
      <HistoryScreen />
    </ShellTestProviders>
  );

describe('History safety', () => {
  it('has a back control', async () => {
    mockLog = [row('a', 'available')];
    await renderIt();
    expect(screen.getByLabelText(/back/i)).toBeTruthy();
  });

  it('rows under a refused step are blocked with a reason, never "Undoes 0 changes"', async () => {
    mockLog = [row('r', 'refused'), row('a', 'available'), row('b', 'available')];
    await renderIt();
    expect(screen.getAllByText('Can’t undo to here: a newer change couldn’t be undone.')).toHaveLength(2);
    expect(screen.queryByLabelText('Undo to here, Added · a')).toBeNull();
    expect(screen.queryByText(/Undoes 0/)).toBeNull();
  });

  it('asks first, Keep sends nothing, confirm sends once', async () => {
    mockLog = [row('c', 'available'), row('b', 'available'), row('a', 'available')];
    await renderIt();
    await fireEvent.press(screen.getByLabelText('Undo to here, Added · a'));
    expect(screen.getByText('Undo 3 changes?')).toBeTruthy();
    expect(screen.getByText(/Added · c\s+Added · b\s+Added · a/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep them'));
    expect(mockRollbackTo).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Undo to here, Added · a'));
    await fireEvent.press(screen.getByText('Undo 3 changes'));
    expect(mockRollbackTo).toHaveBeenCalledTimes(1);
    expect(mockRollbackTo).toHaveBeenCalledWith({ stepId: 'a', ownerId: 'me', householdId: 'h1' });
  });
});
