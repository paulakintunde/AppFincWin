// 06.1-81 re-review B: with Reduce Motion on, the sheet's open slide and backdrop fade take no time on every path that sets them in
// plain JS (the open, the first-layout re-slide, and the keep-editing restore), not the fixed DURATION.sheetUp.
import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DURATION } from '@/theme/motion';
import { Sheet } from '../Sheet';
import { layOutSheets } from '@/test/sheetLayout';

jest.setTimeout(30000);

jest.mock('../haptics');
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }),
}));

const mockTiming = jest.fn();
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return Object.assign({}, actual, {
    __esModule: true,
    withTiming: (to: unknown, config?: { duration?: number }, cb?: unknown) => {
      mockTiming(to, config?.duration);
      return actual.withTiming(to, config, cb);
    },
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

beforeEach(() => {
  jest.useFakeTimers();
  mockReduced = false;
  mockTiming.mockClear();
});
afterEach(() => jest.useRealTimers());

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function open(props: Partial<React.ComponentProps<typeof Sheet>> = {}) {
  const onDismiss = jest.fn();
  const screen = await render(
    <ThemeProvider>
      <Sheet visible onDismiss={onDismiss} {...props}>
        <Text>{'Body'}</Text>
      </Sheet>
    </ThemeProvider>,
  );
  return { screen, onDismiss };
}

/** Durations of the withTiming calls made since the last clear (the open slide to 0 and the backdrop fade in). */
const durations = (): (number | undefined)[] => mockTiming.mock.calls.map((c) => c[1] as number | undefined);

describe('Sheet under Reduce Motion', () => {
  it('opens and re-slides on first layout with no duration', async () => {
    mockReduced = true;
    await open();
    expect(mockTiming).toHaveBeenCalled();
    expect(durations().every((d) => d === 0)).toBe(true);
    mockTiming.mockClear();
    await layOutSheets();
    expect(mockTiming).toHaveBeenCalled();
    expect(durations().every((d) => d === 0)).toBe(true);
  });

  // RNTL 14 has no UNSAFE_getAllByType: the host Modal is the element carrying onRequestClose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backOf = (screen: { root: any }): (() => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = (el: any): any => {
      if (el?.props?.onRequestClose) return el;
      for (const c of el?.children ?? []) {
        if (typeof c === 'string') continue;
        const hit = walk(c);
        if (hit) return hit;
      }
      return null;
    };
    return () => walk(screen.root).props.onRequestClose();
  };

  it('the restore after a refused Back (keep editing) takes no time, before and after the panel is shown', async () => {
    mockReduced = true;
    const { screen, onDismiss } = await open({ dismissible: false });
    mockTiming.mockClear();
    // Before the panel reaches the screen: the restore replays the open slide.
    await act(async () => backOf(screen)());
    expect(mockTiming).toHaveBeenCalled();
    expect(durations().every((d) => d === 0)).toBe(true);
    await layOutSheets();
    await advance(DURATION.sheetUp + 50);
    mockTiming.mockClear();
    // After it is shown: the restore snaps it back.
    await act(async () => backOf(screen)());
    expect(mockTiming).toHaveBeenCalled();
    expect(durations().every((d) => d === 0)).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('keeps the full slide when Reduce Motion is off', async () => {
    await open();
    await layOutSheets();
    expect(durations()).toContain(DURATION.sheetUp);
    expect(durations()).toContain(DURATION.backdrop);
  });
});
