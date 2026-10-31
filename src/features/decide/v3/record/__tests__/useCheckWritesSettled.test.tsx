/** 05.3-74: the settled gate reads in-flight create / draft-save mutations for one check id. */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { MutationObserver, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mutationKeys } from '@/data/keys';
import { useCheckWritesSettled } from '../useCheckWritesSettled';

jest.setTimeout(60000);

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

function start(key: readonly string[], id: string) {
  let resolve: () => void = () => undefined;
  const fn = (_vars: { id: string }) => new Promise<void>((r) => { resolve = r; });
  const obs = new MutationObserver(client, { mutationKey: key, mutationFn: fn });
  void obs.mutate({ id }).catch(() => undefined);
  return () => resolve();
}

beforeEach(() => {
  client = new QueryClient();
  onlineManager.setOnline(true);
});
afterEach(() => {
  client.clear();
  onlineManager.setOnline(true);
});

describe('useCheckWritesSettled', () => {
  it('is true with no mutations', async () => {
    const { result } = await renderHook(() => useCheckWritesSettled('c1'), { wrapper });
    expect(result.current).toBe(true);
  });

  it('is false while a draft save for this id is pending, true once it succeeds', async () => {
    const { result } = await renderHook(() => useCheckWritesSettled('c1'), { wrapper });
    let finish: () => void = () => undefined;
    await act(async () => { finish = start(mutationKeys.saveCheckDraft, 'c1'); });
    await waitFor(() => expect(result.current).toBe(false));
    await act(async () => { finish(); });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is false while a create for this id is pending', async () => {
    const { result } = await renderHook(() => useCheckWritesSettled('c1'), { wrapper });
    await act(async () => { start(mutationKeys.createCheck, 'c1'); });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('ignores a save for another id', async () => {
    const { result } = await renderHook(() => useCheckWritesSettled('c1'), { wrapper });
    await act(async () => { start(mutationKeys.saveCheckDraft, 'c2'); });
    expect(result.current).toBe(true);
  });

  it('treats a paused (offline) save as settled', async () => {
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useCheckWritesSettled('c1'), { wrapper });
    await act(async () => { start(mutationKeys.saveCheckDraft, 'c1'); });
    expect(result.current).toBe(true);
  });
});
