// 07 D-35: a first-month user (entries this month, no full past month) sees "this month so far" in Insights, built for Insights only.
// Decide's builder output and prepared object stay exactly as they were.
import { account, household, row, series, sourceOf, CATEGORIES } from '@/features/decide/snapshot/__tests__/helpers/sourceFixtures';
import type { SnapshotSource } from '@/features/decide/snapshot/sourceTypes';
import { buildInputs, insightsMonthSoFar } from '@/features/decide/snapshot/v3/buildInputs';
import { preparedV3 } from '@/features/decide/snapshot/v3/computeV3';
import { monthBars } from '@/engine/month';
import { categoryModel, compareModel, inOutModel, recordedMonths } from '@/features/insights/model/everyday';
import { householdSnapshotSource } from '../figureScope';
import { withMonthSoFar } from '../insights';

type Extra = Record<string, unknown>;

/** Today is 2026-10-15. Only October holds entries: 3,000.00 pay (series s-pay), 1,000.00 rent and 400.00 food. */
function firstMonth(): SnapshotSource {
  return sourceOf({
    rows: [
      row({ id: 'pay', local_date: '2026-10-01', original_amount: 300_000, category_id: 'c-inc', recurring_series_id: 's-pay' }),
      row({ id: 'rent', local_date: '2026-10-02', original_amount: -100_000, category_id: 'c-house' }),
      row({ id: 'food', local_date: '2026-10-10', original_amount: -40_000, category_id: 'c-food' }),
    ],
    series: [series({ id: 's-pay', amount: 300_000, anchor_date: '2026-10-01', category_id: 'c-inc' })],
    accounts: [account({ id: 'chk', name: 'Checking' })],
    balances: { chk: 160_000 },
    categories: CATEGORIES,
  });
}

const serial = (x: unknown): string => JSON.stringify(x, (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v));
const insightsOf = (source: SnapshotSource) => withMonthSoFar(preparedV3(source, null).prepared, source, null);

describe('07 D-35: this month so far in Insights', () => {
  it('draws one bar for this month with the right in and out', () => {
    const model = inOutModel(insightsOf(firstMonth()), '6m');
    expect(model.bars).toEqual([{ month: '2026-10', comesIn: 300_000, goesOut: 140_000, left: 160_000 }]);
    expect(model.oneMonth).toBe(true);
    expect(model.empty).toBe(false);
  });

  it("lists this month's categories in Where it went", () => {
    const p = insightsOf(firstMonth());
    expect(recordedMonths(p)).toEqual(['2026-10']);
    const breakdown = categoryModel(p, { kind: 'month', month: '2026-10' });
    expect(breakdown.rows.map((r) => [r.categoryId, r.amount])).toEqual([
      ['c-house', 100_000],
      ['c-food', 40_000],
    ]);
    expect(breakdown.total).toBe(140_000);
  });

  it('has nothing to compare against with no month before', () => {
    const cmp = compareModel(insightsOf(firstMonth()), '2026-10');
    expect(cmp.bar?.goesOut).toBe(140_000);
    expect(cmp.previousBar).toBeNull();
    expect(cmp.previousRecorded).toBe(false);
    expect(cmp.totalsChange).toBeNull();
  });

  it('draws the Household month so far from shared lines only', () => {
    const shared = { is_shared: true, household_currency: 'USD' } as Extra;
    const base = firstMonth();
    const source: SnapshotSource = {
      ...base,
      accounts: [...base.accounts, account({ id: 'joint', name: 'Joint', ...({ is_shared: true } as Extra) })],
      rows: [
        ...base.rows,
        row({ id: 'joint-food', account_id: 'joint', local_date: '2026-10-05', original_amount: -25_000, category_id: 'c-food', ...({ ...shared, household_amount: -25_000 } as Extra) }),
      ],
    };
    const hs = householdSnapshotSource(source, 'USD');
    const p = withMonthSoFar(preparedV3(hs, null).prepared, hs, null);
    expect(monthBars(p, { throughCurrent: true })).toEqual([{ month: '2026-10', comesIn: 0, goesOut: 25_000, left: -25_000 }]);
  });

  it('gives nothing extra with no entries this month', () => {
    const source = sourceOf({ accounts: [account({ id: 'chk' })], categories: CATEGORIES });
    expect(insightsMonthSoFar(source, null)).toBeNull();
    const p = preparedV3(source, null).prepared;
    expect(withMonthSoFar(p, source, null)).toBe(p);
  });

  it('leaves a user with full past months exactly as before (the same object)', () => {
    const source = household();
    const p = preparedV3(source, null).prepared;
    expect(insightsMonthSoFar(source, null)).toBeNull();
    expect(withMonthSoFar(p, source, null)).toBe(p);
  });
});

describe("07 D-35: Decide's inputs for a first-month user are unchanged", () => {
  it('holds no months and no series, and the typed estimates stand in as before', () => {
    const inputs = buildInputs(firstMonth(), null);
    expect(inputs.months).toEqual([]);
    expect(inputs.series).toEqual([]);
  });

  it('never changes the prepared object Decide holds', () => {
    const source = firstMonth();
    const decide = preparedV3(source, null);
    const before = serial(decide.inputs);
    const insights = withMonthSoFar(decide.prepared, source, null);
    expect(insights).not.toBe(decide.prepared);
    expect(insights.inputs.months.map((m) => m.month)).toEqual(['2026-10']);
    // the cached Decide build is the same object, holds the same inputs, and the month so far never leaked into it
    expect(preparedV3(source, null)).toBe(decide);
    expect(serial(decide.inputs)).toBe(before);
    expect(decide.prepared.inputs.months).toEqual([]);
    expect(serial(buildInputs(source, null))).toBe(before);
  });
});
