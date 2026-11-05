/**
 * 05.4 BO-05 (05.4-26): running-cost lines, closing costs and the purchase date, as pure functions (RC-01..RC-09).
 */
import { minorUnits as mu } from '../../../../money/types';
import { MAX_CHECK_PRICE } from '../../constants';
import { percent } from '../../../../payoff/types';
import type { ResolvedShare } from '../../../share';
import { buildPurchase, purchaseCashFlows } from '../../judge/purchase';
import { checkOnce, checkPlan } from '../../__tests__/helpers/fixtures';
import type { HomeThresholds, RunningCostLine } from '../../types';
import { closingCost } from '../closingCosts';
import { dayOneDate, inLaterMonth, laterRoom, monthsBetween, purchaseDateOf } from '../purchaseDate';
import { countsAsRunning, monthlyShare, runningCostOutflows } from '../runningCosts';

const line = (over: Partial<RunningCostLine> = {}): RunningCostLine => ({
  id: 'rc',
  amount: mu(10_000),
  everyMonths: 1,
  start: '2026-11-15',
  end: null,
  on: true,
  ...over,
});

describe('runningCostOutflows: each line on its own dates (VC-02)', () => {
  it('RC-03 a cost from 1 February falls once on a 90-day path from 15 November (to 13 February)', () => {
    expect(runningCostOutflows([line({ start: '2027-02-01' })], '2026-11-15', 90)).toEqual([{ date: '2027-02-01', amount: 10_000 }]);
  });

  it('RC-01 monthly costs from today fall on 15 November, 15 December and 15 January; the yearly one from May not at all', () => {
    const flows = runningCostOutflows([line({ id: 'a' }), line({ id: 'reg', amount: mu(27_600), everyMonths: 12, start: '2027-05-01' })], '2026-11-15', 90);
    expect(flows).toEqual([
      { date: '2026-11-15', amount: 10_000 },
      { date: '2026-12-15', amount: 10_000 },
      { date: '2027-01-15', amount: 10_000 },
    ]);
  });

  it('RC-04 a yearly cost falls once, in full, on its date', () => {
    expect(runningCostOutflows([line({ amount: mu(60_000), everyMonths: 12, start: '2027-01-15' })], '2026-11-15', 90)).toEqual([{ date: '2027-01-15', amount: 60_000 }]);
  });

  it('RC-05 no outflow after the end date (the end date itself counts)', () => {
    const flows = runningCostOutflows([line({ amount: mu(6_000), start: '2026-12-01', end: '2027-02-28' })], '2026-11-15', 120);
    expect(flows.map((f) => f.date)).toEqual(['2026-12-01', '2027-01-01', '2027-02-01']);
    expect(runningCostOutflows([line({ start: '2026-12-01', end: '2027-01-01' })], '2026-11-15', 90).map((f) => f.date)).toEqual(['2026-12-01', '2027-01-01']);
  });

  it('RC-09 a line switched off, with no positive amount or an unknown cadence, is never counted', () => {
    expect(runningCostOutflows([line({ on: false })], '2026-11-15', 90)).toEqual([]);
    expect(runningCostOutflows([line({ amount: mu(0) })], '2026-11-15', 90)).toEqual([]);
    expect(runningCostOutflows([line({ amount: -5 as never })], '2026-11-15', 90)).toEqual([]);
    expect(runningCostOutflows([line({ amount: 1.5 as never })], '2026-11-15', 90)).toEqual([]);
    expect(runningCostOutflows([line({ everyMonths: 2 as never })], '2026-11-15', 90)).toEqual([]);
  });

  it('a cost already running keeps its own day; periods before the path are skipped', () => {
    expect(runningCostOutflows([line({ start: '2024-03-20', everyMonths: 3 })], '2026-11-15', 90).map((f) => f.date)).toEqual(['2026-12-20']);
    expect(runningCostOutflows([line({ start: '2025-11-15', everyMonths: 12 })], '2026-11-15', 30).map((f) => f.date)).toEqual(['2026-11-15']);
  });

  it('a day past a short month is clamped, worked out from the start each time', () => {
    expect(runningCostOutflows([line({ start: '2027-01-31' })], '2027-01-31', 75).map((f) => f.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('a start or end that is not a real date counts from today with no end (never fewer costs)', () => {
    expect(runningCostOutflows([line({ start: 'not a date' })], '2026-11-15', 40).map((f) => f.date)).toEqual(['2026-11-15', '2026-12-15']);
    expect(runningCostOutflows([line({ end: '2026-02-31' })], '2026-11-15', 40).map((f) => f.date)).toEqual(['2026-11-15', '2026-12-15']);
  });

  it('sorted by date, then by line id', () => {
    const flows = runningCostOutflows([line({ id: 'b', amount: mu(2) }), line({ id: 'a', amount: mu(1) }), line({ id: 'a', amount: mu(3), start: '2026-11-20' }), line({ id: 'a', amount: mu(4) })], '2026-11-15', 10);
    expect(flows).toEqual([
      { date: '2026-11-15', amount: 1 },
      { date: '2026-11-15', amount: 4 },
      { date: '2026-11-15', amount: 2 },
      { date: '2026-11-20', amount: 3 },
    ]);
  });

  it('days must be a positive whole number', () => {
    expect(() => runningCostOutflows([], '2026-11-15', 0)).toThrow(RangeError);
    expect(() => runningCostOutflows([], '2026-11-15', 1.5)).toThrow(RangeError);
  });

  it('countsAsRunning reads the switch, the amount and the cadence', () => {
    expect(countsAsRunning(line())).toBe(true);
    expect(countsAsRunning(line({ everyMonths: 3 }))).toBe(true);
    expect(countsAsRunning(line({ on: false }))).toBe(false);
  });
});

describe('monthlyShare: what the lines take from a usual month', () => {
  it('RC-01 $150 + $120 + $30 + $276 / 12 = $323', () => {
    const lines = [line({ amount: mu(15_000) }), line({ amount: mu(12_000) }), line({ amount: mu(3_000) }), line({ amount: mu(27_600), everyMonths: 12, start: '2027-05-01' })];
    expect(monthlyShare(lines, '2026-11')).toBe(32_300);
  });

  it('RC-04 a yearly 120000 is 10000 a month; RC-03 a line that starts later still counts', () => {
    expect(monthlyShare([line({ amount: mu(120_000), everyMonths: 12, start: '2027-01-15' })], '2026-11')).toBe(10_000);
    expect(monthlyShare([line({ start: '2027-02-01' })], '2026-11')).toBe(10_000);
  });

  it('rounded half up per line', () => {
    expect(monthlyShare([line({ amount: mu(100), everyMonths: 3 })], '2026-11')).toBe(33);
    expect(monthlyShare([line({ amount: mu(50), everyMonths: 3 })], '2026-11')).toBe(17);
  });

  it('RC-05 counts while it runs; a line ended before the month does not; RC-09 an off line does not', () => {
    expect(monthlyShare([line({ amount: mu(6_000), end: '2027-02-28' })], '2027-02')).toBe(6_000);
    expect(monthlyShare([line({ amount: mu(6_000), end: '2027-02-28' })], '2027-03')).toBe(0);
    expect(monthlyShare([line({ on: false })], '2026-11')).toBe(0);
    expect(monthlyShare([], '2026-11')).toBe(0);
  });
});

describe('closingCost: a % of the price, up front', () => {
  it('RC-06 2.5% of 30000000 is 750000; of 4000000 is 100000', () => {
    expect(closingCost(mu(30_000_000), percent('2.5'))).toBe(750_000);
    expect(closingCost(mu(4_000_000), percent('2.5'))).toBe(100_000);
  });

  it('no % or 0% adds nothing; half up; a negative % is not a figure', () => {
    expect(closingCost(mu(4_000_000), null)).toBe(0);
    expect(closingCost(mu(4_000_000), percent('0'))).toBe(0);
    expect(closingCost(mu(199), percent('2.5'))).toBe(5); // 4.975 -> 5
    expect(closingCost(mu(180), percent('2.5'))).toBe(5); // 4.5 -> 5
    expect(() => closingCost(mu(100), (-1n) as never)).toThrow(RangeError);
  });
});

describe('purchase date (D-42)', () => {
  it('a real date after the check date is kept; absent, invalid, past or today reads as today', () => {
    expect(purchaseDateOf({ purchaseDate: '2027-01-15' }, '2026-11-15')).toBe('2027-01-15');
    expect(purchaseDateOf({}, '2026-11-15')).toBe('2026-11-15');
    expect(purchaseDateOf({ purchaseDate: null }, '2026-11-15')).toBe('2026-11-15');
    expect(purchaseDateOf({ purchaseDate: '2027-02-30' }, '2026-11-15')).toBe('2026-11-15');
    expect(purchaseDateOf({ purchaseDate: '2026-11-01' }, '2026-11-15')).toBe('2026-11-15');
    expect(purchaseDateOf({ purchaseDate: '2026-11-15' }, '2026-11-15')).toBe('2026-11-15');
  });

  it('the day-one money leaves on the purchase date, held to the last day of the path', () => {
    expect(dayOneDate('2027-01-15', '2026-11-15', 90)).toBe('2027-01-15');
    expect(dayOneDate('2027-06-01', '2026-11-15', 90)).toBe('2027-02-12');
    expect(dayOneDate('2026-11-15', '2026-11-15', 90)).toBe('2026-11-15');
  });

  it('RC-08 the months between this month and the purchase month add their usual leftover (December only for 15 January)', () => {
    expect(monthsBetween('2026-11-15', '2027-01-15')).toBe(1);
    expect(monthsBetween('2026-11-15', '2026-12-31')).toBe(0);
    expect(monthsBetween('2026-11-15', '2026-11-30')).toBe(0);
    expect(monthsBetween('2026-11-15', '2027-11-01')).toBe(11);
    expect(laterRoom(mu(100_000), '2026-11-15', '2027-01-15')).toBe(100_000);
    expect(laterRoom(mu(-5_000), '2026-11-15', '2027-01-15')).toBe(0);
    expect(laterRoom(mu(0), '2026-11-15', '2027-03-15')).toBe(0);
    expect(laterRoom(null, '2026-11-15', '2027-03-15')).toBe(0);
    expect(inLaterMonth('2026-11-15', '2026-12-01')).toBe(true);
    expect(inLaterMonth('2026-11-15', '2026-11-30')).toBe(false);
  });
});

describe('buildPurchase and purchaseCashFlows with running costs, closing costs and a purchase date', () => {
  const thresholds: HomeThresholds = { bandEdges: [], unspentDrift: mu(0), quotedTolerance: mu(0), source: 'missing' };
  const ctx = { asOf: '2026-11-15', thresholds, custom: { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] }, maxPrice: mu(MAX_CHECK_PRICE) };

  it('RC-06 the closing % is part of day one, paid once and on a plan, never financed', () => {
    const once = buildPurchase(checkOnce(4_000_000, { closingPercent: percent('2.5') }), ctx).purchase!;
    expect(once.dayOne).toBe(4_100_000);
    expect(once.whole).toBe(4_000_000); // the band reads the price, tax and fees (I32)
    const plan = buildPurchase(checkPlan(4_000_000, { apr: percent('0'), count: 10, deposit: mu(0), firstPayment: { kind: 'one_period' } }, { closingPercent: percent('2.5') }), ctx);
    expect(plan.purchase!.dayOne).toBe(100_000);
    expect(plan.purchase!.schedule!.financed).toBe(4_000_000);
  });

  it('a negative closing % is out of range: a reason, never a throw', () => {
    expect(buildPurchase(checkOnce(100, { closingPercent: (-1n) as never }), ctx).reasons).toContain('exceeds_range');
  });

  it('RC-01 the monthly share is the running monthly cost; the lines ride on the purchase only when there are some', () => {
    const lines = [line({ amount: mu(15_000) }), line({ id: 'reg', amount: mu(27_600), everyMonths: 12, start: '2027-05-01' })];
    const p = buildPurchase(checkOnce(600_000, { runningCosts: lines }), ctx).purchase!;
    expect(p.runningMonthly).toBe(17_300);
    expect(p.monthly).toBe(17_300);
    expect(p.runningCosts).toEqual(lines);
    expect('runningCosts' in buildPurchase(checkOnce(600_000), ctx).purchase!).toBe(false);
    expect('runningCosts' in buildPurchase(checkOnce(600_000, { runningCosts: [] }), ctx).purchase!).toBe(false);
  });

  it('running costs fall on their own dates as my share; the day-one money on the purchase date', () => {
    const share: ResolvedShare = { weights: [1, 1], myIndex: 0 }; // half
    const flows = purchaseCashFlows({ dayOne: mu(50_000), schedule: null, share, runningCosts: [line({ amount: mu(10_000), start: '2026-12-01' })] }, '2026-11-15', 30, '2026-11-20');
    expect(flows).toEqual([
      { date: '2026-11-20', amount: 50_000 },
      { date: '2026-12-01', amount: 5_000 },
    ]);
    expect(purchaseCashFlows({ dayOne: mu(50_000), schedule: null, share }, '2026-11-15', 30)).toEqual([{ date: '2026-11-15', amount: 50_000 }]);
  });
});
