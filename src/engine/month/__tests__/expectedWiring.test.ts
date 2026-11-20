// 08.1-09 (D-09): the month figure and the open cash path both read the one expected-line map, so a due it reduces is reduced in both.
import { minorUnits as mu } from '../../money/types';
import type { IncomeThisMonth, V3Series } from '../../decide/v3/types';
import { openCashFlows } from '../../decide/v3/cash/path';
import { thisMonth } from '../model/thisMonth';

const MONTH = { unit: 'month', every: 1 } as const;

function fuelSeries(anchor: string): V3Series {
  return {
    id: 'fuel',
    role: 'bill',
    cadence: MONTH,
    anchorDate: anchor,
    endDate: null,
    amount: mu(12000),
    status: 'live',
    confirmed: true,
    payGroup: null,
    countsAs: null,
    incomeKind: null,
    typicalChoice: null,
    categoryId: 'cat-fuel',
    isHousing: false,
    savingMode: null,
    amountKind: 'expected',
  };
}

const income: IncomeThisMonth = { received: mu(400000), dueConfirmed: mu(0), total: mu(400000), reasons: [] };

describe('thisMonth: expected lines', () => {
  const run = (expected?: ReadonlyMap<string, bigint>) =>
    thisMonth({ asOf: '2026-10-03', current: null, series: [fuelSeries('2026-10-20')], income, e: mu(147500), typedEveryday: null, setAside: mu(0), expected });

  it('a due the map reduces counts the reduced amount; a due not in the map counts whole', () => {
    expect(run().billsDue).toBe(12000);
    expect(run(new Map([['fuel|2026-10-20', 7000n]])).billsDue).toBe(7000);
    expect(run(new Map([['fuel|2026-10-20', 0n]])).billsDue).toBe(0);
    expect(run(new Map()).billsDue).toBe(12000);
  });
});

describe('openCashFlows: expected lines', () => {
  const base = { asOf: '2026-11-01', days: 30, paidThisMonth: new Set<string>(), erest: mu(0), e: mu(0), series: [fuelSeries('2026-11-20')] };
  const amounts = (expected?: ReadonlyMap<string, bigint>) => openCashFlows({ ...base, expected }).flows.map((f) => Number(f.amount));

  it('a due in the map flows at the reduced amount (0 stays in the list); a due not in it flows whole', () => {
    expect(amounts()).toEqual([-12000]);
    expect(amounts(new Map([['fuel|2026-11-20', 5000n]]))).toEqual([-5000]);
    expect(amounts(new Map([['fuel|2026-11-20', 0n]]))).toEqual([0]);
    expect(amounts(new Map())).toEqual([-12000]);
  });
});
