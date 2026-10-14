import React from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { getAnimatedStyle } from 'react-native-reanimated';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors } from '@/theme/tokens';
import { radii, size } from '@/theme/layout';
import { DURATION } from '@/theme/motion';
import { hapticSelection } from '../haptics';
import { Sheet, SheetScroll } from '../Sheet';
import { BACKDROP_OPACITY, SHEET_DISMISS_DELAY } from '../sheetDrag';

jest.setTimeout(30000);

jest.mock('../haptics');
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }),
}));

// The scroll handler is a worklet event ref that fireEvent cannot drive; swap in the plain function.
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return Object.assign({}, actual, {
    __esModule: true,
    useAnimatedScrollHandler: (h: unknown) => h,
  });
});

let mockReduced = false;
jest.mock('@/theme/motion', () => {
  const actual = jest.requireActual('@/theme/motion');
  return {
    ...actual,
    useMotion: () => ({
      reduced: mockReduced,
      duration: (ms: number) => (mockReduced ? 0 : ms),
      easing: actual.EASING,
    }),
  };
});

// RNTL 14 has no UNSAFE_getAllByType: collect the host Modals (the ones carrying onRequestClose).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function modalsOf(screen: { root: any }): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (el: any, out: any[] = []): any[] => {
    if (el?.props?.onRequestClose) out.push(el);
    for (const c of el?.children ?? []) if (typeof c !== 'string') walk(c, out);
    return out;
  };
  return walk(screen.root);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockReduced = false;
  (hapticSelection as jest.Mock).mockClear();
});
afterEach(() => jest.useRealTimers());

function drag(dy: number, velocityY = 0, startY = 10) {
  fireGestureHandler(getByGestureTestId('sheet-drag'), [
    { state: State.BEGAN, y: startY, translationY: 0 },
    { state: State.ACTIVE, y: startY + dy / 2, translationY: dy / 2 },
    { state: State.END, y: startY + dy, translationY: dy, velocityY },
  ]);
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

const translateOf = (screen: Awaited<ReturnType<typeof render>>) =>
  (getAnimatedStyle(screen.getByTestId('sheet-container')).transform as { translateY: number }[])[0]!.translateY;

async function mount(props: Partial<React.ComponentProps<typeof Sheet>> = {}, withScroll = false) {
  const onDismiss = jest.fn();
  const screen = await render(
    <ThemeProvider>
      <Sheet visible onDismiss={onDismiss} {...props}>
        {withScroll ? (
          <SheetScroll>
            <Text>{'Body'}</Text>
          </SheetScroll>
        ) : (
          <Text>{'Body'}</Text>
        )}
      </Sheet>
    </ThemeProvider>,
  );
  await advance(DURATION.sheetUp + 50);
  return { screen, onDismiss };
}

describe('Sheet drag to dismiss', () => {
  it('slides out, ticks a haptic and dismisses at 190ms, not before', async () => {
    const { screen, onDismiss } = await mount();
    drag(120);
    await advance(150);
    expect(translateOf(screen)).toBeGreaterThan(120);
    expect(hapticSelection).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    await advance(SHEET_DISMISS_DELAY - 150 + 1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('snaps back after a short drag', async () => {
    const { screen, onDismiss } = await mount();
    drag(60, 0);
    await advance(DURATION.sheetDrag + 50);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(translateOf(screen)).toBe(0);
  });

  it('dismisses on a fling', async () => {
    const { onDismiss } = await mount();
    drag(30, 1200);
    await advance(SHEET_DISMISS_DELAY + 1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss when the body was scrolled', async () => {
    const { screen, onDismiss } = await mount({}, true);
    const scroll = screen.getByTestId('sheet-scroll');
    await fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 40, width: 300, height: 200 } } });
    await fireEvent(scroll, 'scroll', { contentOffset: { y: 50 } });
    drag(120, 0, 100);
    await advance(SHEET_DISMISS_DELAY + 50);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('snaps back and ignores back and backdrop when dismissible is false', async () => {
    const { screen, onDismiss } = await mount({ dismissible: false });
    drag(120);
    await advance(SHEET_DISMISS_DELAY + DURATION.sheetDrag + 50);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(translateOf(screen)).toBe(0);
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    modalsOf(screen)[0].props.onRequestClose();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('restores the sheet and backdrop when the owner keeps it open after a drag dismissal', async () => {
    const { screen, onDismiss } = await mount();
    drag(120);
    await advance(SHEET_DISMISS_DELAY + 1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await advance(DURATION.sheetDrag + 100);
    expect(translateOf(screen)).toBe(0);
    expect(getAnimatedStyle(screen.getByTestId('sheet-backdrop-fill', { hidden: true })).opacity).toBeCloseTo(BACKDROP_OPACITY, 2);
  });

  it('puts a 44px handle with a 38x4 bar first in the container', async () => {
    const { screen } = await mount();
    const container = screen.getByTestId('sheet-container');
    const handle = screen.getByTestId('sheet-handle', { hidden: true });
    expect(container.children[0]).toBe(handle);
    const style = StyleSheet.flatten(handle.props.style);
    expect(style.height).toBe(size.sheetHandleHit);
    const barEl = handle.children[0] as unknown as { props: { style: never } };
    const bar = StyleSheet.flatten(barEl.props.style) as Record<string, unknown>;
    expect(bar.width).toBe(size.sheetHandleW);
    expect(bar.height).toBe(size.sheetHandleH);
    expect(bar.backgroundColor).toBe(colors.line2);
    expect(bar.borderRadius).toBe(radii.pill);
  });

  it('is modal for the screen reader and exposes an escape action', async () => {
    const { screen, onDismiss } = await mount();
    const container = screen.getByTestId('sheet-container');
    expect(container.props.accessibilityViewIsModal).toBe(true);
    expect(container.props.accessibilityActions).toEqual([{ name: 'escape', label: 'Close' }]);
    container.props.onAccessibilityEscape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    container.props.onAccessibilityAction({ nativeEvent: { actionName: 'escape' } });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('announces its label on open', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await mount({ accessibilityLabel: 'Add entry' });
    expect(spy).toHaveBeenCalledWith('Add entry');
    spy.mockRestore();
  });

  it('collapses the dismissal timer under reduced motion', async () => {
    mockReduced = true;
    const { onDismiss } = await mount();
    drag(120);
    await advance(1);
    await advance(0);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
