// 10.1-23 (D-09): the set of lines with a receipt still on the phone (waiting or failed), re-read when the outbox changes.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { OutboxItem } from '@/services/receipts/types';
import { useOutboxLineIds } from '../useOutboxLineIds';

let mockItems: Partial<OutboxItem>[] = [];
const mockListeners = new Set<() => void>();
jest.mock('@/services/receipts/outbox', () => ({
  listOutbox: jest.fn(async () => mockItems),
  subscribeOutbox: (l: () => void) => {
    mockListeners.add(l);
    return () => mockListeners.delete(l);
  },
}));

beforeEach(() => {
  mockItems = [];
  mockListeners.clear();
});

describe('useOutboxLineIds', () => {
  it('collects the lines with waiting or failed uploads and follows the outbox', async () => {
    mockItems = [
      { transactionId: 't1', state: 'waiting' },
      { transactionId: 't2', state: 'failed' },
      { transactionId: 't1', state: 'waiting' },
    ];
    const r = (await renderHook(() => useOutboxLineIds())).result;
    await waitFor(() => expect([...r.current].sort()).toEqual(['t1', 't2']));
    mockItems = [{ transactionId: 't2', state: 'failed' }];
    await act(async () => {
      for (const l of mockListeners) l();
    });
    await waitFor(() => expect([...r.current]).toEqual(['t2']));
  });

  it('reads nothing when off', async () => {
    mockItems = [{ transactionId: 't1', state: 'waiting' }];
    const r = (await renderHook(() => useOutboxLineIds(false))).result;
    expect(r.current.size).toBe(0);
    expect(mockListeners.size).toBe(0);
  });
});
