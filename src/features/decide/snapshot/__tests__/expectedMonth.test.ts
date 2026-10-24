// 05-138: builder -> prepareContext -> expectedMonth, against the real engine (D-106, D-107).
import { expectedMonth, prepareContext, totalSetAside, type DecideSnapshot } from '@/engine/decide';
import { buildDecideSnapshot, type SettingsSource, type SnapshotSource } from '../buildSnapshot';
import { computeQuick } from '../computeCheck';
import { defaultQuickInputs } from '../checkInputs';
import type { SnapshotResult } from '../types';
import { TODAY, USD_RATE, debt, goal, household, row, series, settings } from './helpers/sourceFixtures';

function logged(source: SnapshotSource): Extract<SnapshotResult, { kind: 'logged' }> {
  const result = buildDecideSnapshot(source);
  if (result.kind !== 'logged') throw new Error(`expected a logged snapshot, got ${result.kind}`);
  return result;
}
const ctxOf = (snapshot: DecideSnapshot) => {
  const r = prepareContext(snapshot);
  if (!r.ok) throw new Error(`prepareContext refused: ${r.reasons.join(',')}`);
  return r.context;
};
const withExtra = (extra: Partial<SnapshotSource>): SnapshotSource => {
  const base = household({});
  return {
    ...base,
    ...extra,
    rows: [...base.rows, ...(extra.rows ?? [])],
    series: [...base.series, ...(extra.series ?? [])],
    accounts: [...base.accounts, ...(extra.accounts ?? [])],
    balances: { ...base.balances, ...(extra.balances ?? {}) },
  };
};
/** The expected month through the real builder; every call also proves In minus Out equals the hero formula (D-100 addendum). */
function figures(source: SnapshotSource) {
  const r = logged({ ...source, judgeOn: 'month' });
  const context = ctxOf(r.snapshot);
  const f = expectedMonth(context);
  expect(Number(f.income) - Number(f.spending) - Number(f.debtPayments) - Number(f.saving) - Number(f.setAside)).toBe(Number(f.result));
  expect(f.result).toBe(context.leftBefore);
  return { f, r, context };
}
const OCT = '2026-10';
const eurRow = (over: Parameters<typeof row>[0]) => row({ original_currency: 'EUR', home_currency: 'EUR', local_date: `${OCT}-03`, ...over });

describe('expectedMonth through the real builder (D-106)', () => {
  it("D-106 currency conversion: a EUR line and a EUR pay series convert at the snapshot's stored rate into the expected month", () => {
    const foreign = withExtra({
      rates: [USD_RATE],
      rows: [eurRow({ id: 'paid', original_amount: -10_000 }), eurRow({ id: 'pend', original_amount: -20_000, status: 'pending', local_date: `${OCT}-08` })],
      series: [series({ id: 's-eur', amount: 100_000, currency: 'EUR', anchor_date: '2026-10-20', category_id: 'c-inc' })],
    });
    const home = withExtra({
      rows: [row({ id: 'paid', original_amount: -11_000, local_date: `${OCT}-03` }), row({ id: 'pend', original_amount: -22_000, status: 'pending', local_date: `${OCT}-08` })],
      series: [series({ id: 's-eur', amount: 110_000, anchor_date: '2026-10-20', category_id: 'c-inc' })],
    });
    const a = figures(foreign).f;
    expect(a.income).toBe(300_000 + 110_000); // the monthly pay still due plus the EUR pay on the 20th
    expect(a.spending).toBe(11_000 + 22_000);
    expect(a.result).toBe(410_000 - 33_000);
    const b = figures(home).f;
    expect([a.income, a.spending, a.result]).toEqual([b.income, b.spending, b.result]);
  });

  it('D-106 a EUR line stamped at its own home_amount keeps that stamp, as the history does', () => {
    const f = figures(withExtra({ rates: [USD_RATE], rows: [eurRow({ id: 'stamped', original_amount: -10_000, home_currency: 'USD', home_amount: -11_200 })] })).f;
    expect(f.spending).toBe(11_200);
  });

  it('D-106 early month before pay arrives: the pay series still due counts', () => {
    const { f } = figures(withExtra({}));
    expect(f.income).toBe(300_000);
    expect(f.stillDue.income).toBe(300_000);
    expect(f.spending).toBe(0);
  });

  it('D-106 a series already paid this month is not double counted', () => {
    const rent = series({ id: 's-rent', amount: -100_000, anchor_date: '2026-06-02', category_id: 'c-house' });
    const unpaid = figures(withExtra({ series: [rent] })).f;
    expect(unpaid.spending).toBe(100_000);
    const paid = figures(
      withExtra({
        series: [rent],
        rows: [
          row({ id: 'pay', local_date: `${OCT}-01`, original_amount: 300_000, category_id: 'c-inc', recurring_series_id: 's-pay' }),
          row({ id: 'rent', local_date: `${OCT}-02`, original_amount: -100_000, category_id: 'c-house', recurring_series_id: 's-rent' }),
        ],
      })
    ).f;
    expect(paid.income).toBe(300_000);
    expect(paid.spending).toBe(100_000);
    expect(paid.stillDue).toEqual({ income: 0, spending: 0 });
  });

  it('D-106 one-off lines count this month', () => {
    const { f } = figures(withExtra({ rows: [row({ id: 'oo', local_date: `${OCT}-05`, original_amount: -25_000, category_id: 'c-food', one_off: true })] }));
    expect(f.spending).toBe(25_000);
  });

  it('D-106 Savings-category and debt-covered series never reach the expected month', () => {
    const base = figures(withExtra({})).f;
    const { f } = figures(
      withExtra({
        series: [
          series({ id: 's-sav', amount: -50_000, anchor_date: '2026-06-03', category_id: 'c-sav' }),
          series({ id: 's-loan', amount: -30_000, anchor_date: '2026-06-04', category_id: 'c-debt' }),
        ],
        debts: [debt({ id: 'loan', series_id: 's-loan', minimum_payment: 20_000 })],
        rows: [
          row({ id: 'sav-row', local_date: `${OCT}-03`, original_amount: -50_000, category_id: 'c-sav', recurring_series_id: 's-sav' }),
          row({ id: 'loan-row', local_date: `${OCT}-04`, original_amount: -30_000, category_id: 'c-debt', recurring_series_id: 's-loan' }),
        ],
      })
    );
    expect(f.income).toBe(base.income);
    expect(f.spending).toBe(base.spending); // neither is spending
    expect(f.saving).toBe(50_000); // the Savings series counts once, as saving
    expect(f.debtPayments).toBe(20_000); // the loan counts once, as its minimum, not as the 30,000 series
    expect(f.result).toBe(base.result - 50_000 - 20_000);
  });

  it('D-106 a transfer to a pot adds nothing to spending and the pot is counted once in the set-aside', () => {
    const pot = goal({ id: 'pot-1', target: 60_000, ready_by: '2027-03-31' });
    const legs = [
      row({ id: 'out', local_date: `${OCT}-06`, original_amount: -10_000, transfer_id: 't1', account_id: 'chk' }),
      row({ id: 'in', local_date: `${OCT}-06`, original_amount: 10_000, transfer_id: 't1', account_id: 'sav', goal_id: 'pot-1' }),
    ];
    const without = figures(withExtra({ goals: [pot] }));
    const withLegs = figures(withExtra({ goals: [pot], rows: legs }));
    expect(withLegs.f.spending).toBe(without.f.spending);
    expect(withLegs.f.income).toBe(without.f.income);
    expect(withLegs.f.saving).toBe(0); // a tagged leg is the pot's set-aside, not saving twice
    expect(withLegs.f.setAside).toBe(totalSetAside(withLegs.r.snapshot.pots ?? [], TODAY).total);
    expect(withLegs.f.setAside).toBeGreaterThan(0);
  });
});

describe('judging on the chosen basis through the real builder (D-107)', () => {
  it('D-107 a EUR pay series with no stored rate keeps the existing unconverted result, not a month fallback', () => {
    const r = buildDecideSnapshot({
      ...withExtra({ series: [series({ id: 's-eur', amount: 100_000, currency: 'EUR', anchor_date: '2026-10-20', category_id: 'c-inc' })] }),
      judgeOn: 'month',
    });
    expect(r.unconverted).toEqual({ currencies: ['EUR'], rowCount: 1 });
    expect(r.monthUnconverted).toBeNull();
    expect(r.monthFallback).toBeNull();
    expect(r.kind === 'logged' && r.snapshot.basisOverride).toBe('month');
    expect(computeQuick(r, { ...defaultQuickInputs(), name: 'Laptop', price: 150_000 }, { allowCashOnly: false })).toEqual({
      kind: 'unconverted',
      currencies: ['EUR'],
    });
  });

  /** June to September at 3,000 in and 1,400 out, October the same so far: the expected month equals the worst month. */
  const even = (judgeOn?: 'month' | 'worst' | 'average') =>
    withExtra({
      judgeOn,
      rows: [
        row({ id: 'o-pay', local_date: `${OCT}-01`, original_amount: 300_000, category_id: 'c-inc', recurring_series_id: 's-pay' }),
        row({ id: 'o-rent', local_date: `${OCT}-02`, original_amount: -100_000, category_id: 'c-house' }),
        row({ id: 'o-food', local_date: `${OCT}-10`, original_amount: -40_000, category_id: 'c-food' }),
      ],
    });
  const quickOf = (judgeOn?: 'month' | 'worst' | 'average') => {
    const r = computeQuick(buildDecideSnapshot(even(judgeOn)), { ...defaultQuickInputs(), name: 'Laptop', price: 150_000 }, { allowCashOnly: false });
    if (r.kind !== 'logged' || r.verdict.state === 'missing') throw new Error(r.kind);
    return r.verdict;
  };

  it('D-107 the quick check judges on the chosen basis', () => {
    for (const basis of ['month', 'worst', 'average'] as const) {
      expect(quickOf(basis).context.money.basis).toBe(basis);
    }
    const month = quickOf('month');
    const worst = quickOf('worst');
    expect(month.state).toBe(worst.state);
    expect(month.context.leftBefore).toBe(worst.context.leftBefore);
    expect(month.size).toEqual(worst.size);
    expect(month.plan).toEqual(worst.plan);
  });

  it('D-107 checks judge on the chosen basis through the real builder', () => {
    // a tighter October than any earlier month: only the month basis sees it
    const tight = (judgeOn?: 'month' | 'worst' | 'average', basis: SettingsSource['basis_override'] = null): SnapshotSource => ({
      ...withExtra({
        rows: [row({ id: 'big', local_date: `${OCT}-03`, original_amount: -150_000, category_id: 'c-food' })],
        settings: settings({ basis_override: basis }),
      }),
      judgeOn,
    });
    const ctx = (s: SnapshotSource) => ctxOf(logged(s).snapshot);
    const month = ctx(tight('month'));
    const worst = ctx(tight('worst'));
    const average = ctx(tight('average'));
    expect([month.money.basis, worst.money.basis, average.money.basis]).toEqual(['month', 'worst', 'average']);
    expect(Number(month.leftBefore)).toBeLessThan(Number(worst.leftBefore));
    expect(Number(average.leftBefore)).toBeGreaterThanOrEqual(Number(worst.leftBefore));
    expect(ctx(tight(undefined, 'average')).money.basis).toBe('average');
    expect(ctx(tight(undefined, 'worst')).money.basis).toBe('worst');
    expect(ctx(tight(undefined, null)).leftBefore).toBe(worst.leftBefore); // no stored basis: the default is the worst month
  });
});
