/**
 * 06.1-76 H-13 (DB-3, DB-4, DB-14): a sheet never leaves its backdrop on screen without its panel.
 * On the device the panel went off screen (a touch that started while the sheet slid in, or with
 * the keyboard up) and its "Close" backdrop stayed, so every tap on the page brought back
 * "Discard changes?" and "Keep editing" never brought the panel back. These cases put the panel off
 * its rest position the way an unfinished drag does (the touch stream is cut when the prompt's own
 * Modal opens, so no END arrives) and check that every keep-editing route restores it.
 */
import React from 'react';
import { BackHandler, Keyboard, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { getAnimatedStyle } from 'react-native-reanimated';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { DURATION } from '@/theme/motion';
import { resetSheetStackForTests } from '@/state/sheetStack';
import { Sheet } from '../Sheet';
import { SHEET_DISMISS_DELAY } from '../sheetDrag';
import { layOutSheets } from '@/test/sheetLayout';

jest.setTimeout(30000);

jest.mock('../haptics');
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }),
}));

type KbHandler = (e: { endCoordinates: { height: number } }) => void;

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
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

type Screen = Awaited<ReturnType<typeof render>>;

const translateOf = (screen: Screen) =>
  (getAnimatedStyle(screen.getAllByTestId('sheet-container', { hidden: true })[0]!).transform as { translateY: number }[])[0]!
    .translateY;

/** A finger that went down on the panel and moved it, with no END (the prompt's Modal took the touch stream). */
async function strandPanel(dy: number) {
    const handlers = (getByGestureTestId('sheet-drag') as any).handlers;
  await act(async () => {
    handlers.onBegin({ y: 10, translationY: 0 });
    handlers.onUpdate({ y: 10 + dy, translationY: dy });
  });
}

interface TreeProps {
  visible?: boolean;
  dirty?: boolean;
  onDismiss: () => void;
  onDiscard?: () => void;
  onInside?: () => void;
}
function tree({ visible = true, dirty, onDismiss, onDiscard, onInside }: TreeProps) {
  return (
    <ThemeProvider>
      <Sheet visible={visible} dirty={dirty} onDismiss={onDismiss} onDiscard={onDiscard}>
        <Text>{'Body'}</Text>
        <Pressable testID="inside" accessibilityRole="button" onPress={onInside}>
          <Text>{'Inside'}</Text>
        </Pressable>
      </Sheet>
    </ThemeProvider>
  );
}

async function keepEditing(screen: Screen) {
  await fireEvent.press(screen.getByText('Keep editing', { hidden: true }));
  await advance(DURATION.sheetUp + 50);
}

describe('Sheet: no backdrop without its panel (H-13)', () => {
  it('(1) backdrop on a dirty sheet, then Keep editing: the panel is back at 0 and takes a press', async () => {
    const onDismiss = jest.fn();
    const onInside = jest.fn();
    const screen = await render(tree({ dirty: true, onDismiss, onInside }));
    await advance(DURATION.sheetUp + 50);
    await strandPanel(300);
    expect(translateOf(screen)).toBeGreaterThan(0);
    await layOutSheets();
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    expect(screen.getByText('Discard changes?', { hidden: true })).toBeTruthy();
    await keepEditing(screen);
    expect(screen.queryByText('Discard changes?', { hidden: true })).toBeNull();
    expect(translateOf(screen)).toBe(0);
    await fireEvent.press(screen.getByTestId('inside', { hidden: true }));
    expect(onInside).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('(2) Android Back on a dirty sheet, then Keep editing: the panel is back at 0', async () => {
    const onDismiss = jest.fn();
    const screen = await render(tree({ dirty: true, onDismiss }));
    await advance(DURATION.sheetUp + 50);
    await strandPanel(300);
    await act(async () => modalsOf(screen)[0].props.onRequestClose());
    expect(screen.getByText('Discard changes?', { hidden: true })).toBeTruthy();
    await keepEditing(screen);
    expect(translateOf(screen)).toBe(0);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('(3) a touch during the slide-in, then dirty, then a dismiss request: Keep editing brings the panel up', async () => {
    const onDismiss = jest.fn();
    const screen = await render(tree({ onDismiss }));
    await advance(50); // the open slide is still running
    // The backdrop tap of a still-clean sheet closes it in the same handler (DB-14); this owner keeps it open.
    await layOutSheets();
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // A finger held still while the panel slides up reads as a drag and stops the slide part way.
    await strandPanel(400);
    await screen.rerender(tree({ onDismiss, dirty: true }));
    await layOutSheets();
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    await keepEditing(screen);
    expect(translateOf(screen)).toBe(0);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('(4) the keyboard shows and hides while "Discard changes?" is open: Keep editing still restores the panel', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const handlers = new Map<string, KbHandler[]>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, h: KbHandler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), h]);
      return { remove: jest.fn() };
    }) as never);
    const onDismiss = jest.fn();
    const screen = await render(tree({ dirty: true, onDismiss }));
    await advance(DURATION.sheetUp + 50);
    await act(async () => handlers.get('keyboardDidShow')!.forEach((h) => h({ endCoordinates: { height: 300 } })));
    await strandPanel(250);
    await act(async () => modalsOf(screen)[0].props.onRequestClose());
    await act(async () => handlers.get('keyboardDidHide')!.forEach((h) => h({ endCoordinates: { height: 0 } })));
    await keepEditing(screen);
    expect(translateOf(screen)).toBe(0);
    const pad = StyleSheet.flatten(screen.getAllByTestId('sheet-container', { hidden: true })[0]!.props.style).paddingBottom;
    expect(pad).toBe(space.sheetPadBottom + 10);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('(5) Discard closes once and leaves no backdrop; a leaving panel never has a tappable backdrop', async () => {
    const onDismiss = jest.fn();
    const onDiscard = jest.fn();
    const screen = await render(tree({ dirty: true, onDismiss, onDiscard }));
    await advance(DURATION.sheetUp + 50);
    await layOutSheets();
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    await fireEvent.press(screen.getByText('Discard', { hidden: true }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    await screen.rerender(tree({ visible: false, dirty: true, onDismiss, onDiscard }));
    expect(screen.queryAllByTestId('sheet-backdrop', { hidden: true })).toHaveLength(0);

    // A clean sheet dragged away: while it slides out its backdrop takes no taps.
    await screen.rerender(tree({ onDismiss, onDiscard }));
    await layOutSheets();
    await advance(DURATION.sheetUp + 50);
    expect(screen.getByTestId('sheet-backdrop', { hidden: true }).props.pointerEvents).toBe('auto');
    fireGestureHandler(getByGestureTestId('sheet-drag'), [
      { state: State.BEGAN, y: 10, translationY: 0 },
      { state: State.ACTIVE, y: 70, translationY: 60 },
      { state: State.END, y: 130, translationY: 120, velocityY: 0 },
    ]);
    await advance(20);
    expect(screen.getByTestId('sheet-backdrop', { hidden: true }).props.pointerEvents).toBe('none');
    await advance(SHEET_DISMISS_DELAY);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // The owner kept it open: the panel and a tappable backdrop come back together.
    await advance(DURATION.sheetUp + 50);
    expect(translateOf(screen)).toBe(0);
    expect(screen.getByTestId('sheet-backdrop', { hidden: true }).props.pointerEvents).toBe('auto');
  });

  it('DB-14: a clean sheet closes on the first Back and backdrop press, inside the handler', async () => {
    const onDismiss = jest.fn();
    const screen = await render(tree({ onDismiss }));
    await advance(DURATION.sheetUp + 50);
    await act(async () => {
      modalsOf(screen)[0].props.onRequestClose();
      expect(onDismiss).toHaveBeenCalledTimes(1); // no timer or animation wait
    });
    await layOutSheets();
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  // 06.1-81 (G-78-2): on the emulator the open-check sheet was left as a Modal holding only its gesture root and a full-screen
  // backdrop: no dim, no panel, and every tap swallowed. The open slide had run before the Modal's window was attached, so the
  // panel stayed below the screen. The backdrop now takes taps only once the panel has laid out, and that layout sets the slide again.
  it('G-78-2: a panel that never lays out never leaves a pointer-catching backdrop', async () => {
    const onDismiss = jest.fn();
    const screen = await render(tree({ onDismiss }));
    await advance(5000);
    expect(screen.getByTestId('sheet-backdrop', { hidden: true }).props.pointerEvents).toBe('none');
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('G-78-2: the first layout brings a stranded panel up with its dim, then the backdrop takes taps', async () => {
    const onDismiss = jest.fn();
    const screen = await render(tree({ onDismiss }));
    // The lost open slide: the panel is still below the screen when the Modal's window shows.
    await strandPanel(5000);
    expect(translateOf(screen)).toBeGreaterThan(0);
    await layOutSheets();
    await advance(DURATION.sheetUp + 50);
    expect(translateOf(screen)).toBe(0);
    expect(getAnimatedStyle(screen.getByTestId('sheet-backdrop-fill', { hidden: true })).opacity).toBeGreaterThan(0);
    expect(screen.getByTestId('sheet-backdrop', { hidden: true }).props.pointerEvents).toBe('auto');
    // A later layout (keyboard, content) does not replay the slide.
    await strandPanel(100);
    await layOutSheets();
    await advance(DURATION.sheetUp + 50);
    expect(translateOf(screen)).toBe(100);
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('G-78-2: a closed and reopened sheet waits for its new panel’s layout before the backdrop takes taps', async () => {
    const onDismiss = jest.fn();
    const screen = await render(tree({ onDismiss }));
    await layOutSheets();
    expect(screen.getByTestId('sheet-backdrop', { hidden: true }).props.pointerEvents).toBe('auto');
    await screen.rerender(tree({ visible: false, onDismiss }));
    await screen.rerender(tree({ onDismiss }));
    expect(screen.getByTestId('sheet-backdrop', { hidden: true }).props.pointerEvents).toBe('none');
  });

  // 06.1-81 (G-74-2): a Back pressed while the sheet is still opening (before its Modal's window takes Back) reached the screen
  // under it and was lost, and then the sheet appeared. Until the panel lays out the sheet takes Back through BackHandler.
  it('G-74-2: Android Back while the sheet is opening closes it; once it has laid out the Modal handles Back', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const listeners: (() => boolean)[] = [];
    const remove = jest.fn();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_name: string, h: () => boolean) => {
      listeners.push(h);
      return { remove };
    }) as never);
    const onDismiss = jest.fn();
    await render(tree({ onDismiss }));
    expect(listeners).toHaveLength(1);
    let handled = false;
    await act(async () => {
      handled = listeners[0]!();
    });
    expect(handled).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await layOutSheets();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('G-74-2: Back while a dirty sheet is opening asks first, as the Modal’s Back does', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const listeners: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_name: string, h: () => boolean) => {
      listeners.push(h);
      return { remove: jest.fn() };
    }) as never);
    const onDismiss = jest.fn();
    const screen = await render(tree({ dirty: true, onDismiss }));
    await act(async () => {
      listeners[0]!();
    });
    expect(screen.getByText('Discard changes?', { hidden: true })).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('a sheet that cannot be dismissed keeps its panel in view on Back', async () => {
    const onDismiss = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <Sheet visible dismissible={false} onDismiss={onDismiss}>
          <Text>{'Body'}</Text>
        </Sheet>
      </ThemeProvider>,
    );
    await advance(DURATION.sheetUp + 50);
    await strandPanel(200);
    await act(async () => modalsOf(screen)[0].props.onRequestClose());
    await advance(DURATION.sheetUp + 50);
    expect(translateOf(screen)).toBe(0);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
