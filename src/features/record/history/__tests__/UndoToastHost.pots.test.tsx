// D-105: the Pots toasts keep their own words ("Pot saved") yet replay their undo step. Without a key-to-label mapping the host
// found no undo label and drew only the close button.
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

const CASES: [string, Record<string, string | number>, string, string][] = [
  ['decide.pots.toast.saved', { undoLabel: 'potAdded' }, 'potAdded', 'Pot saved'],
  ['decide.pots.toast.saved', { undoLabel: 'potEdited' }, 'potEdited', 'Pot saved'],
  ['decide.pots.toast.saved', {}, 'potEdited', 'Pot saved'],
  ['decide.pots.toast.deleted', { name: 'Test pot' }, 'potDeleted', 'Pot deleted · Test pot'],
  ['decide.pots.toast.done', { name: 'Test pot' }, 'potDone', 'Marked done · Test pot'],
  ['decide.pots.toast.reopened', { name: 'Test pot' }, 'potReopened', 'Reopened · Test pot'],
];

describe('UndoToastHost pot toasts (D-105)', () => {
  it.each(CASES)('%s %j offers Undo that replays the pot step as %s', async (key, params, labelKey, words) => {
    await mount();
    await act(async () => {
      showToast({ kind: 'destructive', text: { key, params }, stepId: 'step-pot' });
    });
    expect(screen.getByText(words)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-pot', labelKey, ownerId: 'me', householdId: 'h1' }));
  });

  it('a pot toast with no step id shows no Undo', async () => {
    await mount();
    await act(async () => {
      showToast({ kind: 'destructive', text: { key: 'decide.pots.toast.saved' } });
    });
    expect(screen.queryByLabelText('Undo')).toBeNull();
  });
});
