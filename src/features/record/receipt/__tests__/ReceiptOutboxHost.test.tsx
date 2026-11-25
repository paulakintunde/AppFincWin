import React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { ReceiptOutboxHost } from '../ReceiptOutboxHost';
import { useReceiptOutbox } from '../useReceiptOutbox';

jest.mock('@/services/storage/wipe', () => ({ registerWipeHandler: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {} }));

const mockDrain = jest.fn();
const mockList = jest.fn();
let mockListener: (() => void) | null = null;
jest.mock('@/services/receipts/outbox', () => ({
  drainOutbox: (...a: unknown[]) => mockDrain(...a),
  listOutbox: (...a: unknown[]) => mockList(...a),
  subscribeOutbox: (l: () => void) => {
    mockListener = l;
    return () => {
      mockListener = null;
    };
  },
}));

function wrap(qc: QueryClient) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe('10.1-17 ReceiptOutboxHost', () => {
  beforeEach(() => {
    mockDrain.mockReset().mockResolvedValue({ uploaded: 0, waiting: 0, failed: 0, uploadedTransactionIds: [] });
    mockList.mockReset().mockResolvedValue([]);
  });

  it('drains on mount, when the app comes to the foreground, and when the phone comes online, after paused writes resume', async () => {
    const qc = new QueryClient();
    const order: string[] = [];
    jest.spyOn(qc, 'resumePausedMutations').mockImplementation(async () => {
      order.push('resume');
      return undefined;
    });
    mockDrain.mockImplementation(async () => {
      order.push('drain');
      return { uploaded: 0, waiting: 0, failed: 0, uploadedTransactionIds: [] };
    });
    let appStateHandler: ((s: string) => void) | null = null;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, h: (s: string) => void) => {
      appStateHandler = h;
      return { remove };
    }) as never);
    const view = await render(<ReceiptOutboxHost />, { wrapper: wrap(qc) });
    await waitFor(() => expect(mockDrain).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['resume', 'drain']);

    await act(async () => appStateHandler?.('background'));
    expect(mockDrain).toHaveBeenCalledTimes(1);
    await act(async () => appStateHandler?.('active'));
    await waitFor(() => expect(mockDrain).toHaveBeenCalledTimes(2));

    await act(async () => onlineManager.setOnline(false));
    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(mockDrain).toHaveBeenCalledTimes(3));

    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('refreshes the receipts of each line that gained one', async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
    mockDrain.mockResolvedValue({ uploaded: 2, waiting: 0, failed: 0, uploadedTransactionIds: ['t1', 't1', 't2'] });
    await render(<ReceiptOutboxHost />, { wrapper: wrap(qc) });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    const predicate = (spy.mock.calls[0]?.[0] as unknown as { predicate: (q: { queryKey: unknown[] }) => boolean }).predicate;
    expect(predicate({ queryKey: ['receipts', 'h', 't1'] })).toBe(true);
    expect(predicate({ queryKey: ['receipts', 'h', 't2'] })).toBe(false);
    expect(predicate({ queryKey: ['other', 'h', 't1'] })).toBe(false);
  });

  it('useReceiptOutbox returns the line items and re-reads after a change', async () => {
    mockList.mockResolvedValueOnce([{ receiptId: 'r1' }]).mockResolvedValueOnce([{ receiptId: 'r1' }, { receiptId: 'r2' }]);
    const { result } = await renderHook(() => useReceiptOutbox('t1'));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(mockList).toHaveBeenCalledWith('t1');
    await act(async () => mockListener?.());
    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('useReceiptOutbox is empty without a line', async () => {
    const { result } = await renderHook(() => useReceiptOutbox(null));
    expect(result.current).toEqual([]);
    expect(mockList).not.toHaveBeenCalled();
  });
});
