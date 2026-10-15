import { act, renderHook } from '@testing-library/react-native';
import { wipeDeviceData } from '@/services/storage/wipe';
import {
  getSheetStack,
  pushSheet,
  removeSheet,
  resetSheetStackForTests,
  useIsTopSheet,
  useSheetCount,
  useTopSheetId,
} from '../sheetStack';

describe('sheetStack', () => {
  beforeEach(() => {
    resetSheetStackForTests();
  });

  it('tracks open order and the top sheet', async () => {
    const { result } = await renderHook(() => ({
      count: useSheetCount(),
      top: useTopSheetId(),
      aTop: useIsTopSheet('a'),
      bTop: useIsTopSheet('b'),
    }));
    await act(() => {
      pushSheet('a');
      pushSheet('b');
    });
    expect(getSheetStack()).toEqual(['a', 'b']);
    expect(result.current).toEqual({ count: 2, top: 'b', aTop: false, bTop: true });
  });

  it('ignores duplicate pushes and unknown removes, and exposes the lower sheet after removal', async () => {
    const { result } = await renderHook(() => useTopSheetId());
    await act(() => {
      pushSheet('a');
      pushSheet('b');
      pushSheet('a');
    });
    expect(getSheetStack()).toEqual(['a', 'b']);
    await act(() => {
      removeSheet('b');
    });
    expect(result.current).toBe('a');
  });

  it('keeps the snapshot reference when nothing changes', () => {
    pushSheet('a');
    const before = getSheetStack();
    removeSheet('zzz');
    pushSheet('a');
    expect(getSheetStack()).toBe(before);
  });

  it('does not notify on an unknown remove', async () => {
    let renders = 0;
    await renderHook(() => {
      renders += 1;
      return useSheetCount();
    });
    const base = renders;
    await act(() => {
      removeSheet('nope');
    });
    expect(renders).toBe(base);
  });

  it('is emptied by the wipe handler', async () => {
    pushSheet('a');
    await wipeDeviceData();
    expect(getSheetStack()).toEqual([]);
  });

  it('is emptied by resetSheetStackForTests', () => {
    pushSheet('a');
    resetSheetStackForTests();
    expect(getSheetStack()).toEqual([]);
  });
});
