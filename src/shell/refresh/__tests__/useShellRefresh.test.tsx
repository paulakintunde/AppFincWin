import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { runShellRefresh, useShellRefresh } from '../useShellRefresh';

const KEY = ['refresh-test', 'a'] as const;
const KEY2 = ['refresh-test', 'b'] as const;

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

type Fetcher = () => Promise<unknown>;

async function setup(fetchers: Record<string, Fetcher>, keys: readonly (readonly string[])[]) {
  const qc = makeClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  // A fixed-length observer hook per key list (the lists are constant within a test).
  const observer = await renderHook(
    () => {
      for (const k of keys) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useQuery({ queryKey: k, queryFn: fetchers[k.join('/')]!, staleTime: Infinity });
      }
    },
    { wrapper },
  );
  return { qc, wrapper, observer };
}

beforeEach(() => resetToastForTests());

describe('runShellRefresh', () => {
  it('resumes paused mutations once, then refetches each active key once', async () => {
    const order: string[] = [];
    const fa = jest.fn(async () => ({ n: 1 }));
    const fb = jest.fn(async () => ({ n: 2 }));
    const { qc } = await setup({ 'refresh-test/a': fa, 'refresh-test/b': fb }, [KEY, KEY2]);
    await waitFor(() => expect(qc.getQueryData(KEY)).toBeDefined());
    await waitFor(() => expect(qc.getQueryData(KEY2)).toBeDefined());
    fa.mockClear();
    fb.mockClear();
    jest.spyOn(qc, 'resumePausedMutations').mockImplementation(async () => {
      order.push('resume');
      return [];
    });
    const refetch = jest.spyOn(qc, 'refetchQueries');
    fa.mockImplementation(async () => {
      order.push('fetch');
      return { n: 1 };
    });
    await runShellRefresh(qc, [KEY, KEY2]);
    expect(qc.resumePausedMutations).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(refetch).toHaveBeenCalledWith({ queryKey: KEY, type: 'active' });
    expect(order[0]).toBe('resume');
    expect(fa).toHaveBeenCalledTimes(1);
  });

  it('structurally equal payload -> nothingNew toast', async () => {
    const f = jest.fn(async () => ({ rows: [1, 2, 3] }));
    const { qc } = await setup({ 'refresh-test/a': f }, [KEY]);
    await waitFor(() => expect(qc.getQueryData(KEY)).toBeDefined());
    const outcome = await runShellRefresh(qc, [KEY]);
    expect(outcome).toBe('nothingNew');
    expect(getToast()?.text?.key).toBe('refresh.nothingNew');
  });

  it('a changed payload -> updated toast of kind info', async () => {
    let v = 1;
    const f = jest.fn(async () => ({ v }));
    const { qc } = await setup({ 'refresh-test/a': f }, [KEY]);
    await waitFor(() => expect(qc.getQueryData(KEY)).toBeDefined());
    v = 2;
    const outcome = await runShellRefresh(qc, [KEY]);
    expect(outcome).toBe('updated');
    expect(getToast()?.text?.key).toBe('refresh.updated');
    expect(getToast()?.kind).toBe('info');
  });

  it('a refetch that errors -> failed, no toast, no throw', async () => {
    let fail = false;
    const f = jest.fn(async () => {
      if (fail) throw new Error('offline');
      return { v: 1 };
    });
    const { qc } = await setup({ 'refresh-test/a': f }, [KEY]);
    await waitFor(() => expect(qc.getQueryData(KEY)).toBeDefined());
    fail = true;
    await expect(runShellRefresh(qc, [KEY])).resolves.toBe('failed');
    expect(getToast()).toBeNull();
  });

  it('resumePausedMutations rejecting still refetches', async () => {
    let v = 1;
    const f = jest.fn(async () => ({ v }));
    const { qc } = await setup({ 'refresh-test/a': f }, [KEY]);
    await waitFor(() => expect(qc.getQueryData(KEY)).toBeDefined());
    jest.spyOn(qc, 'resumePausedMutations').mockRejectedValue(new Error('boom'));
    v = 2;
    await expect(runShellRefresh(qc, [KEY])).resolves.toBe('updated');
  });
});

describe('useShellRefresh', () => {
  it('refreshing is true in flight and false after, even after failure', async () => {
    let fail = false;
    let release: () => void = () => {};
    const f = jest.fn(async () => {
      if (fail) {
        await new Promise<void>((r) => (release = r));
        throw new Error('x');
      }
      return { v: 1 };
    });
    const { qc, wrapper } = await setup({ 'refresh-test/a': f }, [KEY]);
    await waitFor(() => expect(qc.getQueryData(KEY)).toBeDefined());
    const { result } = await renderHook(() => useShellRefresh([KEY]), { wrapper });
    expect(result.current.refreshing).toBe(false);
    fail = true;
    let p: Promise<unknown> = Promise.resolve();
    await act(async () => {
      p = result.current.refresh();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(true));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    await act(async () => {
      release();
      await p;
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('a second refresh while in flight returns the same promise, one toast', async () => {
    let release: () => void = () => {};
    let gate = false;
    const f = jest.fn(async () => {
      if (gate) await new Promise<void>((r) => (release = r));
      return { v: 1 };
    });
    const { qc, wrapper } = await setup({ 'refresh-test/a': f }, [KEY]);
    await waitFor(() => expect(qc.getQueryData(KEY)).toBeDefined());
    const { result } = await renderHook(() => useShellRefresh([KEY]), { wrapper });
    gate = true;
    let p1: Promise<unknown> = Promise.resolve();
    let p2: Promise<unknown> = Promise.resolve();
    await act(async () => {
      p1 = result.current.refresh();
      p2 = result.current.refresh();
    });
    expect(p1).toBe(p2);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    await act(async () => {
      release();
      await p1;
    });
    expect(getToast()?.text?.key).toBe('refresh.nothingNew');
  });
});
