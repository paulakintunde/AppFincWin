// 10.1-21 (D-06, D-09): groups of receipts for one line, plus the add / remove actions.
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReceiptRow } from '@/db/receipts';
import type { OutboxItem } from '@/services/receipts/types';
import { receiptGroups } from '../receiptGroups';
import { useReceiptActions } from '../useReceiptActions';

function stored(over: Partial<ReceiptRow>): ReceiptRow {
  return {
    id: 'x',
    transaction_id: 'tx1',
    household_id: 'h1',
    group_id: 'g1',
    page_no: 1,
    uploaded_by: 'u1',
    object_path: 'h1/tx1/x.jpg',
    kind: 'photo',
    mime_type: 'image/jpeg',
    bytes: 100,
    created_at: '2026-11-20T10:00:00Z',
    ...over,
  };
}

function waiting(over: Partial<OutboxItem>): OutboxItem {
  return {
    receiptId: 'o1',
    groupId: 'og1',
    pageNo: 1,
    transactionId: 'tx1',
    kind: 'photo',
    mime: 'image/jpeg',
    ext: 'jpg',
    bytes: 100,
    localUri: 'file:///pending/o1.jpg',
    attempts: 0,
    nextAttemptAt: null,
    state: 'waiting',
    createdAt: '2026-11-21T10:00:00Z',
    ...over,
  };
}

describe('receiptGroups', () => {
  it('groups a scan by group id with pages in order and puts the outbox photo after it', () => {
    const groups = receiptGroups(
      [stored({ id: 'p2', group_id: 'gs', page_no: 2, kind: 'scan', object_path: 'p2' }), stored({ id: 'p1', group_id: 'gs', page_no: 1, kind: 'scan', object_path: 'p1' })],
      [waiting({})]
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ groupId: 'gs', kind: 'scan', state: 'stored' });
    expect(groups[0]!.pages.map((p) => p.objectPath)).toEqual(['p1', 'p2']);
    expect(groups[1]).toMatchObject({ groupId: 'og1', kind: 'photo', state: 'waiting' });
    expect(groups[1]!.pages[0]).toMatchObject({ objectPath: null, localUri: 'file:///pending/o1.jpg' });
  });

  it('orders each side by created time', () => {
    const groups = receiptGroups(
      [stored({ id: 'b', group_id: 'gb', created_at: '2026-11-22T00:00:00Z' }), stored({ id: 'a', group_id: 'ga', created_at: '2026-11-19T00:00:00Z' })],
      [waiting({ receiptId: 'o2', groupId: 'o-late', createdAt: '2026-11-24T00:00:00Z' }), waiting({ receiptId: 'o3', groupId: 'o-early', createdAt: '2026-11-23T00:00:00Z' })]
    );
    expect(groups.map((g) => g.groupId)).toEqual(['ga', 'gb', 'o-early', 'o-late']);
  });

  it('marks a group failed when any of its pages failed, and keeps pages in order', () => {
    const groups = receiptGroups(
      [],
      [
        waiting({ receiptId: 'a', pageNo: 2, state: 'failed', kind: 'scan' }),
        waiting({ receiptId: 'b', pageNo: 1, localUri: 'file:///first.jpg', kind: 'scan', createdAt: '2026-11-20T00:00:00Z' }),
      ]
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.state).toBe('failed');
    expect(groups[0]!.pages[0]!.localUri).toBe('file:///first.jpg');
    expect(groups[0]!.createdAt).toBe('2026-11-20T00:00:00Z');
  });
});

// ---- useReceiptActions ------------------------------------------------------------------------------------------------
const mockPickPhoto = jest.fn();
const mockPickFile = jest.fn();
const mockScan = jest.fn();
const mockEnqueue = jest.fn();
const mockDrain = jest.fn(async () => ({ uploaded: 0, waiting: 0, failed: 0, uploadedTransactionIds: [] }));
const mockRemoveFromOutbox = jest.fn(async () => undefined);
const mockRetry = jest.fn(async () => undefined);
const mockRemoveReceipt = jest.fn();
const mockRemoveAll = jest.fn();
const mockTap = jest.fn();
let mockRows: ReceiptRow[] = [];
let mockOutbox: OutboxItem[] = [];

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/services/receipts/pickPhoto', () => ({ pickPhoto: (...a: unknown[]) => mockPickPhoto(...a) }));
jest.mock('@/services/receipts/pickFile', () => ({ pickFile: (...a: unknown[]) => mockPickFile(...a) }));
jest.mock('@/services/receipts/scanDocument', () => ({ scanDocument: (...a: unknown[]) => mockScan(...a) }));
jest.mock('@/services/receipts/outbox', () => ({
  enqueueReceipt: (...a: unknown[]) => mockEnqueue(...a),
  drainOutbox: () => mockDrain(),
  removeFromOutbox: (...a: unknown[]) => mockRemoveFromOutbox(...(a as [])),
  retryOutboxItem: (...a: unknown[]) => mockRetry(...(a as [])),
}));
jest.mock('@/db/receipts', () => ({
  removeReceipt: (...a: unknown[]) => mockRemoveReceipt(...a),
  removeAllReceipts: (...a: unknown[]) => mockRemoveAll(...a),
}));
jest.mock('@/data/queries/receipts', () => ({ useReceipts: () => ({ data: mockRows, isLoading: false }) }));
jest.mock('../useReceiptOutbox', () => ({ useReceiptOutbox: () => mockOutbox }));
jest.mock('@/ui/haptics', () => ({ hapticTap: () => mockTap() }));

function setup() {
  const qc = new QueryClient();
  const invalidate = jest.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}

const okPhoto = { ok: true, kind: 'photo', files: [{ uri: 'file:///a.jpg', mime: 'image/jpeg', ext: 'jpg', bytes: 10, width: 1, height: 1 }] };

describe('useReceiptActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRows = [];
    mockOutbox = [];
    mockEnqueue.mockResolvedValue({ ok: true, items: [] });
    mockRemoveReceipt.mockResolvedValue({ ok: true });
    mockRemoveAll.mockResolvedValue({ ok: true });
    jest.spyOn(onlineManager, 'isOnline').mockReturnValue(true);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  });

  it('refuses a sixth receipt without opening the camera', async () => {
    mockRows = [1, 2, 3, 4, 5].map((n) => stored({ id: `r${n}`, group_id: `g${n}` }));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useReceiptActions('h1', 'tx1'), { wrapper });
    await act(async () => {
      await result.current.add('camera');
    });
    expect(mockPickPhoto).not.toHaveBeenCalled();
    expect(result.current.error).toBe('tooManyFiles');
  });

  it.each([
    ['file', { ok: false, reason: 'too_big' }, 'tooBig'],
    ['file', { ok: false, reason: 'bad_type' }, 'badType'],
    ['camera', { ok: false, reason: 'permission_denied' }, 'cameraOff'],
    ['scan', { ok: false, reason: 'permission_denied' }, 'cameraOff'],
    ['library', { ok: false, reason: 'permission_denied' }, 'photosOff'],
    ['file', { ok: false, reason: 'unavailable' }, 'failed'],
    ['camera', { ok: false, reason: 'cancelled' }, null],
  ] as const)('add(%s) with %o sets error %s', async (source, picked, expected) => {
    mockPickPhoto.mockResolvedValue(picked);
    mockPickFile.mockResolvedValue(picked);
    mockScan.mockResolvedValue(picked);
    const { wrapper } = setup();
    const { result } = await renderHook(() => useReceiptActions('h1', 'tx1'), { wrapper });
    await act(async () => {
      await result.current.add(source);
    });
    expect(result.current.error).toBe(expected);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('a successful add enqueues with the picked kind and taps', async () => {
    mockScan.mockResolvedValue({ ...okPhoto, kind: 'scan' });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useReceiptActions('h1', 'tx1'), { wrapper });
    await act(async () => {
      await result.current.add('scan');
    });
    expect(mockEnqueue).toHaveBeenCalledWith({ transactionId: 'tx1', kind: 'scan', files: okPhoto.files });
    expect(mockTap).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('announces once that the receipt is saved on the phone when offline', async () => {
    jest.spyOn(onlineManager, 'isOnline').mockReturnValue(false);
    mockPickPhoto.mockResolvedValue(okPhoto);
    const { wrapper } = setup();
    const { result } = await renderHook(() => useReceiptActions('h1', 'tx1'), { wrapper });
    await act(async () => {
      await result.current.add('camera');
    });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Receipt saved on your phone. It will upload when you are back online.');
  });

  it('an outbox that is full or a file that is too big is reported', async () => {
    mockPickPhoto.mockResolvedValue(okPhoto);
    mockEnqueue.mockResolvedValueOnce({ ok: false, reason: 'too_big' }).mockResolvedValueOnce({ ok: false, reason: 'outbox_full' });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useReceiptActions('h1', 'tx1'), { wrapper });
    await act(async () => {
      await result.current.add('camera');
    });
    expect(result.current.error).toBe('tooBig');
    await act(async () => {
      await result.current.add('camera');
    });
    expect(result.current.error).toBe('failed');
  });

  it('removes a waiting group through the outbox and a stored group through the server, then refreshes', async () => {
    mockRows = [stored({ id: 'r1', group_id: 'g1' })];
    mockOutbox = [waiting({})];
    const { wrapper, invalidate } = setup();
    const { result } = await renderHook(() => useReceiptActions('h1', 'tx1'), { wrapper });
    await act(async () => {
      await result.current.removeGroup('og1');
    });
    expect(mockRemoveFromOutbox).toHaveBeenCalledWith('og1');
    expect(mockRemoveReceipt).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.removeGroup('g1');
    });
    expect(mockRemoveReceipt).toHaveBeenCalledWith(expect.anything(), 'g1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['receipts', 'h1', 'tx1'] });
  });

  it('remove all clears the server rows and the outbox; retry hands the group back to the outbox', async () => {
    mockRows = [stored({ id: 'r1', group_id: 'g1' })];
    mockOutbox = [waiting({ state: 'failed' })];
    const { wrapper } = setup();
    const { result } = await renderHook(() => useReceiptActions('h1', 'tx1'), { wrapper });
    await act(async () => {
      await result.current.retry('og1');
    });
    expect(mockRetry).toHaveBeenCalledWith('og1');
    await act(async () => {
      await result.current.removeAll();
    });
    expect(mockRemoveAll).toHaveBeenCalledWith(expect.anything(), 'tx1');
    expect(mockRemoveFromOutbox).toHaveBeenCalledWith('og1');
  });

  it('a refused server removal is reported', async () => {
    mockRows = [stored({ id: 'r1', group_id: 'g1' })];
    mockRemoveReceipt.mockResolvedValue({ ok: false, reason: 'not_found' });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useReceiptActions('h1', 'tx1'), { wrapper });
    await act(async () => {
      await result.current.removeGroup('g1');
    });
    expect(result.current.error).toBe('failed');
  });
});
