// 05-52: the bought check's recalculation hook. Data hooks are mocked; the pure pieces run for real.
import { renderHook } from '@testing-library/react-native';
import { carInputs, demoSource, sofaInputs } from '@/features/decide/__tests__/helpers/demoScenario';
import { buildDecideSnapshot, type SnapshotSource } from '../../snapshot/buildSnapshot';
import { computeCheck } from '../../snapshot/computeCheck';
import { EMPTY_STACK, type CheckInputs } from '../../snapshot/types';
import { useBoughtCheckComputation, type BoughtCheckComputation } from '../useBoughtCheckComputation';
import type { DecideCheckRow } from '@/db/decideChecks';

const mockSnapshot = jest.fn();
const mockLinks = jest.fn();
const mockOthers = jest.fn();
const mockRecord = jest.fn();

jest.mock('@/data/queries/decide', () => ({
  useDecideSnapshot: () => mockSnapshot(),
  useDecideLinks: (...a: unknown[]) => mockLinks(...a),
  useOtherChecks: (...a: unknown[]) => mockOthers(...a),
}));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockRecord() }));

const TODAY = '2026-10-15';
const run = async (hook: () => BoughtCheckComputation): Promise<BoughtCheckComputation> => (await renderHook(hook)).result.current;
const inputs: CheckInputs = { ...sofaInputs, needBy: null };

const row = (over: Partial<DecideCheckRow> = {}): DecideCheckRow =>
  ({ id: 'sofa', status: 'bought', decided_at: '2026-10-15T23:30:00Z', ...over }) as DecideCheckRow;

function snapshotOf(source: SnapshotSource) {
  const result = buildDecideSnapshot(source);
  return { status: 'ready', result, source, retry: jest.fn() };
}

function withSofaWrites(source: SnapshotSource): SnapshotSource {
  const base = source.rows[0]!;
  const pending = { ...base, id: 'sofa-row', local_date: TODAY, original_amount: -180_000, home_amount: -180_000, status: 'pending' as const, recurring_series_id: null, transfer_id: null, category_id: null };
  return { ...source, rows: [...source.rows, pending] };
}

const written = [{ check_id: 'sofa', entity: 'transactions', target_id: 'sofa-row', source: 'written', deleted_at: null }];

beforeEach(() => {
  mockRecord.mockReturnValue({ userId: 'u1', householdId: 'h1', timeZone: 'America/Los_Angeles', today: TODAY });
  mockOthers.mockReturnValue(EMPTY_STACK);
  mockSnapshot.mockReturnValue(snapshotOf(demoSource(TODAY)));
  mockLinks.mockReturnValue({ data: [], isError: false });
});

describe('useBoughtCheckComputation', () => {
  it('only bought checks are rebuilt', async () => {
    for (const status of ['open', 'waiting', 'passed'] as const) {
      const result = { current: await run(() => useBoughtCheckComputation(row({ status }), inputs)) };
      expect(result.current).toEqual({ status: 'idle', computation: null });
    }
    expect((await run(() => useBoughtCheckComputation(null, inputs))).status).toBe('idle');
    expect((await run(() => useBoughtCheckComputation(row(), null))).status).toBe('idle');
    // no links query is enabled for a check that was not bought
    await run(() => useBoughtCheckComputation(row({ status: 'open' }), inputs));
    expect(mockLinks).toHaveBeenLastCalledWith(undefined, undefined, expect.anything());
  });

  it('a bought check is judged without its own writes', async () => {
    const source = demoSource(TODAY);
    mockSnapshot.mockReturnValue(snapshotOf(withSofaWrites(source)));
    mockLinks.mockReturnValue({ data: written, isError: false });
    const result = { current: await run(() => useBoughtCheckComputation(row(), inputs)) };
    expect(result.current.status).toBe('ready');
    const expected = computeCheck(buildDecideSnapshot(source), inputs);
    expect(result.current.computation?.verdict).toEqual(expected.verdict);
    // the same source judged with the write counted is different
    const naive = computeCheck(buildDecideSnapshot(withSofaWrites(source)), inputs);
    expect(naive.verdict).not.toEqual(expected.verdict);
  });

  it('D-67 (CR-B02): a bought check typed in another currency is judged at the latest stored rate, or read unconverted without one', async () => {
    const base = demoSource(TODAY);
    const other = base.homeCurrency === 'GBP' ? 'CAD' : 'GBP';
    const source: SnapshotSource = {
      ...base,
      rates: [
        { quote: base.homeCurrency, rate: '1.0800000000', rate_date: '2026-10-14', source: 'frankfurter-v2' },
        { quote: other, rate: '0.8600000000', rate_date: '2026-10-12', source: 'frankfurter-v2' },
      ],
    };
    mockSnapshot.mockReturnValue(snapshotOf(source));
    const result = await run(() => useBoughtCheckComputation(row(), { ...inputs, currency: other }));
    expect(result.computation?.status).not.toBe('unconverted');
    expect(result.computation?.resolvedPrice?.price).not.toBe(computeCheck(buildDecideSnapshot(source), inputs).resolvedPrice?.price);
    const noRate = await run(() => useBoughtCheckComputation(row(), { ...inputs, currency: 'XQZ' }));
    expect(noRate.computation?.status).toBe('unconverted');
  });

  it('waits for links and reports an error', async () => {
    mockLinks.mockReturnValue({ data: undefined, isError: false });
    expect(await run(() => useBoughtCheckComputation(row(), inputs))).toEqual({ status: 'loading', computation: null });
    mockLinks.mockReturnValue({ data: undefined, isError: true });
    expect(await run(() => useBoughtCheckComputation(row(), inputs))).toEqual({ status: 'error', computation: null });
    mockLinks.mockReturnValue({ data: [], isError: false });
    mockSnapshot.mockReturnValue({ status: 'error', result: null, source: null, retry: jest.fn() });
    expect((await run(() => useBoughtCheckComputation(row(), inputs))).status).toBe('error');
    mockSnapshot.mockReturnValue({ status: 'loading', result: null, source: null, retry: jest.fn() });
    expect((await run(() => useBoughtCheckComputation(row(), inputs))).status).toBe('loading');
  });

  it('ends the replaced series on the need-by date, else the local decided date', async () => {
    const source = demoSource(TODAY);
    const bus = { ...source.series[0]!, id: 's-bus', end_date: '2026-10-15' };
    const withBus = { ...source, series: [...source.series, bus] };
    const withReplace: CheckInputs = {
      ...carInputs,
      needBy: null,
      replaces: [{ id: 'r', name: 'Bus', amount: 12_000, note: '', counted: true, seriesId: 's-bus', category: null }],
    };
    mockSnapshot.mockReturnValue(snapshotOf(withBus));
    // decided_at 23:30Z on the 15th is still the 15th in Los Angeles, so the bus pass is live again
    const live = await run(() => useBoughtCheckComputation(row({ id: 'car' }), withReplace));
    const expectedLive = computeCheck(buildDecideSnapshot({ ...source, series: [...source.series, { ...bus, end_date: null }] }), withReplace);
    expect(live.computation?.verdict).toEqual(expectedLive.verdict);
    // a different local date leaves it ended
    const ended = await run(() => useBoughtCheckComputation(row({ id: 'car', decided_at: '2026-10-16T12:00:00Z' }), withReplace));
    const expectedEnded = computeCheck(buildDecideSnapshot(withBus), withReplace);
    expect(ended.computation?.verdict).toEqual(expectedEnded.verdict);
    // need-by wins over the decided date
    const needBy: CheckInputs = { ...withReplace, needBy: '2026-10-20' };
    const byNeed = await run(() => useBoughtCheckComputation(row({ id: 'car' }), needBy));
    expect(byNeed.computation?.verdict).toEqual(computeCheck(buildDecideSnapshot(withBus), needBy).verdict);
  });

  it('WR-C02: a Go ahead replayed after midnight still reopens the series it ended on the tap day', async () => {
    const source = demoSource(TODAY);
    const bus = { ...source.series[0]!, id: 's-bus', end_date: '2026-10-15' };
    const withBus = { ...source, series: [...source.series, bus] };
    const withReplace: CheckInputs = {
      ...carInputs,
      needBy: null,
      replaces: [{ id: 'r', name: 'Bus', amount: 12_000, note: '', counted: true, seriesId: 's-bus', category: null }],
    };
    mockSnapshot.mockReturnValue(snapshotOf(withBus));
    const replayed = await run(() => useBoughtCheckComputation(row({ id: 'car', created_at: '2026-10-12T12:00:00Z', decided_at: '2026-10-17T12:00:00Z' }), withReplace));
    const expectedLive = computeCheck(buildDecideSnapshot({ ...source, series: [...source.series, { ...bus, end_date: null }] }), withReplace);
    expect(replayed.computation?.verdict).toEqual(expectedLive.verdict);
  });

  it('WR-B04: a replace line that was not counted is not reopened, since Go ahead never ended it', async () => {
    const source = demoSource(TODAY);
    const bus = { ...source.series[0]!, id: 's-bus', end_date: '2026-10-15' };
    const withBus = { ...source, series: [...source.series, bus] };
    const uncounted: CheckInputs = {
      ...carInputs,
      needBy: null,
      replaces: [{ id: 'r', name: 'Bus', amount: 12_000, note: '', counted: false, seriesId: 's-bus', category: null }],
    };
    mockSnapshot.mockReturnValue(snapshotOf(withBus));
    const result = await run(() => useBoughtCheckComputation(row({ id: 'car' }), uncounted));
    const ended = computeCheck(buildDecideSnapshot(withBus), uncounted);
    const reopened = computeCheck(buildDecideSnapshot({ ...source, series: [...source.series, { ...bus, end_date: null }] }), uncounted);
    expect(ended.verdict).not.toEqual(reopened.verdict);
    expect(result.computation?.verdict).toEqual(ended.verdict);
  });

  it('WR-C02: a bought check whose Go ahead is still queued shows no figures rather than counting the purchase twice', async () => {
    const pending = { ...row(), pending: true } as DecideCheckRow;
    expect(await run(() => useBoughtCheckComputation(pending, inputs))).toEqual({ status: 'loading', computation: null });
  });

  it('falls back to today when decided_at is missing', async () => {
    const result = { current: await run(() => useBoughtCheckComputation(row({ decided_at: null }), inputs)) };
    expect(result.current.status).toBe('ready');
  });
});
