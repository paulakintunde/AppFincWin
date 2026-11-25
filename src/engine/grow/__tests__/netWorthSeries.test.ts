// 07-03 (INS-01): month-ends, holding value on a date, the series and its change. D-26a: "6m" = 6 month-ends before this month.
import {
  holdingValueOn,
  monthEndsFor,
  netWorthSeries,
  seriesChange,
  type PointSource,
  type SeriesAccount,
  type SeriesDebt,
  type SeriesHolding,
  workedBackBalance,
} from '../netWorthSeries';

const pt = (date: string, isToday: boolean, balances: [string, number][], legs: string[] = []): PointSource => ({
  date,
  isToday,
  balances: new Map(balances),
  accountsWithLegs: new Set(legs),
});
const acct = (id: string, createdOn: string, kind: SeriesAccount['kind'] = 'checking'): SeriesAccount => ({ id, kind, createdOn });

describe('monthEndsFor', () => {
  it('6m is six month-ends before this month', () => {
    expect(monthEndsFor('2026-11-22', '2026-01', '6m')).toEqual([
      '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31',
    ]);
  });
  it('never starts before the first recorded month', () => {
    expect(monthEndsFor('2026-11-22', '2026-09', '6m')).toEqual(['2026-09-30', '2026-10-31']);
  });
  it('1y is twelve month-ends, or fewer when history is short', () => {
    expect(monthEndsFor('2026-11-22', '2020-01', '1y')).toHaveLength(12);
    const short = monthEndsFor('2026-11-22', '2025-12', '1y');
    expect(short).toHaveLength(11);
    expect(short[0]).toBe('2025-12-31');
    expect(short[10]).toBe('2026-10-31');
  });
  it('all runs from the first month, leap February included', () => {
    const all = monthEndsFor('2026-11-22', '2024-02', 'all');
    expect(all[0]).toBe('2024-02-29');
    expect(all[all.length - 1]).toBe('2026-10-31');
    expect(all).toHaveLength(33);
  });
  it('is empty with no first month or when the first month is this month', () => {
    expect(monthEndsFor('2026-11-22', null, 'all')).toEqual([]);
    expect(monthEndsFor('2026-11-22', '2026-11', '6m')).toEqual([]);
  });
  it('crosses a year boundary', () => {
    expect(monthEndsFor('2027-01-05', '2026-01', '6m')[0]).toBe('2026-07-31');
  });
});

describe('holdingValueOn', () => {
  const lots = [
    { date: '2026-03-10', amount: 500 },
    { date: '2026-06-01', amount: 700 },
  ];
  it('takes the latest value on or before the date', () => {
    expect(holdingValueOn(lots, '2026-05-31')).toBe(500);
    expect(holdingValueOn(lots, '2026-06-01')).toBe(700);
  });
  it('is null before the first dated value', () => {
    expect(holdingValueOn(lots, '2026-02-28')).toBeNull();
    expect(holdingValueOn([], '2026-02-28')).toBeNull();
  });
  it('ties on a date take the later entry; order of dates does not matter', () => {
    expect(holdingValueOn([{ date: '2026-03-10', amount: 1 }, { date: '2026-03-10', amount: 2 }], '2026-04-01')).toBe(2);
    expect(holdingValueOn([{ date: '2026-06-01', amount: 7 }, { date: '2026-03-10', amount: 5 }], '2026-07-01')).toBe(7);
  });
});

describe('netWorthSeries', () => {
  it('counts an account only once it existed, or once it has a paid line', () => {
    const accounts = [acct('a', '2026-01-01'), acct('b', '2026-08-15'), acct('c', '2026-09-20')];
    const bal: [string, number][] = [['a', 100], ['b', 50], ['c', 25]];
    const out = netWorthSeries({
      accounts, holdings: [], debts: [],
      points: [pt('2026-07-31', false, bal, ['c']), pt('2026-08-31', false, bal), pt('2026-11-22', true, bal)],
    });
    expect(out.map((p) => p.value)).toEqual([125, 150, 175]);
  });

  it('leaves a holding out before its first value (D-22) and counts it after', () => {
    const holdings: SeriesHolding[] = [
      { id: 'h', account_id: null, lots: [{ date: '2026-06-01', amount: 900 }, { date: '2026-08-01', amount: 1000 }] },
      { id: 'gone', account_id: null, deleted_at: '2026-01-01', lots: [{ date: '2026-01-01', amount: 5 }] },
    ];
    const out = netWorthSeries({
      accounts: [], holdings, debts: [],
      points: [pt('2026-05-31', false, []), pt('2026-06-30', false, []), pt('2026-11-22', true, [])],
    });
    expect(out.map((p) => [p.value, p.holdingsLeftOut])).toEqual([[0, 1], [900, 0], [1000, 0]]);
  });

  it('today uses the latest lot by date, even a later-dated one', () => {
    const holdings: SeriesHolding[] = [{ id: 'h', account_id: null, lots: [{ date: '2026-12-01', amount: 42 }] }];
    const out = netWorthSeries({ accounts: [], holdings, debts: [], points: [pt('2026-11-22', true, [])] });
    expect(out[0]!.value).toBe(42);
  });

  it('holds unlinked debts flat in past points and flags it', () => {
    const debts: SeriesDebt[] = [{ account_id: null, balance: 300, startedBalance: null, paidOffOn: null }];
    const out = netWorthSeries({
      accounts: [], holdings: [], debts,
      points: [pt('2026-09-30', false, []), pt('2026-11-22', true, [])],
    });
    expect(out.map((p) => [p.value, p.debtsHeldFlat])).toEqual([[-300, true], [-300, false]]);
  });

  it('a deleted or account-linked debt does not raise the held-flat flag', () => {
    const debts: SeriesDebt[] = [
      { account_id: null, balance: 1, startedBalance: null, paidOffOn: null, deleted_at: '2026-01-01' },
      { account_id: 'a', balance: 1, startedBalance: null, paidOffOn: null },
    ];
    const out = netWorthSeries({ accounts: [acct('a', '2026-01-01', 'loan')], holdings: [], debts, points: [pt('2026-09-30', false, [['a', -1]])] });
    expect(out[0]!.debtsHeldFlat).toBe(false);
  });

  it('a paid-off debt counts at its starting balance before the date and is gone on and after it', () => {
    const debts: SeriesDebt[] = [{ account_id: null, balance: 0, startedBalance: 800, paidOffOn: '2026-09-10' }];
    const out = netWorthSeries({
      accounts: [], holdings: [], debts,
      points: [pt('2026-08-31', false, []), pt('2026-09-30', false, []), pt('2026-11-22', true, [])],
    });
    expect(out.map((p) => p.value)).toEqual([-800, 0, 0]);
    expect(out.every((p) => !p.debtsHeldFlat)).toBe(true);
  });

  it('a paid-off debt with no starting balance falls back to its current balance', () => {
    const debts: SeriesDebt[] = [{ account_id: null, balance: 120, startedBalance: null, paidOffOn: '2026-09-10' }];
    const out = netWorthSeries({ accounts: [], holdings: [], debts, points: [pt('2026-08-31', false, [])] });
    expect(out[0]!.value).toBe(-120);
  });
});

describe('261123 (DD-07): start dates and worked-back loans', () => {
  const points = [pt('2026-06-30', false, []), pt('2026-08-31', false, []), pt('2026-09-30', false, []), pt('2026-11-22', true, [])];

  it('a debt is left out of every month-end before its start date, held flat after it', () => {
    const debts: SeriesDebt[] = [{ account_id: null, balance: 500, startedBalance: null, paidOffOn: null, startDate: '2026-08-15' }];
    const out = netWorthSeries({ accounts: [], holdings: [], debts, points });
    expect(out.map((p) => p.value)).toEqual([0, -500, -500, -500]);
    expect(out.map((p) => p.debtsHeldFlat)).toEqual([false, true, true, false]);
  });

  it('a fixed loan is today plus the payments after each month-end, capped at the original amount', () => {
    const debts: SeriesDebt[] = [
      {
        account_id: null,
        balance: 700,
        startedBalance: 1000,
        paidOffOn: null,
        startDate: '2026-06-01',
        fixed: true,
        payments: [
          { date: '2026-07-01', amount: 200 },
          { date: '2026-09-01', amount: 100 },
          { date: '2026-10-01', amount: 100 },
        ],
      },
    ];
    const out = netWorthSeries({ accounts: [], holdings: [], debts, points });
    // 06-30: 700 + 400 = 1100 -> capped 1000; 08-31: 700 + 200; 09-30: 700 + 100; today: 700.
    expect(out.map((p) => p.value)).toEqual([-1000, -900, -800, -700]);
    expect(out.every((p) => !p.debtsHeldFlat)).toBe(true);
  });

  it('a paid-off fixed loan is worked back before the paid-off date and gone on and after it', () => {
    const debts: SeriesDebt[] = [
      {
        account_id: null,
        balance: 0,
        startedBalance: 900,
        paidOffOn: '2026-09-10',
        startDate: '2026-07-01',
        fixed: true,
        payments: [
          { date: '2026-08-01', amount: 300 },
          { date: '2026-09-10', amount: 600 },
        ],
      },
    ];
    const out = netWorthSeries({ accounts: [], holdings: [], debts, points });
    expect(out.map((p) => p.value)).toEqual([0, -600, 0, 0]);
  });

  it('without payments, or when revolving, the old rule stays', () => {
    const base = { account_id: null, balance: 400, startedBalance: 1000, paidOffOn: null, startDate: '2026-01-01' };
    const out = netWorthSeries({
      accounts: [],
      holdings: [],
      debts: [
        { ...base, fixed: true, payments: [] },
        { ...base, fixed: false, payments: [{ date: '2026-10-01', amount: 100 }] },
      ],
      points: [pt('2026-08-31', false, [])],
    });
    expect(out[0]!.value).toBe(-800);
    expect(out[0]!.debtsHeldFlat).toBe(true);
  });

  it('workedBackBalance is null unless the loan can be worked back, and never passes the original amount', () => {
    const d: SeriesDebt = { account_id: null, balance: 10, startedBalance: 50, paidOffOn: null, startDate: '2026-01-01', fixed: true, payments: [{ date: '2026-05-01', amount: 5 }] };
    expect(workedBackBalance(d, '2026-04-30')).toBe(15);
    expect(workedBackBalance(d, '2026-05-01')).toBe(10);
    expect(workedBackBalance({ ...d, startDate: null }, '2026-04-30')).toBeNull();
    expect(workedBackBalance({ ...d, startedBalance: null }, '2026-04-30')).toBeNull();
    expect(workedBackBalance({ ...d, payments: undefined }, '2026-04-30')).toBeNull();
    const huge: SeriesDebt = { ...d, balance: Number.MAX_SAFE_INTEGER, startedBalance: Number.MAX_SAFE_INTEGER, payments: [{ date: '2026-05-01', amount: 1 }] };
    expect(workedBackBalance(huge, '2026-04-30')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('seriesChange', () => {
  const p = (value: number) => ({ date: 'x', value, debtsHeldFlat: false, holdingsLeftOut: 0 });
  it('is null for fewer than two points', () => {
    expect(seriesChange([])).toBeNull();
    expect(seriesChange([p(5)])).toBeNull();
  });
  it('is first, last and the difference', () => {
    expect(seriesChange([p(100), p(999), p(-50)])).toEqual({ from: 100, to: -50, change: -150 });
  });
  it('throws beyond the safe integer range', () => {
    expect(() => seriesChange([p(-Number.MAX_SAFE_INTEGER), p(Number.MAX_SAFE_INTEGER)])).toThrow(RangeError);
  });
});
