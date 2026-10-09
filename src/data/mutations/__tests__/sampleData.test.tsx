// 02.2-28 Task 2 (REC-23, D-09/D-11/D-12): online sample-data actions.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { queryKeys } from '@/data/keys';
import { useSampleData } from '../sampleData';

const mockSeed = jest.fn();
const mockClear = jest.fn();
const mockMark = jest.fn();
jest.mock('@/db/samples', () => ({
  seedSampleData: (...a: unknown[]) => mockSeed(...a),
  clearSampleData: (...a: unknown[]) => mockClear(...a),
}));
jest.mock('../recordPrefs', () => ({
  useUpdateRecordPrefs: () => ({ markSamplePromptAnswered: mockMark, setWeekStart: jest.fn() }),
}));
jest.mock('../writeClient', () => ({ writeClient: async () => ({ fake: true }) }));

let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const ctx = { userId: 'u1', householdId: 'h1', today: '2026-10-08' };

beforeEach(() => {
  [mockSeed, mockClear, mockMark].forEach((m) => m.mockReset());
  qc = new QueryClient();
});

async function call<T>(fn: (h: ReturnType<typeof useSampleData>) => Promise<T> | T): Promise<T> {
  const { result } = await renderHook(() => useSampleData(ctx), { wrapper });
  let out: T | undefined;
  await act(async () => {
    out = await fn(result.current);
  });
  return out as T;
}

describe('useSampleData', () => {
  it('seed calls the RPC, refreshes the Record reads and resolves true', async () => {
    mockSeed.mockResolvedValue({ status: 'applied', counts: {} });
    const spy = jest.spyOn(qc, 'invalidateQueries');
    expect(await call((h) => h.seed())).toBe(true);
    expect(mockSeed).toHaveBeenCalledWith({ fake: true }, 'h1', '2026-10-08');
    for (const key of [
      queryKeys.accounts('h1'),
      queryKeys.transactionsRoot('h1'),
      queryKeys.recurringSeries('h1'),
      queryKeys.categories('u1'),
      queryKeys.sampleExists('h1'),
    ]) {
      expect(spy).toHaveBeenCalledWith({ queryKey: key });
    }
    expect(mockMark).not.toHaveBeenCalled();
  });

  it('seed failure resolves false and refreshes nothing', async () => {
    mockSeed.mockRejectedValue(new Error('offline'));
    const spy = jest.spyOn(qc, 'invalidateQueries');
    expect(await call((h) => h.seed())).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('clear removes the samples, marks the prompt answered and refreshes incl. the undo log', async () => {
    mockClear.mockResolvedValue({ transactions: 1, series: 0, accounts: 0, categories: 0, kept: 0 });
    const spy = jest.spyOn(qc, 'invalidateQueries');
    expect(await call((h) => h.clear())).toBe(true);
    expect(mockClear).toHaveBeenCalledWith({ fake: true }, 'h1');
    expect(mockMark).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.undoLog('u1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.sampleExists('h1') });
  });

  it('clear failure resolves false and does not mark the prompt', async () => {
    mockClear.mockRejectedValue(new Error('offline'));
    expect(await call((h) => h.clear())).toBe(false);
    expect(mockMark).not.toHaveBeenCalled();
  });

  it('declinePrompt only marks the prompt answered', async () => {
    await call((h) => h.declinePrompt());
    expect(mockMark).toHaveBeenCalledTimes(1);
    expect(mockSeed).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });
});
