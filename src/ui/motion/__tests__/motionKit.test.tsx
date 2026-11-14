// 06.2-06 (D-15, D-16): the motion kit: timing steps, once-per-session, FadeIn, FadeSwap.
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { DURATION } from '@/theme/motion';
import { resetSessionMotion, useOncePerSession } from '../useOncePerSession';
import { FadeIn } from '../FadeIn';
import { FadeSwap } from '../FadeSwap';

let mockReduced = false;
jest.mock('@/theme/motion', () => {
  const actual = jest.requireActual('@/theme/motion');
  return {
    ...actual,
    useMotion: () => ({
      reduced: mockReduced,
      duration: (ms: number) => (mockReduced ? 0 : ms),
      easing: actual.EASING,
      fade: (ms: number) => (mockReduced ? actual.DURATION.press : ms),
    }),
  };
});

beforeEach(() => {
  mockReduced = false;
  resetSessionMotion();
});

describe('DURATION steps (D-15)', () => {
  it('has the six new steps and keeps the old ones', () => {
    expect(DURATION).toMatchObject({ press: 100, swap: 180, appear: 240, fill: 550, icon: 1200, toastOut: 150 });
    expect(DURATION).toMatchObject({ entrance: 220, progress: 550, fade: 200, tabSlide: 260, searchFade: 150 });
  });
});

describe('useOncePerSession', () => {
  it('is true for the first mount with a key and false for later mounts', async () => {
    const a = await renderHook(() => useOncePerSession('home.cards'));
    expect(a.result.current).toBe(true);
    const b = await renderHook(() => useOncePerSession('home.cards'));
    expect(b.result.current).toBe(false);
    const other = await renderHook(() => useOncePerSession('grow.rings'));
    expect(other.result.current).toBe(true);
  });

  it('keeps its answer across re-renders of the same mount', async () => {
    const a = await renderHook(() => useOncePerSession('k'));
    await a.rerender({});
    expect(a.result.current).toBe(true);
  });

  it('resetSessionMotion forgets every key', async () => {
    await renderHook(() => useOncePerSession('k'));
    resetSessionMotion();
    const again = await renderHook(() => useOncePerSession('k'));
    expect(again.result.current).toBe(true);
  });
});

describe('FadeIn (D-15)', () => {
  it('fades in with a layout entering animation on first view', async () => {
    await render(
      <FadeIn once="card.a" testID="fade">
        <Text>Hello</Text>
      </FadeIn>,
    );
    expect(screen.getByTestId('fade').props.entering).toBeDefined();
  });

  it('draws at once with no animation on a later view in the same session', async () => {
    await render(<FadeIn once="card.b" testID="first"><Text>One</Text></FadeIn>);
    await render(<FadeIn once="card.b" testID="second"><Text>Two</Text></FadeIn>);
    const second = screen.getByTestId('second');
    expect(second.props.entering).toBeUndefined();
    expect(StyleSheet.flatten(second.props.style) ?? {}).not.toHaveProperty('opacity');
  });

  it('without a once key it fades on every mount', async () => {
    await render(<FadeIn testID="a"><Text>A</Text></FadeIn>);
    await render(<FadeIn testID="b"><Text>B</Text></FadeIn>);
    expect(screen.getByTestId('b').props.entering).toBeDefined();
  });

  it('content is tappable from the first frame (no pointerEvents block, no opacity style)', async () => {
    const onPress = jest.fn();
    await render(
      <FadeIn once="card.c" testID="fade">
        <Pressable onPress={onPress} testID="btn"><Text>Tap</Text></Pressable>
      </FadeIn>,
    );
    const node = screen.getByTestId('fade');
    expect(node.props.pointerEvents).toBeUndefined();
    expect(StyleSheet.flatten(node.props.style) ?? {}).not.toHaveProperty('opacity');
    await fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('FadeSwap (D-16)', () => {
  const opacityOf = (id: string): unknown => (StyleSheet.flatten(screen.getByTestId(id).props.style) as { opacity?: unknown } | undefined)?.opacity;

  it('does not animate on first mount', async () => {
    await render(<FadeSwap value="$40" testID="swap"><Text>$40</Text></FadeSwap>);
    expect(opacityOf('swap')).toBe(1);
  });

  it('dips and returns to full opacity over DURATION.swap when the value changes', async () => {
    jest.useFakeTimers();
    try {
      const view = await render(<FadeSwap value="$40" testID="swap"><Text>$40</Text></FadeSwap>);
      await view.rerender(<FadeSwap value="$55" testID="swap"><Text>$55</Text></FadeSwap>);
      expect(screen.getByText('$55')).toBeTruthy();
      await act(() => {
        jest.advanceTimersByTime(DURATION.swap + 50);
      });
      expect(opacityOf('swap')).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a re-render with the same value starts nothing', async () => {
    const view = await render(<FadeSwap value="$40" testID="swap"><Text>$40</Text></FadeSwap>);
    await view.rerender(<FadeSwap value="$40" testID="swap"><Text>$40</Text></FadeSwap>);
    expect(opacityOf('swap')).toBe(1);
  });
});
