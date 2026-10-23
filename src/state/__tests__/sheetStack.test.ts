import { act, renderHook } from '@testing-library/react-native';
import { wipeDeviceData } from '@/services/storage/wipe';
import {
  getSheetStack,
  markMounted,
  markUnmounted,
  noteVisible,
  prune,
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

  it('D-85 the watchdog drops ids whose sheet is not mounted', () => {
    pushSheet('a');
    pushSheet('b');
    markMounted('a');
    expect(prune(0)).toBe(1);
    expect(getSheetStack()).toEqual(['a']);
    markUnmounted('a');
    expect(prune(1)).toBe(1);
    expect(getSheetStack()).toEqual([]);
  });

  it('D-85 a stale stack is cleared after 1 s with nothing visible', () => {
    pushSheet('a');
    expect(noteVisible(0, false)).toBe(0);
    expect(noteVisible(1000, false)).toBe(0);
    expect(getSheetStack()).toEqual(['a']);
    expect(noteVisible(1001, false)).toBe(1);
    expect(getSheetStack()).toEqual([]);
  });

  it('D-85 a visible sheet resets the stale timer', () => {
    pushSheet('a');
    noteVisible(0, false);
    noteVisible(900, true);
    expect(noteVisible(1500, false)).toBe(0);
    expect(getSheetStack()).toEqual(['a']);
  });
});
