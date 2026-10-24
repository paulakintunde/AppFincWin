import * as fc from 'fast-check';
import {
  CARD_MAX_PURCHASE_USD,
  MARKET_DEFAULTS,
  ZERO_PERCENT,
  decide,
  totalSetAside,
  minimumTermsFromDefaults,
  percent,
  prepareContext,
  type BuyCheck,
  type DecideSnapshot,
} from '@/engine/decide';
import { currencyCode, minorUnits } from '@/engine/money';
import { simulateMinimum } from '@/engine/payoff';
import { buildDecideSnapshot, marketKeyFor, type SnapshotSource } from '../buildSnapshot';
import type { SnapshotResult } from '../types';
import {
  CAD_RATE,
  CATEGORIES,
  MONTHS,
  USD_RATE,
  account,
  change,
  customCurrency,
  debt,
  goal,
  household,
  paymentLink,
  row,
  series,
  settings,
  sourceOf,
} from './helpers/sourceFixtures';

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
const withExtra = (extra: Partial<SnapshotSource> & { rows?: SnapshotSource['rows'] }, cur = 'USD'): SnapshotSource => {
  const base = household({}, cur);
  return {
    ...base,
    ...extra,
    rows: [...base.rows, ...(extra.rows ?? [])],
    series: [...base.series, ...(extra.series ?? [])],
    accounts: [...base.accounts, ...(extra.accounts ?? [])],
    balances: { ...base.balances, ...(extra.balances ?? {}) },
  };
};

describe('marketKeyFor', () => {
  it('maps a country-level region to a market, never CA-QC', () => {
    expect(marketKeyFor('US')).toBe('US');
    expect(marketKeyFor('CA')).toBe('CA');
    expect(marketKeyFor('GB')).toBe('UK');
    expect(marketKeyFor('FR')).toBeNull();
    expect(marketKeyFor(null)).toBeNull();
  });
});

describe('kind of result', () => {
  it('returns none when there is nothing to judge against', () => {
    const r = buildDecideSnapshot(sourceOf());
    expect(r.kind).toBe('none');
    expect(r.cash).toBe(0);
    expect(r.cards).toEqual([]);
    expect(r.conversions).toEqual([]);
    expect(r.unconverted).toBeNull();
  });

  it('rough figures stand in before the first full month', () => {
    const r = buildDecideSnapshot(
      sourceOf({
        settings: settings({ rough_income: 400_000, rough_spending: 300_000 }),
        accounts: [account({ id: 'chk' })],
        balances: { chk: 50_000 },
      })
    );
    expect(r).toMatchObject({
      kind: 'rough',
      cash: 50_000,
      figures: { currency: 'USD', cash: 50_000, monthlyIncome: 400_000, monthlySpending: 300_000 },
    });
  });

  it('rough figures in another currency convert at the stored rate and the money limits fall back', () => {
    const r = buildDecideSnapshot(
      sourceOf({
        settings: settings({ currency: 'EUR', rough_income: 100_000, rough_spending: 50_000, reserve: 5_000 }),
        rates: [USD_RATE],
      })
    );
    expect(r).toMatchObject({ kind: 'rough', figures: { monthlyIncome: 110_000, monthlySpending: 55_000 } });
    expect(r.conversions.map((c) => c.currency)).toEqual(['EUR']);
    expect(r.meta.limitsReset).toBe(0);
  });

  it('rough figures with no stored rate give none and an unconverted note', () => {
    const r = buildDecideSnapshot(
      sourceOf({ settings: settings({ currency: 'EUR', rough_income: 100_000, rough_spending: 50_000 }) })
    );
    expect(r.kind).toBe('none');
    expect(r.unconverted).toEqual({ currencies: ['EUR'], rowCount: 2 });
    expect(r.meta.unconvertedRows).toBe(2);
  });

  it('only one rough figure set stays none', () => {
    expect(buildDecideSnapshot(sourceOf({ settings: settings({ rough_income: 1 }) })).kind).toBe('none');
  });

  it('one full month ends the rough figures', () => {
    const r = buildDecideSnapshot(household({ settings: settings({ rough_income: 1, rough_spending: 1 }) }));
    expect(r.kind).toBe('logged');
  });
});

describe('a four-month household', () => {
  it('matches the hand-written snapshot', () => {
    const r = logged(household());
    const lines = (m: string) => [
      { id: `inc-${m}`, date: `${m}-01`, direction: 'in', amount: 300_000, currency: 'USD', status: 'paid', isRefund: false, transferId: null, seriesId: 's-pay', categoryId: 'c-inc', oneOff: false },
      { id: `rent-${m}`, date: `${m}-02`, direction: 'out', amount: 100_000, currency: 'USD', status: 'paid', isRefund: false, transferId: null, seriesId: null, categoryId: 'c-house', oneOff: false },
      { id: `food-${m}`, date: `${m}-10`, direction: 'out', amount: 40_000, currency: 'USD', status: 'paid', isRefund: false, transferId: null, seriesId: null, categoryId: 'c-food', oneOff: false },
    ];
    const empty = (m: string, full = false) => ({ month: m, full, lines: [] });
    const expected = {
      currency: 'USD',
      asOf: '2026-10-15',
      months: [
        empty('2026-10'),
        { month: '2026-09', full: true, lines: lines('2026-09') },
        { month: '2026-08', full: true, lines: lines('2026-08') },
        { month: '2026-07', full: true, lines: lines('2026-07') },
        { month: '2026-06', full: true, lines: lines('2026-06') },
        ...['2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12', '2025-11', '2025-10'].map((m) => empty(m)),
      ],
      bills: [],
      basisOverride: null,
      cashOnHand: 700_000,
      debts: [],
      monthlySaving: 0,
      monthlyInvesting: 0,
      scope: { kind: 'personal' },
      householdSpending: null,
      housingMonthly: 100_000, // D-103: the Housing-category rent
      limits: { reserve: null, dsrLine: null, housingLine: null, unsecuredIncomeMultiple: null, investingFloor: null, savingFloor: null, spareFloor: null },
      projectionReturn: null,
      projectionRates: [],
      expenseLines: [
        { lineId: 'c-food', averageMonthly: 40_000, cuttable: true },
        { lineId: 'c-house', averageMonthly: 100_000, cuttable: false },
      ],
      incomeSeries: [
        { seriesId: 's-pay', confirmed: true, freq: 'monthly', anchorDate: '2026-06-01', endDate: null, occurrenceCount: null, latestAmount: 300_000, currency: 'USD', lastPaidDate: '2026-09-01' },
      ],
      futureChanges: [],
      investmentBalance: 0,
      scheduledOutflows: [],
      pots: [],
    };
    expect(r.snapshot).toEqual(expected);
    expect(r.meta).toMatchObject({ fullMonths: 4, expenseLinesThisMonth: 0, debtCount: 0, accountCount: 2, unconvertedRows: 0 });
    expect(r.cash).toBe(700_000);
    expect(ctxOf(r.snapshot).money.spendingAverage).toBe(140_000);
  });

  it('the current month is not full and uncategorised spending gets its own line', () => {
    const r = logged(
      withExtra({
        rows: [
          row({ id: 'now', local_date: '2026-10-05', original_amount: -2_000, category_id: 'c-food' }),
          row({ id: 'misc', local_date: '2026-09-20', original_amount: -4_000 }),
          row({ id: 'misc2', local_date: '2026-08-20', original_amount: -4_001, category_id: 'c-custom' }),
        ],
      })
    );
    expect(r.snapshot.months[0]).toMatchObject({ month: '2026-10', full: false });
    expect(r.snapshot.months[0]?.lines).toHaveLength(1);
    expect(r.meta.expenseLinesThisMonth).toBe(1);
    expect(r.snapshot.expenseLines.find((l) => l.lineId === 'uncategorised')).toEqual({ lineId: 'uncategorised', averageMonthly: 1_000, cuttable: true });
    expect(r.snapshot.expenseLines.find((l) => l.lineId === 'c-custom')).toMatchObject({ averageMonthly: 1_000, cuttable: true });
  });

  it('only the newest six full months are averaged and rows beyond them need no rate', () => {
    const early = ['2026-03', '2026-04', '2026-05'].map((m) => row({ id: `e-${m}`, local_date: `${m}-01`, original_amount: -10_000, category_id: 'c-food' }));
    const stranded = row({ id: 'old-eur', local_date: '2026-03-05', original_amount: -777, original_currency: 'EUR', home_currency: 'EUR' });
    const r = logged(withExtra({ rows: [...early, stranded] }));
    expect(r.snapshot.months.filter((m) => m.full)).toHaveLength(7);
    expect(r.unconverted).toBeNull();
    // food: 4 x 40,000 in Jun-Sep plus 10,000 in Apr and May (Mar is outside the six) over six months
    expect(r.snapshot.expenseLines.find((l) => l.lineId === 'c-food')?.averageMonthly).toBe(Math.round(180_000 / 6));
  });

  it('excludes deleted rows, rows outside the window and keeps flags on lines', () => {
    const r = logged(
      withExtra({
        rows: [
          row({ id: 'gone', local_date: '2026-09-11', original_amount: -999_999, deleted_at: '2026-09-12T00:00:00Z' }),
          row({ id: 'future-month', local_date: '2027-02-11', original_amount: -5 }),
          row({ id: 'refund', local_date: '2026-09-12', original_amount: 2_000, is_refund: true, category_id: 'c-food' }),
          row({ id: 'xfer', local_date: '2026-09-13', original_amount: -5_000, transfer_id: 't-1' }),
          row({ id: 'skipped', local_date: '2026-09-14', original_amount: -300, status: 'skipped' }),
        ],
      })
    );
    const sep = r.snapshot.months.find((m) => m.month === '2026-09')!.lines;
    expect(sep.some((l) => l.id === 'gone' || l.id === 'future-month')).toBe(false);
    expect(sep.find((l) => l.id === 'refund')).toMatchObject({ direction: 'in', isRefund: true, amount: 2_000 });
    expect(sep.find((l) => l.id === 'xfer')).toMatchObject({ direction: 'out', transferId: 't-1' });
    expect(sep.find((l) => l.id === 'skipped')).toMatchObject({ status: 'skipped' });
    expect(r.snapshot.expenseLines.find((l) => l.lineId === 'uncategorised')?.averageMonthly ?? 0).toBe(0);
  });

  it('a one-off line stays in its month and out of the expense lines', () => {
    const r = logged(
      withExtra({
        rows: [
          row({ id: 'oo', local_date: '2026-09-15', original_amount: -50_000, category_id: 'c-food', one_off: true }),
          row({ id: 'oo-series', local_date: '2026-09-16', original_amount: -1_000, category_id: 'c-food', one_off: true, recurring_series_id: 'sx' }),
          row({ id: 'oo-xfer', local_date: '2026-09-17', original_amount: -1_000, category_id: 'c-food', one_off: true, transfer_id: 't-2' }),
          row({ id: 'plain-null', local_date: '2026-09-18', original_amount: -1_000, category_id: 'c-food', one_off: null }),
        ],
      })
    );
    const sep = r.snapshot.months.find((m) => m.month === '2026-09')!.lines;
    const flag = (id: string) => sep.find((l) => l.id === id)?.oneOff;
    expect([flag('oo'), flag('oo-series'), flag('oo-xfer'), flag('plain-null'), flag('food-2026-09')]).toEqual([true, false, false, false, false]);
    expect(ctxOf(r.snapshot).money.oneOffsExcluded).toBeDefined();
    // the 50,000 one-off is not in the food average: only plain food (40,000 x 4 + 1,000 + 1,000 + ...) counts
    expect(r.snapshot.expenseLines.find((l) => l.lineId === 'c-food')?.averageMonthly).toBe(Math.round((160_000 + 1_000 + 1_000) / 4));
  });
});

describe('statement periods', () => {
  it('a period covering a month end to end makes it full', () => {
    const rows = [
      row({ id: 'apr', local_date: '2026-04-03', original_amount: -2_000 }),
      row({ id: 'jun', local_date: '2026-06-03', original_amount: -2_000 }),
    ];
    const noPeriod = buildDecideSnapshot(sourceOf({ rows }));
    expect(noPeriod.meta.fullMonths).toBe(1); // June only: the April rows start on the 3rd
    const withPeriod = buildDecideSnapshot(sourceOf({ rows, statementPeriods: [{ account_id: 'chk', period_start: '2026-04-01', period_end: '2026-04-30' }] }));
    expect(withPeriod.meta.fullMonths).toBe(2);
  });
});

describe('unconverted amounts (D-37)', () => {
  it('a row in a used month with no stored rate makes the snapshot unconverted', () => {
    const r = logged(
      withExtra({
        rows: [row({ id: 'eur', local_date: '2026-09-20', original_amount: -5_000, original_currency: 'EUR', home_currency: 'EUR' })],
      })
    );
    expect(r.unconverted).toEqual({ currencies: ['EUR'], rowCount: 1 });
    expect(r.meta.unconvertedRows).toBe(1);
    expect(r.snapshot.months.find((m) => m.month === '2026-09')!.lines.some((l) => l.id === 'eur')).toBe(false);
  });

  it('a row in the current month needs no rate and is not counted', () => {
    const r = logged(
      withExtra({
        rows: [row({ id: 'eur', local_date: '2026-10-02', original_amount: -5_000, original_currency: 'EUR', home_currency: 'EUR' })],
      })
    );
    expect(r.unconverted).toBeNull();
    expect(r.meta.expenseLinesThisMonth).toBe(0);
  });

  it('past rows keep their stamp and produce no conversion note', () => {
    const r = logged(
      withExtra({
        rates: [USD_RATE],
        rows: [row({ id: 'stamped', local_date: '2026-09-21', original_amount: -10_000, original_currency: 'EUR', home_currency: 'USD', home_amount: -11_200 })],
      })
    );
    const line = r.snapshot.months.find((m) => m.month === '2026-09')!.lines.find((l) => l.id === 'stamped');
    expect(line?.amount).toBe(11_200);
    expect(r.conversions).toEqual([]);
  });

  it('balances convert at the latest rate and are reported once with their rate and date', () => {
    const r = logged(
      withExtra({
        rates: [USD_RATE],
        accounts: [account({ id: 'eur-cash', kind: 'cash', currency: 'EUR' }), account({ id: 'eur-sav', kind: 'savings', currency: 'EUR' })],
        balances: { 'eur-cash': 10_000, 'eur-sav': 20_000 },
      })
    );
    expect(r.snapshot.cashOnHand).toBe(700_000 + 11_000 + 22_000);
    expect(r.conversions).toEqual([{ currency: 'EUR', rateText: '1.1000000000', rateDate: '2026-10-14' }]);
    expect(r.meta.accountCount).toBe(4);
  });

  it('a missing rate on a balance, a series, a debt or a change makes the snapshot unconverted', () => {
    const r = logged(
      withExtra({
        accounts: [
          account({ id: 'eur-cash', kind: 'cash', currency: 'EUR' }),
          account({ id: 'eur-inv', kind: 'investment', currency: 'CHF' }),
          account({ id: 'gbp-card', kind: 'credit', currency: 'GBP' }),
        ],
        balances: { 'eur-cash': 1, 'eur-inv': 1, 'gbp-card': -500 },
        series: [series({ id: 's-chf', amount: -100, currency: 'CHF' }), series({ id: 's-jpy', amount: 100, currency: 'JPY' })],
        debts: [debt({ currency: 'SEK', series_id: null }), debt({ id: 'd-min', currency: 'USD', balance: 5, minimum_payment: 1 }), debt({ kind: 'card', account_id: 'gbp-card', currency: 'NOK', min_percent: '2', min_interest_added: false, min_floor: 100 })],
      })
    );
    expect(r.unconverted?.currencies).toEqual(['CHF', 'EUR', 'GBP', 'JPY', 'NOK', 'SEK']);
    expect(r.snapshot.bills.map((b) => b.seriesId)).toEqual([]);
    expect(r.snapshot.debts.map((d) => d.id)).toEqual(['d-min']);
    expect(r.snapshot.futureChanges).toEqual([]);
    const withChange = logged(withExtra({ changes: [change({ currency: 'DKK' })] }));
    expect(withChange.unconverted?.currencies).toEqual(['DKK']);
    expect(withChange.snapshot.futureChanges).toEqual([]);
  });

  it('archived and deleted items never count and other account kinds are ignored', () => {
    const r = logged(
      withExtra({
        accounts: [
          account({ id: 'x1', kind: 'cash', currency: 'EUR', archived_at: '2026-01-01T00:00:00Z' }),
          account({ id: 'x2', kind: 'savings', currency: 'EUR', deleted_at: '2026-01-01T00:00:00Z' }),
          account({ id: 'x3', kind: 'other', currency: 'EUR' }),
        ],
        balances: { x1: 9, x2: 9, x3: 9 },
        series: [series({ id: 's-del', currency: 'EUR', deleted_at: '2026-01-01T00:00:00Z' }), series({ id: 's-ended', currency: 'EUR', end_date: '2026-09-30' })],
        debts: [debt({ currency: 'EUR', deleted_at: '2026-01-01T00:00:00Z' })],
        changes: [change({ currency: 'EUR', deleted_at: '2026-01-01T00:00:00Z' })],
      })
    );
    expect(r.unconverted).toBeNull();
    expect(r.meta.accountCount).toBe(2);
  });

  it('a custom-currency savings balance converts through its reference and does not make the snapshot unconverted', () => {
    const r = logged(
      withExtra({
        rates: [USD_RATE],
        customCurrencies: [customCurrency()],
        accounts: [account({ id: 'tok', kind: 'savings', currency: 'TOK' })],
        balances: { tok: 1_000 },
      })
    );
    expect(r.unconverted).toBeNull();
    expect(r.snapshot.cashOnHand).toBe(700_500);
    expect(r.conversions.map((c) => c.currency)).toEqual(['TOK']);
  });

  it('WR-B01: a zero balance in a currency with no stored rate leaves the snapshot converted', () => {
    const r = logged(
      withExtra({
        rates: [USD_RATE],
        accounts: [account({ id: 'jpy-sav', kind: 'savings', currency: 'JPY' }), account({ id: 'nob', kind: 'cash', currency: 'CHF' })],
        balances: { 'jpy-sav': 0 },
      })
    );
    expect(r.unconverted).toBeNull();
    expect(r.conversions.map((c) => c.currency)).not.toContain('JPY');
    expect(r.snapshot.cashOnHand).toBe(700_000);
  });

  it('a missing balance counts as zero', () => {
    const r = logged(withExtra({ accounts: [account({ id: 'no-bal', kind: 'cash' })] }));
    expect(r.snapshot.cashOnHand).toBe(700_000);
  });

  it('investment balances sum and never go negative', () => {
    const r = logged(withExtra({ accounts: [account({ id: 'inv', kind: 'investment' })], balances: { inv: 123_456 } }));
    expect(r.snapshot.investmentBalance).toBe(123_456);
    const neg = logged(withExtra({ accounts: [account({ id: 'inv', kind: 'investment' })], balances: { inv: -50 } }));
    expect(neg.snapshot.investmentBalance).toBe(0);
  });
});

describe('saving and investing', () => {
  const sav = (id: string, date: string, amount: number, extra = {}) =>
    row({ id, local_date: date, original_amount: amount, account_id: 'sav', transfer_id: `t-${id}`, ...extra });

  it('averages transfers into savings and investment accounts and Savings-category outflows over the months used', () => {
    const r = logged(
      withExtra({
        accounts: [account({ id: 'inv', kind: 'investment' }), account({ id: 'cc', kind: 'checking' })],
        rows: [
          sav('s1', '2026-09-03', 50_000),
          sav('s2', '2026-08-03', 30_000),
          sav('s3', '2026-09-04', 2),
          sav('s-pending', '2026-09-05', 99_999, { status: 'pending' }),
          row({ id: 'to-chk', local_date: '2026-09-06', original_amount: 7_000, account_id: 'cc', transfer_id: 't-cc' }),
          row({ id: 'to-unknown', local_date: '2026-09-06', original_amount: 7_000, account_id: 'ghost', transfer_id: 't-ghost' }),
          row({ id: 'to-inv', local_date: '2026-09-07', original_amount: 10_000, account_id: 'inv', transfer_id: 't-inv' }),
          row({ id: 'save-out', local_date: '2026-07-07', original_amount: -10_000, category_id: 'c-sav' }),
          row({ id: 'save-out-pending', local_date: '2026-07-08', original_amount: -50_000, category_id: 'c-sav', status: 'pending' }),
          row({ id: 'sav-leg-out', local_date: '2026-09-08', original_amount: -4_000, account_id: 'sav', transfer_id: 't-leg' }),
        ],
      })
    );
    expect(r.snapshot.monthlySaving).toBe(22_501); // (50,000 + 30,000 + 2 + 10,000) / 4, half-up
    expect(r.snapshot.monthlyInvesting).toBe(2_500);
    const all = r.snapshot.months.flatMap((m) => m.lines.map((l) => l.id));
    expect(all).not.toContain('save-out');
    expect(all).toContain('s1');
  });

  it('a Savings-category series is saving, not a bill', () => {
    const r = logged(
      withExtra({
        series: [series({ id: 's-sav', amount: -25_000, category_id: 'c-sav' })],
        rows: ['2026-08', '2026-09'].map((m) => row({ id: `sv-${m}`, local_date: `${m}-15`, original_amount: -25_000, category_id: 'c-sav', recurring_series_id: 's-sav' })),
      })
    );
    expect(r.snapshot.bills.map((b) => b.seriesId)).not.toContain('s-sav');
    expect(r.snapshot.months.flatMap((m) => m.lines).some((l) => l.seriesId === 's-sav')).toBe(false);
    expect(r.snapshot.monthlySaving).toBe(25_000);
  });

  it('a Go-ahead monthly investment counts as saving from the next check', () => {
    const r = logged(withExtra({ series: [series({ id: 's-inv', amount: -25_000, category_id: 'c-sav' })] }));
    expect(r.snapshot.monthlySaving).toBe(25_000);
    expect(r.snapshot.bills).toEqual([]);
  });

  it('a Go-ahead monthly investment counts as investing', () => {
    const r = logged(
      withExtra({
        series: [series({ id: 's-inv', amount: -25_000, category_id: 'c-sav', freq: 'weekly' })],
        paymentLinks: [paymentLink({ check_id: 'c-inv', target_id: 's-inv', check_kind: 'invest' })],
      })
    );
    expect(r.snapshot.monthlyInvesting).toBe(108_333);
    expect(r.snapshot.monthlySaving).toBe(0);
  });

  it('an ended Savings series counts for nothing', () => {
    const r = logged(withExtra({ series: [series({ id: 's-old', amount: -25_000, category_id: 'c-sav', end_date: '2026-09-01' })] }));
    expect(r.snapshot.monthlySaving).toBe(0);
  });
});

describe('every payment is counted once', () => {
  const loanFixture = (): SnapshotSource =>
    withExtra({
      debts: [debt({ id: 'loan-1', balance: 1_150_000, minimum_payment: 26_000, series_id: 's-pay2' })],
      series: [series({ id: 's-pay2', amount: -26_000, category_id: 'c-debt' })],
      rows: ['2026-08', '2026-09'].map((m) => row({ id: `lp-${m}`, local_date: `${m}-20`, original_amount: -26_000, category_id: 'c-debt', recurring_series_id: 's-pay2' })),
    });

  it('a loan payment written by Go ahead counts exactly once', () => {
    const r = logged(loanFixture());
    expect(r.snapshot.bills.map((b) => b.seriesId)).not.toContain('s-pay2');
    expect(r.snapshot.months.flatMap((m) => m.lines).some((l) => l.seriesId === 's-pay2')).toBe(false);
    expect(r.snapshot.debts).toEqual([{ id: 'loan-1', balance: 1_150_000, minimumPayment: 26_000, secured: false, apr: null, currency: 'USD' }]);
    const ctx = ctxOf(r.snapshot);
    expect(ctx.debtPayments).toBe(26_000);
    const without = ctxOf(logged(household()).snapshot);
    expect(ctx.money.spendingAverage).toBe(without.money.spendingAverage);
  });

  it('every payment run of a promo loan counts once', () => {
    const r = logged(
      withExtra({
        debts: [debt({ id: 'promo', check_id: 'c-promo', series_id: 's-run1', apr: '9.9', secured: true, balance: 500_000, minimum_payment: 10_000 })],
        series: [series({ id: 's-run1', amount: -10_000, category_id: 'c-debt' }), series({ id: 's-run2', amount: -12_000, category_id: 'c-debt' })],
        paymentLinks: [paymentLink({ check_id: 'c-promo', target_id: 's-run2' }), paymentLink({ check_id: 'other', target_id: 's-other' })],
        rows: [
          row({ id: 'run1-p', local_date: '2026-09-25', original_amount: -10_000, category_id: 'c-debt', recurring_series_id: 's-run1' }),
          row({ id: 'run2-p', local_date: '2026-09-26', original_amount: -12_000, category_id: 'c-debt', recurring_series_id: 's-run2' }),
        ],
      })
    );
    expect(r.snapshot.bills).toEqual([]);
    expect(r.snapshot.months.flatMap((m) => m.lines).some((l) => l.id.startsWith('run'))).toBe(false);
    expect(r.snapshot.debts).toHaveLength(1);
    expect(r.snapshot.debts[0]).toMatchObject({ secured: true, apr: percent('9.9') });
    expect(ctxOf(r.snapshot).debtPayments).toBe(10_000);
  });

  it('a Debt-category series no debt names stays a bill', () => {
    const r = logged(
      withExtra({
        series: [series({ id: 's-dbt', amount: -15_000, category_id: 'c-debt' })],
        rows: [row({ id: 'dbt-1', local_date: '2026-09-25', original_amount: -15_000, category_id: 'c-debt', recurring_series_id: 's-dbt' })],
      })
    );
    expect(r.snapshot.bills.map((b) => b.seriesId)).toEqual(['s-dbt']);
    expect(r.snapshot.bills[0]).toMatchObject({ latestAmount: 15_000, categoryId: 'c-debt', confirmed: true, lastPaidDate: '2026-09-25' });
    expect(r.snapshot.months.flatMap((m) => m.lines).some((l) => l.id === 'dbt-1')).toBe(true);
  });

  it('WR-B03 (D-68): a Debt-category payment that is not a transfer is spending, even with a debt recorded', () => {
    const extra = [row({ id: 'dbt-loose', local_date: '2026-09-25', original_amount: -15_000, category_id: 'c-debt' })];
    const kept = logged(withExtra({ rows: extra }));
    expect(kept.snapshot.months.flatMap((m) => m.lines).some((l) => l.id === 'dbt-loose')).toBe(true);
    // a recorded loan with a minimum does not make an unmatched payment its minimum: it went to an untracked account
    const withLoan = logged(withExtra({ rows: extra, debts: [debt({})] }));
    expect(withLoan.snapshot.months.flatMap((m) => m.lines).some((l) => l.id === 'dbt-loose')).toBe(true);
    expect(withLoan.snapshot.expenseLines.some((l) => l.lineId === 'c-debt')).toBe(true);
    // a Debt-category row inside a series is kept so the engine pairs it with its bill
    const inSeries = logged(
      withExtra({
        debts: [debt({})],
        series: [series({ id: 's-keep', amount: -3_000, category_id: 'c-debt' })],
        rows: [row({ id: 'keep-1', local_date: '2026-09-25', original_amount: -3_000, category_id: 'c-debt', recurring_series_id: 's-keep' })],
      })
    );
    expect(inSeries.snapshot.months.flatMap((m) => m.lines).some((l) => l.id === 'keep-1')).toBe(true);
  });

  it('a debt row converts at the latest rate and clamps negatives', () => {
    const r = logged(withExtra({ rates: [USD_RATE], debts: [debt({ id: 'eur-loan', currency: 'EUR', balance: 10_000, minimum_payment: 1_000, apr: '5' }), debt({ id: 'neg', balance: -5, minimum_payment: -1 })] }));
    expect(r.snapshot.debts[0]).toMatchObject({ id: 'eur-loan', balance: 11_000, minimumPayment: 1_100, apr: percent('5'), currency: 'USD' });
    expect(r.snapshot.debts[1]).toMatchObject({ balance: 0, minimumPayment: 0 });
  });
});

describe('bills and income series', () => {
  it('confirmed pay series become incomeSeries', () => {
    const r = logged(withExtra({ series: [series({ id: 's-side', amount: 50_000, freq: 'weekly', category_id: null }), series({ id: 's-xfer', amount: 50_000, category_id: 'c-xfer' }), series({ id: 's-zero', amount: 0 })] }));
    expect(r.snapshot.incomeSeries.map((s) => s.seriesId)).toEqual(['s-pay', 's-side']);
    expect(r.snapshot.incomeSeries[0]).toMatchObject({ latestAmount: 300_000, lastPaidDate: '2026-09-01' });
    expect(r.snapshot.bills).toEqual([]);
  });

  it('WR-B02: an outgoing Transfer series is not a bill, and needs no rate', () => {
    const r = logged(
      withExtra({
        rates: [USD_RATE],
        series: [
          series({ id: 's-xfer-out', amount: -40_000, category_id: 'c-xfer' }),
          series({ id: 's-xfer-jpy', amount: -40_000, currency: 'JPY', category_id: 'c-xfer' }),
          series({ id: 's-rent', amount: -40_000, category_id: 'c-house' }),
        ],
      })
    );
    expect(r.snapshot.bills.map((b) => b.seriesId)).toEqual(['s-rent']);
    expect(r.unconverted).toBeNull();
  });

  it('bills carry their latest amount, last settled date and skip ended series', () => {
    const r = logged(
      withExtra({
        rates: [USD_RATE],
        series: [
          series({ id: 's-rent', amount: -100_000, category_id: 'c-house' }),
          series({ id: 's-eur', amount: -10_000, currency: 'EUR' }),
          series({ id: 's-ended', amount: -1_000, end_date: '2026-10-14' }),
          series({ id: 's-last-day', amount: -1_000, end_date: '2026-10-15' }),
        ],
        rows: [
          row({ id: 'b1', local_date: '2026-08-02', original_amount: -100_000, recurring_series_id: 's-rent' }),
          row({ id: 'b2', local_date: '2026-09-02', original_amount: -100_000, recurring_series_id: 's-rent', status: 'skipped' }),
          row({ id: 'b3', local_date: '2026-07-02', original_amount: -100_000, recurring_series_id: 's-rent' }),
          row({ id: 'b4', local_date: '2026-10-20', original_amount: -100_000, recurring_series_id: 's-rent', status: 'pending' }),
        ],
      })
    );
    const ids = r.snapshot.bills.map((b) => b.seriesId);
    expect(ids).toEqual(['s-rent', 's-eur', 's-last-day']);
    expect(r.snapshot.bills[0]?.lastPaidDate).toBe('2026-09-02');
    expect(r.snapshot.bills[1]).toMatchObject({ latestAmount: 11_000, currency: 'USD', lastPaidDate: null });
  });
});

describe('a purchase already committed (04 D-61)', () => {
  const baseCtx = () => ctxOf(logged(household()).snapshot);
  const pending = (over: Partial<SnapshotSource['rows'][number]>) =>
    row({ id: 'p-buy', status: 'pending', original_amount: -180_000, account_id: 'chk', local_date: '2026-12-15', ...over });

  it('a Go-ahead pending purchase lowers the next check\'s cash', () => {
    const base = baseCtx();
    const r = logged({ ...household(), upcomingRows: [pending({})] });
    expect(r.snapshot.cashOnHand).toBe(700_000);
    expect(r.snapshot.scheduledOutflows).toEqual([{ id: 'p-buy', date: '2026-12-15', amount: 180_000, currency: 'USD' }]);
    expect(r.meta.pendingOneOffs).toBe(1);
    const ctx = ctxOf(r.snapshot);
    expect(ctx.cashAvailable).toBe(base.cashAvailable);
    expect(ctx.outflowsDueAhead).toBe(180_000);
    expect(ctx.cashAfterBills).toBe(base.cashAfterBills - 180_000);

    const today = logged({ ...household(), rows: [...household().rows, pending({ local_date: '2026-10-15' })], upcomingRows: [pending({ local_date: '2026-10-15' })] });
    expect(today.snapshot.cashOnHand).toBe(700_000);
    expect(today.snapshot.scheduledOutflows).toHaveLength(1);
    expect(today.meta.pendingOneOffs).toBe(1);
    const t = ctxOf(today.snapshot);
    expect(t.outflowsDueNow).toBe(180_000);
    expect(t.ledgerCash).toBe(base.ledgerCash - 180_000);
  });

  it('entries are sorted by date then id', () => {
    const r = logged({
      ...household(),
      upcomingRows: [pending({ id: 'z', local_date: '2026-11-01' }), pending({ id: 'b', local_date: '2026-11-01' }), pending({ id: 'a', local_date: '2026-12-01' }), pending({ id: 'y', local_date: '2026-10-20' }), pending({ id: 'c', local_date: '2026-11-01' }), pending({ id: 'x', local_date: '2026-10-20' })],
    });
    expect(r.snapshot.scheduledOutflows.map((o) => o.id)).toEqual(['x', 'y', 'b', 'c', 'z', 'a']);
  });

  it('the same row on a credit account raises that account\'s derived card debt and adds no scheduled entry', () => {
    const r = logged({
      ...household({ region: null }),
      accounts: [...household().accounts, account({ id: 'card', kind: 'credit' })],
      upcomingRows: [pending({ account_id: 'card' })],
    });
    expect(r.snapshot.scheduledOutflows).toEqual([]);
    expect(r.snapshot.debts).toMatchObject([{ id: 'card', balance: 180_000, minimumPayment: 0 }]);
    expect(r.meta).toMatchObject({ pendingOneOffs: 1, derivedDebts: 1, cardsWithoutMinimum: 1 });
  });

  it('ignores money in, series rows and unknown accounts', () => {
    const r = logged({
      ...household(),
      debts: [debt({})],
      upcomingRows: [
        pending({ id: 'p-in', original_amount: 5_000 }),
        pending({ id: 'p-series', recurring_series_id: 's-pay' }),
        pending({ id: 'p-ghost', account_id: 'ghost' }),
        pending({ id: 'p-paid', status: 'paid' }),
        pending({ id: 'p-investment-acct', account_id: 'inv' }),
        pending({ id: 'p-deleted', deleted_at: '2026-10-01T00:00:00Z' }),
      ],
      accounts: [...household().accounts, account({ id: 'arch', kind: 'checking', archived_at: '2026-01-01T00:00:00Z' }), account({ id: 'inv', kind: 'investment' })],
    });
    expect(r.snapshot.scheduledOutflows).toEqual([]);
    expect(r.meta.pendingOneOffs).toBe(0);
  });

  it('a pending Debt-category purchase is kept when no debt is recorded, and an archived account is ignored', () => {
    const r = logged({
      ...household(),
      accounts: [...household().accounts, account({ id: 'arch', kind: 'checking', archived_at: '2026-01-01T00:00:00Z' })],
      upcomingRows: [pending({ id: 'p-debt', category_id: 'c-debt' }), pending({ id: 'p-arch', account_id: 'arch' })],
    });
    expect(r.snapshot.scheduledOutflows.map((o) => o.id)).toEqual(['p-debt']);
  });

  it('a pending transfer between cash accounts is an internal move; one to an investment account is an entry', () => {
    const legs = (id: string, to: string) => [
      pending({ id: `${id}-out`, transfer_id: id, original_amount: -50_000 }),
      pending({ id: `${id}-in`, transfer_id: id, original_amount: 50_000, account_id: to }),
    ];
    const internal = logged({ ...household(), upcomingRows: legs('t-int', 'sav') });
    expect(internal.snapshot.scheduledOutflows).toEqual([]);
    expect(internal.meta.pendingOneOffs).toBe(0);
    const accounts = [...household().accounts, account({ id: 'inv', kind: 'investment' }), account({ id: 'arch', kind: 'savings', archived_at: '2026-01-01T00:00:00Z' })];
    const toInvest = logged({ ...household(), accounts, upcomingRows: legs('t-inv', 'inv') });
    expect(toInvest.snapshot.scheduledOutflows.map((o) => [o.id, o.amount])).toEqual([['t-inv-out', 50_000]]);
    const toArchived = logged({ ...household(), accounts, upcomingRows: legs('t-arch', 'arch') });
    expect(toArchived.snapshot.scheduledOutflows).toHaveLength(1);
    const toGhost = logged({ ...household(), accounts, upcomingRows: legs('t-ghost', 'ghost') });
    expect(toGhost.snapshot.scheduledOutflows).toHaveLength(1);
    const noPartner = logged({ ...household(), accounts, upcomingRows: [pending({ id: 'lonely', transfer_id: 't-lonely' })] });
    expect(noPartner.snapshot.scheduledOutflows).toHaveLength(1);
  });

  it('a pending row with no stored rate is counted once, even when it is also a line', () => {
    const eur = pending({ id: 'p-eur', local_date: '2026-09-28', original_currency: 'EUR', home_currency: 'EUR' });
    const r = logged({ ...household(), rows: [...household().rows, eur], upcomingRows: [eur] });
    expect(r.unconverted).toEqual({ currencies: ['EUR'], rowCount: 1 });
    expect(r.meta.unconvertedRows).toBe(1);
  });
});

describe('card minimums (D-40)', () => {
  const card = (balance: number, over: Partial<SnapshotSource> = {}): SnapshotSource => ({
    ...household(),
    accounts: [...household().accounts, account({ id: 'card', name: 'Visa', kind: 'credit' })],
    balances: { chk: 500_000, sav: 200_000, card: balance },
    ...over,
  });

  it('WR-B03 (D-68): a Debt-category payment that is not a transfer stays spending beside a counted card minimum', () => {
    const terms = { kind: 'card' as const, account_id: 'card', min_percent: '2', min_interest_added: false, min_floor: 2_500 };
    const payments = [row({ id: 'card-pay', local_date: '2026-09-25', original_amount: -15_000, category_id: 'c-debt' })];
    const pendingPay = row({ id: 'card-pay-next', status: 'pending', local_date: '2026-11-25', original_amount: -15_000, category_id: 'c-debt' });
    const r = logged(card(-120_000, { debts: [debt(terms)], rows: [...household().rows, ...payments], upcomingRows: [pendingPay] }));
    expect(r.snapshot.debts.map((d) => d.minimumPayment)).toEqual([2_500]);
    expect(r.snapshot.months.flatMap((m) => m.lines).some((l) => l.id === 'card-pay')).toBe(true);
    expect(r.snapshot.expenseLines.some((l) => l.lineId === 'c-debt')).toBe(true);
    expect(r.snapshot.scheduledOutflows.map((o) => o.id)).toEqual(['card-pay-next']);
    expect(r.meta.pendingOneOffs).toBe(1);
  });

  const legs = (id: string, to: string) => [
    row({ id: `${id}-out`, status: 'pending', local_date: '2026-11-25', original_amount: -15_000, category_id: 'c-debt', transfer_id: id }),
    row({ id: `${id}-in`, status: 'pending', local_date: '2026-11-25', original_amount: 15_000, category_id: 'c-debt', transfer_id: id, account_id: to }),
  ];

  it('WR-B03 (D-68): a pending Debt-category transfer into a card whose minimum is counted is that minimum', () => {
    const terms = { kind: 'card' as const, account_id: 'card', min_percent: '2', min_interest_added: false, min_floor: 2_500 };
    const r = logged(card(-120_000, { debts: [debt(terms)], upcomingRows: legs('t-card', 'card') }));
    expect(r.snapshot.debts.map((d) => d.minimumPayment)).toEqual([2_500]);
    expect(r.snapshot.scheduledOutflows).toEqual([]);
    expect(r.meta.pendingOneOffs).toBe(0);
  });

  it('WR-B03 (D-68): a pending Debt-category transfer into a card with no counted minimum is an outflow', () => {
    const paidInFull = { kind: 'card' as const, account_id: 'card', paid_in_full: true };
    const r = logged(card(-120_000, { debts: [debt(paidInFull)], upcomingRows: legs('t-pif', 'card') }));
    expect(r.snapshot.debts.map((d) => d.minimumPayment)).toEqual([0]);
    expect(r.snapshot.scheduledOutflows.map((o) => o.id)).toEqual(['t-pif-out']);
    expect(r.meta.pendingOneOffs).toBe(1);
  });

  it('WR-B03 (D-68): a pending Debt-category transfer into a recorded loan counts as its minimum only when one is set', () => {
    const accounts = [...household().accounts, account({ id: 'loan-acct', kind: 'loan' })];
    const withMinimum = logged({ ...household(), accounts, debts: [debt({ account_id: 'loan-acct' })], upcomingRows: legs('t-loan', 'loan-acct') });
    expect(withMinimum.snapshot.scheduledOutflows).toEqual([]);
    const noMinimum = logged({ ...household(), accounts, debts: [debt({ account_id: 'loan-acct', minimum_payment: 0 })], upcomingRows: legs('t-loan0', 'loan-acct') });
    expect(noMinimum.snapshot.scheduledOutflows.map((o) => o.id)).toEqual(['t-loan0-out']);
  });

  it('WR-B03 (D-68): a pending Debt-category transfer to an untracked account or with no partner leg is an outflow', () => {
    const lonely = row({ id: 'lonely', status: 'pending', local_date: '2026-11-25', original_amount: -15_000, category_id: 'c-debt', transfer_id: 't-lonely' });
    const r = logged(card(-120_000, { upcomingRows: [...legs('t-ghost', 'ghost'), lonely] }));
    expect(r.snapshot.scheduledOutflows.map((o) => o.id).sort()).toEqual(['lonely', 't-ghost-out']);
  });

  it('WR-B03: a recorded debt with no minimum leaves Debt-category payments as outgoings', () => {
    const payments = [row({ id: 'dbt-pay', local_date: '2026-09-25', original_amount: -15_000, category_id: 'c-debt' })];
    const pendingPay = row({ id: 'dbt-next', status: 'pending', local_date: '2026-11-25', original_amount: -15_000, category_id: 'c-debt' });
    const r = logged({ ...household(), debts: [debt({ minimum_payment: 0 })], rows: [...household().rows, ...payments], upcomingRows: [pendingPay] });
    expect(r.snapshot.months.flatMap((m) => m.lines).some((l) => l.id === 'dbt-pay')).toBe(true);
    expect(r.snapshot.expenseLines.some((l) => l.lineId === 'c-debt')).toBe(true);
    expect(r.snapshot.scheduledOutflows.map((o) => o.id)).toEqual(['dbt-next']);
    expect(r.meta.pendingOneOffs).toBe(1);
  });

  it('stored card terms set the card minimum', () => {
    const r = logged(card(-120_000, { debts: [debt({ id: 'card-d', kind: 'card', account_id: 'card', apr: '22.9', min_percent: '2', min_interest_added: false, min_floor: 2_500, version: 4 })] }));
    const expected = simulateMinimum(minorUnits(120_000), percent('22.9'), { minimumPercent: percent('2'), interestAdded: false, floor: minorUnits(2_500) }).firstPayment;
    expect(expected).toBe(2_500);
    expect(r.snapshot.debts).toEqual([{ id: 'card', balance: 120_000, minimumPayment: expected, secured: false, apr: percent('22.9'), currency: 'USD' }]);
    expect(ctxOf(r.snapshot).debtPayments).toBe(2_500);
    expect(r.meta.cardsWithoutMinimum).toBe(0);
    expect(r.cards[0]).toMatchObject({
      accountId: 'card',
      name: 'Visa',
      record: { id: 'card', apr: percent('22.9'), currency: 'USD', minimumTerms: { minimumPercent: percent('2'), interestAdded: false, floor: 2_500 } },
      terms: { debtId: 'card-d', source: 'stored', paidInFull: false, percentText: '2', interestAdded: false, floor: 2_500, floorCurrency: 'USD', marketAvailable: true, version: 4 },
    });
  });

  it('market terms pre-fill the card minimum', () => {
    const r = logged(card(-120_000));
    const terms = minimumTermsFromDefaults(MARKET_DEFAULTS.US)!;
    expect(r.snapshot.debts[0]?.minimumPayment).toBe(simulateMinimum(minorUnits(120_000), ZERO_PERCENT, terms).firstPayment);
    expect(r.meta.cardsMinimumWithoutRate).toBe(1);
    expect(r.cards[0]?.terms).toEqual({ debtId: null, source: 'market', paidInFull: false, percentText: '1', interestAdded: true, floor: 2_500, floorCurrency: 'USD', marketAvailable: true, version: null });
    const withRate = logged(card(-120_000, { debts: [debt({ kind: 'card', account_id: 'card', apr: '22.9' })] }));
    expect(withRate.meta.cardsMinimumWithoutRate).toBe(0);
    expect(withRate.snapshot.debts[0]?.apr).toBe(percent('22.9'));
    expect(withRate.cards[0]?.terms).toMatchObject({ source: 'market' });
    const noInterest = logged({ ...card(-120_000, { region: 'CA', homeCurrency: 'CAD' }) });
    expect(noInterest.kind).toBe('logged');
  });

  it('a pay-in-full card adds no payment', () => {
    const spend = ['2026-08', '2026-09'].map((m) => row({ id: `cs-${m}`, local_date: `${m}-21`, original_amount: -21_000, account_id: 'card', category_id: 'c-food' }));
    const mk = (balance: number) => card(balance, { rows: [...household().rows, ...spend], debts: [debt({ kind: 'card', account_id: 'card', paid_in_full: true })] });
    const r = logged(mk(-42_000));
    expect(r.snapshot.debts[0]?.minimumPayment).toBe(0);
    expect(r.cards[0]?.record.minimumTerms).toBeNull();
    expect(r.cards[0]?.terms.paidInFull).toBe(true);
    expect(r.meta.cardsWithoutMinimum).toBe(0);
    const zero = logged(mk(0));
    const a = ctxOf(r.snapshot);
    const b = ctxOf(zero.snapshot);
    expect(a.money.spendingAverage).toBe(b.money.spendingAverage);
    expect(a.debtPayments).toBe(b.debtPayments);
  });

  it('a card with no terms and no market row is named', () => {
    const r = logged(card(-42_000, { region: null }));
    expect(r.snapshot.debts[0]?.minimumPayment).toBe(0);
    expect(r.meta.cardsWithoutMinimum).toBe(1);
    expect(r.meta.cardsWithoutMinimumIds).toEqual(['card']);
    expect(r.cards[0]?.terms).toMatchObject({ source: 'none', percentText: null, interestAdded: null, floor: null, marketAvailable: false });
    expect(r.cards[0]?.record.minimumTerms).toBeNull();
  });

  it('a card in another currency gets no borrowed market terms', () => {
    const r = logged(card(-30_000, { rates: [USD_RATE, CAD_RATE], accounts: [...household().accounts, account({ id: 'card', kind: 'credit', currency: 'CAD' })] }));
    expect(r.cards[0]?.terms).toMatchObject({ source: 'none', floorCurrency: 'CAD' });
    expect(r.meta.cardsWithoutMinimum).toBe(1);
    expect(r.snapshot.debts[0]?.balance).toBe(22_000);
  });

  it('a stored floor with no rate and a market floor with no rate are left unconverted, not guessed', () => {
    const stored = logged(card(-30_000, { debts: [debt({ kind: 'card', account_id: 'card', currency: 'EUR', min_percent: '2', min_interest_added: true, min_floor: 100 })] }));
    expect(stored.unconverted?.currencies).toEqual(['EUR']);
    expect(stored.cards[0]?.terms.source).toBe('stored');
    expect(stored.cards[0]?.record.minimumTerms).toBeNull();
    const market = logged(card(-30_000, { region: 'CA', accounts: [...household().accounts, account({ id: 'card', kind: 'credit', currency: 'CAD' })] }));
    expect(market.cards[0]?.terms.source).toBe('none');
    expect(market.unconverted?.currencies).toEqual(['CAD']);
  });

  it('a market row with missing fields gives no terms', () => {
    const r = logged(card(-30_000, { region: 'CA', homeCurrency: 'CAD' }));
    expect(r.kind).toBe('logged');
  });

  it('a card payoff series counts once, as a bill', () => {
    const payoff = (balance: number, extra: Partial<SnapshotSource> = {}): SnapshotSource =>
      card(balance, {
        series: [...household().series, series({ id: 's-card', amount: -15_500, category_id: 'c-debt' })],
        rows: [...household().rows, row({ id: 'p-card', status: 'pending', original_amount: -180_000, account_id: 'card', local_date: '2026-10-20' })],
        paymentLinks: [paymentLink({ check_id: 'c-card', target_id: 's-card', check_kind: 'buy' })],
        writtenRowLinks: [{ check_id: 'c-card', target_id: 'p-card' }, { check_id: 'c-none', target_id: 'p-other' }],
        ...extra,
      });
    const r = logged(payoff(0, { region: null }));
    expect(r.snapshot.bills.map((b) => b.seriesId)).toEqual(['s-card']);
    expect(r.snapshot.debts).toMatchObject([{ id: 'card', balance: 180_000, minimumPayment: 0 }]);
    expect(ctxOf(r.snapshot).debtPayments).toBe(0);
    expect(r.meta.cardsWithoutMinimum).toBe(0);

    const stored = logged(
      payoff(-120_000, { debts: [debt({ kind: 'card', account_id: 'card', apr: '20', min_percent: '10', min_interest_added: false, min_floor: 2_500 })] })
    );
    const expected = simulateMinimum(minorUnits(120_000), percent('20'), { minimumPercent: percent('10'), interestAdded: false, floor: minorUnits(2_500) }).firstPayment;
    expect(expected).toBe(12_000);
    expect(stored.snapshot.debts[0]).toMatchObject({ balance: 300_000, minimumPayment: 12_000 });
    expect(ctxOf(stored.snapshot).debtPayments).toBe(12_000);
    expect(stored.snapshot.bills.map((b) => b.seriesId)).toEqual(['s-card']);
  });
});

describe('loan accounts (D-38 minimal reading, DCU-24)', () => {
  const loanSource = (balance: number, extra: Partial<SnapshotSource> = {}): SnapshotSource => ({
    ...household(),
    accounts: [...household().accounts, account({ id: 'loan1', kind: 'loan' })],
    balances: { chk: 500_000, sav: 200_000, loan1: balance },
    ...extra,
  });

  it('a loan account with no debt record and no series is named', () => {
    const r = logged(loanSource(-500_000));
    expect(r.snapshot.debts).toEqual([{ id: 'loan1', balance: 500_000, minimumPayment: 0, secured: false, apr: null, currency: 'USD' }]);
    expect(r.meta).toMatchObject({ loansWithoutPayment: 1, derivedDebts: 1 });
    const withSeries = logged(loanSource(-500_000, { series: [...household().series, series({ account_id: 'loan1', amount: -20_000, category_id: 'c-debt' })] }));
    expect(withSeries.meta.loansWithoutPayment).toBe(0);
    expect(withSeries.snapshot.bills).toHaveLength(1);
    const zero = logged(loanSource(0));
    expect(zero.meta.loansWithoutPayment).toBe(0);
    expect(zero.snapshot.debts).toEqual([]);
  });

  it('a loan account named by a debts row gets its record from the row only', () => {
    const r = logged(loanSource(-500_000, { debts: [debt({ id: 'ln', account_id: 'loan1', balance: 480_000, minimum_payment: 9_000 })] }));
    expect(r.snapshot.debts.map((d) => d.id)).toEqual(['ln']);
    expect(r.meta.derivedDebts).toBe(0);
  });

  it('a loan account takes its rate from a card-kind row when one exists', () => {
    const r = logged(loanSource(-500_000, { debts: [debt({ kind: 'card', account_id: 'loan1', apr: '7.5' })] }));
    expect(r.snapshot.debts[0]?.apr).toBe(percent('7.5'));
  });
});

describe('market defaults and the dealer cap', () => {
  it('uses the US dealer cap, converts it for another home currency and never invents one', () => {
    expect(buildDecideSnapshot(sourceOf()).dealerCap).toBe(500_000);
    expect(buildDecideSnapshot(sourceOf({ homeCurrency: 'EUR', rates: [USD_RATE] })).dealerCap).toBe(454_545);
    expect(buildDecideSnapshot(sourceOf({ homeCurrency: 'EUR' })).dealerCap).toBeNull();
    expect(buildDecideSnapshot(sourceOf({ region: null })).dealerCap).toBeNull();
    expect(buildDecideSnapshot(sourceOf({ homeCurrency: 'EUR', rates: [USD_RATE] })).conversions).toEqual([]);
  });

  it('a market with no dealer cap passes null', () => {
    const source = household(
      {
        region: 'CA',
        accounts: [account({ id: 'chk', currency: 'CAD' }), account({ id: 'sav', kind: 'savings', currency: 'CAD' }), account({ id: 'card', kind: 'credit', currency: 'CAD' })],
      },
      'CAD'
    );
    const r = logged(source);
    expect(r.dealerCap).toBeNull();
    const check: BuyCheck = {
      kind: 'buy',
      currency: currencyCode('CAD'),
      price: minorUnits(3_000_000),
      dayFees: minorUnits(0),
      itemType: 'vehicle',
      runningCostsNet: minorUnits(0),
      payment: { method: 'card', card: r.cards[0]!.record, payoff: { kind: 'full' }, dealerCap: r.dealerCap },
    };
    const verdict = decide(r.snapshot, check).verdict;
    expect(verdict.state).toBe('missing');
    if (verdict.state === 'missing') expect(verdict.reasons).toContain('dealer_cap_missing');
  });
});

describe('the card check limit (D-91)', () => {
  it('D-91 the card limit converts at the latest stored rate and floors', () => {
    // 10,000,000 USD cents at 1.3 USD per EUR = 7,692,307.69 EUR cents: a half-up conversion would give 7,692,308
    const r = buildDecideSnapshot(sourceOf({ homeCurrency: 'EUR', rates: [{ ...USD_RATE, rate: '1.3' }] }));
    expect(r.cardMaxPurchase).toBe(7_692_307);
    expect(buildDecideSnapshot(sourceOf({ homeCurrency: 'EUR', rates: [USD_RATE] })).cardMaxPurchase).toBe(9_090_909);
  });

  it('D-91 no USD rate leaves the limit null', () => {
    const r = buildDecideSnapshot(sourceOf({ homeCurrency: 'EUR' }));
    expect(r.cardMaxPurchase).toBeNull();
    expect(r.basisNotes).toEqual([]);
    expect(buildDecideSnapshot(sourceOf({ homeCurrency: 'GBP', rates: [USD_RATE] })).cardMaxPurchase).toBeNull();
  });

  it('D-91 USD home needs no rate', () => {
    const r = buildDecideSnapshot(sourceOf());
    expect(r.cardMaxPurchase).toBe(CARD_MAX_PURCHASE_USD);
    expect(r.basisNotes).toEqual([]);
  });

  it('D-91 an older rate adds only a basis note', () => {
    const r = buildDecideSnapshot(sourceOf({ homeCurrency: 'EUR', rates: [USD_RATE] }));
    expect(r.basisNotes).toEqual([{ kind: 'card_limit_rate', date: '2026-10-14' }]);
    expect(r.conversions).toEqual([]);
    expect(r.unconverted).toBeNull();
    expect(r.provisional).toBeNull();
    const dated = buildDecideSnapshot(sourceOf({ homeCurrency: 'EUR', rates: [{ ...USD_RATE, rate_date: '2026-10-15' }] }));
    expect(dated.basisNotes).toEqual([]);
  });

  it('D-92 the RD-02 region is carried through', () => {
    expect(buildDecideSnapshot(sourceOf({ region: 'GB' })).region).toBe('GB');
    expect(buildDecideSnapshot(sourceOf({ region: null })).region).toBeNull();
  });
});

describe('limits', () => {
  it('passes the user\'s own limits through', () => {
    const r = logged(
      household({
        settings: settings({ reserve: 100_000, dsr_line: '30.5', unsecured_multiple: 10, investing_floor: 5_000, saving_floor: 7_000, basis_override: 'worst' }),
      })
    );
    expect(r.snapshot.limits).toEqual({ reserve: 100_000, dsrLine: percent('30.5'), housingLine: null, unsecuredIncomeMultiple: 10, investingFloor: 5_000, savingFloor: 7_000, spareFloor: null });
    expect(r.snapshot.basisOverride).toBe('worst');
    expect(r.meta.limitsReset).toBe(0);
  });

  it('a blank line stays null so the engine default applies', () => {
    const r = logged(household({ settings: settings() }));
    expect(r.snapshot.limits).toEqual({ reserve: null, dsrLine: null, housingLine: null, unsecuredIncomeMultiple: null, investingFloor: null, savingFloor: null, spareFloor: null });
  });

  it('treats the money limits as null when they were typed in another currency', () => {
    const r = logged(household({ settings: settings({ currency: 'EUR', reserve: 5_000, dsr_line: '30' }) }));
    expect(r.snapshot.limits.reserve).toBeNull();
    expect(r.snapshot.limits.dsrLine).toBe(percent('30'));
    expect(logged(household({ settings: settings({ currency: 'USD', reserve: 5_000 }) })).snapshot.limits.reserve).toBe(5_000);
  });

  it('never passes an invalid limit to the engine', () => {
    const cases: Partial<ReturnType<typeof settings>>[] = [
      { reserve: -1 },
      { reserve: 12.5 },
      { reserve: 2 ** 60 },
      { investing_floor: -1 },
      { saving_floor: 1.5 },
      { dsr_line: '-5' },
      { dsr_line: 'abc' },
      { unsecured_multiple: 1.5 },
      { unsecured_multiple: -2 },
      { unsecured_multiple: 121 },
    ];
    for (const c of cases) {
      const r = logged(household({ settings: settings(c) }));
      const l = r.snapshot.limits;
      expect([l.reserve, l.investingFloor, l.savingFloor, l.dsrLine, l.unsecuredIncomeMultiple]).toEqual([null, null, null, null, null]);
      expect(r.meta.limitsReset).toBe(1);
      expect(prepareContext(r.snapshot).ok).toBe(true);
    }
    const all = logged(household({ settings: settings({ reserve: -1, dsr_line: 'abc', unsecured_multiple: 1.5, investing_floor: -1, saving_floor: -1 }) }));
    expect(all.meta.limitsReset).toBe(5);
  });
});

describe('dated changes (D-27)', () => {
  it('passes live changes in the home currency and leaves ended ones out', () => {
    const r = logged(
      withExtra({
        rates: [USD_RATE],
        changes: [
          change({ id: 'raise', monthly_amount: 20_000 }),
          change({ id: 'cut', kind: 'spending', monthly_amount: -5_000, end_month: '2026-10' }),
          change({ id: 'ended', end_month: '2026-09' }),
          change({ id: 'gone', deleted_at: '2026-10-01T00:00:00Z' }),
          change({ id: 'euro', monthly_amount: 10_000, currency: 'EUR' }),
        ],
      })
    );
    expect(r.snapshot.futureChanges).toEqual([
      { id: 'raise', kind: 'income', monthlyAmount: 20_000, startMonth: '2026-11', endMonth: null, currency: 'USD' },
      { id: 'cut', kind: 'spending', monthlyAmount: -5_000, startMonth: '2026-11', endMonth: '2026-10', currency: 'USD' },
      { id: 'euro', kind: 'income', monthlyAmount: 11_000, startMonth: '2026-11', endMonth: null, currency: 'USD' },
    ]);
  });
});

describe('property: the engine accepts what the builder builds', () => {
  it('every built snapshot is one prepareContext accepts', () => {
    const money = fc.oneof(fc.constant(null), fc.integer({ min: -5, max: 5_000_000 }), fc.double({ min: -5, max: 5_000_000, noNaN: true }), fc.constant(2 ** 60));
    const settingsArb = fc.record({
      currency: fc.constantFrom<string | null>(null, 'USD', 'EUR'),
      rough_income: fc.constant(null),
      rough_spending: fc.constant(null),
      reserve: money,
      dsr_line: fc.constantFrom<string | null>(null, '-5', 'abc', '30', '36.5', '999.9999', '1000'),
      housing_line: fc.constantFrom<string | null>(null, '-5', 'abc', '28', '100', '100.0001', '999.9999'),
      unsecured_multiple: fc.oneof(fc.constant(null), fc.integer({ min: -5, max: 200 }), fc.double({ min: -5, max: 200, noNaN: true })),
      investing_floor: money,
      saving_floor: money,
      basis_override: fc.constantFrom<'average' | 'worst' | null>(null, 'average', 'worst'),
    });
    const debtArb = fc.record({
      kind: fc.constantFrom<'loan' | 'card' | 'other'>('loan', 'card', 'other'),
      balance: fc.integer({ min: -1_000, max: 9_000_000 }),
      minimum_payment: fc.integer({ min: -1_000, max: 200_000 }),
      secured: fc.boolean(),
      apr: fc.constantFrom<string | null>(null, '0', '12.5', '29.99'),
      paid_in_full: fc.boolean(),
      is_housing: fc.boolean(),
      min_percent: fc.constantFrom<string | null>(null, '1', '2.5'),
      min_interest_added: fc.constantFrom<boolean | null>(null, true, false),
      min_floor: fc.constantFrom<number | null>(null, 0, 2_500),
    });
    const rowArb = fc.record({
      amount: fc.integer({ min: -400_000, max: 400_000 }),
      day: fc.integer({ min: 1, max: 28 }),
      month: fc.constantFrom(...MONTHS),
      status: fc.constantFrom<'paid' | 'pending' | 'skipped'>('paid', 'pending', 'skipped'),
      cat: fc.constantFrom<string | null>(null, ...Object.keys(CATEGORIES)),
      oneOff: fc.boolean(),
    });
    fc.assert(
      fc.property(settingsArb, fc.array(debtArb, { maxLength: 3 }), fc.array(rowArb, { maxLength: 8 }), (st, ds, rs) => {
        const base = household({ settings: st });
        const source: SnapshotSource = {
          ...base,
          accounts: [...base.accounts, account({ id: 'card', kind: 'credit' })],
          balances: { ...base.balances, card: -50_000 },
          debts: ds.map((d, i) => debt({ ...d, id: `pd-${i}`, account_id: i === 0 ? 'card' : null })),
          rows: [
            ...base.rows,
            ...rs.map((r, i) =>
              row({ id: `pr-${i}`, local_date: `${r.month}-${String(r.day).padStart(2, '0')}`, original_amount: r.amount, status: r.status, category_id: r.cat, one_off: r.oneOff })
            ),
          ],
        };
        const result = buildDecideSnapshot(source);
        if (result.kind !== 'logged') return false;
        expect(() => prepareContext(result.snapshot)).not.toThrow();
        const s = result.snapshot;
        const ok = (n: number) => Number.isSafeInteger(n) && n >= 0;
        return s.debts.every((d) => ok(d.balance) && ok(d.minimumPayment)) && ok(s.monthlySaving) && ok(s.monthlyInvesting) && ok(s.investmentBalance);
      }),
      { numRuns: 150 }
    );
  });
});

describe('pots (D-101, R18.2)', () => {
  const sav = (id: string, date: string, amount: number, extra = {}) =>
    row({ id, local_date: date, original_amount: amount, account_id: 'sav', transfer_id: `t-${id}`, ...extra });

  it('D-101 the builder passes live not-done pots to the engine', () => {
    const r = logged(
      withExtra({
        goals: [
          goal({ id: 'g-live', target: 60_000, opening_saved: 10_000 }),
          goal({ id: 'g-done', done_at: '2026-10-01T00:00:00Z' }),
          goal({ id: 'g-gone', deleted_at: '2026-10-02T00:00:00Z' }),
          goal({ id: 'g-wait', kind: 'wait', check_id: 'chk-9', target: 30_000, monthly_amount: 5_000, ready_by: null }),
          goal({ id: 'g-notarget', kind: 'wait', check_id: null, target: null, monthly_amount: 0, ready_by: null }),
        ],
      })
    );
    expect(r.snapshot.pots).toEqual([
      { id: 'g-live', kind: 'pot', target: 60_000, monthlyAmount: null, readyBy: '2027-03-31', saved: 10_000 },
      { id: 'g-wait', kind: 'wait', target: 30_000, monthlyAmount: 5_000, readyBy: null, saved: 0 },
      { id: 'g-notarget', kind: 'wait', target: null, monthlyAmount: 0, readyBy: null, saved: 0 },
    ]);
    expect(r.pots).toBe(r.snapshot.pots); // 05-134 reads pots from the result base
    expect(r.potChecks).toEqual({ 'g-wait': 'chk-9' });
    // five whole months from 15 Oct to 31 Mar: 50,000 / 5 = 10,000, plus the Wait pot's 5,000
    expect(ctxOf(r.snapshot).setAside).toBe(15_000);
    expect(r.meta.unconvertedPots).toBe(0);
  });

  it('D-101 a pot counts the paid tagged lines as saved', () => {
    const r = logged(
      withExtra({
        goals: [goal({ id: 'g1', target: 200_000, opening_saved: 5_000 })],
        rows: [
          sav('tag-1', '2026-09-03', 30_000, { goal_id: 'g1' }),
          sav('tag-2', '2026-02-03', 20_000, { goal_id: 'g1' }),
          sav('tag-pending', '2026-09-04', 99_999, { goal_id: 'g1', status: 'pending' }),
          sav('tag-other', '2026-09-05', 77_777, { goal_id: 'someone-else' }),
        ],
      })
    );
    expect(r.snapshot.pots[0]!.saved).toBe(55_000);
  });

  it('D-101 a tagged transfer leg is not counted as saving', () => {
    const inv = { id: 'i-plain', local_date: '2026-09-07', original_amount: 8_000, account_id: 'inv', transfer_id: 't-inv-plain' };
    const base = withExtra({
      accounts: [account({ id: 'inv', kind: 'investment' })],
      rows: [sav('s-plain', '2026-09-03', 40_000), row(inv)],
    });
    const tagged = withExtra({
      goals: [goal({ id: 'g1' })],
      accounts: [account({ id: 'inv', kind: 'investment' })],
      rows: [
        sav('s-plain', '2026-09-03', 40_000),
        sav('s-tagged', '2026-09-04', 60_000, { goal_id: 'g1' }),
        row(inv),
        row({ id: 'i-tagged', local_date: '2026-09-08', original_amount: 9_000, account_id: 'inv', transfer_id: 't-inv-tagged', goal_id: 'g1' }),
      ],
    });
    const a = logged(base).snapshot;
    const b = logged(tagged).snapshot;
    expect(b.monthlySaving).toBe(a.monthlySaving);
    expect(b.monthlyInvesting).toBe(a.monthlyInvesting);
    expect(b.monthlySaving).toBe(10_000);
    expect(b.monthlyInvesting).toBe(2_000);
  });

  it('D-101 a leg tagged to a done or deleted pot counts as saving again', () => {
    const rows = (goalId: string | null) => [
      sav('s-plain', '2026-09-03', 40_000),
      sav('s-tagged', '2026-09-04', 60_000, goalId === null ? {} : { goal_id: goalId }),
    ];
    const untagged = logged(withExtra({ goals: [], rows: rows(null) })).snapshot;
    const done = logged(withExtra({ goals: [goal({ id: 'g1', done_at: '2026-10-01T00:00:00Z' })], rows: rows('g1') })).snapshot;
    const deleted = logged(withExtra({ goals: [goal({ id: 'g1', deleted_at: '2026-10-01T00:00:00Z' })], rows: rows('g1') })).snapshot;
    const live = logged(withExtra({ goals: [goal({ id: 'g1' })], rows: rows('g1') })).snapshot;
    expect(done.monthlySaving).toBe(untagged.monthlySaving);
    expect(deleted.monthlySaving).toBe(untagged.monthlySaving);
    expect(live.monthlySaving).toBeLessThan(untagged.monthlySaving);
    expect(done.pots).toHaveLength(0);
  });

  it('D-101 an untagged Savings series still counts as saving', () => {
    const r = logged(
      withExtra({
        goals: [goal({ id: 'g1' })],
        series: [series({ id: 's-sav', amount: -25_000, category_id: 'c-sav' })],
      })
    );
    expect(r.snapshot.monthlySaving).toBe(25_000);
    expect(r.snapshot.pots).toHaveLength(1);
  });

  it('D-101 a pot in another currency converts at the latest stored rate and rounds up', () => {
    // 1 EUR = 1.1 USD: 100,001 EUR cents is 110,001.1 USD cents (target up), 1 cent is 1.1 (opening down), 3 is 3.3 (Wait amount up)
    const r = logged(
      withExtra({
        rates: [USD_RATE],
        goals: [
          goal({ id: 'g-eur', currency: 'EUR', target: 100_001, opening_saved: 1 }),
          goal({ id: 'g-w', kind: 'wait', currency: 'EUR', target: 100_001, monthly_amount: 3, ready_by: null, opening_saved: 0 }),
        ],
      })
    );
    expect(r.snapshot.pots[0]).toMatchObject({ target: 110_002, saved: 1 });
    expect(r.snapshot.pots[1]).toMatchObject({ target: 110_002, monthlyAmount: 4, saved: 0 });
    expect(r.unconverted).toBeNull();
  });

  it('D-101 a pot whose amounts are zero needs no rate', () => {
    const r = logged(withExtra({ goals: [goal({ id: 'g-eur', currency: 'EUR', target: null, monthly_amount: 0, kind: 'wait', ready_by: null, opening_saved: 0 })] }));
    expect(r.snapshot.pots).toHaveLength(1);
    expect(r.unconverted).toBeNull();
  });

  it('D-101 a pot with no stored rate makes the card unavailable', () => {
    const r = logged(withExtra({ goals: [goal({ id: 'g-eur', currency: 'EUR' }), goal({ id: 'g-eur2', currency: 'EUR' }), goal({ id: 'g-usd' })] }));
    expect(r.unconverted).toEqual({ currencies: ['EUR'], rowCount: 2 });
    expect(r.meta.unconvertedPots).toBe(2);
    expect(r.snapshot.pots.map((p) => p.id)).toEqual(['g-usd']);
  });

  it('D-101 a pot with a tagged line that has no rate counts as unconverted', () => {
    const r = logged(
      withExtra({
        goals: [goal({ id: 'g1' })],
        rows: [row({ id: 'tag-eur', local_date: '2026-05-10', original_amount: 5_000, original_currency: 'EUR', home_currency: 'EUR', account_id: 'sav', transfer_id: 't-eur', goal_id: 'g1' })],
      })
    );
    expect(r.unconverted).toEqual({ currencies: ['USD'], rowCount: 1 });
    expect(r.meta.unconvertedPots).toBe(1);
  });

  it('D-101 a pot converted beyond the money range counts as unconverted', () => {
    const r = logged(withExtra({ rates: [USD_RATE], goals: [goal({ id: 'g-big', currency: 'EUR', target: 9_999_999_999_999 })] }));
    expect(r.meta.unconvertedPots).toBe(1);
  });

  it('D-101 saved is capped at the money range', () => {
    const r = logged(withExtra({ goals: [goal({ id: 'g1', target: 10_000_000_000_000, opening_saved: 10_000_000_000_000 })], rows: [sav('tag-1', '2026-09-03', 5, { goal_id: 'g1' })] }));
    expect(r.snapshot.pots[0]!.saved).toBe(10_000_000_000_000);
  });

  it('D-101 rough hero takes the set-asides off', () => {
    const rough = buildDecideSnapshot(
      sourceOf({
        settings: settings({ rough_income: 400_000, rough_spending: 300_000 }),
        accounts: [account({ id: 'chk' })],
        balances: { chk: 50_000 },
        goals: [goal({ id: 'g1', target: 60_000 })],
      })
    );
    if (rough.kind !== 'rough') throw new Error('expected rough');
    expect(rough.pots).toHaveLength(1);
    const setAside = totalSetAside(rough.pots ?? [], '2026-10-15').total; // the same potSetAside the engine uses
    expect(setAside).toBe(12_000);
    expect(rough.figures.monthlyIncome - rough.figures.monthlySpending - setAside).toBe(88_000);
    const none = buildDecideSnapshot(sourceOf({ goals: [goal({ id: 'g1' })] }));
    expect(none.kind).toBe('none');
    expect(none.pots?.map((p) => p.id)).toEqual(['g1']);
  });
});

describe('housing (D-103, R18.4)', () => {
  it('D-103 housing counts Housing-category spending plus is_housing loan payments', () => {
    expect(logged(household()).snapshot.housingMonthly).toBe(100_000);
    const r = logged(withExtra({ debts: [debt({ is_housing: true, minimum_payment: 150_000 }), debt({ is_housing: false, minimum_payment: 9_000 })] }));
    expect(r.snapshot.housingMonthly).toBe(250_000);
    const other = logged(
      withExtra({
        rows: [
          row({ id: 'custom', local_date: '2026-09-12', original_amount: -50_000, category_id: 'c-custom' }),
          row({ id: 'oneoff', local_date: '2026-09-13', original_amount: -70_000, category_id: 'c-house', one_off: true }),
          row({ id: 'plain', local_date: '2026-09-14', original_amount: -20_000 }),
        ],
      })
    );
    expect(other.snapshot.housingMonthly).toBe(100_000);
  });

  it('D-103 housing is the average of the used months whatever the basis', () => {
    const rows = [row({ id: 'extra-rent', local_date: '2026-09-20', original_amount: -30_000, category_id: 'c-house' })];
    const avg = logged(withExtra({ rows, settings: settings({ basis_override: 'average' }) })).snapshot.housingMonthly;
    const worst = logged(withExtra({ rows, settings: settings({ basis_override: 'worst' }) })).snapshot.housingMonthly;
    expect(avg).toBe(107_500); // (4 x 100,000 + 30,000) / 4 used months
    expect(worst).toBe(avg);
  });

  it('D-103 a card with is_housing set is ignored', () => {
    const r = logged(withExtra({ debts: [debt({ kind: 'card', account_id: null, is_housing: true, minimum_payment: 55_000 })] }));
    expect(r.snapshot.housingMonthly).toBe(100_000);
  });

  it('D-103 a debt-covered series is counted once', () => {
    const r = logged(
      withExtra({
        series: [series({ id: 's-mort', amount: -150_000, category_id: 'c-house' })],
        rows: ['2026-07', '2026-08', '2026-09'].map((m) =>
          row({ id: `mort-${m}`, local_date: `${m}-05`, original_amount: -150_000, category_id: 'c-house', recurring_series_id: 's-mort' })
        ),
        debts: [debt({ series_id: 's-mort', is_housing: true, minimum_payment: 150_000 })],
      })
    );
    expect(r.snapshot.housingMonthly).toBe(250_000); // rent plus the mortgage minimum once, not 400,000
  });

  it('D-103 a housing loan in another currency converts at the stored rate', () => {
    const r = logged(withExtra({ rates: [USD_RATE], debts: [debt({ currency: 'EUR', is_housing: true, minimum_payment: 100_000 })] }));
    expect(r.snapshot.housingMonthly).toBe(210_000);
  });

  it('D-103 housing_line is parsed like the DSR line and passed on', () => {
    for (const text of ['28', '31.5', '0', '100', '100.0000']) {
      const r = logged(household({ settings: settings({ housing_line: text }) }));
      expect(r.snapshot.limits.housingLine).toBe(percent(text));
      expect(r.meta.limitsReset).toBe(0);
    }
  });

  it('D-103 an invalid housing_line counts toward limitsReset', () => {
    for (const text of ['abc', '-5', '100.0001', '101', '1.23456', '']) {
      const r = logged(household({ settings: settings({ housing_line: text }) }));
      expect(r.snapshot.limits.housingLine).toBeNull();
      expect(r.meta.limitsReset).toBe(1);
      expect(prepareContext(r.snapshot).ok).toBe(true);
    }
  });
});

describe('current-month lines without a stored rate (D-106)', () => {
  const eur = (id: string, over: Partial<ReturnType<typeof row>> = {}) =>
    row({ id, local_date: '2026-10-02', original_amount: -5_000, original_currency: 'EUR', home_currency: 'EUR', ...over });

  it('D-106 a paid current-month line with no stored rate is reported in monthUnconverted', () => {
    const base = logged(withExtra({}));
    const r = logged(withExtra({ rows: [eur('e1')] }));
    expect(r.monthUnconverted).toEqual({ currencies: ['EUR'], rowCount: 1, rowsByCurrency: { EUR: 1 } });
    expect(r.unconverted).toBeNull();
    expect(r.snapshot.months).toEqual(base.snapshot.months.map((m) => (m.month === '2026-10' ? { ...m, lines: [] } : m)));
  });

  it('D-106 a pending current-month line is reported too', () => {
    const r = logged(withExtra({ rows: [eur('e1', { status: 'pending' })] }));
    expect(r.monthUnconverted?.rowCount).toBe(1);
  });

  it('D-106 a skipped or deleted current-month line is not reported', () => {
    const r = logged(withExtra({ rows: [eur('e1', { status: 'skipped' }), eur('e2', { deleted_at: '2026-10-03T00:00:00Z' })] }));
    expect(r.monthUnconverted).toBeNull();
  });

  it('D-106 monthUnconverted lists each currency once, sorted, and counts rows', () => {
    const r = logged(
      withExtra({
        rows: [eur('e1'), eur('e2'), eur('g1', { original_currency: 'GBP', home_currency: 'GBP' })],
      })
    );
    expect(r.monthUnconverted).toEqual({ currencies: ['EUR', 'GBP'], rowCount: 3, rowsByCurrency: { EUR: 2, GBP: 1 } });
  });

  it('D-106 a current-month line that converts is not reported', () => {
    const r = logged(withExtra({ rates: [USD_RATE], rows: [eur('e1')] }));
    expect(r.monthUnconverted).toBeNull();
  });

  it("D-106 an older month's unconverted line is still handled as before", () => {
    const used = logged(withExtra({ rows: [eur('e1', { local_date: '2026-09-20' })] }));
    expect(used.unconverted).toEqual({ currencies: ['EUR'], rowCount: 1 });
    expect(used.monthUnconverted).toBeNull();
    const unused = logged(withExtra({ rows: [eur('old', { local_date: '2025-12-20' })] }));
    expect(unused.unconverted).toBeNull();
    expect(unused.monthUnconverted).toBeNull();
  });

  it('D-106 monthUnconverted is null when nothing is missing, on logged, rough and none results', () => {
    expect(logged(withExtra({})).monthUnconverted).toBeNull();
    expect(buildDecideSnapshot(sourceOf()).monthUnconverted).toBeNull();
    const rough = buildDecideSnapshot(
      sourceOf({ settings: settings({ rough_income: 400_000, rough_spending: 300_000 }), accounts: [account({ id: 'chk' })], balances: { chk: 1 } })
    );
    expect(rough.kind).toBe('rough');
    expect(rough.monthUnconverted).toBeNull();
  });
});

describe('Judge on becomes the engine basis (D-107)', () => {
  const missing = row({ id: 'e1', local_date: '2026-10-02', original_amount: -5_000, original_currency: 'EUR', home_currency: 'EUR' });
  const stored = (basis: 'average' | 'worst' | null) => ({ settings: settings({ basis_override: basis }) });

  it('D-107 judgeOn month sets basisOverride month', () => {
    const r = logged(withExtra({ judgeOn: 'month' }));
    expect(r.snapshot.basisOverride).toBe('month');
    expect(r.judgeOn).toBe('month');
    expect(r.monthFallback).toBeNull();
    expect(ctxOf(r.snapshot).money.basis).toBe('month');
  });

  it('D-107 judgeOn worst or average overrides the stored settings basis', () => {
    expect(logged(withExtra({ judgeOn: 'worst', ...stored('average') })).snapshot.basisOverride).toBe('worst');
    expect(logged(withExtra({ judgeOn: 'average', ...stored('worst') })).snapshot.basisOverride).toBe('average');
    expect(logged(withExtra({ judgeOn: 'month', ...stored('worst') })).snapshot.basisOverride).toBe('month');
  });

  it('D-107 judgeOn absent keeps the settings basis_override exactly as before', () => {
    for (const basis of ['average', 'worst', null] as const) {
      const r = logged(withExtra(stored(basis)));
      expect(r.snapshot.basisOverride).toBe(basis);
      expect(r.judgeOn).toBeNull();
      expect(logged(withExtra({ ...stored(basis), judgeOn: null })).snapshot.basisOverride).toBe(basis);
    }
  });

  it('D-107 judgeOn month with a current-month line missing a rate falls back to worst and reports monthFallback with the currencies', () => {
    const r = logged(withExtra({ judgeOn: 'month', ...stored('average'), rows: [missing] }));
    expect(r.snapshot.basisOverride).toBe('worst');
    expect(r.monthFallback).toEqual({ currencies: ['EUR'] });
    expect(ctxOf(r.snapshot).money.basis).toBe('worst');
  });

  it("D-107 the fallback leaves the history, unconverted and the checks' other figures unchanged", () => {
    const fallback = logged(withExtra({ judgeOn: 'month', rows: [missing] }));
    const worst = logged(withExtra({ judgeOn: 'worst' }));
    expect(fallback.snapshot).toEqual(worst.snapshot);
    expect(fallback.unconverted).toEqual(worst.unconverted);
    expect(fallback.meta).toEqual(worst.meta);
    expect(ctxOf(fallback.snapshot)).toEqual(ctxOf(worst.snapshot));
  });

  it('D-107 judgeOn is on the result even when the fallback applied', () => {
    expect(logged(withExtra({ judgeOn: 'month', rows: [missing] })).judgeOn).toBe('month');
  });

  it('D-107 a missing rate does not move a worst or average choice', () => {
    const r = logged(withExtra({ judgeOn: 'average', rows: [missing] }));
    expect(r.snapshot.basisOverride).toBe('average');
    expect(r.monthFallback).toBeNull();
    expect(r.monthUnconverted?.currencies).toEqual(['EUR']);
  });

  it('D-107 rough and none results carry judgeOn and no monthFallback', () => {
    const rough = buildDecideSnapshot(
      sourceOf({ judgeOn: 'month', settings: settings({ rough_income: 400_000, rough_spending: 300_000 }), accounts: [account({ id: 'chk' })], balances: { chk: 1 } })
    );
    expect(rough).toMatchObject({ kind: 'rough', judgeOn: 'month', monthFallback: null });
    expect(buildDecideSnapshot(sourceOf({ judgeOn: 'worst' }))).toMatchObject({ kind: 'none', judgeOn: 'worst', monthFallback: null });
    expect(buildDecideSnapshot(sourceOf())).toMatchObject({ judgeOn: null, monthFallback: null });
  });
});
