import type { FxLatestRow } from '@/db/rows';
import { MAX_OWN_LINES, buildMonthModel, type AccountUse } from '@/engine/decide/v3';
import { MAX_ABS_AMOUNT_MINOR } from '@/engine/money';
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import type { SnapshotSource } from '../../buildSnapshot';
import { buildDecideSnapshot } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import type { V3SeriesExtra, V3SettingsSource } from '../types';
import { v3s } from './v3Fixtures';

const TODAY = '2026-10-03';
type Row = SnapshotSource['rows'][number];

const extra = (over: Partial<V3SeriesExtra> = {}): V3SeriesExtra => ({ pay_group: null, counts_as: null, income_kind: null, saving_mode: null, typical_choice: null, status: null, ...over });

const EVERYDAY = 'demo-acct-everyday';
const SAVINGS = 'demo-acct-savings';
const CASH = 'demo-acct-cash';
const CARD = 'demo-acct-card';

function mk(id: string, account: string, amount: number, over: Partial<Row> = {}): Row {
  return {
    id, account_id: account, local_date: '2026-10-02', original_amount: amount, original_currency: 'USD', home_currency: 'USD', home_amount: amount,
    orig_per_eur: null, status: 'paid', is_refund: false, transfer_id: null, recurring_series_id: null, category_id: null, deleted_at: null, ...over,
  };
}
function pair(tid: string, from: string, to: string, amount: number, over: { out?: Partial<Row>; in?: Partial<Row> } = {}): Row[] {
  return [mk(`${tid}-out`, from, -amount, { transfer_id: tid, ...over.out }), mk(`${tid}-in`, to, amount, { transfer_id: tid, ...over.in })];
}
const withRows = (rows: Row[], base: SnapshotSource = demoSource(TODAY)): SnapshotSource => ({ ...base, rows: [...base.rows, ...rows] });
const lineOf = (src: SnapshotSource, id: string, v3: V3SettingsSource | null = null) => buildV3Inputs(src, v3).months.flatMap((m) => m.lines).find((l) => l.id === id);

describe('buildV3Inputs: the demo (S9)', () => {
  const inputs = buildV3Inputs(demoSource(TODAY), null);
  const snap = buildDecideSnapshot(demoSource(TODAY));

  it('turns the demo into USD inputs with six full past months', () => {
    expect(inputs.currency).toBe('USD');
    expect(inputs.asOf).toBe(TODAY);
    expect(inputs.region).toBe('US');
    expect(inputs.months.filter((m) => m.full)).toHaveLength(6);
    expect(inputs.unsavedWrites).toBe(0);
    expect(inputs.provisionalRates).toBe(false);
  });

  it('has the confirmed salary pay series and no other series', () => {
    expect(inputs.series).toHaveLength(1);
    const s = inputs.series[0]!;
    expect(s).toMatchObject({ id: 'demo-series-salary', role: 'pay', amount: 440000, confirmed: true, status: 'live', countsAs: 'available', savingMode: null, isHousing: false });
    expect(s.cadence).toEqual({ unit: 'month', every: 1 });
  });

  it('has the student loan with its minimum and the cash balance of the snapshot', () => {
    expect(inputs.debts).toEqual([{ id: 'demo-debt-0', kind: 'loan', balance: 620000, minimum: 19000, apr: expect.anything(), secured: false, isHousing: false }]);
    expect(snap.kind).toBe('logged');
    expect(inputs.balance).toBe(snap.cash);
  });

  it('has null settings defaults: no unspent, no profile, no emergency, table thresholds, legacy lines off', () => {
    expect(inputs.unspent).toBeNull();
    expect(inputs.profile).toBeNull();
    expect(inputs.emergency).toBeNull();
    expect(inputs.rough).toBeNull();
    expect(inputs.everydayOverride).toBeNull();
    expect(inputs.dismissedKeys).toEqual([]);
    expect(inputs.thresholds.source).toBe('table');
    expect(inputs.limits.lines.map((l) => [l.id, l.on, l.source])).toEqual([['debt_share', false, 'builtin'], ['housing_share', false, 'builtin'], ['unsecured_multiple', false, 'builtin']]);
    expect(inputs.custom).toEqual({ itemTypes: [], purposes: [], cadences: [], incomeKinds: [] });
  });

  it('maps demo transfers to saved_invested on the spending leg and own_transfer on the receiving leg', () => {
    const month = inputs.months.find((m) => m.full)!;
    const roles = Object.fromEntries(month.lines.filter((l) => l.id.includes('-x')).map((l) => [l.id.replace(/^demo-\d{4}-\d{2}-/, ''), l.role]));
    expect(roles).toEqual({ 'x0-out': 'saved_invested', 'x0-in': 'own_transfer', 'x1-out': 'saved_invested', 'x1-in': 'own_transfer' });
    expect(month.lines.find((l) => l.id.endsWith('salary'))).toMatchObject({ role: 'income', seriesId: 'demo-series-salary', countsAs: 'available' });
    expect(month.lines.find((l) => l.id.endsWith('-t0'))).toMatchObject({ role: 'spending', countsAs: null });
  });
});

describe('buildV3Inputs: line roles', () => {
  it('classifies refunds, income and plain spending', () => {
    const src = withRows([mk('refund', EVERYDAY, 2500, { is_refund: true }), mk('gift', EVERYDAY, 900), mk('coffee', EVERYDAY, -400)]);
    expect(lineOf(src, 'refund')!.role).toBe('refund');
    expect(lineOf(src, 'gift')).toMatchObject({ role: 'income', countsAs: null });
    expect(lineOf(src, 'coffee')!.role).toBe('spending');
  });

  it('moves between spending accounts are own_transfer; payments into a card are debt_payment', () => {
    const src = withRows([...pair('t-cash', EVERYDAY, CASH, 2000), ...pair('t-card', EVERYDAY, CARD, 3000)]);
    expect(lineOf(src, 't-cash-out')!.role).toBe('own_transfer');
    expect(lineOf(src, 't-cash-in')!.role).toBe('own_transfer');
    expect(lineOf(src, 't-card-out')!.role).toBe('debt_payment');
    expect(lineOf(src, 't-card-in')!.role).toBe('own_transfer');
  });

  it('an untagged return from savings is other_in on the receiving leg', () => {
    const src = withRows(pair('t-back', SAVINGS, EVERYDAY, 1500));
    expect(lineOf(src, 't-back-in')!.role).toBe('other_in');
    expect(lineOf(src, 't-back-out')!.role).toBe('own_transfer');
  });

  it('unpaired legs and legs to unknown accounts fall to other_out / other_in', () => {
    const src = withRows([
      mk('lone-out', EVERYDAY, -700, { transfer_id: 'lone-a' }),
      mk('lone-in', EVERYDAY, 800, { transfer_id: 'lone-b' }),
      mk('deleted-partner', EVERYDAY, 600, { transfer_id: 'lone-c', deleted_at: '2026-10-01T00:00:00Z' }),
    ]);
    expect(lineOf(src, 'lone-out')!.role).toBe('other_out');
    expect(lineOf(src, 'lone-in')!.role).toBe('other_in');
    expect(lineOf(withRows([mk('ghost', 'no-such-account', -50, { transfer_id: 'lone-d' })]), 'ghost')!.role).toBe('own_transfer');
    expect(lineOf(src, 'deleted-partner')).toBeUndefined(); // the snapshot drops deleted rows
  });

  it('drops skipped lines and keeps pending ones', () => {
    const src = withRows([mk('skipped', EVERYDAY, -100, { status: 'skipped' }), mk('later', EVERYDAY, -100, { status: 'pending', local_date: '2026-10-20' })]);
    expect(lineOf(src, 'skipped')).toBeUndefined();
    expect(lineOf(src, 'later')!.status).toBe('pending');
  });

  it('D-22 stand-in: a goal-tagged deposit and withdrawal become envelope lines and the goal an Envelope', () => {
    const goals: SnapshotSource['goals'] = [
      { id: 'g1', kind: 'pot', check_id: null, currency: 'USD', target: 90000, monthly_amount: 5000, ready_by: '2027-03-01', opening_saved: 10000, done_at: null, deleted_at: null },
      { id: 'g-done', kind: 'wait', check_id: null, currency: 'USD', target: null, monthly_amount: null, ready_by: null, opening_saved: 0, done_at: '2026-09-01', deleted_at: null },
    ];
    const src = withRows(
      [...pair('dep', EVERYDAY, SAVINGS, 5000, { in: { goal_id: 'g1' } }), ...pair('wd', SAVINGS, EVERYDAY, 2000, { out: { goal_id: 'g1' } }), ...pair('old', EVERYDAY, SAVINGS, 300, { in: { goal_id: 'g-done' } })],
      { ...demoSource(TODAY), goals }
    );
    const inputs = buildV3Inputs(src, null);
    expect(lineOf(src, 'dep-out')!.role).toBe('envelope_deposit');
    expect(lineOf(src, 'dep-in')!.role).toBe('own_transfer');
    expect(lineOf(src, 'wd-in')!.role).toBe('envelope_withdrawal');
    expect(lineOf(src, 'old-out')!.role).toBe('saved_invested'); // a done goal counts as saving again
    expect(inputs.envelopes).toEqual([{ id: 'g1', kind: 'pot', target: 90000, monthlyAmount: 5000, readyBy: '2027-03-01', saved: 17000, purposeId: null, accountId: SAVINGS, bucket: false }]);
  });
});

describe('buildV3Inputs: series', () => {
  const base = demoSource(TODAY);
  const bill = (id: string, over: Partial<SnapshotSource['series'][number]> = {}): SnapshotSource['series'][number] => ({
    id, account_id: EVERYDAY, amount: -160000, currency: 'USD', freq: 'monthly', anchor_date: '2026-04-02', end_date: null, occurrence_count: null, category_id: 'cat-housing', deleted_at: null, ...over,
  });
  const src = (series: SnapshotSource['series'], more: Partial<SnapshotSource> = {}): SnapshotSource => ({ ...base, series: [...base.series, ...series], ...more });
  const byId = (s: SnapshotSource, v3: V3SettingsSource | null = null) => Object.fromEntries(buildV3Inputs(s, v3).series.map((x) => [x.id, x]));

  it('a housing bill keeps its category and flags isHousing; extras carry over', () => {
    const v3 = v3s({ series_extra: { rent: extra({ typical_choice: 'monthly', status: 'ended', pay_group: 'g' }) }, dismissals: ['k1', 5 as unknown as string] });
    const s = byId(src([bill('rent', { end_date: '2026-12-31' })]), v3).rent!;
    expect(s).toMatchObject({ role: 'bill', amount: 160000, isHousing: true, categoryId: 'cat-housing', typicalChoice: 'monthly', status: 'ended', payGroup: 'g', countsAs: null, incomeKind: null, savingMode: null, endDate: '2026-12-31' });
    expect(buildV3Inputs(src([]), v3).dismissedKeys).toEqual(['k1']);
  });

  it('a category missing from the map is not housing', () => {
    expect(byId(src([bill('odd', { category_id: 'cat-unmapped' })])).odd!.isHousing).toBe(false);
  });

  it('an occurrence count becomes the end date of the last occurrence', () => {
    expect(byId(src([bill('b3', { occurrence_count: 3 })])).b3!.endDate).toBe('2026-06-02');
    expect(byId(src([bill('b3e', { occurrence_count: 12, end_date: '2026-12-01' })])).b3e!.endDate).toBe('2026-12-01');
    expect(byId(src([bill('b3l', { occurrence_count: 3, end_date: '2027-05-01' })])).b3l!.endDate).toBe('2026-06-02');
    expect(byId(src([bill('b0', { occurrence_count: 0 })])).b0!.endDate).toBe('2026-04-02');
  });

  it('income series: salary stays pay, other kinds become other_income, kinds and counts_as come from the extras', () => {
    const inc = (id: string): SnapshotSource['series'][number] => bill(id, { amount: 50000, category_id: 'cat-income' });
    const v3 = v3s({
      series_extra: {
        s: extra({ income_kind: 'salary', counts_as: 'kept' }),
        r: extra({ income_kind: 'rent' }),
        c: extra({ income_kind: 'my-own-kind', counts_as: 'available' }),
        'demo-series-salary': extra({ income_kind: null }),
      },
    });
    const all = byId(src([inc('s'), inc('r'), inc('c'), inc('plain')]), v3);
    expect(all.s).toMatchObject({ role: 'pay', countsAs: 'kept', incomeKind: { kind: 'preset', value: 'salary' } });
    expect(all.r).toMatchObject({ role: 'other_income', countsAs: null, incomeKind: { kind: 'preset', value: 'rent' } });
    expect(all.c).toMatchObject({ role: 'other_income', countsAs: 'available', incomeKind: { kind: 'custom', id: 'my-own-kind' } });
    expect(all.plain).toMatchObject({ role: 'pay', countsAs: 'available', incomeKind: null });
  });

  it('Savings series become saving or investing, skipping ended, deleted, covered and unconvertible ones', () => {
    const categories = { ...base.categories, 'cat-savings': 'Savings' };
    const sv = (id: string, over: Partial<SnapshotSource['series'][number]> = {}) => bill(id, { amount: -20000, category_id: 'cat-savings', ...over });
    const s = src(
      [sv('save'), sv('invest'), sv('flex'), sv('past', { end_date: '2026-01-01' }), sv('gone', { deleted_at: 'x' }), sv('covered'), sv('zero', { amount: 0 }), sv('eur', { currency: 'EUR' })],
      {
        categories,
        paymentLinks: [{ check_id: 'c1', target_id: 'invest', check_kind: 'invest' }],
        debts: [...base.debts, { ...base.debts[0]!, id: 'd-cov', series_id: 'covered' }, { ...base.debts[0]!, id: 'd-del', series_id: 'zero', deleted_at: 'x' }],
      }
    );
    const all = byId(s, v3s({ series_extra: { flex: extra({ saving_mode: 'flexible' }) } }));
    expect(all.save).toMatchObject({ role: 'saving', amount: 20000, savingMode: 'fixed' });
    expect(all.invest).toMatchObject({ role: 'investing', savingMode: 'fixed' });
    expect(all.flex!.savingMode).toBe('flexible');
    for (const gone of ['past', 'gone', 'covered', 'zero', 'eur']) expect(all[gone]).toBeUndefined();
  });
});

describe('buildV3Inputs: v3 settings', () => {
  const src = demoSource(TODAY);

  it('parses the profile, anchor, override and marks; invalid values fall to null', () => {
    const month = buildV3Inputs(src, null).months.find((m) => m.full)!.month;
    const good = buildV3Inputs(
      src,
      v3s({ income_types: ['salary', 'bogus'], variable_method: 'spread', steady_amount: 300000, hold_months: 2, unspent_anchor: 120000, unspent_anchor_at: '2026-10-01', everyday_override: 50000, month_marks: { [month]: 'half', '2020-01': 'x' } })
    );
    expect(good.profile).toEqual({ types: ['salary'], variable: 'spread', steady: 300000, billsHorizonMonths: 2, pattern: null, patternConfirmed: false });
    expect(good.unspent).toEqual({ amount: 120000, at: '2026-10-01' });
    expect(good.everydayOverride).toBe(50000);
    expect(good.months.find((m) => m.month === month)!.mark).toBe('half');
    expect(good.months.filter((m) => m.mark !== null)).toHaveLength(1);

    const bad = buildV3Inputs(src, v3s({ income_types: [], variable_method: 'x', steady_amount: -1, hold_months: 7, unspent_anchor: 1.5, unspent_anchor_at: 'soon', everyday_override: Number.NaN, month_marks: { [month]: 'weird' } }));
    expect(bad.profile).toEqual({ types: [], variable: null, steady: null, billsHorizonMonths: null, pattern: null, patternConfirmed: false });
    expect(bad.unspent).toBeNull();
    expect(bad.everydayOverride).toBeNull();
    expect(bad.months.every((m) => m.mark === null)).toBe(true);
    expect(buildV3Inputs(src, v3s({ hold_months: 1 })).profile).toBeNull(); // income_types null = not set up
    expect(buildV3Inputs(src, v3s({ unspent_anchor: 5 })).unspent).toBeNull(); // anchor needs its date
  });

  it('emergency comes from the reserve, only in the home currency and only when valid', () => {
    const withReserve = (reserve: number | null, currency: string | null) => ({ ...src, settings: { ...src.settings!, reserve, currency } });
    expect(buildV3Inputs(withReserve(500000, null), null).emergency).toEqual({ amount: 500000, accountId: null });
    expect(buildV3Inputs(withReserve(500000, 'USD'), null).emergency).toEqual({ amount: 500000, accountId: null });
    expect(buildV3Inputs(withReserve(500000, 'USD'), v3s({ reserve_account_id: SAVINGS })).emergency).toEqual({ amount: 500000, accountId: SAVINGS }); // D-54
    expect(buildV3Inputs(withReserve(500000, 'EUR'), null).emergency).toBeNull();
    expect(buildV3Inputs(withReserve(-5, null), null).emergency).toBeNull();
    expect(buildV3Inputs({ ...src, settings: null }, null).emergency).toBeNull();
  });

  it('legacy line settings carry over on (D-13)', () => {
    const s = { ...src, settings: { ...src.settings!, dsr_line: '40', housing_line: '30', unsecured_multiple: 6 } };
    expect(buildV3Inputs(s, null).limits.lines.map((l) => [l.id, l.on, l.source])).toEqual([['debt_share', true, 'legacy'], ['housing_share', true, 'legacy'], ['unsecured_multiple', true, 'legacy']]);
  });

  it('own lines: every kind parses; bad, duplicate, colliding and surplus lines are dropped', () => {
    const own = [
      { id: 'a', on: true, spec: { kind: 'housing_share', pct: '30' } },
      { id: 'b', spec: { kind: 'debt_share', pct: '36.5' } },
      { id: 'c', on: true, spec: { kind: 'unsecured_multiple', times: 4 } },
      { id: 'd', on: true, spec: { kind: 'category_monthly_cap', categoryId: 'cat-dining', cap: 20000 } },
      { id: 'e', on: true, spec: { kind: 'single_purchase_cap', cap: 90000 } },
      { id: 'f', on: true, spec: { kind: 'category_income_share', categoryId: 'cat-dining', pct: '10' } },
      { id: 'g', on: true, spec: { kind: 'unspent_floor', floor: 10000 } },
    ];
    const lines = buildV3Inputs(src, v3s({ own_lines: own })).limits.lines.filter((l) => l.source === 'own');
    expect(lines.map((l) => [l.id, l.on])).toEqual([['a', true], ['b', false], ['c', true], ['d', true], ['e', true]]);
    expect(lines).toHaveLength(MAX_OWN_LINES);

    const bad = [
      'not an object',
      { id: '', spec: { kind: 'unspent_floor', floor: 1 } },
      { id: 'x1', spec: 'nope' },
      { id: 'x2', spec: { kind: 'mystery' } },
      { id: 'x3', spec: { kind: 'housing_share', pct: '120' } },
      { id: 'x4', spec: { kind: 'housing_share', pct: 30 } },
      { id: 'x5', spec: { kind: 'unsecured_multiple', times: 500 } },
      { id: 'x6', spec: { kind: 'unsecured_multiple', times: 1.5 } },
      { id: 'x7', spec: { kind: 'category_monthly_cap', categoryId: '', cap: 5 } },
      { id: 'x8', spec: { kind: 'category_monthly_cap', categoryId: 'c', cap: -5 } },
      { id: 'x9', spec: { kind: 'single_purchase_cap', cap: 'big' } },
      { id: 'y1', spec: { kind: 'category_income_share', categoryId: 'c', pct: 'x' } },
      { id: 'y2', spec: { kind: 'category_income_share', categoryId: '', pct: '5' } },
      { id: 'y3', spec: { kind: 'unspent_floor', floor: -1 } },
      { id: 'debt_share', spec: { kind: 'unspent_floor', floor: 1 } },
      { id: 'ok', spec: { kind: 'unspent_floor', floor: 1 } },
      { id: 'ok', spec: { kind: 'unspent_floor', floor: 2 } },
    ];
    expect(buildV3Inputs(src, v3s({ own_lines: bad })).limits.lines.filter((l) => l.source === 'own').map((l) => l.id)).toEqual(['ok']);
  });

  it('custom options parse, and anything invalid falls back to none', () => {
    const good = {
      itemTypes: [
        { id: 'boat', base: 'general', questionIds: ['fuel_monthly', 7], ownQuestions: [{ id: 'oq', label: 'Moorings', cadence: 'yearly', cash: true }] },
        'junk',
        { id: '', base: 'general' },
        { id: 'bad-base', base: 'nope' },
      ],
      purposes: [{ id: 'p1' }, { id: '' }, 4],
      cadences: [{ unit: 'week', every: 3 }, { unit: 'day', every: 1 }, 'x'],
      incomeKinds: [{ id: 'k1', countsAs: 'kept' }, { id: 'k2', countsAs: 'available' }, { id: 'k3', countsAs: 'maybe' }, { id: '' }, 9],
    };
    const parsed = buildV3Inputs(src, v3s({ custom_options: good })).custom;
    expect(parsed.itemTypes).toHaveLength(1);
    expect(parsed.purposes).toEqual([{ id: 'p1' }]);
    expect(parsed.cadences).toEqual([{ unit: 'week', every: 3 }]);
    expect(parsed.incomeKinds).toEqual([{ id: 'k1', countsAs: 'kept' }, { id: 'k2', countsAs: 'available' }, { id: 'k3', countsAs: null }]);
    expect(parsed.itemTypes[0]!.questionIds).toEqual(['fuel_monthly']);
    const own = (q: unknown) => ({ itemTypes: [{ id: 'z', base: 'general', questionIds: [], ownQuestions: [q] }] });
    for (const q of [{ id: '', label: 'a', cadence: 'yearly', cash: true }, { id: 'a', label: 3, cadence: 'yearly', cash: true }, { id: 'a', label: 'a', cadence: 'daily', cash: true }, { id: 'a', label: 'a', cadence: 'yearly', cash: 'yes' }, 'junk']) {
      expect(buildV3Inputs(src, v3s({ custom_options: own(q) })).custom.itemTypes[0]!.ownQuestions).toEqual([]);
    }
    expect(buildV3Inputs(src, v3s({ custom_options: { purposes: [{ id: 'dup' }, { id: 'dup' }] } })).custom.purposes).toEqual([{ id: 'dup' }]);
    expect(buildV3Inputs(src, v3s({ custom_options: 'nope' })).custom.purposes).toEqual([]);
  });
});

describe('buildV3Inputs: thresholds and other snapshot kinds', () => {
  const RATES: FxLatestRow[] = [
    { quote: 'USD', rate: '1.1', rate_date: '2026-10-02', source: 'frankfurter-v2' },
    { quote: 'XTS', rate: '2.2', rate_date: '2026-10-02', source: 'frankfurter-v2' },
  ];

  it('a currency outside the band table uses the stored rate, else reports missing (D-26)', () => {
    const xts = { ...demoSource(TODAY), homeCurrency: 'XTS' };
    expect(buildV3Inputs({ ...xts, rates: RATES }, null).thresholds.source).toBe('fallback');
    expect(buildV3Inputs(xts, null).thresholds.source).toBe('missing');
  });

  it('a rough snapshot maps the rough figures; the v3 rough fields fill the rest', () => {
    const rough: SnapshotSource = {
      ...demoSource(TODAY), rows: [], series: [], debts: [],
      settings: { ...demoSource(TODAY).settings!, rough_income: 400000, rough_spending: 250000 },
    };
    expect(buildDecideSnapshot(rough).kind).toBe('rough');
    const plain = buildV3Inputs(rough, null);
    expect(plain.rough).toEqual({ income: 400000, expenses: 250000, saving: 0, debt: 0, invest: 0, asOf: TODAY });
    expect(plain.months).toEqual([]);
    const filled = buildV3Inputs(rough, v3s({ rough_saving: 1000, rough_debt: 2000, rough_invest: 3000, rough_as_of: '2026-09-15' }));
    expect(filled.rough).toEqual({ income: 400000, expenses: 250000, saving: 1000, debt: 2000, invest: 3000, asOf: '2026-09-15' });
  });

  it('a snapshot with nothing to go on gives empty months and no rough figures', () => {
    const none: SnapshotSource = { ...demoSource(TODAY), rows: [], series: [], debts: [], settings: null };
    expect(buildDecideSnapshot(none).kind).toBe('none');
    const inputs = buildV3Inputs(none, null);
    expect(inputs.months).toEqual([]);
    expect(inputs.rough).toBeNull();
    expect(inputs.series).toEqual([]);
    expect(inputs.debts).toEqual([]);
  });

  it('a prebuilt snapshot without pots or provisional notes is accepted', () => {
    const built = { ...buildDecideSnapshot(demoSource(TODAY)) } as ReturnType<typeof buildDecideSnapshot> & { pots?: unknown };
    delete built.pots;
    expect(buildV3Inputs(demoSource(TODAY), null, built).envelopes).toEqual([]);
    const marked = { ...buildDecideSnapshot(demoSource(TODAY)), provisional: { rowCount: 1, rateDate: '2026-10-01' } };
    expect(buildV3Inputs(demoSource(TODAY), null, marked).provisionalRates).toBe(false); // logged snapshots carry their own flag
    const none = { ...buildDecideSnapshot({ ...demoSource(TODAY), rows: [], series: [], debts: [], settings: null }), provisional: { rowCount: 1, rateDate: '2026-10-01' } };
    expect(buildV3Inputs(demoSource(TODAY), null, none).provisionalRates).toBe(true);
  });

  it('derived card and loan debts map their kind from the account', () => {
    const base = demoSource(TODAY);
    const src: SnapshotSource = {
      ...base,
      accounts: [...base.accounts, { id: 'card2', name: 'Card 2', kind: 'credit', currency: 'USD', archived_at: null, deleted_at: null }, { id: 'loan2', name: 'Loan 2', kind: 'loan', currency: 'USD', archived_at: null, deleted_at: null }],
      balances: { ...base.balances, card2: -50000, loan2: -90000 },
    };
    const kinds = Object.fromEntries(buildV3Inputs(src, null).debts.map((d) => [d.id, d.kind]));
    expect(kinds).toMatchObject({ card2: 'card', loan2: 'loan', 'demo-debt-0': 'loan' });
  });

  it('a housing loan sets isHousing on its debt', () => {
    const base = demoSource(TODAY);
    const src = { ...base, debts: base.debts.map((d) => (d.id === 'demo-debt-0' ? { ...d, is_housing: true } : d)) };
    expect(buildV3Inputs(src, null).debts.find((d) => d.id === 'demo-debt-0')!.isHousing).toBe(true);
  });
});

describe('buildV3Inputs: M-07 signed unspent anchor', () => {
  const src = demoSource(TODAY);
  const anchor = (n: number) => buildV3Inputs(src, v3s({ unspent_anchor: n, unspent_anchor_at: '2026-10-01' })).unspent;
  it('M-07: an overdrawn figure reaches the engine; out-of-range and fractional ones do not', () => {
    expect(anchor(-150000)).toEqual({ amount: -150000, at: '2026-10-01' });
    expect(anchor(-MAX_ABS_AMOUNT_MINOR - 1)).toBeNull();
    expect(anchor(1.5)).toBeNull();
  });
});

describe('buildV3Inputs: M-09 one bad custom option drops only itself', () => {
  const src = demoSource(TODAY);
  const custom = (o: unknown) => buildV3Inputs(src, v3s({ custom_options: o })).custom;
  it('M-09: a bad item type leaves the other item types, purposes, cadences and income kinds', () => {
    const good = { id: 'a', base: 'general', questionIds: [], ownQuestions: [] };
    const bad = { id: 'b', base: 'general', questionIds: [], ownQuestions: [{ id: 'q', label: '  ', cadence: 'yearly', cash: true }] };
    const c = custom({ itemTypes: [good, bad, { ...good, id: 'c' }], purposes: [{ id: 'p' }], cadences: [{ unit: 'week', every: 2 }], incomeKinds: [{ id: 'k', countsAs: 'kept' }] });
    expect(c.itemTypes.map((t) => t.id)).toEqual(['a', 'c']);
    expect(c.purposes).toEqual([{ id: 'p' }]);
    expect(c.cadences).toHaveLength(1);
    expect(c.incomeKinds).toHaveLength(1);
  });
  it('M-09: each list is cut to ten; an out-of-range cadence and a later duplicate id are dropped alone', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}` }));
    expect(custom({ purposes: twelve }).purposes.map((p) => p.id)).toEqual(twelve.slice(0, 10).map((p) => p.id));
    expect(custom({ cadences: [{ unit: 'month', every: 13 }, { unit: 'month', every: 2 }] }).cadences).toEqual([{ unit: 'month', every: 2 }]);
    expect(custom({ incomeKinds: [{ id: 'k', countsAs: 'kept' }, { id: 'k', countsAs: 'available' }] }).incomeKinds).toEqual([{ id: 'k', countsAs: 'kept' }]);
  });
});

describe('buildV3Inputs: L-09 transfer lines never throw', () => {
  it('L-09: a transfer line whose row is missing is an own transfer', () => {
    const src = withRows(pair('t-gone', EVERYDAY, SAVINGS, 1000));
    const built = buildDecideSnapshot(src);
    const lost = { ...src, rows: src.rows.filter((r) => !String(r.id).startsWith('t-gone')) };
    const lines = buildV3Inputs(lost, null, built).months.flatMap((m) => m.lines);
    expect(lines.find((l) => l.id === 't-gone-out')!.role).toBe('own_transfer');
  });
  it('L-09: a leg with no transfer legs entry does not throw and reads as an unpaired leg', () => {
    const src = withRows(pair('t-del', EVERYDAY, SAVINGS, 1000));
    const built = buildDecideSnapshot(src);
    const dead = { ...src, rows: src.rows.map((r) => (String(r.id).startsWith('t-del') ? { ...r, deleted_at: '2026-10-02T00:00:00Z' } : r)) };
    const lines = buildV3Inputs(dead, null, built).months.flatMap((m) => m.lines);
    expect(lines.find((l) => l.id === 't-del-out')!.role).toBe('other_out');
  });
});

describe('buildV3Inputs: new inputs, accounts and sources (D-54, D-51, M-06)', () => {
  const src = demoSource(TODAY);
  it('maps the new engine inputs explicitly', () => {
    const inputs = buildV3Inputs(src, null);
    expect(inputs.expectedIncome).toEqual([]);
    expect(inputs.heldBridges).toEqual([]);
    expect(inputs.payArrivals).toEqual([]);
    expect(inputs.unexplainedAnswer).toBeNull();
    expect(buildV3Inputs(src, v3s({ income_types: ['salary'] })).profile).toMatchObject({ pattern: null, patternConfirmed: false });
  });

  it('D-54: every live account is listed with its home balance and use null; archived and deleted ones are not', () => {
    const base = demoSource(TODAY);
    const archived = { ...base.accounts[0]!, id: 'zz-arch', archived_at: '2026-01-01T00:00:00Z' };
    const deleted = { ...base.accounts[0]!, id: 'zz-del', deleted_at: '2026-01-01T00:00:00Z' };
    const foreign = { ...base.accounts[0]!, id: 'zz-xyz', currency: 'XYZ' };
    const inputs = buildV3Inputs({ ...base, accounts: [...base.accounts, archived, deleted, foreign], balances: { ...base.balances, 'zz-xyz': 5 } }, null);
    expect(inputs.accounts!.map((a) => a.id)).toEqual(base.accounts.map((a) => a.id));
    expect(inputs.accounts!.every((a) => a.use === null)).toBe(true);
    expect(inputs.accounts!.find((a) => a.id === SAVINGS)!.balance).toBe(base.balances[SAVINGS]);
    expect(buildV3Inputs({ ...base, balances: {} }, null).accounts!.every((a) => a.balance === 0)).toBe(true);
  });

  it('D-54: an envelope with no tagged leg has accountId null; the latest tagged leg decides', () => {
    const goal = (id: string): SnapshotSource['goals'][number] => ({ id, kind: 'pot', check_id: null, currency: 'USD', target: 90000, monthly_amount: 5000, ready_by: '2027-03-01', opening_saved: 0, done_at: null, deleted_at: null });
    const s = withRows(
      [
        ...pair('d1', EVERYDAY, SAVINGS, 100, { in: { goal_id: 'g1', local_date: '2026-09-02' } }),
        ...pair('d2', EVERYDAY, CASH, 100, { in: { goal_id: 'g1', local_date: '2026-10-02' } }),
        ...pair('d3', SAVINGS, CASH, 100, { out: { goal_id: 'g1' } }),
        ...pair('d4', EVERYDAY, EVERYDAY, 100, { in: { goal_id: 'g1', local_date: '2026-08-01' } }),
      ],
      { ...demoSource(TODAY), goals: [goal('g1'), goal('g2')] }
    );
    const env = buildV3Inputs(s, null).envelopes;
    expect(env.find((e) => e.id === 'g1')!.accountId).toBe(CASH);
    expect(env.find((e) => e.id === 'g2')!.accountId).toBeNull();
  });

  it('M-06: with stated uses, counted to counted is an own transfer; counted to untouched is saved; tagged is a deposit; back is other_in', () => {
    const goals: SnapshotSource['goals'] = [{ id: 'g1', kind: 'pot', check_id: null, currency: 'USD', target: null, monthly_amount: null, ready_by: null, opening_saved: 0, done_at: null, deleted_at: null }];
    const src2 = withRows([...pair('u1', EVERYDAY, CASH, 1000), ...pair('u2', EVERYDAY, SAVINGS, 2000), ...pair('u3', SAVINGS, EVERYDAY, 500), ...pair('u4', EVERYDAY, CARD, 700), ...pair('u5', EVERYDAY, SAVINGS, 300, { in: { goal_id: 'g1' } })], { ...demoSource(TODAY), goals });
    const uses = { [EVERYDAY]: { kind: 'everyday' as const }, [CASH]: { kind: 'mixed' as const, extraSetAside: null }, [SAVINGS]: { kind: 'untouched' as const } };
    const rolesWith = (u: Record<string, AccountUse>) => buildV3Inputs(src2, null, undefined, u).months.flatMap((m) => m.lines);
    const role = (u: Record<string, AccountUse>, id: string) => rolesWith(u).find((l) => l.id === id)!.role;
    expect(role(uses, 'u1-out')).toBe('own_transfer');
    expect(role(uses, 'u2-out')).toBe('saved_invested');
    expect(role(uses, 'u3-in')).toBe('other_in');
    expect(role(uses, 'u4-out')).toBe('debt_payment');
    expect(role(uses, 'u5-out')).toBe('envelope_deposit');
    expect(buildV3Inputs(src2, null, undefined, uses).accounts!.find((a) => a.id === SAVINGS)!.use).toEqual({ kind: 'untouched' });
    expect(role({ [EVERYDAY]: { kind: 'everyday' }, [SAVINGS]: { kind: 'everyday' } }, 'u2-out')).toBe('own_transfer');
    expect(role({ [EVERYDAY]: { kind: 'everyday' } }, 'u2-out')).toBe('saved_invested');
    expect(role({ [EVERYDAY]: { kind: 'everyday' }, [SAVINGS]: { kind: 'dedicated', purpose: { kind: 'emergency' } } }, 'u3-in')).toBe('other_in');
    const lone = withRows([mk('lone', EVERYDAY, -50, { transfer_id: 'lone-t' })]);
    expect(buildV3Inputs(lone, null, undefined, { [EVERYDAY]: { kind: 'everyday' } }).months.flatMap((m) => m.lines).find((l) => l.id === 'lone')!.role).toBe('other_out');
  });

  it('D-51: a line is a statement line when its row has an import batch, else manual', () => {
    const s = withRows([mk('imp', EVERYDAY, -100, { import_batch_id: 'b1' }), mk('man', EVERYDAY, -100), mk('nul', EVERYDAY, -100, { import_batch_id: null })]);
    expect(lineOf(s, 'imp')!.source).toBe('statement');
    expect(lineOf(s, 'man')!.source).toBe('manual');
    expect(lineOf(s, 'nul')!.source).toBe('manual');
  });
});

describe('buildV3Inputs: stored 05.2 answers (DSU-20)', () => {
  const base = demoSource(TODAY);
  const acct = (over: Record<string, unknown>): SnapshotSource => ({ ...base, accounts: base.accounts.map((a) => (a.id === SAVINGS ? { ...a, ...over } : a)) as SnapshotSource['accounts'] });
  const useOf = (src: SnapshotSource, uses?: Record<string, AccountUse>) => buildV3Inputs(src, null, undefined, uses).accounts!.find((a) => a.id === SAVINGS)!.use;
  type Ans = NonNullable<V3SettingsSource['answers']>[number];
  const ans = (over: Partial<Ans>): Ans => ({ kind: 'pay_arrival', key: 'k', amount: null, bool_value: null, on_date: null, check_id: null, ...over });

  describe('income pattern', () => {
    it('reads the stated pattern and its confirmation; a bad pattern is null', () => {
      expect(buildV3Inputs(base, v3s({ income_types: ['salary_or_wages'], income_pattern: 'seasonal', income_pattern_confirmed: true })).profile).toMatchObject({ types: ['salary'], pattern: 'seasonal', patternConfirmed: true });
      expect(buildV3Inputs(base, v3s({ income_types: ['none'], income_pattern: 'odd' as never, income_pattern_confirmed: false })).profile).toMatchObject({ types: ['none'], pattern: null, patternConfirmed: false });
      expect(buildV3Inputs(base, v3s({ income_types: ['own_business', 'pension_or_benefits'] })).profile!.types).toEqual(['freelance', 'salary']);
    });
  });

  describe('account use', () => {
    it('reads every shape from the account columns', () => {
      expect(useOf(acct({ use: 'everyday' }))).toEqual({ kind: 'everyday' });
      expect(useOf(acct({ use: 'untouched' }))).toEqual({ kind: 'untouched' });
      expect(useOf(acct({ use: 'mixed', use_extra_set_aside: 5000 }))).toEqual({ kind: 'mixed', extraSetAside: 5000 });
      expect(useOf(acct({ use: 'mixed', use_extra_set_aside: null }))).toEqual({ kind: 'mixed', extraSetAside: null });
      expect(useOf(acct({ use: 'dedicated', use_purpose: 'emergency' }))).toEqual({ kind: 'dedicated', purpose: { kind: 'emergency' } });
      expect(useOf(acct({ use: 'dedicated', use_purpose: 'envelope', use_envelope_id: 'g1' }))).toEqual({ kind: 'dedicated', purpose: { kind: 'envelope', envelopeId: 'g1' } });
    });
    it('an unfinished or missing use reads as not stated; the uses argument still overrides', () => {
      expect(useOf(acct({ use: 'dedicated', use_purpose: 'envelope', use_envelope_id: null }))).toBeNull();
      expect(useOf(acct({ use: 'dedicated', use_purpose: null }))).toBeNull();
      expect(useOf(acct({ use: null }))).toBeNull();
      expect(useOf(base)).toBeNull();
      expect(useOf(acct({ use: 'everyday' }), { [SAVINGS]: { kind: 'untouched' } })).toEqual({ kind: 'untouched' });
    });
    it('stored uses decide which transfers count (M-06)', () => {
      const accounts = base.accounts.map((a) => (a.id === EVERYDAY ? { ...a, use: 'everyday' } : a.id === SAVINGS ? { ...a, use: 'untouched' } : a)) as SnapshotSource['accounts'];
      const s = withRows(pair('t1', EVERYDAY, SAVINGS, 2000), { ...base, accounts });
      expect(lineOf(s, 't1-out')!.role).toBe('saved_invested');
    });
  });

  describe('envelopes', () => {
    const goal = (id: string, over: Partial<SnapshotSource['goals'][number]> = {}): SnapshotSource['goals'][number] => ({ id, kind: 'pot', check_id: null, currency: 'USD', target: 90000, monthly_amount: 5000, ready_by: '2027-03-01', opening_saved: 0, done_at: null, deleted_at: null, ...over });
    it('a stored account wins over the transfer-leg guess, which stays as the fallback; bucket marks a saving bucket', () => {
      const s = withRows(pair('d1', EVERYDAY, SAVINGS, 100, { in: { goal_id: 'g1' } }), { ...base, goals: [goal('g1', { account_id: CASH }), goal('g2', { bucket: 'trip' }), goal('g3', { account_id: null, bucket: null })] });
      const env = Object.fromEntries(buildV3Inputs(s, null).envelopes.map((e) => [e.id, e]));
      expect(env.g1).toMatchObject({ accountId: CASH, bucket: false });
      expect(env.g2).toMatchObject({ accountId: null, bucket: true });
      expect(env.g3).toMatchObject({ accountId: null, bucket: false });
      const guess = withRows(pair('d1', EVERYDAY, SAVINGS, 100, { in: { goal_id: 'g1' } }), { ...base, goals: [goal('g1')] });
      expect(buildV3Inputs(guess, null).envelopes[0]!.accountId).toBe(SAVINGS);
    });
  });

  describe('D-23 buckets are carved out of regular saving', () => {
    const categories = { ...base.categories, 'cat-savings': 'Savings' };
    const saving = { id: 'sv', account_id: EVERYDAY, amount: -30000, currency: 'USD', freq: 'monthly' as const, anchor_date: '2026-04-02', end_date: null, occurrence_count: null, category_id: 'cat-savings', deleted_at: null };
    const goal = (id: string, monthly: number): SnapshotSource['goals'][number] => ({ id, kind: 'pot', check_id: null, currency: 'USD', target: null, monthly_amount: monthly, ready_by: null, opening_saved: 0, done_at: null, deleted_at: null, bucket: 'house' });
    const setAside = (monthly: number) => buildMonthModel(buildV3Inputs({ ...base, categories, series: [...base.series, saving], goals: [goal('b1', monthly), goal('b2', monthly)] }, null)).setAside;
    const debts = buildV3Inputs(base, null).debts.reduce((n, d) => n + d.minimum, 0);
    it('two 15000 buckets inside a 30000 saving count 30000, not 60000; 25000 buckets count 50000', () => {
      expect(setAside(15000)).toBe(debts + 30000);
      expect(setAside(25000)).toBe(debts + 50000);
    });
  });

  describe('lines', () => {
    it('carries the refund link, the income kind and counts-as from the row', () => {
      const s = withRows([mk('buy', EVERYDAY, -5000), mk('ref', EVERYDAY, 2000, { is_refund: true, refund_of: 'buy' }), mk('inc', EVERYDAY, 7000, { income_kind: 'rent', counts_as: 'kept' }), mk('plain', EVERYDAY, 800)]);
      expect(lineOf(s, 'ref')).toMatchObject({ role: 'refund', refundOf: 'buy' });
      expect(lineOf(s, 'buy')!.refundOf).toBeNull();
      expect(lineOf(s, 'inc')).toMatchObject({ role: 'income', incomeKind: { kind: 'preset', value: 'rent' }, countsAs: 'kept' });
      expect(lineOf(s, 'plain')).toMatchObject({ incomeKind: null, countsAs: null });
    });
  });

  describe('series attributes', () => {
    const row = (id: string, over: Record<string, unknown>): SnapshotSource['series'][number] =>
      ({ id, account_id: EVERYDAY, amount: 50000, currency: 'USD', freq: 'monthly', anchor_date: '2026-04-02', end_date: null, occurrence_count: null, category_id: 'cat-income', deleted_at: null, ...over }) as SnapshotSource['series'][number];
    const byId = (s: SnapshotSource, v3: V3SettingsSource | null = null) => Object.fromEntries(buildV3Inputs(s, v3).series.map((x) => [x.id, x]));
    const withSeries = (...rows: SnapshotSource['series']): SnapshotSource => ({ ...base, series: [...base.series, ...rows] });
    it('reads the attributes from the series row', () => {
      const all = byId(withSeries(row('r', { income_kind: 'rent', counts_as: 'available', pay_group: 'pg' })));
      expect(all.r).toMatchObject({ role: 'other_income', countsAs: 'available', payGroup: 'pg', incomeKind: { kind: 'preset', value: 'rent' } });
    });
    it('a prebuilt snapshot naming a series the source no longer lists reads no attributes for it', () => {
      const built = buildDecideSnapshot(base);
      const out = buildV3Inputs({ ...base, series: [] }, null, built).series.find((x) => x.id === 'demo-series-salary')!;
      expect(out).toMatchObject({ role: 'pay', payGroup: null, countsAs: 'available' });
    });
    it('a series_extra entry overrides field by field and keeps the row for the rest', () => {
      const s = withSeries(row('r', { income_kind: 'rent', counts_as: 'available', pay_group: 'pg' }));
      const partial = byId(s, v3s({ series_extra: { r: extra({ typical_choice: 'monthly' }) } }));
      expect(partial.r).toMatchObject({ countsAs: 'available', payGroup: 'pg', typicalChoice: 'monthly' });
      const full = byId(s, v3s({ series_extra: { r: extra({ counts_as: 'kept', pay_group: 'x', income_kind: 'family', saving_mode: 'flexible' }) } }));
      expect(full.r).toMatchObject({ countsAs: 'kept', payGroup: 'x', incomeKind: { kind: 'preset', value: 'family' } });
    });
  });

  describe('answers', () => {
    const cid = '11111111-1111-1111-1111-111111111111';
    it('maps a pay arrival and ignores a bad key, date or empty answer', () => {
      const out = buildV3Inputs(
        base,
        v3s({
          answers: [
            ans({ key: 'demo-series-salary:2026-09-25', bool_value: true }),
            ans({ key: 'demo-series-salary:2026-09-26', bool_value: false }),
            ans({ key: 'demo-series-salary:2026-09-27', bool_value: null }),
            ans({ key: 'demo-series-salary:soon', bool_value: true }),
            ans({ key: ':2026-09-28', bool_value: true }),
            ans({ key: 'nocolon', bool_value: true }),
            ans({ kind: 'held_bridge', key: 'other:2026-09-25', bool_value: true }),
          ],
        })
      ).payArrivals;
      expect(out).toEqual([
        { seriesId: 'demo-series-salary', date: '2026-09-25', arrived: true },
        { seriesId: 'demo-series-salary', date: '2026-09-26', arrived: false },
      ]);
    });
    it('maps expected income and drops incomplete ones', () => {
      const out = buildV3Inputs(
        base,
        v3s({
          answers: [
            ans({ kind: 'expected_income', key: '2026-11', amount: 300000, on_date: '2026-10-02' }),
            ans({ kind: 'expected_income', key: '2026-12', amount: null, on_date: '2026-10-02' }),
            ans({ kind: 'expected_income', key: '2026-12', amount: 5, on_date: null }),
            ans({ kind: 'expected_income', key: 'dec', amount: 5, on_date: '2026-10-02' }),
            ans({ kind: 'volatile_cover', key: '2026-12', amount: 5, on_date: '2026-10-02' }),
          ],
        })
      ).expectedIncome;
      expect(out).toEqual([{ month: '2026-11', amount: 300000, at: '2026-10-02' }]);
    });
    it('holds a bridge only while its check is live', () => {
      const answers = [
        ans({ kind: 'held_bridge', key: cid, amount: 40000, check_id: cid }),
        ans({ kind: 'held_bridge', key: 'z', amount: 1, check_id: null }),
        ans({ kind: 'held_bridge', key: cid, amount: null, check_id: cid }),
        ans({ kind: 'pay_arrival', amount: 5, check_id: cid }),
      ];
      expect(buildV3Inputs(base, v3s({ answers, live_bridge_check_ids: [cid] })).heldBridges).toEqual([{ id: cid, amount: 40000 }]);
      expect(buildV3Inputs(base, v3s({ answers, live_bridge_check_ids: [] })).heldBridges).toEqual([]);
      expect(buildV3Inputs(base, null).heldBridges).toEqual([]);
    });
    it('the unexplained answer needs its amount, use and date', () => {
      const full = { unexplained_amount: 12000, unexplained_use: 'spare' as const, unexplained_at: '2026-10-01' };
      expect(buildV3Inputs(base, v3s(full)).unexplainedAnswer).toEqual({ amount: 12000, use: 'spare', at: '2026-10-01' });
      expect(buildV3Inputs(base, v3s({ ...full, unexplained_amount: null })).unexplainedAnswer).toBeNull();
      expect(buildV3Inputs(base, v3s({ ...full, unexplained_use: null })).unexplainedAnswer).toBeNull();
      expect(buildV3Inputs(base, v3s({ ...full, unexplained_use: 'odd' as never })).unexplainedAnswer).toBeNull();
      expect(buildV3Inputs(base, v3s({ ...full, unexplained_at: null })).unexplainedAnswer).toBeNull();
      expect(buildV3Inputs(base, null).unexplainedAnswer).toBeNull();
    });
    it('an old cached settings row without the new fields reads as nothing stored', () => {
      const old = { ...v3s(), answers: undefined, live_bridge_check_ids: undefined, unexplained_amount: undefined } as V3SettingsSource;
      const out = buildV3Inputs(base, old);
      expect([out.payArrivals, out.expectedIncome, out.heldBridges, out.unexplainedAnswer]).toEqual([[], [], [], null]);
    });
  });
});
