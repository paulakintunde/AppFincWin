// 02-28: UndoToastHost (D-31) and HistoryScreen (D-27, D-28, D-32) with mocked hooks.
// RNTL 14: render, act and fireEvent are all async and must be awaited.
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { dismissToast, getToast, resetToastForTests, showToast } from '@/state/undoToast';
import type { UndoLogRow } from '@/db/rows';
import { undoLabelText } from '@/i18n/undoLabel';
import { HistoryScreen } from '../HistoryScreen';
import { UndoToastHost } from '../UndoToastHost';

jest.setTimeout(20000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

const mockUndo = jest.fn();
const mockRollbackTo = jest.fn();
let mockLog: UndoLogRow[] = [];
const mockCtx = { userId: 'me', householdId: 'h1', timeZone: 'UTC' };

jest.mock('@/data/mutations/undo', () => ({
  useUndo: () => ({ undo: mockUndo }),
  useRollbackUndo: () => ({ rollbackTo: mockRollbackTo }),
}));
jest.mock('@/data/queries/undoLog', () => ({ useUndoLog: () => ({ data: mockLog }) }));
jest.mock('@/data/queries/activity', () => ({ useHouseholdMemberNames: () => new Map([['sam', 'Sam']]) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockCtx }));

let screenReader = false;
beforeEach(() => {
  mockUndo.mockClear();
  mockRollbackTo.mockClear();
  screenReader = false;
  mockLog = [];
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => screenReader);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  resetToastForTests();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderThemed(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

async function show(t: Parameters<typeof showToast>[0]) {
  await act(async () => {
    showToast(t);
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('UndoToastHost', () => {
  it('shows an ordinary change with Undo, and Undo replays the step then dismisses', async () => {
    await renderThemed(<UndoToastHost />);
    await show({ kind: 'ordinary', text: { key: 'undo.label.added', params: { name: 'Coffee' } }, stepId: 's1' });
    expect(screen.getByText('Added · Coffee')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(mockUndo).toHaveBeenCalledWith({
      stepId: 's1',
      ownerId: 'me',
      householdId: 'h1',
      labelKey: 'added',
      labelParams: { name: 'Coffee' },
    });
    expect(getToast()).toBeNull();
  });

  it('maps a { count }-only toast onto labelParams.n', async () => {
    await renderThemed(<UndoToastHost />);
    await show({ kind: 'destructive', text: { key: 'undo.label.deletedMany', params: { count: 30 } }, stepId: 's2' });
    expect(screen.getByText('30 deleted')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ labelKey: 'deletedMany', labelParams: { n: 30 } }));
  });

  it('never offers Undo when the step id is null (item 7)', async () => {
    await renderThemed(<UndoToastHost />);
    await show({ kind: 'ordinary', text: { key: 'undo.label.deleted', params: { name: 'Rent' } }, stepId: null });
    expect(screen.getByText('Deleted · Rent')).toBeTruthy();
    expect(screen.queryByLabelText('Undo')).toBeNull();
  });

  it('renders a nameless label without a raw placeholder, and still offers Undo (item 10, S-CR-04)', async () => {
    await renderThemed(<UndoToastHost />);
    const text = undoLabelText('deleted', {});
    expect(text.key).toBe('undo.labelUnnamed.deleted');
    await show({ kind: 'destructive', text, stepId: 's3' });
    expect(screen.getByText('Deleted')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ stepId: 's3', labelKey: 'deleted', labelParams: {} }));
  });

  it.each(['markedPaid', 'skipped', 'transferAdded', 'transferEdited', 'transferDeleted', 'edited'])(
    'offers Undo for a nameless %s step (S-CR-04)',
    async (labelKey) => {
      await renderThemed(<UndoToastHost />);
      await show({ kind: 'ordinary', text: undoLabelText(labelKey, {}), stepId: 's4' });
      await fireEvent.press(screen.getByLabelText('Undo'));
      expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ stepId: 's4', labelKey }));
    }
  );

  it('auto-dismisses ordinary at 3200 ms and destructive at 6000 ms', async () => {
    jest.useFakeTimers();
    await renderThemed(<UndoToastHost />);
    await show({ kind: 'ordinary', text: { key: 'undo.label.added', params: { name: 'A' } }, stepId: 's1' });
    await advance(3199);
    expect(getToast()).not.toBeNull();
    await advance(1);
    expect(getToast()).toBeNull();

    await show({ kind: 'destructive', text: { key: 'undo.label.deleted', params: { name: 'A' } }, stepId: 's2' });
    await advance(5999);
    expect(getToast()).not.toBeNull();
    await advance(1);
    expect(getToast()).toBeNull();
  });

  it('does not auto-dismiss while a screen reader is on (D-31) and shows Dismiss', async () => {
    screenReader = true;
    jest.useFakeTimers();
    await renderThemed(<UndoToastHost />);
    await show({ kind: 'ordinary', text: { key: 'undo.label.added', params: { name: 'A' } }, stepId: 's1' });
    await advance(60000);
    expect(getToast()).not.toBeNull();
    await fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(getToast()).toBeNull();
  });

  it('renders a refusal toast with the attribution, and the reverted info toast with the label', async () => {
    await renderThemed(<UndoToastHost />);
    await show({
      kind: 'refusal',
      refusal: { entity: 'transactions', id: 't', updatedBy: 'sam', recordName: 'Groceries', builtinKey: null, reason: 'changed' },
    });
    expect(screen.getByText('Sam edited Groceries after this, so it can’t be undone.')).toBeTruthy();
    expect(screen.queryByLabelText('Undo')).toBeNull();
    await act(async () => {
      dismissToast();
    });
    await show({ kind: 'info', text: { key: 'undo.reverted', params: { labelKey: 'deletedMany', n: 3 } } });
    expect(screen.getByText('Undone · 3 deleted')).toBeTruthy();
  });
});

function row(id: string, status: 'available' | 'refused', over: Partial<UndoLogRow> = {}): UndoLogRow {
  return {
    id,
    owner_id: 'me',
    label_key: 'added',
    label_params: { name: id },
    status,
    refusal: null,
    created_at: '2026-10-01T09:30:00Z',
    resolved_at: null,
    ...over,
  };
}

describe('HistoryScreen', () => {
  it('shows the empty state', async () => {
    await renderThemed(<HistoryScreen />);
    expect(screen.getByText('Nothing yet.')).toBeTruthy();
    expect(screen.getByText('Every change that can be undone shows up here.')).toBeTruthy();
  });

  it('lists steps newest first with counts, and Undo to here rolls back', async () => {
    mockLog = [row('c', 'available'), row('b', 'available'), row('a', 'available')];
    await renderThemed(<HistoryScreen />);
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Recent changes')).toBeTruthy();
    expect(screen.getByText('Most recent')).toBeTruthy();
    expect(screen.getByText('Undoes 1 change')).toBeTruthy();
    expect(screen.getByText('Undoes 3 changes')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Undo to here, Added · a'));
    expect(mockRollbackTo).toHaveBeenCalledWith({ stepId: 'a', ownerId: 'me', householdId: 'h1' });
  });

  it('greys refused steps with the reason and no action', async () => {
    mockLog = [
      row('b', 'refused', {
        refusal: { entity: 'transactions', id: 't', updated_by: 'sam', record_name: 'Groceries', builtin_key: null, reason: 'changed' },
      }),
      row('a', 'available'),
    ];
    await renderThemed(<HistoryScreen />);
    expect(screen.getByText('Can’t undo')).toBeTruthy();
    expect(screen.getByText('Sam edited Groceries after this, so it can’t be undone.')).toBeTruthy();
    expect(screen.queryByLabelText('Undo to here, Added · b')).toBeNull();
  });

  it('handles series refusals with no updated_by and both-null refusals (item 11)', async () => {
    mockLog = [
      row('s', 'refused', {
        label_key: 'seriesEdited',
        label_params: {},
        refusal: { entity: 'recurring_series', id: 'x', updated_by: null, record_name: 'Rent', builtin_key: null, reason: 'changed' },
      }),
      row('t', 'refused', {
        refusal: { entity: 'transactions', id: 'y', updated_by: null, record_name: null, builtin_key: null, reason: 'changed' },
      }),
    ];
    await renderThemed(<HistoryScreen />);
    expect(screen.getByText('Newer occurrences of Rent have been scheduled since, so this can’t be undone.')).toBeTruthy();
    expect(screen.getByText('this line was changed elsewhere after this, so it can’t be undone.')).toBeTruthy();
    expect(screen.getByText('Series edited')).toBeTruthy();
  });
});
