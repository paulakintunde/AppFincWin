// 08-25 (UI-SPEC Screen 9): the scope switch defaults to Mine and is kept per screen on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { figureScopeKey, useFigureScope } from '../useFigureScope';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('useFigureScope', () => {
  it('defaults to Mine', async () => {
    const { result } = await renderHook(() => useFigureScope('home'));
    expect(result.current[0]).toBe('mine');
  });

  it('keeps the choice under a fincwin: key, so sign-out clears it', async () => {
    expect(figureScopeKey('home')).toBe('fincwin:figureScope.home');
    const { result } = await renderHook(() => useFigureScope('home'));
    await act(async () => result.current[1]('household'));
    expect(result.current[0]).toBe('household');
    expect(await AsyncStorage.getItem('fincwin:figureScope.home')).toBe('household');
    const again = await renderHook(() => useFigureScope('home'));
    await act(async () => undefined);
    expect(again.result.current[0]).toBe('household');
  });

  it('a tap made before the stored read resolves is not overridden by it (IN-05)', async () => {
    await AsyncStorage.setItem('fincwin:figureScope.home', 'household');
    let release: (v: string | null) => void = () => undefined;
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise<string | null>((r) => (release = r)));
    const { result } = await renderHook(() => useFigureScope('home'));
    await act(async () => result.current[1]('mine'));
    await act(async () => release('household'));
    expect(result.current[0]).toBe('mine');
  });

  it('reads anything else as Mine, and a failed read keeps Mine', async () => {
    await AsyncStorage.setItem('fincwin:figureScope.home', 'nonsense');
    const { result } = await renderHook(() => useFigureScope('home'));
    await act(async () => undefined);
    expect(result.current[0]).toBe('mine');
    const spy = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    const failed = await renderHook(() => useFigureScope('home'));
    await act(async () => undefined);
    expect(failed.result.current[0]).toBe('mine');
    spy.mockRestore();
  });
});
