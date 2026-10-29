// 05.2-52 (F-04): READ-ONLY diagnosis. Why did the walkthrough's engine believe typical income was about $21,061 a month
// (typicalLeft $16,280.94 with e $4,780.16), and why did Home say "In $203,974.77" while Decide said "$6,428.54 in"?
// Every expectation below records what the CURRENT code does (characterisation); nothing here changes production code.
// Fixture: USD home, today 2026-10-28, GBP -> USD from stored rates only (USD 1.08 / GBP 0.86 per EUR, so 1 GBP = 1.25581 USD).
import { monthTotals } from '@/engine/activity/totals';
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import type { SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import { computeV3 } from '../computeV3';
import type { V3SettingsSource } from '../types';
import { v3s } from './v3Fixtures';

const TODAY = '2026-10-28';
type Row = SnapshotSource['rows'][number];
type Series = SnapshotSource['series'][number];

const MAIN = 'a-main';
const GBP = 'a-gbp';
const SAV2 = 'a-sav2';
const CARD = 'a-card';
const TEST = 'a-test';
const GBP_PER_USD_NUM = 108; // 1 GBP = 1.08 / 0.86 USD
const GBP_PER_USD_DEN = 86;
const usdOfGbp = (minor: number): number => Math.round((minor * GBP_PER_USD_NUM) / GBP_PER_USD_DEN);

const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

function row(id: string, account: string, minor: number, date: string, over: Partial<Row> = {}): Row {
  const gbp = account === GBP;
  return {
    id, account_id: account, local_date: date, original_amount: minor, original_currency: gbp ? 'GBP' : 'USD', home_currency: 'USD',
    home_amount: gbp ? usdOfGbp(minor) : minor, orig_per_eur: null, status: date <= TODAY ? 'paid' : 'pending', is_refund: false,
    transfer_id: null, recurring_series_id: null, category_id: null, deleted_at: null, ...over,
  };
}
const series = (id: string, account: string, minor: number, currency: string, over: Partial<Series> = {}): Series => ({
  id, account_id: account, amount: minor, currency, freq: 'monthly', anchor_date: '2026-04-05', end_date: null, occurrence_count: null,
  category_id: 'cat-income', deleted_at: null, ...over,
});

interface Parts {
  transfers: boolean; // own transfers, both legs, every month
  testInflow: boolean; // two USD 200,000 deposits on the test account (Aug and Oct)
  refunds: boolean; // 11 is_refund GBP rows + 2 untagged positive GBP rows
  gbpSeries: boolean; // the GBP 3,000 monthly pay series named "Refund - Online Store" (2 occurrences)
  salary: boolean; // USD 4,000 monthly salary series with its rows
}
const ALL: Parts = { transfers: true, testInflow: true, refunds: true, gbpSeries: true, salary: true };

function source(p: Parts): SnapshotSource {
  const base = demoSource(TODAY);
  const rows: Row[] = [row('early', MAIN, -1000, '2026-03-15')];
  const rowsSeries: Series[] = [];
  MONTHS.concat('2026-10').forEach((m, i) => {
    if (p.salary) rows.push(row(`sal-${m}`, MAIN, 400000, `${m}-05`, { recurring_series_id: 'ser-salary', category_id: 'cat-income' }));
    if (m !== '2026-10') rows.push(row(`eat-${m}`, MAIN, -478016, `${m}-12`, { category_id: 'cat-groc' }));
    if (p.transfers) {
      for (const [k, from, to, amt] of [['m2s', MAIN, SAV2, 50000], ['g2m', GBP, MAIN, 30000], ['s2m', SAV2, MAIN, 10000]] as const) {
        const tid = `t-${k}-${m}`;
        const gbpLeg = (a: string, minor: number): Row => row(`${tid}-${a}`, a, minor, `${m}-20`, { transfer_id: tid, category_id: 'cat-transfer' });
        rows.push(gbpLeg(from, -amt), gbpLeg(to, amt));
      }
    }
    if (p.refunds && i < 7) {
      if (i < 6) rows.push(row(`ref-${m}`, GBP, 1999, `${m}-08`, { is_refund: true }));
      if (i < 5) rows.push(row(`ref2-${m}`, GBP, 1999, `${m}-09`, { is_refund: true }));
      if (i === 2 || i === 4 || i === 6) rows.push(row(`plain-${m}`, GBP, 1999, `${m}-10`)); // positive, not a refund, no tag
    }
  });
  if (p.testInflow) {
    rows.push(row('big-aug', TEST, 20000000, '2026-08-03', { category_id: 'cat-income' }), row('big-oct', TEST, 20000000, '2026-10-03', { category_id: 'cat-income' }));
  }
  if (p.gbpSeries) {
    rowsSeries.push(series('ser-refundname', GBP, 300000, 'GBP', { anchor_date: '2026-09-15' }));
    rows.push(row('rn-sep', GBP, 300000, '2026-09-15', { recurring_series_id: 'ser-refundname', category_id: 'cat-income' }), row('rn-oct', GBP, 300000, '2026-10-15', { recurring_series_id: 'ser-refundname', category_id: 'cat-income' }));
  }
  if (p.salary) rowsSeries.push(series('ser-salary', MAIN, 400000, 'USD'));
  const acct = (id: string, kind: string, currency: string) => ({ id, name: id, kind: kind as never, currency, archived_at: null, deleted_at: null });
  const accounts = [acct(MAIN, 'checking', 'USD'), acct(GBP, 'checking', 'GBP'), acct(SAV2, 'savings', 'USD'), acct(CARD, 'credit', 'USD'), acct(TEST, 'checking', 'USD')];
  const balances: Record<string, number> = {};
  for (const r of rows) if (r.status === 'paid') balances[r.account_id] = (balances[r.account_id] ?? 0) + r.original_amount;
  return {
    ...base, homeCurrency: 'USD', rows, series: rowsSeries, accounts, balances, debts: [], upcomingRows: [],
    categories: { 'cat-income': 'Income', 'cat-groc': 'Groceries', 'cat-transfer': 'Transfer' },
    rates: [
      { quote: 'USD', rate: '1.0800000000', rate_date: '2026-10-27', source: 'frankfurter-v2' },
      { quote: 'GBP', rate: '0.8600000000', rate_date: '2026-10-27', source: 'frankfurter-v2' },
    ],
  };
}

function figures(src: SnapshotSource, v3: V3SettingsSource | null) {
  const ev = computeV3(src, v3, null);
  const oct = src.rows.filter((r) => r.local_date.startsWith('2026-10'));
  const totals = monthTotals(oct.map((r) => ({ amountHome: r.home_amount, status: r.status as never, isTransfer: r.transfer_id !== null, isRefund: r.is_refund })), []);
  const m = ev.month;
  return { typicalIncome: Number(m.typicalIncome), typicalLeft: m.typicalLeft === null ? null : Number(m.typicalLeft), e: m.e === null ? null : Number(m.e), moneyIn: Number(m.moneyIn), homePaidIn: totals.paidIn, pattern: ev.month.incomePicture?.treated ?? null, code: ev.result.code };
}

const without = (k: keyof Parts): Parts => ({ ...ALL, [k]: false });

const CONFIRMED = { income_pattern: 'steady' as const, income_pattern_confirmed: true };
const SALARIED = v3s({ income_types: ['salary_or_wages'], ...CONFIRMED });
const GBP_PAY = usdOfGbp(300000); // 376,744: GBP 3,000 in dollars at the stored rates
const TEST_INFLOW = 20000000;
const PLAIN_GBP = usdOfGbp(1999); // the untagged positive GBP row in October

describe('F-04 diagnosis: walkthrough-shaped fixture (characterisation, no production change)', () => {
  it('base case: an unconfirmed steady earner with a new pay series is read as variable and typical income is the window median', () => {
    expect(figures(source(ALL), v3s({ income_types: ['salary_or_wages'], income_pattern: 'steady' }))).toEqual({
      typicalIncome: 400000, typicalLeft: -72996, e: 472996, moneyIn: 776744, homePaidIn: 20776744 + PLAIN_GBP, pattern: 'variable', code: 'needs_input',
    });
  });

  it('(a) transfers: own transfer legs change no figure', () => {
    const a = figures(source(ALL), SALARIED);
    const b = figures(source(without('transfers')), SALARIED);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ typicalIncome: 400000 + GBP_PAY, moneyIn: 400000 + GBP_PAY });
  });

  it('(b) currency: the GBP pay series reaches the engine converted (376,744), not as 300,000 dollars', () => {
    const pay = buildV3Inputs(source(ALL), SALARIED).series.find((x) => x.id === 'ser-refundname');
    expect(pay).toMatchObject({ role: 'pay', amount: GBP_PAY });
    expect(figures(source(without('salary')), SALARIED)).toMatchObject({ typicalIncome: GBP_PAY, moneyIn: GBP_PAY });
  });

  it('(c) test-account inflow: Home counts it, Decide does not (a salaried profile), and it is not in typical income', () => {
    const withTest = figures(source(ALL), SALARIED);
    const noTest = figures(source(without('testInflow')), SALARIED);
    expect(withTest.typicalIncome).toBe(noTest.typicalIncome);
    expect(withTest.moneyIn).toBe(noTest.moneyIn);
    expect(withTest.homePaidIn - noTest.homePaidIn).toBe(TEST_INFLOW);
    // Home In minus Decide's money in = the test inflow + the untagged positive GBP row (rows Home counts and Decide does not)
    expect(withTest.homePaidIn - withTest.moneyIn).toBe(TEST_INFLOW + PLAIN_GBP);
    expect(noTest.homePaidIn - noTest.moneyIn).toBe(PLAIN_GBP);
  });

  it('(c) by definition: a variable-income profile counts every untagged paid inflow as its income, test deposit included', () => {
    const free = v3s({ income_types: ['freelance'], variable_method: 'match', ...CONFIRMED });
    expect(figures(source(ALL), free)).toMatchObject({ moneyIn: 20776744 + PLAIN_GBP, typicalIncome: 400000 + GBP_PAY });
    expect(figures(source(without('testInflow')), free).moneyIn).toBe(776744 + PLAIN_GBP);
  });

  it('(d) refunds: is_refund rows are neither Home In nor Decide income; they only lower e', () => {
    const a = figures(source(ALL), SALARIED);
    const b = figures(source(without('refunds')), SALARIED);
    expect(a.typicalIncome).toBe(b.typicalIncome);
    expect(a.moneyIn).toBe(b.moneyIn);
    expect(a.e).toBe(472996);
    expect(b.e).toBe(478016);
    expect(a.homePaidIn - b.homePaidIn).toBe(PLAIN_GBP); // only the untagged positive row, never a refund
  });

  it('(e) steady amount with a pay series: a mixed profile adds both; a freelance profile uses the steady amount alone; a salaried profile ignores it', () => {
    const mix = v3s({ income_types: ['mix'], variable_method: 'steady', steady_amount: 1700000, ...CONFIRMED });
    const free = v3s({ income_types: ['freelance'], variable_method: 'steady', steady_amount: 1700000, ...CONFIRMED });
    const salaried = v3s({ income_types: ['salary_or_wages'], variable_method: 'steady', steady_amount: 1700000, ...CONFIRMED });
    expect(figures(source(ALL), mix).typicalIncome).toBe(400000 + GBP_PAY + 1700000);
    expect(figures(source(ALL), free).typicalIncome).toBe(1700000);
    expect(figures(source(ALL), salaried).typicalIncome).toBe(400000 + GBP_PAY);
  });

  it('(f) a pay series named from a refund counts like any pay series: its monthly equivalent, once', () => {
    const a = figures(source(ALL), SALARIED);
    const b = figures(source(without('gbpSeries')), SALARIED);
    expect(a.typicalIncome - b.typicalIncome).toBe(GBP_PAY);
    expect(a.moneyIn - b.moneyIn).toBe(GBP_PAY); // the October occurrence on the 15th, settled by its row
    expect(buildV3Inputs(source(ALL), SALARIED).series.filter((x) => x.role === 'pay')).toHaveLength(2);
  });

  it('typical left is typical income - bills - e - set aside, so a 21,061 dollar figure needs 21,061 dollars of typical income', () => {
    const f = figures(source(ALL), SALARIED);
    expect(f.typicalLeft).toBe(f.typicalIncome - (f.e as number)); // no bills, nothing set aside in the fixture
  });
});
