import { act, renderHook } from '@testing-library/react-native';
import { DETAILS_DEBOUNCE_MS, useDebouncedValue } from '../useDebouncedValue';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useDebouncedValue', () => {
  it('returns the first value immediately', async () => {
    const { result } = await renderHook(() => useDebouncedValue('a'));
    expect(result.current).toBe('a');
  });

  it('follows the input 150 ms after it stops changing', async () => {
    const { result, rerender } = await renderHook((p: { v: string }) => useDebouncedValue(p.v), { initialProps: { v: 'a' } });
    await rerender({ v: 'b' });
    expect(result.current).toBe('a');
    await act(async () => {
      jest.advanceTimersByTime(DETAILS_DEBOUNCE_MS - 1);
    });
    expect(result.current).toBe('a');
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
  });

  it('restarts the wait on each change and keeps only the last value', async () => {
    const { result, rerender } = await renderHook((p: { v: number }) => useDebouncedValue(p.v), { initialProps: { v: 0 } });
    for (const v of [1, 2, 3]) {
      await rerender({ v });
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      expect(result.current).toBe(0);
    }
    await act(async () => {
      jest.advanceTimersByTime(DETAILS_DEBOUNCE_MS);
    });
    expect(result.current).toBe(3);
  });

  it('does not update after unmount', async () => {
    const { rerender, unmount } = await renderHook((p: { v: number }) => useDebouncedValue(p.v), { initialProps: { v: 0 } });
    await rerender({ v: 1 });
    await unmount();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      jest.advanceTimersByTime(DETAILS_DEBOUNCE_MS * 2);
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
