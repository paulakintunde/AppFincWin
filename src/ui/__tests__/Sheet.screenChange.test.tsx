/**
 * 06.1-84 (G-61-1): a sheet opened as part of a screen change (Fix on "What is <account> for?" opens Records and its accounts
 * sheet on arrival; the plan sheet on a busy answer) was left with only its gesture root and backdrop: the panel below the
 * screen and the dim at 0, for 20 s and more.
 *
 * Root cause: the open slide and the dim live only in Reanimated's props registry. What React commits for the panel is the
 * first render's animated style, the closed position (translateY = window height, dim 0). Reanimated 4.5 hands a settled
 * animation's last values back to React from a 500 ms JS interval (FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS), and it drops
 * registry entries older than 2 s before it collects the ones older than 1 s. When the JS thread is busy for more than about
 * 1.5 s right after the slide settles (a Decide screen mounting and running its reads), the open values are dropped without
 * ever reaching React, and the next React commit of the panel puts it back where React thinks it is: closed.
 *
 * The fix: once the open slide has finished, the Sheet commits the rest position (translateY 0, the dim on) itself, so
 * whatever Reanimated keeps or drops, React's own props show the panel. Before that, React still commits the closed
 * position, so a slow first frame never flashes the panel before it slides.
 */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { getAnimatedStyle } from 'react-native-reanimated';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DURATION } from '@/theme/motion';
import { resetSheetStackForTests } from '@/state/sheetStack';
import { layOutSheets } from '@/test/sheetLayout';
import { Sheet } from '../Sheet';
import { BACKDROP_OPACITY } from '../sheetDrag';

jest.setTimeout(30000);

jest.mock('../haptics');
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  resetSheetStackForTests();
});
afterEach(() => {
  jest.useRealTimers();
});

type Screen = Awaited<ReturnType<typeof render>>;

/** What React itself commits for the panel (the props Fabric mounts from), not Reanimated's animated overlay. */
const committedTranslate = (screen: Screen): number => {
  const flat = StyleSheet.flatten(screen.getAllByTestId('sheet-container', { hidden: true })[0]!.props.style) as {
    transform?: { translateY?: number }[];
  };
  return flat.transform?.[0]?.translateY ?? 0;
};
const committedDim = (screen: Screen): number =>
  (StyleSheet.flatten(screen.getByTestId('sheet-backdrop-fill', { hidden: true }).props.style) as { opacity?: number }).opacity ?? 1;

/** A screen that is still settling: it re-renders its sheet (new children, new inline styles) after the sheet opened. */
function Records({ tick, onInside }: { tick: number; onInside?: () => void }) {
  return (
    <ThemeProvider>
      <Sheet visible onDismiss={jest.fn()} accessibilityLabel="Your accounts">
        <Text>{`Accounts ${tick}`}</Text>
        <Pressable testID="inside" accessibilityRole="button" onPress={onInside}>
          <Text>{'Inside'}</Text>
        </Pressable>
      </Sheet>
    </ThemeProvider>
  );
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('Sheet opened during a screen change (G-61-1)', () => {
  it('before the slide ends, React still commits the closed position (no flash of the panel)', async () => {
    const screen = await render(<Records tick={0} />);
    expect(committedTranslate(screen)).toBeGreaterThan(0);
    expect(committedDim(screen)).toBe(0);
  });

  it('after a long JS stall through the screen change, the screen re-renders and the committed panel is at rest with its dim', async () => {
    const onInside = jest.fn();
    const screen = await render(<Records tick={0} onInside={onInside} />);
    // The screen change holds the JS thread: the slide's frames and the panel's first layout arrive late and in one go.
    await advance(5000);
    await layOutSheets();
    // The screen under the sheet settles and renders again: this commit is the one that used to put the panel back down.
    await screen.rerender(<Records tick={1} onInside={onInside} />);
    await advance(100);
    expect(committedTranslate(screen)).toBe(0);
    expect(committedDim(screen)).toBeCloseTo(BACKDROP_OPACITY, 2);
    expect(screen.getByText('Accounts 1', { hidden: true })).toBeTruthy();
    expect(screen.getByTestId('sheet-backdrop', { hidden: true }).props.pointerEvents).toBe('auto');
    await fireEvent.press(screen.getByTestId('inside', { hidden: true }));
    expect(onInside).toHaveBeenCalledTimes(1);
  });

  it('a drag after the open still moves the panel (Reanimated keeps the live value over the committed rest)', async () => {
    const screen = await render(<Records tick={0} />);
    await advance(DURATION.sheetUp + 50);
    await layOutSheets();
    const handlers = (getByGestureTestId('sheet-drag') as any).handlers;
    await act(async () => {
      handlers.onBegin({ y: 10, translationY: 0 });
      handlers.onUpdate({ y: 90, translationY: 80 });
    });
    expect((getAnimatedStyle(screen.getAllByTestId('sheet-container', { hidden: true })[0]!).transform as { translateY: number }[])[0]!.translateY).toBe(80);
    // The committed rest is only the fallback when Reanimated has dropped its values; it does not move with the finger.
    expect(committedTranslate(screen)).toBe(0);
  });
});
