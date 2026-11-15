// 06.1-11: useCheckEngine and useMonthPicture over the mocked reads (as decideV3.test): calm per-keystroke judging, quick lines,
// the hidden home kind, and offline/error states. Spies sit on the engine barrel, which computeV3 and the hooks both import.
import { act, renderHook } from '@testing-library/react-native';
import { EMPTY_DECIDE_SETTINGS } from '@/db/decideSettings';
import { demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import type { SnapshotSource } from '@/features/decide/snapshot/buildSnapshot';
import * as engine from '@/engine/decide/v3';
import type { CheckV2 } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { checkOnce } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { perfReport, perfReset } from '@/features/decide/perf/perfMarks';
import { useCheckEngine } from '../useCheckEngine';
import { useMonthPicture } from '../useMonthPicture';

jest.mock('@/engine/decide/v3', () => {
  const actual = jest.requireActual('@/engine/decide/v3');
  return { ...actual, prepare: jest.fn(actual.prepare), judgeCheck: jest.fn(actual.judgeCheck), judgeWithQuickLines: jest.fn(actual.judgeWithQuickLines), cashTimeline: jest.fn(actual.cashTimeline) };
});

type Q = { data: unknown; isError: boolean; error?: unknown; refetch: jest.Mock };
const q = (data: unknown, isError = false, error: unknown = null): Q => ({ data, isError, error, refetch: jest.fn() });
const mockState = {
  snapshot: { status: 'ready' as 'loading' | 'error' | 'ready', source: null as SnapshotSource | null, result: null, retry: jest.fn(), errorKind: undefined as 'network' | 'server' | null | undefined, missingReads: undefined as readonly string[] | undefined },
  settings: q(undefined), answers: q(undefined), dismissals: q(undefined), checks: q(undefined), links: q(undefined),
};
jest.mock('@/data/queries/decide', () => ({
  useDecideSnapshot: () => mockState.snapshot,
  useDecideSettings: () => mockState.settings,
  useDecideChecks: () => mockState.checks,
  useDecideLinks: () => mockState.links,
}));
jest.mock('@/data/queries/decideAnswers', () => ({ useDecideAnswers: () => mockState.answers }));
jest.mock('@/data/queries/recurringDismissals', () => ({ useRecurringDismissals: () => mockState.dismissals }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1' }) }));

// stable data references across renders, as the real query hooks give
const SOURCE = demoSource('2026-10-03');
const SETTINGS = { ...EMPTY_DECIDE_SETTINGS, user_id: 'u1', income_types: ['salary_or_wages'], income_pattern: 'steady', income_pattern_confirmed: true };
const EMPTY: unknown[] = [];

function ready(): void {
  mockState.snapshot = { status: 'ready', source: SOURCE, result: null, retry: jest.fn(), errorKind: undefined, missingReads: undefined };
  mockState.settings = q(SETTINGS);
  mockState.answers = q(EMPTY);
  mockState.dismissals = q(EMPTY);
  mockState.checks = q(EMPTY);
  mockState.links = q(EMPTY);
}
const judgeMock = engine.judgeCheck as jest.Mock;
const prepareMock = engine.prepare as jest.Mock;
const quickMock = engine.judgeWithQuickLines as jest.Mock;
const timelineMock = engine.cashTimeline as jest.Mock;

beforeEach(() => {
  ready();
  jest.clearAllMocks();
});

describe('useCheckEngine', () => {
  it('judges a check and offers the lazy extras', async () => {
    const check = checkOnce(20000);
    const { result } = await renderHook(() => useCheckEngine(check));
    expect(result.current.status).toBe('ready');
    expect(typeof result.current.evaluation!.result.code).toBe('string');
    expect(result.current.both()!.cash).toBeTruthy();
    expect(result.current.timeline()).not.toBeNull();
  });

  it('typing a price re-runs judgeCheck once and does not prepare again', async () => {
    const { rerender } = await renderHook(({ c }: { c: CheckV2 }) => useCheckEngine(c), { initialProps: { c: checkOnce(20000) } });
    judgeMock.mockClear();
    prepareMock.mockClear();
    await rerender({ c: checkOnce(25000) });
    expect(judgeMock).toHaveBeenCalledTimes(1);
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it('judgeOn judges the same check on another purchase date, and paydays lists the pay days in the cash path', async () => {
    const { result } = await renderHook(() => useCheckEngine(checkOnce(20000)));
    const days = result.current.paydays();
    expect(days.length).toBeGreaterThan(0);
    expect([...days].sort()).toEqual(days);
    const later = result.current.judgeOn(days[0] as never);
    expect(later).not.toBeNull();
    expect(later!.result.purchaseDate).toBe(days[0]);
    expect(result.current.evaluation!.result.purchaseDate).not.toBe(days[0]);
  });

  it('06.1-47 (B-6): the verdict follows a deferred check and settles on the last typed price', async () => {
    const { result, rerender } = await renderHook(({ c }: { c: CheckV2 }) => useCheckEngine(c), { initialProps: { c: checkOnce(20000) } });
    await rerender({ c: checkOnce(90000) });
    await act(async () => {});
    const last = judgeMock.mock.calls[judgeMock.mock.calls.length - 1]!;
    expect(last[1].price).toEqual(checkOnce(90000).price);
    // the settled evaluation equals a direct judge of the typed check on the same Prepared
    const actual = jest.requireActual('@/engine/decide/v3');
    expect(result.current.evaluation).toEqual(actual.judgeCheck(last[0], checkOnce(90000)));
  });

  it('06.1-68 (CF-3): updating is true while the deferred judge lags the typed check, then false once it settles', async () => {
    const seen: boolean[] = [];
    const { result, rerender } = await renderHook(
      ({ c }: { c: CheckV2 }) => {
        const e = useCheckEngine(c);
        seen.push(e.updating);
        return e;
      },
      { initialProps: { c: checkOnce(20000) } }
    );
    expect(result.current.updating).toBe(false);
    seen.length = 0;
    await rerender({ c: checkOnce(90000) });
    await act(async () => {});
    // the urgent render still shows the old verdict (updating), the background render catches up
    expect(seen[0]).toBe(true);
    expect(result.current.updating).toBe(false);
  });

  it('06.1-47 (B-7): paydays is built once per prepared and check and returns the same array', async () => {
    const check = checkOnce(20000);
    const { result, rerender } = await renderHook(({ c }: { c: CheckV2 }) => useCheckEngine(c), { initialProps: { c: check } });
    timelineMock.mockClear();
    const first = result.current.paydays();
    expect(result.current.paydays()).toBe(first);
    expect(timelineMock).toHaveBeenCalledTimes(1);
    // re-renders with the same check (as AnswerScreen does) keep the list
    await rerender({ c: check });
    await rerender({ c: check });
    expect(result.current.paydays()).toBe(first);
    expect(timelineMock).toHaveBeenCalledTimes(1);
  });

  it('judgeOn and paydays are empty for a home-kind check', async () => {
    const { result } = await renderHook(() => useCheckEngine(checkOnce(20000, { itemType: { kind: 'preset', value: 'property' } })));
    expect(result.current.judgeOn('2026-11-20' as never)).toBeNull();
    expect(result.current.paydays()).toEqual([]);
  });

  it('a check with quick lines is judged through judgeWithQuickLines', async () => {
    const check = checkOnce(20000, { quickLines: [{ id: 'q1', kind: 'expense', name: 'x', amount: minorUnits(5000), everyMonths: 0, date: null }] });
    const { result } = await renderHook(() => useCheckEngine(check));
    expect(quickMock).toHaveBeenCalled();
    expect(result.current.evaluation).not.toBeNull();
  });

  it('a home-kind check (D-02) gets no evaluation and never reaches the engine', async () => {
    const check = checkOnce(20000, { itemType: { kind: 'preset', value: 'property' } });
    const { result } = await renderHook(() => useCheckEngine(check));
    judgeMock.mockClear();
    expect(result.current.evaluation).toBeNull();
    expect(result.current.both()).toBeNull();
    expect(judgeMock).not.toHaveBeenCalled();
  });

  it('offline with a cached copy is ready even if a refetch errored (APP-01)', async () => {
    mockState.dismissals = q(EMPTY, true, new TypeError('Network request failed'));
    const { result } = await renderHook(() => useCheckEngine(checkOnce(20000)));
    expect(result.current.status).toBe('ready');
    expect(result.current.evaluation).not.toBeNull();
  });

  it('a network failure with nothing cached is an error of kind network, never not_found (APP-10)', async () => {
    mockState.answers = q(undefined, true, new TypeError('Network request failed'));
    const { result } = await renderHook(() => useCheckEngine(checkOnce(20000)));
    expect(result.current.status).toBe('error');
    expect(result.current.errorKind).toBe('network');
    expect(result.current.evaluation).toBeNull();
  });
});

describe('useMonthPicture', () => {
  it('returns the picture and bars on the prepared inputs', async () => {
    const { result } = await renderHook(() => useMonthPicture());
    expect(result.current.picture).not.toBeNull();
    expect(Array.isArray(result.current.bars)).toBe(true);
  });
  it('is empty while loading', async () => {
    mockState.settings = q(undefined);
    const { result } = await renderHook(() => useMonthPicture());
    expect(result.current).toEqual({ picture: null, bars: [] });
  });
});

describe('06.1-72 perf marks (EXPO_PUBLIC_PERF=1 only)', () => {
  const original = process.env.EXPO_PUBLIC_PERF;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_PERF;
    else process.env.EXPO_PUBLIC_PERF = original;
    perfReset();
  });

  it('times the mount, the first judge and each judge, by name only; nothing while off', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    process.env.EXPO_PUBLIC_PERF = '1';
    perfReset();
    const check = checkOnce(20000);
    const hook = await renderHook(({ c }: { c: CheckV2 }) => useCheckEngine(c, { checkId: 'k1' }), { initialProps: { c: check } });
    expect(hook.result.current.evaluation).not.toBeNull();
    await hook.rerender({ c: { ...check, price: minorUnits(30000) } });
    const report = perfReport();
    expect(report['answer.mount']!.count).toBe(1);
    expect(report['answer.firstJudge']!.count).toBe(1);
    expect(report['answer.judge']!.count).toBeGreaterThanOrEqual(2);
    expect(Object.keys(report).every((name) => /^[a-z.A-Z]+$/.test(name))).toBe(true);
    delete process.env.EXPO_PUBLIC_PERF;
    perfReset();
    await renderHook(() => useCheckEngine(check, { checkId: 'k2' }));
    process.env.EXPO_PUBLIC_PERF = '1';
    expect(perfReport()).toEqual({});
    (console.log as jest.Mock).mockRestore();
  });
});

