import { act, renderHook } from '@testing-library/react-native';
import { useSettledLabel } from '../useSettledLabel';

describe('useSettledLabel', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('intermediate labels are not announced while typing', async () => {
    const { result, rerender } = await renderHook(({ label }: { label: string }) => useSettledLabel(label, 'fits', 150), { initialProps: { label: 'a' } });
    await rerender({ label: 'ab' });
    await act(async () => { jest.advanceTimersByTime(100); });
    await rerender({ label: 'abc' });
    await act(async () => { jest.advanceTimersByTime(100); });
    expect(result.current).toBe('a');
    await act(async () => { jest.advanceTimersByTime(60); });
    expect(result.current).toBe('abc');
  });

  it('a state-chip change announces at once', async () => {
    const { result, rerender } = await renderHook(({ label, chip }: { label: string; chip: string }) => useSettledLabel(label, chip, 150), {
      initialProps: { label: 'fits', chip: 'fits' },
    });
    await rerender({ label: 'adjust', chip: 'adjust' });
    expect(result.current).toBe('adjust');
  });
});
