import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { wipeDeviceData } from '@/services/storage/wipe';
import { decideHintsKey, loadJudgeOn, loadJudgeOnDefaulted, markJudgeOnDefaulted, saveJudgeOn } from '../../hints/decideHints';
import { resetJudgeOnStoreForTest, useJudgeOn } from '../judgeOnStore';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
  resetJudgeOnStoreForTest();
});

describe('judgeOnStore', () => {
  it('D-107 judgeOn is null until the stored choice has been read', async () => {
    let release: (v: string | null) => void = () => undefined;
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise<string | null>((r) => (release = r)));
    const { result } = await renderHook(() => useJudgeOn('u1'));
    expect(result.current.judgeOn).toBeNull();
    await act(async () => release(null));
    expect(result.current.judgeOn).toBe('month');
  });

  it('D-107 with no stored choice the choice is month, whatever basis_override holds', async () => {
    // basis_override lives in settings and is never read here: nothing stored is month.
    const { result } = await renderHook(() => useJudgeOn('u1'));
    await waitFor(() => expect(result.current.judgeOn).toBe('month'));
  });

  it('D-107 a stored worst or average wins', async () => {
    await saveJudgeOn('u1', 'worst');
    await saveJudgeOn('u2', 'average');
    const a = await renderHook(() => useJudgeOn('u1'));
    await waitFor(() => expect(a.result.current.judgeOn).toBe('worst'));
    const b = await renderHook(() => useJudgeOn('u2'));
    await waitFor(() => expect(b.result.current.judgeOn).toBe('average'));
  });

  it('D-107 a rejected read counts as month', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useJudgeOn('u1'));
    await waitFor(() => expect(result.current.judgeOn).toBe('month'));
  });

  it('D-107 two mounted components see a change at once', async () => {
    const a = await renderHook(() => useJudgeOn('u1'));
    const b = await renderHook(() => useJudgeOn('u1'));
    await waitFor(() => expect(a.result.current.judgeOn).toBe('month'));
    await act(async () => a.result.current.setJudgeOn('average'));
    expect(b.result.current.judgeOn).toBe('average');
    expect(a.result.current.judgeOn).toBe('average');
  });

  it('D-107 setJudgeOn persists', async () => {
    const { result } = await renderHook(() => useJudgeOn('u1'));
    await waitFor(() => expect(result.current.judgeOn).toBe('month'));
    await act(async () => result.current.setJudgeOn('worst'));
    await waitFor(async () => expect(await loadJudgeOn('u1')).toBe('worst'));
    expect(await AsyncStorage.getItem(decideHintsKey('u1'))).toContain('worst');
  });

  it('D-107 switching user reloads and drops a late result for the old user', async () => {
    await saveJudgeOn('u2', 'average');
    let release: (v: string | null) => void = () => undefined;
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise<string | null>((r) => (release = r)));
    const { result, rerender } = await renderHook((p: { id: string }) => useJudgeOn(p.id), { initialProps: { id: 'u1' } });
    expect(result.current.judgeOn).toBeNull();
    await rerender({ id: 'u2' });
    await waitFor(() => expect(result.current.judgeOn).toBe('average'));
    await act(async () => release(JSON.stringify({ v: 1, judgeOn: 'worst' })));
    expect(result.current.judgeOn).toBe('average');
  });

  it('D-107 sign-out wipe resets the store', async () => {
    await saveJudgeOn('u1', 'worst');
    const { result } = await renderHook(() => useJudgeOn('u1'));
    await waitFor(() => expect(result.current.judgeOn).toBe('worst'));
    await act(async () => wipeDeviceData());
    expect(result.current.judgeOn).toBeNull();
  });

  it('D-107 userId null is month at once', async () => {
    const { result } = await renderHook(() => useJudgeOn(null));
    expect(result.current.judgeOn).toBe('month');
    await act(async () => result.current.setJudgeOn('worst'));
    expect(result.current.judgeOn).toBe('month');
  });

  it('D-107 the default switch is pending with nothing stored, and resolves once', async () => {
    const { result } = await renderHook(() => useJudgeOn('u1'));
    await waitFor(() => expect(result.current.judgeOn).toBe('month'));
    expect(result.current.pendingDefault).toBe(true);
    await act(async () => result.current.resolveDefault());
    expect(result.current.pendingDefault).toBe(false);
    await waitFor(async () => expect(await loadJudgeOnDefaulted('u1')).toBe(true));
  });

  it('D-107 the default switch is not pending once it is done', async () => {
    await markJudgeOnDefaulted('u1');
    const { result } = await renderHook(() => useJudgeOn('u1'));
    await waitFor(() => expect(result.current.judgeOn).toBe('month'));
    expect(result.current.pendingDefault).toBe(false);
  });

  it('D-107 the default switch is not pending when a choice is stored', async () => {
    await saveJudgeOn('u2', 'worst');
    const { result } = await renderHook(() => useJudgeOn('u2'));
    await waitFor(() => expect(result.current.judgeOn).toBe('worst'));
    expect(result.current.pendingDefault).toBe(false);
  });

  it('D-107 the user choosing, even This month, ends the pending default', async () => {
    const { result } = await renderHook(() => useJudgeOn('u3'));
    await waitFor(() => expect(result.current.pendingDefault).toBe(true));
    await act(async () => result.current.setJudgeOn('month'));
    expect(result.current.pendingDefault).toBe(false);
  });
});
