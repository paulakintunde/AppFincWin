import { AccessibilityInfo, type EmitterSubscription } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMotion } from '../motion';

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
