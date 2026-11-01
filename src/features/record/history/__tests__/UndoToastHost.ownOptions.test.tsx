// 05.3-101 (UAT gap 25): own kind / purpose toasts offer Undo, and an Undo toast stays up 10 s.
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ShellTestProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { showToast } from '@/state/undoToast';
import { UndoToastHost } from '../UndoToastHost';

jest.setTimeout(30000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

const mockUndo = jest.fn();
jest.mock('@/data/mutations/undo', () => ({ useUndo: () => ({ undo: mockUndo }) }));
jest.mock('@/data/queries/activity', () => ({ useHouseholdMemberNames: () => new Map() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'me', householdId: 'h1', timeZone: 'UTC' }) }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  resetShellStores();
});

async function mount() {
  await render(
    <ShellTestProviders>
      <UndoToastHost />
    </ShellTestProviders>
  );
}

// 05.3-120 (UAT gap 37): each toast replays its own named step.
const KEYS: readonly (readonly [string, string])[] = [
  ['savedToast', 'ownOptionAdded'],
  ['renamedToast', 'ownOptionRenamed'],
  ['removedToast', 'ownOptionRemoved'],
];

describe('UndoToastHost own-option toasts (05.3-101)', () => {
  it.each(KEYS)('%s offers Undo that replays the saved step as %s', async (k, label) => {
    await mount();
    await act(async () => {
      showToast({ kind: 'destructive', text: { key: `decide.v3.ui.ownOptions.${k}`, params: { name: 'Bike' } }, stepId: 's1' });
    });
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ stepId: 's1', labelKey: label, labelParams: { name: 'Bike' } }));
  });

  it('stays up at 9.9 s and is gone at 10.1 s', async () => {
    jest.useFakeTimers();
    try {
      await mount();
      await act(async () => {
        showToast({ kind: 'destructive', text: { key: 'decide.v3.ui.ownOptions.removedToast', params: { name: 'Bike' } }, stepId: 's1' });
      });
      await act(async () => {
        jest.advanceTimersByTime(9900);
      });
      expect(screen.queryByLabelText('Undo')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      expect(screen.queryByLabelText('Undo')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
