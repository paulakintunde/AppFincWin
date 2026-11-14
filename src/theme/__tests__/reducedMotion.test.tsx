import React from 'react';
import { AccessibilityInfo, StyleSheet, Text, type EmitterSubscription } from 'react-native';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { DURATION, useMotion } from '../motion';
import { FadeIn } from '@/ui/motion/FadeIn';
import { FadeSwap } from '@/ui/motion/FadeSwap';

function mockAccessibilityInfo(initial: boolean) {
  let listener: ((value: boolean) => void) | null = null;

  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(initial);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, handler) => {
    listener = handler as unknown as (value: boolean) => void;
    return { remove: jest.fn() } as unknown as EmitterSubscription;
  });

  return {
    fire(value: boolean) {
      listener?.(value);
    },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useMotion', () => {
  it('returns the real duration when reduce-motion is off', async () => {
    mockAccessibilityInfo(false);

    const { result } = await renderHook(() => useMotion());

    await waitFor(() => expect(result.current.reduced).toBe(false));
    expect(result.current.duration(220)).toBe(220);
  });

  it('collapses every duration to 0 when reduce-motion is on', async () => {
    mockAccessibilityInfo(true);

    const { result } = await renderHook(() => useMotion());

    await waitFor(() => expect(result.current.reduced).toBe(true));
    expect(result.current.duration(220)).toBe(0);
  });

  it('flips to 0 live when the reduceMotionChanged event fires mid-session', async () => {
    const mocked = mockAccessibilityInfo(false);

    const { result } = await renderHook(() => useMotion());

    await waitFor(() => expect(result.current.reduced).toBe(false));
    expect(result.current.duration(220)).toBe(220);

    await act(() => {
      mocked.fire(true);
    });

    expect(result.current.reduced).toBe(true);
    expect(result.current.duration(220)).toBe(0);
  });
});

describe('useMotion().fade (06.2 D-17)', () => {
  it('keeps the given fade length when reduce-motion is off', async () => {
    mockAccessibilityInfo(false);
    const { result } = await renderHook(() => useMotion());
    await waitFor(() => expect(result.current.reduced).toBe(false));
    expect(result.current.fade(DURATION.appear)).toBe(DURATION.appear);
  });

  it('turns every fade into a quick DURATION.press fade when reduce-motion is on', async () => {
    mockAccessibilityInfo(true);
    const { result } = await renderHook(() => useMotion());
    await waitFor(() => expect(result.current.reduced).toBe(true));
    expect(result.current.fade(DURATION.appear)).toBe(DURATION.press);
    expect(result.current.fade(DURATION.swap)).toBe(DURATION.press);
  });
});

describe('FadeIn and FadeSwap under Reduce Motion (06.2 D-17)', () => {
  it('FadeIn is a plain opacity fade with no translate', async () => {
    mockAccessibilityInfo(true);
    await render(
      <FadeIn testID="fade-reduced">
        <Text>{'Body'}</Text>
      </FadeIn>,
    );
    await waitFor(() => expect(screen.getByTestId('fade-reduced')).toBeTruthy());
    const node = screen.getByTestId('fade-reduced');
    const style = StyleSheet.flatten(node.props.style) ?? {};
    expect(style).not.toHaveProperty('transform');
    expect(style).not.toHaveProperty('opacity');
  });

  it('FadeSwap changes value with a quick fade and never moves', async () => {
    mockAccessibilityInfo(true);
    jest.useFakeTimers();
    try {
      const view = await render(
        <FadeSwap value="a" testID="swap-reduced">
          <Text>{'a'}</Text>
        </FadeSwap>,
      );
      await view.rerender(
        <FadeSwap value="b" testID="swap-reduced">
          <Text>{'b'}</Text>
        </FadeSwap>,
      );
      await act(() => {
        jest.advanceTimersByTime(DURATION.press + 50);
      });
      const style = StyleSheet.flatten(screen.getByTestId('swap-reduced').props.style) ?? {};
      expect(style).not.toHaveProperty('transform');
      expect(style.opacity).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
