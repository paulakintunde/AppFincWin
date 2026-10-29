// 05.2-53 (F-08): every 05.2 toast that is shown with a step id offers Undo. A missing label mapping fails here.
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

const CASES: [string, Record<string, string | number>, string][] = [
  ['decide.settings.toastReset', {}, 'setupReset'],
  ['decide.setup.regular.toastCleared', { name: 'Gym' }, 'paymentRestored'],
  ['decide.accountUse.toastSaved', {}, 'accountUseSaved'],
  ['decide.emergencySheet.toastSaved', {}, 'emergencySaved'],
  ['decide.emergencySheet.toastSavedAccount', { account: 'Savings' }, 'emergencySaved'],
  ['decide.emergencySheet.toastRemoved', {}, 'emergencyRemoved'],
  ['activity.refund.toastLinked', {}, 'refundLinked'],
  ['activity.refund.toastUnlinked', {}, 'refundUnlinked'],
  ['activity.incomeTag.toastSaved', {}, 'incomeTypeSaved'],
  ['activity.incomeTag.toastTagged', { count: 3, payer: 'Acme' }, 'incomeTagged'],
  ['activity.incomeTag.toastFuture', { payer: 'Acme' }, 'incomeTagged'],
  ['decide.setup.shell.toastSaved', { title: 'Income', name: 'Income' }, 'setupStepSaved'],
  ['decide.setup.shell.toastIncome', { undoLabel: 'setupStepSaved', name: 'Income' }, 'setupStepSaved'],
  ['decide.unspentSheet.toastConfirmed', { undoLabel: 'unspentConfirmed' }, 'unspentConfirmed'],
  ['decide.unspentSheet.toastCleared', { undoLabel: 'unspentCleared' }, 'unspentCleared'],
  ['decide.setup.saving.toastRaised', { amount: '$50', undoLabel: 'seriesEdited', name: 'Rent' }, 'seriesEdited'],
  ['decide.setup.debtSheet.savedToast', { undoLabel: 'debtAdded', name: 'Card' }, 'debtAdded'],
  ['decide.setup.debtSheet.paidOffToast', { undoLabel: 'debtPaidOff', name: 'Card' }, 'debtPaidOff'],
];

describe('UndoToastHost 05.2 toasts (F-08)', () => {
  it.each(CASES)('%s offers Undo that replays the step as %s', async (key, params, labelKey) => {
    await mount();
    await act(async () => {
      showToast({ kind: 'ordinary', text: { key, params }, stepId: 'step-1' });
    });
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-1', labelKey, ownerId: 'me', householdId: 'h1' }));
  });

  it('a toast key outside the lists still shows no Undo', async () => {
    await mount();
    await act(async () => {
      showToast({ kind: 'ordinary', text: { key: 'decide.flow.saveWaiting' }, stepId: 'step-1' });
    });
    expect(screen.queryByLabelText('Undo')).toBeNull();
  });
});
