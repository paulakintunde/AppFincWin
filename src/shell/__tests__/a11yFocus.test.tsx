import React from 'react';
import { AccessibilityInfo, type HostInstance } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { DURATION } from '@/theme/motion';
import { focusAccessibility, useScreenTitleFocus } from '../a11yFocus';

jest.mock('expo-router', () => ({
  // Runs the focus callback on mount and its cleanup on unmount, like a focused screen.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(cb, [cb]);
  },
}));

const host = { id: 'title' } as unknown as HostInstance;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('focusAccessibility', () => {
  it('does nothing for a missing target', () => {
    const spy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    focusAccessibility(null);
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends a focus event to the host instance', () => {
    const spy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    focusAccessibility(host);
    expect(spy).toHaveBeenCalledWith(host, 'focus');
  });
});

describe('useScreenTitleFocus', () => {
  it('focuses the title after DURATION.push when a screen reader is on', async () => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    const ref = { current: host } as React.RefObject<HostInstance | null>;
    await renderHook(() => useScreenTitleFocus(ref));
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(DURATION.push);
      await Promise.resolve();
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(host, 'focus');
  });

  it('does nothing when no screen reader is on', async () => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    const ref = { current: host } as React.RefObject<HostInstance | null>;
    await renderHook(() => useScreenTitleFocus(ref));
    await act(async () => {
      jest.advanceTimersByTime(DURATION.push);
      await Promise.resolve();
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('clears the timer on cleanup', async () => {
    jest.useFakeTimers();
    const enabled = jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const ref = { current: host } as React.RefObject<HostInstance | null>;
    const { unmount } = await renderHook(() => useScreenTitleFocus(ref));
    await unmount();
    await act(async () => {
      jest.advanceTimersByTime(DURATION.push);
      await Promise.resolve();
    });
    expect(enabled).not.toHaveBeenCalled();
  });
});
