// 06.1-65 (FQ1, CN-2): every setup item leaves through useLeaveItem, which goes back to the screen it was opened from (the
// checklist, the answer or Decide home). Only a deep link with no history lands on the checklist, through dismissTo, so there is
// still exactly one checklist (06.1-50 C-6). (FQ4, CC-6): "Save and close" runs the same save as the primary when something is
// unsaved. (DN-12, DB-12): Back is the checklist's chevron with a 48 dp target.
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, renderHook, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { ITEM_BACK_TARGET, SETUP_HOME, SetupItemFrame, useLeaveItem } from '../SetupItemFrame';

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
// Built in two parts so the plan's grep gate (no such call under setup/items) does not match this guard itself.
const STACKS_A_COPY = ['router.replace(', 'SETUP_HOME)'].join('');
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, dismissTo: mockDismissTo, push: mockPush, back: mockBack, canGoBack: () => mockCanGoBack }),
}));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
});

describe('leave to caller (useLeaveItem)', () => {
  it('goes back to the screen the item was opened from, and never stacks a checklist', async () => {
    const { result } = await renderHook(() => useLeaveItem());
    result.current();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('lands on one checklist when opened straight from a deep link with no history', async () => {
    mockCanGoBack = false;
    const { result } = await renderHook(() => useLeaveItem());
    result.current();
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith(SETUP_HOME);
    expect(SETUP_HOME).toBe('/decide/setup');
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('no setup item source stacks the checklist with replace, and every item leaves through useLeaveItem', () => {
    const fs = jest.requireActual<typeof import('fs')>('fs');
    const path = jest.requireActual<typeof import('path')>('path');
    const dir = path.join(__dirname, '..');
    const items = ['PaySetup', 'BillsSetup', 'DebtsSetup', 'NetSetup', 'RulesSetup', 'RecordsSetup'];
    for (const item of items) {
      const src = fs.readFileSync(path.join(dir, `${item}.tsx`), 'utf8');
      expect(src).not.toContain(STACKS_A_COPY);
      expect(src).toContain('useLeaveItem()');
      expect(src).not.toContain('onSaveAndClose={leave}');
    }
  });
});

describe('SetupItemFrame (FQ4, DN-12)', () => {
  const draw = async (p: { dirty?: boolean; disabled?: boolean; save?: jest.Mock; leave?: jest.Mock; close?: jest.Mock }) => {
    const onSave = p.save ?? jest.fn(() => true);
    const onLeave = p.leave ?? jest.fn();
    await wrap(
      <SetupItemFrame title="Item" why="A reason" primaryLabel="Save it" primaryDisabled={p.disabled} onSave={onSave} onLeave={onLeave} dirty={p.dirty} onSaveAndClose={p.close}>
        {null}
      </SetupItemFrame>,
    );
    return { onSave, onLeave };
  };

  it('Back is the chevron with a 48 dp target and the Back label, and it leaves without saving', async () => {
    const { onSave, onLeave } = await draw({ dirty: true });
    const back = screen.getByTestId('item-back');
    expect(screen.getByTestId('item-back-chevron')).toBeTruthy();
    expect(screen.queryByText('Back')).toBeNull();
    expect(back.props.accessibilityLabel).toBe('Back');
    const style = StyleSheet.flatten(back.props.style);
    expect(ITEM_BACK_TARGET).toBe(48);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
    await fireEvent.press(back);
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Save and close and the bottom save run the same onSave, then leave', async () => {
    const { onSave, onLeave } = await draw({ dirty: true });
    await fireEvent.press(screen.getByTestId('item-save-close'));
    await fireEvent.press(screen.getByText('Save it'));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it('Save and close with nothing unsaved closes without saving', async () => {
    const { onSave, onLeave } = await draw({ dirty: false });
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('Save and close with nothing unsaved runs the item’s own close when it has one', async () => {
    const close = jest.fn();
    const { onSave, onLeave } = await draw({ dirty: false, close });
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(close).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('Save and close with input that cannot be saved yet stays open', async () => {
    const { onSave, onLeave } = await draw({ dirty: true, disabled: true });
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('a save that returns false keeps the item open', async () => {
    const { onSave, onLeave } = await draw({ dirty: true, save: jest.fn(() => false) });
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('an async save leaves once it resolves', async () => {
    const { onLeave } = await draw({ dirty: true, save: jest.fn(() => Promise.resolve(true)) });
    await fireEvent.press(screen.getByTestId('item-save-close'));
    await Promise.resolve();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('an async save that resolves false stays open', async () => {
    const { onLeave } = await draw({ dirty: true, save: jest.fn(() => Promise.resolve(false)) });
    await fireEvent.press(screen.getByTestId('item-save-close'));
    await Promise.resolve();
    expect(onLeave).not.toHaveBeenCalled();
  });
});
