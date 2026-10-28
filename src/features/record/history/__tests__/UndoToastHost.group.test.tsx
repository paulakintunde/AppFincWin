// 05.2-40: one user action, one Undo. A toast carrying an undo group replays every step, last saved first.
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

const TEXT = { key: 'decide.setup.shell.toastSaved', params: { title: 'Pay', name: 'Pay' } };

describe('UndoToastHost undo group (05.2-40)', () => {
  it('replays every step in the group, last first, with the toast label', async () => {
    await mount();
    await act(async () => {
      showToast({ kind: 'ordinary', text: TEXT, stepId: 'b', stepIds: ['a', 'b', 'c'] });
    });
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(mockUndo.mock.calls.map((c) => c[0].stepId)).toEqual(['c', 'b', 'a']);
    for (const c of mockUndo.mock.calls) expect(c[0]).toEqual(expect.objectContaining({ labelKey: 'setupStepSaved', ownerId: 'me' }));
  });

  it('undoes a duplicated id once', async () => {
    await mount();
    await act(async () => {
      showToast({ kind: 'ordinary', text: TEXT, stepIds: ['a', 'b', 'a'] });
    });
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(mockUndo.mock.calls.map((c) => c[0].stepId)).toEqual(['b', 'a']);
  });

  it('a one-id group behaves like a single step', async () => {
    await mount();
    await act(async () => {
      showToast({ kind: 'ordinary', text: TEXT, stepIds: ['only'] });
    });
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'only' }));
  });

  it('an empty group with no stepId offers no Undo', async () => {
    await mount();
    await act(async () => {
      showToast({ kind: 'ordinary', text: TEXT, stepIds: [] });
    });
    expect(screen.queryByLabelText('Undo')).toBeNull();
  });
});
