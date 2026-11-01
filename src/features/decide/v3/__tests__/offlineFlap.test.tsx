/**
 * 05.3-102 (UAT gap 22): a draft save queued behind another write in WRITE_SCOPE is paused by query-core while the phone is
 * online. It must read "Saving", not "Offline, will save", and Check it must still open the answer with the queue busy.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { MutationObserver, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mutationKeys, WRITE_SCOPE } from '@/data/keys';
import { toStoredV2 } from '@/engine/decide/v3';
import { emptyCheck, withPrice } from '../model/checkEdits';
import { useCheckWritesSettled } from '../record/useCheckWritesSettled';
import { useV3CheckDraft, V3_DRAFT_DEBOUNCE_MS } from '../check/useV3CheckDraft';

jest.setTimeout(60000);

const ID = '11111111-1111-4111-8111-111111111111';
let client: QueryClient;
let mockRows: unknown[] = [];
let mockPending: unknown[] = [];
const mockSaveAnswer = jest.fn();
const never = (): Promise<never> => new Promise(() => undefined);

function mockObserver(key: readonly string[]) {
  return new MutationObserver<unknown, Error, Record<string, unknown>>(client, { mutationKey: key, scope: WRITE_SCOPE, mutationFn: never });
}

jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1' }) }));
jest.mock('@/data/queries/decide', () => ({ useDecideChecks: () => ({ data: mockRows }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useCreateCheck: () => ({
    create: (v: { id: string; name: string; inputs: Record<string, unknown> }) => {
      mockPending = [{ id: v.id, name: v.name, inputs: v.inputs, status: 'open', furthest_step: 1, version: 1, created_by: 'u1', household_id: 'h1' }];
      void mockObserver(['decide-checks', 'create']).mutate(v).catch(() => undefined);
    },
    pendingIds: [],
    get pendingRows() {
      return mockPending;
    },
  }),
  useSaveCheckDraft: () => ({
    save: (v: { id: string }) => void mockObserver(['decide-checks', 'save-draft']).mutate(v).catch(() => undefined),
  }),
  useSaveCheckAnswer: () => ({ save: mockSaveAnswer }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient();
  mockRows = [];
  mockPending = [];
  mockSaveAnswer.mockClear();
  onlineManager.setOnline(true);
});
afterEach(() => {
  client.clear();
  onlineManager.setOnline(true);
});

/** A slow write already holds WRITE_SCOPE, so the next write is paused by the scope while the phone is online. */
async function holdScope(): Promise<void> {
  await act(async () => {
    void new MutationObserver<unknown, Error, Record<string, unknown>>(client, { mutationKey: ['other', 'slow'], scope: WRITE_SCOPE, mutationFn: never }).mutate({}).catch(() => undefined);
  });
}

function storedRow(price: number) {
  return { id: ID, name: 'Van', status: 'open', furthest_step: 1, version: 1, created_by: 'u1', household_id: 'h1', inputs: toStoredV2(withPrice(emptyCheck(), price as never)) };
}

describe('offline flap with a busy write queue (online)', () => {
  it('reads a save queued behind another write as saving, not offline', async () => {
    mockRows = [storedRow(100_000)];
    const { result } = await renderHook(() => useV3CheckDraft(ID), { wrapper });
    await holdScope();
    await act(async () => {
      result.current.edit(withPrice(result.current.check, 700_000 as never));
      await new Promise((r) => setTimeout(r, V3_DRAFT_DEBOUNCE_MS + 50));
    });
    const queued = client.getMutationCache().getAll().find((m) => m.options.mutationKey?.[1] === 'save-draft');
    expect(queued?.state.status).toBe('pending');
    expect(queued?.state.isPaused).toBe(true);
    await waitFor(() => expect(result.current.status).toBe('saving'));
  });

  it('reads the same paused save as offline once the app is offline', async () => {
    mockRows = [storedRow(100_000)];
    const { result } = await renderHook(() => useV3CheckDraft(ID), { wrapper });
    await holdScope();
    await act(async () => {
      result.current.edit(withPrice(result.current.check, 700_000 as never));
      await new Promise((r) => setTimeout(r, V3_DRAFT_DEBOUNCE_MS + 50));
    });
    await act(async () => onlineManager.setOnline(false));
    await waitFor(() => expect(result.current.status).toBe('offline'));
  });

  it('does not settle a save queued behind another write while online, and settles it offline', async () => {
    const { result } = await renderHook(() => useCheckWritesSettled(ID), { wrapper });
    await holdScope();
    await act(async () => {
      void mockObserver(mutationKeys.saveCheckDraft).mutate({ id: ID }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current).toBe(false));
    await act(async () => onlineManager.setOnline(false));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('Check it opens the answer for a new check whose create is still queued', async () => {
    await holdScope();
    const { result, rerender } = await renderHook(() => useV3CheckDraft(ID), { wrapper });
    await act(async () => {
      result.current.setName('Van');
      result.current.edit(withPrice(result.current.check, 700_000 as never));
    });
    await rerender({});
    expect(result.current.check.price).toBe(700_000);
    let ok = false;
    await act(async () => {
      ok = result.current.commit({ code: 'fits_month', variant: null, readyBy: null, facts: [] } as never);
    });
    expect(ok).toBe(true);
    expect(mockSaveAnswer).toHaveBeenCalledTimes(1);
  });

  it('follows the typed price over a stale cached row with a queued draft save', async () => {
    mockRows = [storedRow(99_999_999_900)];
    const { result } = await renderHook(() => useV3CheckDraft(ID), { wrapper });
    await holdScope();
    await act(async () => {
      result.current.edit(withPrice(result.current.check, 700_000 as never));
    });
    expect(result.current.check.price).toBe(700_000);
    let ok = false;
    await act(async () => {
      ok = result.current.commit({ code: 'fits_month', variant: null, readyBy: null, facts: [] } as never);
    });
    expect(ok).toBe(true);
    expect(result.current.check.price).toBe(700_000);
  });
});
