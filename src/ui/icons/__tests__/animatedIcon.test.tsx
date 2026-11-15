// 06.2-06 (D-25, D-15, D-17): the play-once animated icon and its still-icon fallback.
import React from 'react';
import { UIManager } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { AnimatedIcon, lottieAvailable, resetAnimatedIcons } from '../AnimatedIcon';

let mockReduced = false;
let mockThrow = false;
let mockFinish: ((cancelled: boolean) => void) | null = null;
const mockLottieProps: Record<string, unknown>[] = [];

jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useMotion: () => ({ reduced: mockReduced, duration: (ms: number) => ms, easing: undefined, fade: (ms: number) => ms }),
}));

jest.mock('lottie-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (p: Record<string, unknown>) => {
      if (mockThrow) throw new Error('native view missing');
      mockLottieProps.push(p);
      mockFinish = p.onAnimationFinish as typeof mockFinish;
      return React.createElement(View, { testID: 'lottie-view', ...p });
    },
  };
});

// Other suites share the machine; the render cases can be slow under load.
jest.setTimeout(30000);

const H = { includeHiddenElements: true };
const SOURCE = { v: '5.7.0', layers: [] };
const ui = UIManager as unknown as { hasViewManagerConfig: (name: string) => boolean };
let hasView: jest.SpyInstance;

function setNative(present: boolean) {
  hasView = jest.spyOn(ui, 'hasViewManagerConfig').mockImplementation((name: string) => present && name === 'LottieAnimationView');
}

beforeEach(() => {
  resetAnimatedIcons();
  mockReduced = false;
  mockThrow = false;
  mockFinish = null;
  mockLottieProps.length = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('lottieAvailable (D-25)', () => {
  it('is false when the native view is not registered, and cached', () => {
    setNative(false);
    expect(lottieAvailable()).toBe(false);
    const calls = hasView.mock.calls.length;
    expect(lottieAvailable()).toBe(false);
    expect(hasView.mock.calls.length).toBe(calls);
  });

  it('is true when the native view is registered', () => {
    setNative(true);
    expect(lottieAvailable()).toBe(true);
  });

  it('is false (never throws) when the check itself throws', () => {
    jest.spyOn(ui, 'hasViewManagerConfig').mockImplementation(() => {
      throw new Error('no UIManager');
    });
    expect(lottieAvailable()).toBe(false);
  });
});

describe('AnimatedIcon', () => {
  it('shows the still Glyph on a build without the native view (D-25)', async () => {
    setNative(false);
    await render(<AnimatedIcon source={SOURCE} still="savings" color="#123456" testID="icon" />);
    expect(screen.getByTestId('icon-still', H)).toBeTruthy();
    expect(screen.queryByTestId('lottie-view', H)).toBeNull();
  });

  it('plays once: autoPlay, loop false, speed 1', async () => {
    setNative(true);
    await render(<AnimatedIcon source={SOURCE} still="savings" color="#123456" testID="icon" />);
    expect(screen.getByTestId('icon-lottie', H)).toBeTruthy();
    expect(mockLottieProps[0]).toMatchObject({ autoPlay: true, loop: false, speed: 1, source: SOURCE });
    expect(screen.queryByTestId('icon-still', H)).toBeNull();
  });

  it('falls back to the still Glyph when the Lottie view throws (error boundary)', async () => {
    setNative(true);
    mockThrow = true;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await render(<AnimatedIcon source={SOURCE} still="savings" color="#123456" testID="icon" />);
    expect(screen.getByTestId('icon-still', H)).toBeTruthy();
    spy.mockRestore();
    // the slot was released: a later icon can play
    mockThrow = false;
    await render(<AnimatedIcon source={SOURCE} still="savings" color="#123456" testID="next" />);
    expect(screen.getByTestId('next-lottie', H)).toBeTruthy();
  });

  it('shows the last frame (still Glyph) and never plays under Reduce Motion (D-17)', async () => {
    setNative(true);
    mockReduced = true;
    await render(<AnimatedIcon source={SOURCE} still="savings" color="#123456" testID="icon" />);
    expect(screen.getByTestId('icon-still', H)).toBeTruthy();
    expect(mockLottieProps).toHaveLength(0);
  });

  it('one at a time: a second icon shows its Glyph while the first plays (D-15)', async () => {
    setNative(true);
    await render(
      <>
        <AnimatedIcon source={SOURCE} still="savings" color="#123456" testID="a" />
        <AnimatedIcon source={SOURCE} still="savings" color="#123456" testID="b" />
      </>,
    );
    expect(screen.getByTestId('a-lottie', H)).toBeTruthy();
    expect(screen.getByTestId('b-still', H)).toBeTruthy();
  });

  it('onAnimationFinish releases the slot for the next icon', async () => {
    setNative(true);
    await render(<AnimatedIcon source={SOURCE} still="savings" color="#123456" testID="a" />);
    await act(() => {
      mockFinish?.(false);
    });
    await render(<AnimatedIcon source={SOURCE} still="savings" color="#123456" testID="b" />);
    expect(screen.getByTestId('b-lottie', H)).toBeTruthy();
  });

  it('unmount releases the slot', async () => {
    setNative(true);
    const first = await render(<AnimatedIcon source={SOURCE} still="savings" color="#123456" testID="a" />);
    await first.unmount();
    await render(<AnimatedIcon source={SOURCE} still="savings" color="#123456" testID="b" />);
    expect(screen.getByTestId('b-lottie', H)).toBeTruthy();
  });

  it('is hidden from accessibility (the word beside it carries the meaning)', async () => {
    setNative(true);
    await render(<AnimatedIcon source={SOURCE} still="savings" color="#123456" size={48} testID="icon" />);
    const box = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(box.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(box.props.accessibilityElementsHidden).toBe(true);
    expect(box.props.style).toMatchObject({ width: 48, height: 48 });
  });
});
