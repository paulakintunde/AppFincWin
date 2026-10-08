// 02-47 Task 2: the budgeted, oldest-first, backing-off pending-rate sweep.
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import {
  DATE_BACKOFF_MS,
  resetRatePendingSweepForTests,
  runRatePendingSweep,
  startRatePendingSweep,
  SWEEP_MIN_INTERVAL_MS,
  SWEEP_ROW_LIMIT,
} from '../ratePendingSweep';
import { SWEEP_MAX_CALLS, type SweepBudget } from '../sweepBudget';
import { noteResolveRateThrottled, resetResolveRateBackoffForTests } from '../resolveRateBackoff';

let mockSession: { user: { id: string } } | null = { user: { id: 'u1' } };
let mockRows: { id: string; household_id: string; local_date: string; rate_pending: boolean }[] = [];
let mockReadError = false;
let mockDeferredChecks = 0;
let mockCalls: string[][] = [];
let mockStill: (dates: string[]) => string[] = () => [];

const mockFetchRows = jest.fn(async (_c: unknown, _o: unknown) => {
  if (mockReadError) throw new Error('read failed');
  return mockRows;
});
const mockRetryChecks = jest.fn(async (_qc: unknown, _uid: string, budget: SweepBudget) => {
  for (let i = 0; i < mockDeferredChecks; i++) {
    if (!budget.take()) break;
    mockCalls.push(['check']);
  }
});
const mockFollowUp = jest.fn(
  async (_qc: unknown, rows: { local_date: string }[], opts: { maxCalls: number }) => {
    const dates = [...new Set(rows.map((r) => r.local_date))].sort().reverse().slice(0, opts.maxCalls);
    for (const d of dates) mockCalls.push([d]);
    return { calls: dates.length, stillPendingDates: mockStill(dates) };
  }
);

jest.mock('@/db/fxResolve', () => ({
  fetchRatePendingRows: (c: unknown, o: unknown) => mockFetchRows(c, o),
}));
jest.mock('@/data/mutations/accountRateChecks', () => ({
  retryAccountRateChecks: (q: unknown, u: string, b: SweepBudget) => mockRetryChecks(q, u, b),
}));
jest.mock('@/data/mutations/transactionCache', () => ({
  lazySupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: mockSession }, error: null }) },
  }),
  followUpPendingByDate: (q: unknown, r: { local_date: string }[], o: { maxCalls: number }) => mockFollowUp(q, r, o),
}));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceTimeZone: () => 'UTC' }));

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const qc = new QueryClient();
const row = (date: string, i = 0) => ({ id: `${date}-${i}`, household_id: 'h1', local_date: date, rate_pending: true });
const dayN = (n: number) => `2026-09-${String(n).padStart(2, '0')}`; // 2026-09-01 .. 2026-09-30

beforeEach(() => {
  resetRatePendingSweepForTests();
  resetResolveRateBackoffForTests();
  mockSession = { user: { id: 'u1' } };
  mockRows = [];
  mockReadError = false;
  mockDeferredChecks = 0;
  mockCalls = [];
  mockStill = () => [];
  jest.clearAllMocks();
});

describe('runRatePendingSweep gating', () => {
  it('throttled -> nothing', async () => {
    noteResolveRateThrottled(NOW, 60_000);
    mockRows = [row(dayN(1))];
    await runRatePendingSweep(qc, NOW);
    expect(mockFollowUp).not.toHaveBeenCalled();
    expect(mockFetchRows).not.toHaveBeenCalled();
  });

  it('signed out -> nothing', async () => {
    mockSession = null;
    mockRows = [row(dayN(1))];
    await runRatePendingSweep(qc, NOW);
    expect(mockFetchRows).not.toHaveBeenCalled();
    expect(mockFollowUp).not.toHaveBeenCalled();
    expect(mockRetryChecks).not.toHaveBeenCalled();
  });

  it('less than the interval since the last run -> nothing', async () => {
    mockRows = [row(dayN(1))];
    await runRatePendingSweep(qc, NOW);
    expect(mockFollowUp).toHaveBeenCalledTimes(1);
    await runRatePendingSweep(qc, NOW + SWEEP_MIN_INTERVAL_MS - 1);
    expect(mockFetchRows).toHaveBeenCalledTimes(1);
    await runRatePendingSweep(qc, NOW + SWEEP_MIN_INTERVAL_MS);
    expect(mockFetchRows).toHaveBeenCalledTimes(2);
  });

  it('empty rows -> no resolve call; account checks still run first', async () => {
    mockRows = [];
    await runRatePendingSweep(qc, NOW);
    expect(mockRetryChecks).toHaveBeenCalledWith(qc, 'u1', expect.anything());
    expect(mockFollowUp).not.toHaveBeenCalled();
  });

  it('reads oldest first, up to device-local tomorrow, with the row limit', async () => {
    await runRatePendingSweep(qc, NOW);
    expect(mockFetchRows).toHaveBeenCalledWith(expect.anything(), {
      onOrBefore: '2026-10-09',
      limit: SWEEP_ROW_LIMIT,
      order: 'asc',
    });
  });

  it('a read error is swallowed and the next run is allowed after the interval', async () => {
    mockReadError = true;
    await expect(runRatePendingSweep(qc, NOW)).resolves.toBeUndefined();
    mockReadError = false;
    mockRows = [row(dayN(1))];
    await runRatePendingSweep(qc, NOW + SWEEP_MIN_INTERVAL_MS);
    expect(mockFollowUp).toHaveBeenCalledTimes(1);
  });
});

describe('budget and backoff', () => {
  const thirtyDates = () => Array.from({ length: 30 }, (_, i) => row(dayN(i + 1)));

  it('30 pending dates, budget 10 -> exactly the 10 oldest; next run skips backed-off dates (no starvation)', async () => {
    mockRows = thirtyDates();
    mockStill = (dates) => dates; // every date stays pending
    await runRatePendingSweep(qc, NOW);
    expect(mockCalls.map((c) => c[0]).sort()).toEqual(Array.from({ length: 10 }, (_, i) => dayN(i + 1)));

    mockCalls = [];
    await runRatePendingSweep(qc, NOW + SWEEP_MIN_INTERVAL_MS);
    expect(mockCalls.map((c) => c[0]).sort()).toEqual(Array.from({ length: 10 }, (_, i) => dayN(i + 11)));
  });

  it('a date backed off 7 hours ago is eligible again; 5 hours ago is not', async () => {
    mockRows = [row(dayN(1))];
    mockStill = (dates) => dates;
    await runRatePendingSweep(qc, NOW);
    expect(mockCalls).toHaveLength(1);
    mockCalls = [];
    await runRatePendingSweep(qc, NOW + 5 * 60 * 60 * 1000);
    expect(mockCalls).toHaveLength(0);
    await runRatePendingSweep(qc, NOW + DATE_BACKOFF_MS + 60_000);
    expect(mockCalls).toHaveLength(1);
  });

  it('4 deferred account checks + 30 dates -> 10 calls in total and an empty budget', async () => {
    mockRows = thirtyDates();
    mockDeferredChecks = 4;
    let budget: SweepBudget | undefined;
    mockRetryChecks.mockImplementationOnce(async (_q, _u, b) => {
      budget = b;
      for (let i = 0; i < 4; i++) if (b.take()) mockCalls.push(['check']);
    });
    await runRatePendingSweep(qc, NOW);
    expect(mockCalls).toHaveLength(SWEEP_MAX_CALLS);
    expect(mockCalls.filter((c) => c[0] === 'check')).toHaveLength(4);
    expect(budget?.remaining).toBe(0);
    expect(mockFollowUp).toHaveBeenCalledWith(qc, expect.any(Array), { maxCalls: 6 });
  });

  it('an exhausted budget after the account checks makes no pending call', async () => {
    mockRows = thirtyDates();
    mockRetryChecks.mockImplementationOnce(async (_q, _u, b) => {
      b.spend(SWEEP_MAX_CALLS);
    });
    await runRatePendingSweep(qc, NOW);
    expect(mockFollowUp).not.toHaveBeenCalled();
  });
});

describe('startRatePendingSweep', () => {
  it('is idempotent, runs immediately when online and focused, and reruns on a focus change', async () => {
    jest.spyOn(onlineManager, 'isOnline').mockReturnValue(true);
    jest.spyOn(focusManager, 'isFocused').mockReturnValue(true);
    mockRows = [row(dayN(1))];
    const stop = startRatePendingSweep(qc);
    const stop2 = startRatePendingSweep(qc);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetchRows).toHaveBeenCalledTimes(1);
    expect(stop2).toBe(stop);
    stop();
    jest.restoreAllMocks();
  });

  it('does nothing at start while offline', async () => {
    jest.spyOn(onlineManager, 'isOnline').mockReturnValue(false);
    jest.spyOn(focusManager, 'isFocused').mockReturnValue(true);
    const stop = startRatePendingSweep(qc);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetchRows).not.toHaveBeenCalled();
    stop();
    jest.restoreAllMocks();
  });
});
