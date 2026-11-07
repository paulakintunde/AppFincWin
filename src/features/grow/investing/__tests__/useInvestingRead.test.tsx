// 06-14: the Investing read model on the LEDGER figures. Gain, totals and staleness come from the engine.
/* eslint-disable import/first */
import { renderHook } from '@testing-library/react-native';
import { LEDGER_TODAY, holdings as ledger } from '@/engine/grow/__tests__/fixtures/ledger';
import type { HoldingLotRow } from '@/db/holdingLots';
import type { HoldingRow } from '@/db/holdings';

let mockHoldings: HoldingRow[] | undefined;
let mockLots: HoldingLotRow[] | undefined;
let mockError = false;

jest.mock('@/data/queries/growHoldings', () => ({
  useHoldingRows: () => ({ data: mockHoldings, isError: mockError, refetch: jest.fn() }),
  useHoldingLotRows: () => ({ data: mockLots, isError: false, refetch: jest.fn() }),
}));
jest.mock('@/features/decide/past/usePastDecisions', () => ({
  usePastContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    today: '2026-11-05',
    ctx: { home: 'USD', rates: [], customs: [], today: '2026-11-05', timeZone: 'UTC' },
  }),
}));

import { buildInvestingModel, useInvestingRead } from '../useInvestingRead';
/* eslint-enable import/first */

const usd = (amount: number, currency: string): number | null => (currency === 'USD' ? amount : null);

const holding = (over: Partial<HoldingRow> & { id: string; name: string }): HoldingRow => ({
  household_id: 'h1',
  created_by: 'u1',
  updated_by: null,
  type: 'brokerage',
  currency: 'USD',
  value: 0,
  value_as_of: ledger.retirement.asOf,
  opening_put_in: 0,
  account_id: null,
  paid_from_account_id: null,
  monthly_amount: null,
  day: null,
  rate: null,
  is_sample: false,
  deleted_at: null,
  version: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

const lot = (over: Partial<HoldingLotRow> & { id: string; holding_id: string }): HoldingLotRow => ({
  household_id: 'h1',
  created_by: 'u1',
  updated_by: null,
  kind: 'buy',
  amount: 0,
  units: null,
  local_date: '2026-06-01',
  note: null,
  is_sample: false,
  deleted_at: null,
  version: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

// Retirement: 500000 opening + a 80000 buy = 580000 put in. Index: 120000 opening.
const RET = holding({ id: 'ret', name: 'Retirement', type: 'retirement', value: ledger.retirement.value, opening_put_in: 500000, monthly_amount: ledger.retirement.monthly });
const IDX = holding({ id: 'idx', name: 'Index', type: 'brokerage', value: ledger.index.value, opening_put_in: 120000, monthly_amount: ledger.index.monthly });
const LOTS = [lot({ id: 'l1', holding_id: 'ret', amount: 80000 })];

beforeEach(() => {
  mockHoldings = undefined;
  mockLots = undefined;
  mockError = false;
});

describe('buildInvestingModel on the LEDGER', () => {
  const m = buildInvestingModel([RET, IDX], LOTS, usd, LEDGER_TODAY);

  it('per holding: value, put in, gain and gain percent', () => {
    expect(m.holdings[0]).toMatchObject({ name: 'Retirement', value: 645000, putIn: 580000, gain: 65000, gainPercentTenths: 112, asOf: '2026-11-01' });
    expect(m.holdings[1]).toMatchObject({ name: 'Index', value: 124000, putIn: 120000, gain: 4000, asOf: '2026-11-01' });
  });

  it('totals and the monthly figure', () => {
    expect(m.totals).toMatchObject({ value: 769000, putIn: 700000, gain: 69000 });
    expect(m.monthlyIn).toBe(20000);
    expect(m.unconverted).toBe(0);
  });

  it('allocation is 84 / 16 in whole percent', () => {
    expect(m.holdings.map((h) => h.allocationPercent)).toEqual([84, 16]);
  });

  it('not stale on 2026-11-05', () => {
    expect(m.holdings.map((h) => h.stale)).toEqual([false, false]);
    expect(m.anyStale).toBe(false);
  });
});

describe('staleness (D-12): day 31, not day 30', () => {
  it('30 days after the value date is fresh; 31 days is stale', () => {
    expect(buildInvestingModel([RET], LOTS, usd, '2026-12-01').holdings[0]?.stale).toBe(false);
    const stale = buildInvestingModel([RET], LOTS, usd, '2026-12-02');
    expect(stale.holdings[0]?.stale).toBe(true);
    expect(stale.anyStale).toBe(true);
  });
});

describe('entries', () => {
  it('a partial sale lowers the put-in at average cost and records the realised gain', () => {
    const h = holding({ id: 'h', name: 'Fund', value: 150000, opening_put_in: 0 });
    const lots = [
      lot({ id: 'b', holding_id: 'h', kind: 'buy', amount: 100000, units: '10', local_date: '2026-01-01' }),
      lot({ id: 's', holding_id: 'h', kind: 'sell', amount: 60000, units: '4', local_date: '2026-02-01' }),
      lot({ id: 'd', holding_id: 'h', kind: 'dividend', amount: 1000, local_date: '2026-03-01' }),
      lot({ id: 'v', holding_id: 'h', kind: 'value', amount: 150000, local_date: '2026-10-01' }),
    ];
    const line = buildInvestingModel([h], lots, usd, LEDGER_TODAY).holdings[0];
    expect(line).toMatchObject({ putIn: 60000, realisedGain: 20000, dividends: 1000, gain: 90000, entriesBroken: false });
  });

  it('removed entries are ignored; entries that cannot replay fall back to the opening put-in', () => {
    const h = holding({ id: 'h', name: 'Fund', value: 50000, opening_put_in: 40000 });
    const bad = [lot({ id: 's', holding_id: 'h', kind: 'sell', amount: 10000, units: '5', local_date: '2026-02-01' })];
    const line = buildInvestingModel([h], bad, usd, LEDGER_TODAY).holdings[0];
    expect(line).toMatchObject({ entriesBroken: true, putIn: 40000 });
    const removed = [lot({ id: 's', holding_id: 'h', kind: 'sell', amount: 10000, units: '5', deleted_at: '2026-02-02T00:00:00Z' })];
    expect(buildInvestingModel([h], removed, usd, LEDGER_TODAY).holdings[0]).toMatchObject({ entriesBroken: false, putIn: 40000 });
  });

  it('a holding with nothing put in has no gain percent; removed holdings are left out', () => {
    const h = holding({ id: 'h', name: 'Gift', value: 30000, opening_put_in: 0 });
    const gone = holding({ id: 'g', name: 'Old', value: 99, deleted_at: '2026-10-02T00:00:00Z' });
    const m = buildInvestingModel([h, gone], [], usd, LEDGER_TODAY);
    expect(m.holdings).toHaveLength(1);
    expect(m.holdings[0]).toMatchObject({ gain: 30000, gainPercentTenths: null });
  });

  it('a holding that cannot convert is shown but left out of the totals', () => {
    const eur = holding({ id: 'e', name: 'EU fund', currency: 'EUR', value: 100000, opening_put_in: 90000 });
    const m = buildInvestingModel([RET, eur], LOTS, usd, LEDGER_TODAY);
    expect(m.holdings).toHaveLength(2);
    expect(m.unconverted).toBe(1);
    expect(m.totals.value).toBe(645000);
    expect(m.holdings[1]?.allocationPercent).toBeNull();
  });
});

describe('useInvestingRead', () => {
  it('reports loading, error and ready', async () => {
    expect((await renderHook(() => useInvestingRead())).result.current.status).toBe('loading');
    mockError = true;
    expect((await renderHook(() => useInvestingRead())).result.current.status).toBe('error');
    mockError = false;
    mockHoldings = [RET, IDX];
    mockLots = LOTS;
    const ready = await renderHook(() => useInvestingRead());
    expect(ready.result.current.status).toBe('ready');
    expect(ready.result.current.model.totals.gain).toBe(69000);
  });
});
