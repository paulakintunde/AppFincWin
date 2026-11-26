// 10.1-24 (SCN-01, D-18): reading on the phone, page by page, merged into one receipt; no online path.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReadResult } from '@/services/receipts/types';
import { dateOrderFor } from '@/services/locale/dateOrder';
import { mergePages, useReadReceipt } from '../useReadReceipt';

jest.mock('@/services/receipts/readOnDevice', () => ({ readOnDevice: jest.fn() }));

const opts = { currency: 'USD', dateOrder: 'MDY' as const, today: '2026-11-26' };

const line = (text: string, top: number) => ({ text, frame: { left: 10, top, width: 400, height: 30 } });

const page1: ReadResult = {
  ok: true,
  result: {
    lines: [line('CORNER MARKET', 10), line('BREAD 10.00', 100), line('SOAP 5.00', 150)],
    imageWidth: 600,
    imageHeight: 1000,
  },
};
const page2: ReadResult = {
  ok: true,
  result: { lines: [line('TAX 1.20', 20), line('TOTAL 16.20', 70)], imageWidth: 600, imageHeight: 800 },
};

describe('mergePages', () => {
  it('stacks the second page below the first', () => {
    const m = mergePages([page1, page2]);
    expect(m.offsets).toEqual([
      { page: 0, top: 0 },
      { page: 1, top: 1000 },
    ]);
    expect(m.ocr?.lines[3]?.frame?.top).toBe(1020);
    expect(m.ocr?.imageHeight).toBe(1800);
    expect(m.sizes).toEqual([
      { width: 600, height: 1000 },
      { width: 600, height: 800 },
    ]);
  });

  it('skips a page that did not read and uses the lowest line when the size is unknown', () => {
    const noSize: ReadResult = { ok: true, result: { ...(page1 as Extract<ReadResult, { ok: true }>).result, imageHeight: null, imageWidth: null } };
    const m = mergePages([{ ok: false, reason: 'empty' }, noSize, { ok: true, result: { lines: [{ text: 'TOTAL 1.00', frame: null }], imageWidth: null, imageHeight: null } }]);
    expect(m.offsets).toEqual([
      { page: 1, top: 0 },
      { page: 2, top: 180 },
    ]);
    expect(m.ocr?.lines[3]?.frame).toBeNull();
    expect(m.ocr?.imageWidth).toBeNull();
    expect(mergePages([null, { ok: false, reason: 'unavailable' }]).ocr).toBeNull();
  });
});

describe('useReadReceipt', () => {
  it('reads two pages and parses them as one receipt', async () => {
    const read = jest.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    const r = (await renderHook(() => useReadReceipt([{ uri: 'p1' }, { uri: 'p2' }], opts, read))).result;
    expect(r.current.pageCount).toBe(2);
    await waitFor(() => expect(r.current.state).toBe('done'));
    expect(read.mock.calls.map((c) => c[0])).toEqual(['p1', 'p2']);
    expect(r.current.page).toBe(2);
    const out = r.current.outcome;
    expect(out?.readable).toBe(true);
    expect(out?.receipt.total.value).toBe(1620);
    expect(out?.receipt.items.map((i) => i.price)).toEqual([1000, 500]);
    expect(r.current.pageOffsets[1]).toEqual({ page: 1, top: 1000 });
  });

  it('returns an unreadable outcome when no page reads (D-18)', async () => {
    const read = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'unavailable' })
      .mockResolvedValueOnce({ ok: false, reason: 'empty' })
      .mockRejectedValueOnce(new Error('boom'));
    const r = (await renderHook(() => useReadReceipt([{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }], opts, read))).result;
    await waitFor(() => expect(r.current.state).toBe('done'));
    expect(r.current.outcome?.readable).toBe(false);
    expect(r.current.outcome?.receipt.items).toEqual([]);
    expect(r.current.outcome?.receipt.currency).toBe('USD');
  });

  it('uses the phone reader by default', async () => {
    const { readOnDevice } = jest.requireMock('@/services/receipts/readOnDevice') as { readOnDevice: jest.Mock };
    readOnDevice.mockResolvedValueOnce(page1);
    const r = (await renderHook(() => useReadReceipt([{ uri: 'only' }], opts))).result;
    await waitFor(() => expect(r.current.state).toBe('done'));
    expect(readOnDevice).toHaveBeenCalledWith('only');
  });

  it('stop cancels and returns nothing', async () => {
    let release: (v: ReadResult) => void = () => undefined;
    const read = jest.fn(() => new Promise<ReadResult>((res) => (release = res)));
    const r = (await renderHook(() => useReadReceipt([{ uri: 'a' }, { uri: 'b' }], opts, read))).result;
    await act(async () => r.current.stop());
    expect(r.current.state).toBe('stopped');
    await act(async () => release(page1));
    expect(read).toHaveBeenCalledTimes(1);
    expect(r.current.outcome).toBeNull();
    expect(r.current.state).toBe('stopped');
  });
});

describe('dateOrderFor', () => {
  it('follows the region', () => {
    expect(dateOrderFor('en-US')).toBe('MDY');
    expect(dateOrderFor('en-GB')).toBe('DMY');
    expect(dateOrderFor('ja-JP')).toBe('YMD');
    expect(dateOrderFor('not a tag')).toBe('MDY');
  });
});
