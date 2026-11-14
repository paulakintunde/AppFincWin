// 06.1-43 (G-1, C-2): readiness answers and skipped lines reach the engine through buildV3Inputs.
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import type { SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import { computeV3 } from '../computeV3';
import type { V3AnswerLite } from '../types';
import { waiverAnswerKey } from '../waiverKeys';
import { v3s } from './v3Fixtures';

const TODAY = '2026-10-03';
const BILL = '3f0c2a9e-1b4d-4c5e-8f60-1234567890ab';
const OTHER = '0a0c2a9e-1b4d-4c5e-8f60-1234567890ab';
const MISSED = '2026-09-10';
type Row = SnapshotSource['rows'][number];

function billRow(date: string, over: Partial<Row> = {}): Row {
  return {
    id: `bill-${date}`,
    account_id: 'demo-acct-everyday',
    local_date: date,
    original_amount: -5000,
    original_currency: 'USD',
    home_currency: 'USD',
    home_amount: -5000,
    orig_per_eur: null,
    status: 'paid',
    is_refund: false,
    transfer_id: null,
    recurring_series_id: BILL,
    category_id: 'cat-utilities',
    deleted_at: null,
    ...over,
  };
}

/** The demo plus a monthly bill paid every month from April to August; September's occurrence is missing. */
function missedBillSource(extra: Row[] = []): SnapshotSource {
  const base = demoSource(TODAY);
  const paid = ['2026-04-10', '2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10'].map((d) => billRow(d));
  return {
    ...base,
    rows: [...base.rows, ...paid, ...extra],
    series: [
      ...base.series,
      { id: BILL, account_id: 'demo-acct-everyday', amount: -5000, currency: 'USD', freq: 'monthly', anchor_date: '2026-04-10', end_date: null, occurrence_count: null, category_id: 'cat-utilities', deleted_at: null },
    ],
  };
}

const waiverRow = (key: string, on_date: string | null = TODAY): V3AnswerLite => ({ kind: 'readiness_waiver', key, amount: null, bool_value: null, on_date, check_id: null });

describe('buildV3Inputs: waivers', () => {
  it('no readiness answers -> waivers is present and empty', () => {
    expect(buildV3Inputs(demoSource(TODAY), null).waivers).toEqual([]);
    expect(buildV3Inputs(demoSource(TODAY), v3s()).waivers).toEqual([]);
  });

  it('reads every readiness_waiver row in stored order and drops malformed rows and other kinds', () => {
    const answers: V3AnswerLite[] = [
      waiverRow(`always-other:${BILL}`),
      { kind: 'pay_arrival', key: `${BILL}:2026-09-10`, amount: null, bool_value: true, on_date: '2026-09-10', check_id: null },
      waiverRow('nonsense'),
      waiverRow('nothing-to-add:2026-09', '2026-10-02'),
      waiverRow('nothing-to-add:2026-08', null),
      waiverRow('income-elsewhere'),
    ];
    expect(buildV3Inputs(demoSource(TODAY), v3s({ answers })).waivers).toEqual([
      { kind: 'always_other', seriesId: BILL },
      { kind: 'nothing_to_add', month: '2026-09', at: '2026-10-02' },
      { kind: 'income_elsewhere' },
    ]);
  });
});

describe('buildV3Inputs: skipped', () => {
  it('none -> skipped is present and empty', () => {
    expect(buildV3Inputs(demoSource(TODAY), null).skipped).toEqual([]);
  });

  it('one entry per skipped series row, de-duplicated, sorted by series then date; skipped rows never become lines', () => {
    const src = missedBillSource([
      billRow('2026-09-10', { id: 's1', status: 'skipped' }),
      billRow('2026-09-10', { id: 's1-dup', status: 'skipped' }),
      billRow('2026-08-28', { id: 's0', status: 'skipped', recurring_series_id: BILL }),
      billRow('2026-09-01', { id: 's-other', status: 'skipped', recurring_series_id: OTHER }),
      billRow('2026-09-02', { id: 's-loose', status: 'skipped', recurring_series_id: null }),
      billRow('2026-09-03', { id: 's-gone', status: 'skipped', deleted_at: '2026-10-01T00:00:00Z' }),
    ]);
    const inputs = buildV3Inputs(src, null);
    expect(inputs.skipped).toEqual([
      { seriesId: OTHER, date: '2026-09-01' },
      { seriesId: BILL, date: '2026-08-28' },
      { seriesId: BILL, date: '2026-09-10' },
    ]);
    const ids = inputs.months.flatMap((m) => m.lines).map((l) => l.id);
    expect(ids.filter((id) => id.startsWith('s'))).toEqual([]);
  });
});

describe('computeV3: answers and skips clear readiness items', () => {
  const readinessOf = (src: SnapshotSource, answers: V3AnswerLite[] = []) => computeV3(src, v3s({ answers }), {}).result.readiness;

  it('a missed bill occurrence is a named open item', () => {
    const r = readinessOf(missedBillSource());
    expect(r?.ready).toBe(false);
    expect(r?.items).toEqual([expect.objectContaining({ kind: 'bill', seriesId: BILL, date: MISSED, month: '2026-09' })]);
  });

  it('a paid-by-other answer for that occurrence makes it ready and names the answer', () => {
    const key = waiverAnswerKey({ kind: 'paid_by_other', seriesId: BILL, date: MISSED });
    const r = readinessOf(missedBillSource(), [waiverRow(key)]);
    expect(r?.ready).toBe(true);
    expect(r?.waived?.[0]?.by).toBe('paid_by_other');
  });

  it('a skipped line for the same series and date makes it ready silently', () => {
    const r = readinessOf(missedBillSource([billRow(MISSED, { id: 'skip-sep', status: 'skipped' })]));
    expect(r?.ready).toBe(true);
    expect(r?.waived).toEqual([]);
  });

  it('D-54: an envelope with no account stays open whatever answers are given', () => {
    const src: SnapshotSource = {
      ...demoSource(TODAY),
      goals: [{ id: 'g-env', name: 'Holiday', kind: 'pot', check_id: null, currency: 'USD', target: 100000, monthly_amount: 10000, ready_by: null, opening_saved: 20000, done_at: null, deleted_at: null, account_id: null }],
    };
    const all = [
      `paid-by-other:${BILL}:${MISSED}`,
      `didnt-happen:${BILL}:${MISSED}`,
      `no-pay:${BILL}:${MISSED}`,
      `always-other:${BILL}`,
      'income-elsewhere',
      'nothing-to-add:2026-10',
      'month-complete:2026-10',
      'start-from:2026-11',
    ].map((k) => waiverRow(k));
    const r = readinessOf(src, all);
    expect(r?.ready).toBe(false);
    expect(r?.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'envelopes', envelopeId: 'g-env' })]));
  });
});
