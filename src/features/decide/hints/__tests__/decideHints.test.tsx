import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import * as motion from '@/theme/motion';
import { STORAGE_PREFIX, wipeDeviceData } from '@/services/storage/wipe';
import { FoldHint } from '../../ui/FoldHint';
import {
  decideHintsKey,
  loadFoldHintSeen,
  loadHomeBasisSeen,
  loadJudgeOn,
  markFoldHintSeen,
  markHomeBasisSeen,
  saveJudgeOn,
} from '../decideHints';
import { useFoldHint } from '../useFoldHint';

jest.setTimeout(30000);

const USER = 'user-1';
const HINT = 'Tap a row to see the detail';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

function wrap(visible: boolean) {
  return (
    <ThemeProvider>
      <FontScaleProvider value={1}>
        <FoldHint visible={visible} />
      </FontScaleProvider>
    </ThemeProvider>
  );
}

describe('decideHints store', () => {
  it('D-75 the hint key is per user and wiped with local data', () => {
    expect(decideHintsKey(USER)).toBe('fincwin:decide-hints:user-1');
    expect(decideHintsKey(USER).startsWith(STORAGE_PREFIX)).toBe(true);
    expect(decideHintsKey('a')).not.toBe(decideHintsKey('b'));
  });

  it('D-75 a read failure counts as not seen', async () => {
    expect(await loadFoldHintSeen(USER)).toBe(false);
    await AsyncStorage.setItem(decideHintsKey(USER), 'not json');
    expect(await loadFoldHintSeen(USER)).toBe(false);
    await AsyncStorage.setItem(decideHintsKey(USER), JSON.stringify({ v: 2, foldHintSeen: true }));
    expect(await loadFoldHintSeen(USER)).toBe(false);
    await AsyncStorage.setItem(decideHintsKey(USER), JSON.stringify({ v: 1, foldHintSeen: true }));
    expect(await loadFoldHintSeen(USER)).toBe(true);
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('read'));
    expect(await loadFoldHintSeen(USER)).toBe(false);
  });

  it('D-75 a write failure is swallowed', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('write'));
    await expect(markFoldHintSeen(USER)).resolves.toBeUndefined();
  });
});

describe('homeBasisSeen', () => {
  it('D-95 homeBasisSeen shares the hints record without clearing the fold hint', async () => {
    expect(await loadHomeBasisSeen(USER)).toBe(false);
    await markFoldHintSeen(USER);
    await markHomeBasisSeen(USER);
    expect(await loadFoldHintSeen(USER)).toBe(true);
    expect(await loadHomeBasisSeen(USER)).toBe(true);
    expect(JSON.parse((await AsyncStorage.getItem(decideHintsKey(USER))) as string)).toEqual({ v: 1, foldHintSeen: true, homeBasisSeen: true });
    // the other order, and one flag alone, keep the v1 shape
    await AsyncStorage.clear();
    await markHomeBasisSeen(USER);
    expect(await AsyncStorage.getItem(decideHintsKey(USER))).toBe('{"v":1,"homeBasisSeen":true}');
    expect(await loadFoldHintSeen(USER)).toBe(false);
    await markFoldHintSeen(USER);
    expect(await loadHomeBasisSeen(USER)).toBe(true);
    expect(await loadFoldHintSeen(USER)).toBe(true);
    // another user is untouched
    expect(await loadHomeBasisSeen('user-2')).toBe(false);
  });

  it('D-95 a failed read counts as not seen', async () => {
    expect(await loadHomeBasisSeen(USER)).toBe(false);
    await AsyncStorage.setItem(decideHintsKey(USER), 'not json');
    expect(await loadHomeBasisSeen(USER)).toBe(false);
    await AsyncStorage.setItem(decideHintsKey(USER), JSON.stringify({ v: 2, homeBasisSeen: true }));
    expect(await loadHomeBasisSeen(USER)).toBe(false);
    await AsyncStorage.setItem(decideHintsKey(USER), JSON.stringify({ v: 1, homeBasisSeen: true }));
    expect(await loadHomeBasisSeen(USER)).toBe(true);
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('read'));
    expect(await loadHomeBasisSeen(USER)).toBe(false);
  });

  it('D-95 marking over an unreadable record starts a fresh v1 record, and a write failure is swallowed', async () => {
    await AsyncStorage.setItem(decideHintsKey(USER), 'not json');
    await markHomeBasisSeen(USER);
    expect(await AsyncStorage.getItem(decideHintsKey(USER))).toBe('{"v":1,"homeBasisSeen":true}');
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('write'));
    await expect(markHomeBasisSeen(USER)).resolves.toBeUndefined();
  });
});

describe('useFoldHint', () => {
  it('D-75 dismiss hides the hint and writes v1 once', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    setItem.mockClear();
    const { result } = await renderHook(() => useFoldHint(USER));
    await waitFor(() => expect(result.current.visible).toBe(true));
    await act(async () => result.current.dismiss());
    expect(result.current.visible).toBe(false);
    await act(async () => result.current.dismiss());
    await waitFor(() => expect(setItem).toHaveBeenCalledTimes(1));
    expect(await AsyncStorage.getItem(decideHintsKey(USER))).toBe('{"v":1,"foldHintSeen":true}');
  });

  it('D-75 a seen hint stays hidden', async () => {
    await markFoldHintSeen(USER);
    const { result } = await renderHook(() => useFoldHint(USER));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.visible).toBe(false);
  });

  it('D-75 no user, no hint', async () => {
    const getItem = jest.spyOn(AsyncStorage, 'getItem');
    getItem.mockClear();
    const { result } = await renderHook(() => useFoldHint(null));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.visible).toBe(false);
    await act(async () => result.current.dismiss());
    expect(getItem).not.toHaveBeenCalled();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});

describe('judge-on record', () => {
  it('D-107 the judge-on choice round-trips per user', async () => {
    await saveJudgeOn('a', 'worst');
    await saveJudgeOn('b', 'average');
    expect(await loadJudgeOn('a')).toBe('worst');
    expect(await loadJudgeOn('b')).toBe('average');
    expect(await loadJudgeOn('c')).toBeNull();
  });

  it('D-107 a missing, unreadable or invalid stored choice loads as null', async () => {
    expect(await loadJudgeOn(USER)).toBeNull();
    await AsyncStorage.setItem(decideHintsKey(USER), JSON.stringify({ v: 1, judgeOn: 'best' }));
    expect(await loadJudgeOn(USER)).toBeNull();
    await AsyncStorage.setItem(decideHintsKey(USER), '{not json');
    expect(await loadJudgeOn(USER)).toBeNull();
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('boom'));
    expect(await loadJudgeOn(USER)).toBeNull();
  });

  it('D-107 saving the choice keeps the other flags and they keep it', async () => {
    await markFoldHintSeen(USER);
    await saveJudgeOn(USER, 'month');
    expect(await loadFoldHintSeen(USER)).toBe(true);
    expect(await loadJudgeOn(USER)).toBe('month');
    await markHomeBasisSeen(USER);
    expect(await loadJudgeOn(USER)).toBe('month');
    expect(await loadHomeBasisSeen(USER)).toBe(true);
  });

  it('D-107 a failed write is swallowed', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await expect(saveJudgeOn(USER, 'worst')).resolves.toBeUndefined();
  });

  it('D-107 the record sits under the fincwin: prefix so wipeDeviceData clears it', async () => {
    await saveJudgeOn(USER, 'worst');
    expect(await AsyncStorage.getItem(decideHintsKey(USER))).not.toBeNull();
    await wipeDeviceData();
    expect(await loadJudgeOn(USER)).toBeNull();
  });
});

describe('FoldHint', () => {
  it('D-75 the hint tile reads Tap a row to see the detail', async () => {
    const view = await render(wrap(true));
    expect(screen.getByText(HINT)).toBeTruthy();
    await view.rerender(wrap(false));
    // Reanimated's jest mock drops the exiting animation, so the tile is gone at once.
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it('D-75 the hint is not a live region', async () => {
    jest.spyOn(motion, 'useReduceMotion').mockReturnValue(true);
    await render(wrap(true));
    const node = screen.getByText(HINT);
    expect(node.props.accessibilityLiveRegion).toBeUndefined();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
