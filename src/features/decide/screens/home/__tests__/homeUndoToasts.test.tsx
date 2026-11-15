// 06.1-80 (H-17, DC-9, DC-10): every toast Decide home's sheets show after a write offers Undo, and Undo replays that write's own
// step. The payloads are the ones the sheets send (see ruleSheets, somethingChanged and openCheckSheet tests).
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { UndoToastHost } from '@/features/record/history/UndoToastHost';
import { ShellTestProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { showToast } from '@/state/undoToast';

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
    </ShellTestProviders>,
  );
}

type Payload = Parameters<typeof showToast>[0];
const CASES: [string, Payload, string, string][] = [
  [
    'check deleted from the open-check sheet',
    { kind: 'destructive', text: { key: 'decide.screens.sheetsHome.openCheck.deleted', params: { name: 'Used car', undoLabel: 'decisionDeleted' } }, stepId: 'step-1', target: { entity: 'decide_checks', id: 'c1' } },
    'Deleted: Used car.',
    'decisionDeleted',
  ],
  ['check deleted from the answer', { kind: 'destructive', text: { key: 'decide.screens.common.toast.deleted', params: { item: 'Used car' } }, stepId: 'step-1' }, 'Deleted: Used car.', 'decisionDeleted'],
  [
    'change added',
    { kind: 'ordinary', text: { key: 'decide.screens.sheetsHome.changed.toast', params: { change: 'Car repair', date: 'Nov 20', name: 'Car repair', undoLabel: 'changeAdded' } }, stepId: 'step-1' },
    'Changed: Car repair. Answers use it from Nov 20.',
    'changeAdded',
  ],
  [
    'change changed',
    { kind: 'ordinary', text: { key: 'decide.screens.sheetsHome.changed.toast', params: { change: 'Car repair', date: 'Nov 20', name: 'Car repair', undoLabel: 'changeEdited' } }, stepId: 'step-1' },
    'Changed: Car repair. Answers use it from Nov 20.',
    'changeEdited',
  ],
  ['change reset', { kind: 'ordinary', text: { key: 'decide.screens.sheetsHome.changed.resetToast', params: { undoLabel: 'changeDeleted', name: 'Gym stopped' } }, stepId: 'step-1' }, 'Change reset.', 'changeDeleted'],
  ['rule added', { kind: 'ordinary', text: { key: 'decide.screens.sheetsHome.addRule.toast', params: { undoLabel: 'ruleAdded' } }, stepId: 'step-1' }, 'Rule added.', 'ruleAdded'],
];

describe('Decide home sheet toasts offer Undo (06.1-80)', () => {
  it.each(CASES)('%s: the toast reads right and Undo replays its step', async (_name, payload, text, labelKey) => {
    await mount();
    await act(async () => {
      showToast(payload);
    });
    expect(screen.getByText(text)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-1', labelKey, ownerId: 'me', householdId: 'h1' }));
  });

  it('the open-check delete Undo is checked against the deleted check', async () => {
    await mount();
    await act(async () => {
      showToast(CASES[0]![1]);
    });
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ labelKey: 'decisionDeleted', labelParams: { name: 'Used car' }, expect: { entityId: 'c1' } }));
  });
});
