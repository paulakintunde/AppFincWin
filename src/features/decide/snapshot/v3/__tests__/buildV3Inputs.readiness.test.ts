/**
 * 05.3-55 (D-24, D-28, W2): the readiness engine is fed from the reads Decide already makes. Waivers come from the owner's
 * answers, skipped occurrences from the source rows (never the built months) and names from the rows. The owner evidence
 * (asOf 2026-10-30) is worked by hand from 05.3-54 and pinned through computeV3.
 */
import { minorUnits } from '@/engine/money';
import type { ReadinessItem } from '@/engine/decide/v3';
import { sofaInputs } from '../../../__tests__/helpers/demoScenario';
import type { GoalSource, SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import { computeV3 } from '../computeV3';
import { v3s } from './v3Fixtures';

type Row = SnapshotSource['rows'][number];
type Series = SnapshotSource['series'][number];

const TODAY = '2026-10-30';
const ACCT = 'acct-everyday';
const PAY = '00000000-0000-4000-8000-000000000001';
const NETFLIX = '00000000-0000-4000-8000-000000000002';
const LUNCH = '00000000-0000-4000-8000-000000000003';
const CATEGORIES: Record<string, string> = { 'cat-income': 'Income', 'cat-subs': 'Subscriptions', 'cat-dining': 'Dining', 'cat-groceries': 'Groceries' };

const row = (id: string, date: string, amount: number, over: Partial<Row> = {}): Row => ({
  id, account_id: ACCT, local_date: date, original_amount: amount, original_currency: 'USD', home_currency: 'USD', home_amount: amount,
  orig_per_eur: null, status: 'paid', is_refund: false, transfer_id: null, recurring_series_id: null, category_id: null, deleted_at: null, ...over,
});
const series = (id: string, amount: number, anchor: string, category: string, name?: string): Series => ({
  id, account_id: ACCT, amount, currency: 'USD', freq: 'monthly', anchor_date: anchor, end_date: null, occurrence_count: null, category_id: category,
  deleted_at: null, ...(name === undefined ? {} : { name }),
});
const goal = (id: string, over: Partial<GoalSource> = {}): GoalSource => ({
  id, kind: 'pot', check_id: null, currency: 'USD', target: 100000, monthly_amount: null, ready_by: null, opening_saved: 0, done_at: null, deleted_at: null,
  account_id: ACCT, ...over,
});

function paidMonth(ym: string): Row[] {
  return [
    row(`pay-${ym}`, `${ym}-03`, 1619942, { recurring_series_id: PAY, category_id: 'cat-income', name: 'Pay' }),
    row(`netflix-${ym}`, `${ym}-03`, -1199, { recurring_series_id: NETFLIX, category_id: 'cat-subs', name: 'Netflix' }),
    row(`lunch-${ym}`, `${ym}-21`, -1000, { recurring_series_id: LUNCH, category_id: 'cat-dining', name: 'Lunch' }),
    row(`e1-${ym}`, `${ym}-08`, -150000, { category_id: 'cat-groceries', name: 'Groceries' }),
    row(`e2-${ym}`, `${ym}-18`, -150000, { category_id: 'cat-groceries', name: 'Groceries' }),
  ];
}

/** The owner's account on 2026-10-30: September's pay and two bills are still pending; October has one everyday line, dated Oct 14. */
function evidenceSource(extraRows: Row[] = [], goals: GoalSource[] = []): SnapshotSource {
  const rows: Row[] = [
    ...paidMonth('2026-06'),
    ...paidMonth('2026-07'),
    ...paidMonth('2026-08'),
    row('pay-sep', '2026-09-03', 1619942, { recurring_series_id: PAY, category_id: 'cat-income', status: 'pending', name: 'Pay' }),
    row('netflix-sep', '2026-09-03', -1199, { recurring_series_id: NETFLIX, category_id: 'cat-subs', status: 'pending', name: 'Netflix' }),
    row('lunch-sep', '2026-09-21', -1000, { recurring_series_id: LUNCH, category_id: 'cat-dining', status: 'pending', name: 'Lunch' }),
    row('e1-sep', '2026-09-08', -150000, { category_id: 'cat-groceries' }),
    row('e2-sep', '2026-09-18', -150000, { category_id: 'cat-groceries' }),
    row('pay-oct', '2026-10-03', 1619942, { recurring_series_id: PAY, category_id: 'cat-income', name: 'Pay' }),
    row('netflix-oct', '2026-10-03', -1199, { recurring_series_id: NETFLIX, category_id: 'cat-subs', name: 'Netflix' }),
    row('lunch-oct', '2026-10-21', -1000, { recurring_series_id: LUNCH, category_id: 'cat-dining', name: 'Lunch' }),
    row('e1-oct', '2026-10-14', -5000, { category_id: 'cat-groceries', name: '' }),
    ...extraRows,
  ];
  const balance = rows.filter((r) => r.status === 'paid' && r.deleted_at === null).reduce((sum, r) => sum + r.original_amount, 0);
  return {
    today: TODAY,
    homeCurrency: 'USD',
    region: 'US',
    rows,
    upcomingRows: [],
    series: [series(PAY, 1619942, '2026-06-03', 'cat-income', 'Salary'), series(NETFLIX, -1199, '2026-06-03', 'cat-subs', 'Netflix'), series(LUNCH, -1000, '2026-06-21', 'cat-dining', '')],
    accounts: [{ id: ACCT, name: 'Everyday', kind: 'checking', currency: 'USD', archived_at: null, deleted_at: null }],
    balances: { [ACCT]: balance },
    rates: [],
    categories: Object.fromEntries(Object.entries(CATEGORIES)),
    settings: null,
    debts: [],
    goals,
    statementPeriods: [],
    customCurrencies: [],
    changes: [],
    paymentLinks: [],
    writtenRowLinks: [],
  };
}

const mu = minorUnits;
const item = (p: Partial<ReadinessItem> & Pick<ReadinessItem, 'kind' | 'code' | 'month'>): ReadinessItem => ({
  seriesId: null, envelopeId: null, lineId: null, name: null, amount: null, date: null, ...p,
});

describe('buildV3Inputs: skipped occurrences come from the source rows (W2)', () => {
  it('a live skipped row with a series gives one skipped occurrence; deleted ones and ones with no series do not', () => {
    const inputs = buildV3Inputs(
      evidenceSource([
        row('skip-1', '2026-09-03', -1199, { recurring_series_id: NETFLIX, status: 'skipped' }),
        row('skip-gone', '2026-08-03', -1199, { recurring_series_id: NETFLIX, status: 'skipped', deleted_at: '2026-09-01T00:00:00Z' }),
        row('skip-loose', '2026-09-05', -500, { status: 'skipped' }),
      ]),
      null,
    );
    expect(inputs.skipped).toEqual([{ seriesId: NETFLIX, date: '2026-09-03' }]);
  });

  it('the months are the same with or without the skipped rows', () => {
    const plain = buildV3Inputs(evidenceSource(), null);
    const skipped = buildV3Inputs(evidenceSource([row('skip-1', '2026-09-03', -1199, { recurring_series_id: NETFLIX, status: 'skipped' })]), null);
    expect(skipped.months).toEqual(plain.months);
    expect(plain.skipped).toEqual([]);
  });
});

describe('buildV3Inputs: names come from the rows (D-24)', () => {
  const inputs = buildV3Inputs(evidenceSource([], [goal('pot-a', { name: 'Holiday' }), goal('pot-b', { name: '' }), goal('pot-c')]), null);
  const lines = inputs.months.flatMap((m) => m.lines);

  it('a line takes its transaction name; an empty or missing name is null', () => {
    expect(lines.find((l) => l.id === 'netflix-sep')?.name).toBe('Netflix');
    expect(lines.find((l) => l.id === 'e1-oct')?.name).toBeNull();
    expect(lines.find((l) => l.id === 'e1-sep')?.name).toBeNull();
  });

  it('a series takes its recurring_series name; an empty or missing name is null', () => {
    expect(inputs.series.find((s) => s.id === PAY)?.name).toBe('Salary');
    expect(inputs.series.find((s) => s.id === LUNCH)?.name).toBeNull();
    const unnamed = buildV3Inputs({ ...evidenceSource(), series: evidenceSource().series.map(({ name: _n, ...s }) => s) }, null);
    expect(unnamed.series.map((s) => s.name)).toEqual([null, null, null]);
  });

  it('an envelope takes its savings_goals name; an empty or missing name is null', () => {
    expect(inputs.envelopes.map((e) => [e.id, e.name])).toEqual([
      ['pot-a', 'Holiday'],
      ['pot-b', null],
      ['pot-c', null],
    ]);
  });
});

describe('buildV3Inputs: waivers (D-28)', () => {
  it('passes the settings waivers through; absent is an empty list', () => {
    const waivers = [{ kind: 'paid_by_other', seriesId: NETFLIX, date: '2026-09-03' }] as const;
    expect(buildV3Inputs(evidenceSource(), v3s({ waivers: [...waivers] })).waivers).toEqual(waivers);
    expect(buildV3Inputs(evidenceSource(), v3s()).waivers).toEqual([]);
    expect(buildV3Inputs(evidenceSource(), null).waivers).toEqual([]);
  });

  it('pay arrivals, expected income and held bridges ignore readiness_waiver rows', () => {
    const inputs = buildV3Inputs(
      evidenceSource(),
      v3s({
        live_bridge_check_ids: ['chk'],
        answers: [
          { kind: 'readiness_waiver', key: `no-pay:${PAY}:2026-09-03`, amount: 100, bool_value: true, on_date: '2026-10-30', check_id: 'chk' },
          { kind: 'readiness_waiver', key: '2026-09', amount: 100, bool_value: true, on_date: '2026-10-30', check_id: 'chk' },
        ],
      }),
    );
    expect(inputs.payArrivals).toEqual([]);
    expect(inputs.expectedIncome).toEqual([]);
    expect(inputs.heldBridges).toEqual([]);
  });
});

describe('computeV3: the owner evidence names all four gaps', () => {
  it('pay, Netflix and Lunch in September with their pending lines, and October spending dated Oct 14', () => {
    const readiness = computeV3(evidenceSource(), null, sofaInputs).result.readiness;
    expect(readiness.missing).toEqual(['activity_not_current', 'past_month_missing']);
    expect(readiness.items).toEqual([
      item({ kind: 'pay', code: 'past_month_missing', month: '2026-09', seriesId: PAY, lineId: 'pay-sep', name: 'Pay', amount: mu(1619942), date: '2026-09-03' }),
      item({ kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: NETFLIX, lineId: 'netflix-sep', name: 'Netflix', amount: mu(1199), date: '2026-09-03' }),
      item({ kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: LUNCH, lineId: 'lunch-sep', name: 'Lunch', amount: mu(1000), date: '2026-09-21' }),
      item({ kind: 'spending', code: 'activity_not_current', month: '2026-10', date: '2026-10-14' }),
    ]);
  });

  it("the owner's waiver and a skipped row settle the September bills", () => {
    const base = evidenceSource();
    const source = { ...base, rows: base.rows.map((r) => (r.id === 'lunch-sep' ? { ...r, status: 'skipped' as const } : r)) };
    const readiness = computeV3(source, v3s({ waivers: [{ kind: 'paid_by_other', seriesId: NETFLIX, date: '2026-09-03' }] }), sofaInputs).result.readiness;
    expect(readiness.items?.map((i) => i.seriesId ?? i.kind)).toEqual([PAY, 'spending']);
  });
});
