// 03-19 (D-16): the toast is hosted in the top-most layer, keeps its timing across layers and
// reports its height to the FAB lift. RNTL 14: render, act and fireEvent are async and awaited.
import React from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import { ShellTestProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { useShellLayout } from '@/shell/layout/ShellLayoutProvider';
import { getToast, showToast } from '@/state/undoToast';
import { Sheet } from '@/ui/Sheet';
import { SheetOverlayProvider } from '@/ui/sheetOverlay';
import { SheetToastOverlay, UndoToastHost } from '../UndoToastHost';

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

const mockUndo = jest.fn();
const mockCtx = { userId: 'me', householdId: 'h1', timeZone: 'UTC' };
jest.mock('@/data/mutations/undo', () => ({ useUndo: () => ({ undo: mockUndo }) }));
jest.mock('@/data/queries/activity', () => ({ useHouseholdMemberNames: () => new Map() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockCtx }));

let screenReader = false;
beforeEach(() => {
  jest.clearAllMocks();
  screenReader = false;
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => screenReader);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  resetShellStores();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function Probe() {
  const { toastHeight, setTabBarHeight } = useShellLayout();
  React.useEffect(() => setTabBarHeight(83), [setTabBarHeight]);
  return <Text testID="toast-height">{String(toastHeight)}</Text>;
}

function Tree({ open, hostPlacement }: { open: boolean; hostPlacement?: 'app' | 'sheet' }) {
  return (
    <SheetOverlayProvider overlay={SheetToastOverlay}>
      <Probe />
      <UndoToastHost placement={hostPlacement} />
      <Sheet visible={open} onDismiss={jest.fn()}>
        <Text>{'Sheet body'}</Text>
      </Sheet>
    </SheetOverlayProvider>
  );
}

async function mount(open: boolean, options?: React.ComponentProps<typeof ShellTestProviders>['options']) {
  const ui = (o: boolean) => (
    <ShellTestProviders options={options}>
      <Tree open={o} />
    </ShellTestProviders>
  );
  const utils = await render(ui(open));
  return { ...utils, set: (o: boolean) => utils.rerender(ui(o)) };
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

function hostStyle(text: string) {
  let node = screen.getByText(text, { hidden: true }).parent;
  while (node) {
    const flat = StyleSheet.flatten(node.props?.style);
    if (flat && flat.position === 'absolute' && flat.bottom !== undefined) return flat;
    node = node.parent;
  }
  throw new Error('no host style');
}

const ORDINARY = { kind: 'ordinary' as const, text: { key: 'undo.label.added', params: { name: 'Coffee' } }, stepId: 's1' };

describe('UndoToastHost layers (D-16)', () => {
  it('app placement renders with no sheet open and nothing while a sheet is open', async () => {
    const m = await mount(false);
    await show(ORDINARY);
    expect(screen.getAllByText('Added · Coffee', { hidden: true })).toHaveLength(1);
    await m.set(true);
    // Only the sheet-layer host shows it now.
    expect(screen.getAllByText('Added · Coffee', { hidden: true })).toHaveLength(1);
    const overlayHost = screen.getByTestId('sheet-gesture-root', { hidden: true });
    expect(overlayHost).toBeTruthy();
  });

  it('sheet placement sits at insets.bottom + 30 with sides 18', async () => {
    await mount(true);
    await show(ORDINARY);
    const style = hostStyle('Added · Coffee');
    expect(style.bottom).toBe(12 + 30);
    expect(style.left).toBe(18);
    expect(style.right).toBe(18);
  });

  it('app placement on a tab: tab bar height + 12; on an outer location: insets.bottom + 30', async () => {
    const tab = await mount(false);
    await show(ORDINARY);
    expect(hostStyle('Added · Coffee').bottom).toBe(83 + 12);
    await tab.unmount();
    resetShellStores();
    await mount(false, { backHistory: { current: { area: 'outer', depth: 1, href: '/x' } } });
    await show(ORDINARY);
    expect(hostStyle('Added · Coffee').bottom).toBe(12 + 30);
  });

  it('app placement reports its height and clears it; sheet placement never reports', async () => {
    const m = await mount(false);
    await show(ORDINARY);
    const host = hostStyleNode('Added · Coffee');
    await act(async () => {
      host.props.onLayout({ nativeEvent: { layout: { height: 56 } } });
    });
    expect(screen.getByTestId('toast-height').children.join('')).toBe('56');
    await advance(6000); // 05.2 F-12: Undo toasts 6 s
    expect(getToast()).toBeNull();
    expect(screen.getByTestId('toast-height').children.join('')).toBe('0');

    await show(ORDINARY);
    await m.set(true);
    expect(screen.getByTestId('toast-height').children.join('')).toBe('0');
  });

  it('does not restart the timer when the sheet closes (6000ms total for an Undo toast)', async () => {
    // 05.2 F-12: Undo toasts 6 s
    const m = await mount(true);
    await show(ORDINARY);
    await advance(2000);
    await m.set(false);
    await advance(3900);
    expect(getToast()).not.toBeNull();
    await advance(200);
    expect(getToast()).toBeNull();
  });

  it('a destructive toast keeps its 6000ms across layers', async () => {
    const m = await mount(true);
    await show({ ...ORDINARY, kind: 'destructive' });
    await advance(4000);
    await m.set(false);
    await advance(1900);
    expect(getToast()).not.toBeNull();
    await advance(200);
    expect(getToast()).toBeNull();
  });

  it('never auto-dismisses with a screen reader on', async () => {
    screenReader = true;
    await mount(true);
    await act(async () => {
      await Promise.resolve();
    });
    await show(ORDINARY);
    await advance(10000);
    expect(getToast()).not.toBeNull();
  });

  it('a local onUndo works inside the sheet: called once, toast dismissed, sheet stays', async () => {
    await mount(true);
    const onUndo = jest.fn();
    await show({ kind: 'destructive', text: { key: 'undo.deleted' }, onUndo });
    const label = screen.queryAllByLabelText('Undo', { hidden: true });
    expect(label).toHaveLength(1);
    await fireEvent.press(label[0]!);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(getToast()).toBeNull();
    expect(screen.getByText('Sheet body', { hidden: true })).toBeTruthy();
  });

  it.each([
    ['decide.delete.toastCheck', 'checkDeleted', 'Check deleted. Nothing was written.'],
    ['decide.clear.toast', 'checkCleared', 'Check cleared. Nothing was written.'],
    ['decide.delete.toastDecision', 'decisionDeleted', 'Decision deleted'],
    ['decide.delete.toastChange', 'changeDeleted', 'Change deleted'],
    ['decide.toast.unlinked', 'lineUnlinked', 'Line unlinked'],
  ])('D-73 the Decide toast %s keeps its words and offers Undo for its step', async (key, labelKey, words) => {
    await mount(false);
    await show({ kind: 'destructive', text: { key, params: { name: 'Test chair' } }, stepId: 'step-9' });
    expect(screen.getByText(words, { hidden: true })).toBeTruthy();
    const undo = screen.queryAllByLabelText('Undo', { hidden: true });
    expect(undo).toHaveLength(1);
    await fireEvent.press(undo[0]!);
    expect(mockUndo).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'step-9', labelKey, labelParams: expect.objectContaining({ name: 'Test chair' }) })
    );
    expect(getToast()).toBeNull();
  });

  it('a Decide toast with no step id offers no Undo', async () => {
    await mount(false);
    await show({ kind: 'destructive', text: { key: 'decide.delete.toastCheck' } });
    expect(screen.queryAllByLabelText('Undo', { hidden: true })).toHaveLength(0);
  });

  it('announces politely in both placements', async () => {
    const m = await mount(false);
    await show(ORDINARY);
    let msg = screen.getByText('Added · Coffee', { hidden: true });
    expect(msg.props.accessibilityRole).toBe('alert');
    expect(msg.props.accessibilityLiveRegion).toBe('polite');
    await m.set(true);
    msg = screen.getByText('Added · Coffee', { hidden: true });
    expect(msg.props.accessibilityRole).toBe('alert');
    expect(msg.props.accessibilityLiveRegion).toBe('polite');
  });
});

function hostStyleNode(text: string) {
  let node = screen.getByText(text, { hidden: true }).parent;
  while (node) {
    if (node.props?.onLayout) return node;
    node = node.parent;
  }
  throw new Error('no host');
}
