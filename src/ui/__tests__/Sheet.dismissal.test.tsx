import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { getAnimatedStyle } from 'react-native-reanimated';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { getSheetStack, resetSheetStackForTests } from '@/state/sheetStack';
import { DURATION } from '@/theme/motion';
import { colors } from '@/theme/tokens';
import { Sheet } from '../Sheet';
import { SHEET_DISMISS_DELAY } from '../sheetDrag';

jest.setTimeout(30000);

jest.mock('../haptics');
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }),
}));

// RNTL 14 has no UNSAFE_getAllByType: collect the host Modals (the ones carrying onRequestClose) in tree order.
 
function modalsOf(screen: { root: any }): any[] {
   
  const walk = (el: any, out: any[] = []): any[] => {
    if (el?.props?.onRequestClose) out.push(el);
    for (const c of el?.children ?? []) if (typeof c !== 'string') walk(c, out);
    return out;
  };
  return walk(screen.root);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetSheetStackForTests();
});
afterEach(() => jest.useRealTimers());

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function mount(dirty?: boolean) {
  const onDismiss = jest.fn();
  const screen = await render(
    <ThemeProvider>
      <Sheet visible onDismiss={onDismiss} dirty={dirty}>
        <Text>{'Body'}</Text>
      </Sheet>
    </ThemeProvider>,
  );
  await advance(DURATION.sheetUp + 50);
  return { screen, onDismiss };
}

function drag(dy: number, velocityY = 0) {
  fireGestureHandler(getByGestureTestId('sheet-drag'), [
    { state: State.BEGAN, y: 10, translationY: 0 },
    { state: State.ACTIVE, y: 10 + dy / 2, translationY: dy / 2 },
    { state: State.END, y: 10 + dy, translationY: dy, velocityY },
  ]);
}

const translateOf = (screen: Awaited<ReturnType<typeof render>>) =>
  (getAnimatedStyle(screen.getAllByTestId('sheet-container')[0]!).transform as { translateY: number }[])[0]!.translateY;

describe('Sheet dirty dismissal', () => {
  it('drag past the threshold snaps back and asks to discard', async () => {
    const { screen, onDismiss } = await mount(true);
    drag(120);
    await advance(SHEET_DISMISS_DELAY + DURATION.sheetDrag + 100);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(translateOf(screen)).toBe(0);
    expect(screen.getByText('Discard changes?', { hidden: true })).toBeTruthy();
    expect(screen.getByText('Changes on this sheet haven’t been saved.', { hidden: true })).toBeTruthy();
  });

  it('backdrop tap asks instead of closing', async () => {
    const { screen, onDismiss } = await mount(true);
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText('Discard changes?', { hidden: true })).toBeTruthy();
  });

  it('Android back asks instead of closing', async () => {
    const { screen, onDismiss } = await mount(true);
    await act(async () => modalsOf(screen)[0].props.onRequestClose());
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText('Discard changes?', { hidden: true })).toBeTruthy();
  });

  it('Keep editing hides the prompt without dismissing', async () => {
    const { screen, onDismiss } = await mount(true);
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    await fireEvent.press(screen.getByText('Keep editing', { hidden: true }));
    expect(screen.queryByText('Discard changes?', { hidden: true })).toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('the prompt own back and backdrop also just hide it', async () => {
    const { screen, onDismiss } = await mount(true);
    await act(async () => modalsOf(screen)[0].props.onRequestClose());
    const modals = modalsOf(screen);
    expect(modals).toHaveLength(2);
    await act(async () => modals[1].props.onRequestClose());
    expect(screen.queryByText('Discard changes?', { hidden: true })).toBeNull();

    await act(async () => modalsOf(screen)[0].props.onRequestClose());
    const backdrops = screen.getAllByTestId('sheet-backdrop', { hidden: true });
    expect(backdrops).toHaveLength(2);
    await fireEvent.press(backdrops[1]!);
    expect(screen.queryByText('Discard changes?', { hidden: true })).toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('Discard dismisses the edit sheet exactly once', async () => {
    const { screen, onDismiss } = await mount(true);
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    await fireEvent.press(screen.getByText('Discard', { hidden: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard changes?', { hidden: true })).toBeNull();
  });

  it('a clean or undefined dirty sheet closes at once', async () => {
    for (const dirty of [false, undefined]) {
      const { screen, onDismiss } = await mount(dirty);
      drag(120);
      await advance(SHEET_DISMISS_DELAY + 1);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
      expect(onDismiss).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Discard changes?', { hidden: true })).toBeNull();
      await screen.unmount();
    }
  });

  it('puts Discard as a danger button right of Keep editing', async () => {
    const { screen } = await mount(true);
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    const keep = screen.getByText('Keep editing', { hidden: true });
    const discard = screen.getByText('Discard', { hidden: true });
    expect(StyleSheet.flatten(discard.props.style).color).toBe(colors.danger);
    expect(StyleSheet.flatten(keep.props.style).color).toBe(colors.ink);
    const all = screen.getAllByText(/^(Keep editing|Discard)$/, { hidden: true }).map((n) => n.children[0]);
    expect(all).toEqual(['Keep editing', 'Discard']);
  });

  it('renders the prompt as a nested Modal so the stack holds two sheets', async () => {
    const { screen } = await mount(true);
    expect(getSheetStack()).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    expect(getSheetStack()).toHaveLength(2);
    expect(modalsOf(screen)).toHaveLength(2);
  });
});

describe('Sheet onDiscard, single-fire dismissal, fling, prompt reset', () => {
  function tree(props: { visible?: boolean; dirty?: boolean; onDismiss: () => void; onDiscard?: () => void }) {
    return (
      <ThemeProvider>
        <Sheet visible={props.visible ?? true} onDismiss={props.onDismiss} onDiscard={props.onDiscard} dirty={props.dirty}>
          <Text>{'Body'}</Text>
        </Sheet>
      </ThemeProvider>
    );
  }
  async function mountTree(props: { dirty?: boolean; onDiscard?: () => void }) {
    const onDismiss = jest.fn();
    const screen = await render(tree({ ...props, onDismiss }));
    await advance(DURATION.sheetUp + 50);
    return { screen, onDismiss };
  }

  it('Discard calls onDiscard instead of onDismiss', async () => {
    const onDiscard = jest.fn();
    const { screen, onDismiss } = await mountTree({ dirty: true, onDiscard });
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    await fireEvent.press(screen.getByText('Discard', { hidden: true }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('a drag dismissal fires once even with a backdrop press and back inside the slide-out', async () => {
    const { screen, onDismiss } = await mountTree({});
    drag(120);
    await advance(20);
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    await act(async () => modalsOf(screen)[0].props.onRequestClose());
    expect(onDismiss).not.toHaveBeenCalled();
    await advance(SHEET_DISMISS_DELAY);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('unmounting during the slide-out cancels the dismissal', async () => {
    const { screen, onDismiss } = await mountTree({});
    drag(120);
    await advance(20);
    await screen.unmount();
    await advance(SHEET_DISMISS_DELAY + 100);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('reopening after a drag dismissal dismisses normally again', async () => {
    const onDismiss = jest.fn();
    const screen = await render(tree({ onDismiss }));
    await advance(DURATION.sheetUp + 50);
    drag(120);
    await advance(SHEET_DISMISS_DELAY + 1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await screen.rerender(tree({ onDismiss, visible: false }));
    await screen.rerender(tree({ onDismiss, visible: true }));
    await advance(DURATION.sheetUp + 50);
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('a dirty fling asks to discard; a slow short drag does not', async () => {
    const { screen, onDismiss } = await mountTree({ dirty: true });
    drag(40, 100);
    await advance(DURATION.sheetDrag + 50);
    expect(screen.queryByText('Discard changes?', { hidden: true })).toBeNull();
    drag(40, 1500);
    await advance(DURATION.sheetDrag + 50);
    expect(screen.getByText('Discard changes?', { hidden: true })).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('the prompt does not come back by itself after the sheet stops being dirty', async () => {
    const onDismiss = jest.fn();
    const screen = await render(tree({ onDismiss, dirty: true }));
    await advance(DURATION.sheetUp + 50);
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    expect(screen.getByText('Discard changes?', { hidden: true })).toBeTruthy();
    await screen.rerender(tree({ onDismiss, dirty: false }));
    await screen.rerender(tree({ onDismiss, dirty: true }));
    expect(screen.queryByText('Discard changes?', { hidden: true })).toBeNull();
  });
});
