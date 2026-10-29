// 05.2-56 (F-10, D-11): before / after the series income type reaches the engine line. "Before" is the inputs with every
// income line's incomeKind reset to what the old code produced (the row's own tag only); "after" is buildV3Inputs now.
import type { CheckV2, V3Inputs } from '@/engine/decide/v3';
import { demoSource, sofaInputs } from '../../../__tests__/helpers/demoScenario';
import type { SnapshotSource } from '../../buildSnapshot';
import { computeV3 } from '../computeV3';
import { buildV3Inputs } from '../buildV3Inputs';
import * as engine from '@/engine/decide/v3';
import { v3s } from './v3Fixtures';

const TODAY = '2026-10-28';
type Row = SnapshotSource['rows'][number];
type Series = SnapshotSource['series'][number];

const seen: CheckV2[] = [];
jest.mock('@/engine/decide/v3', () => {
  const actual = jest.requireActual('@/engine/decide/v3');
  return { ...actual, evaluate: (i: unknown, c: CheckV2) => (seen.push(c), actual.evaluate(i, c)) };
});

const EVERYDAY = 'demo-acct-everyday';
const month = (back: number): string => {
  const d = new Date(Date.UTC(2026, 9 - back, 1));
  return d.toISOString().slice(0, 7);
};
function row(id: string, amount: number, date: string, over: Partial<Row> = {}): Row {
  return {
    id, account_id: EVERYDAY, local_date: date, original_amount: amount, original_currency: 'USD', home_currency: 'USD', home_amount: amount,
    orig_per_eur: null, status: 'paid', is_refund: false, transfer_id: null, recurring_series_id: null, category_id: 'cat-income', deleted_at: null, ...over,
  };
}
const series = (id: string, amount: number, over: Partial<Series>): Series => ({
  id, account_id: EVERYDAY, amount, currency: 'USD', freq: 'monthly', anchor_date: `${month(6)}-05`, end_date: null, occurrence_count: null, category_id: 'cat-income', deleted_at: null, ...over,
});

function fixture(): SnapshotSource {
  const base = demoSource(TODAY);
  const rows: Row[] = [];
  for (let back = 6; back >= 0; back -= 1) {
    const m = month(back);
    // a salary series whose occurrences carry no tag of their own, beside rows tagged on the row itself
    rows.push(row(`sal-${m}`, 300000, `${m}-05`, { recurring_series_id: 'ser-salary' }));
    rows.push(row(`sal-tagged-${m}`, 40000, `${m}-06`, { income_kind: 'salary', counts_as: 'available' }));
    // untagged one-off income, and a refund
    rows.push(row(`oneoff-${m}`, 12000 + back * 700, `${m}-12`));
    rows.push(row(`ref-${m}`, 2500, `${m}-14`, { is_refund: true, category_id: null }));
    // a second, untagged-occurrence other-income series
    rows.push(row(`rent-${m}`, 80000, `${m}-09`, { recurring_series_id: 'ser-rent' }));
  }
  return {
    ...base,
    rows: [...base.rows, ...rows],
    series: [
      ...base.series,
      series('ser-salary', 300000, { income_kind: 'salary', counts_as: 'available' }),
      series('ser-rent', 80000, { income_kind: 'rent', counts_as: 'kept' }),
    ],
  };
}

/** What the old line produced: the row's own tag only, so a row with none read null. */
function before(source: SnapshotSource, after: V3Inputs): V3Inputs {
  const own = new Map(source.rows.map((r) => [r.id, (r as { income_kind?: string | null }).income_kind ?? null]));
  return {
    ...after,
    months: after.months.map((m) => ({
      ...m,
      lines: m.lines.map((l) => (l.role === 'income' && own.get(l.id) === null ? { ...l, incomeKind: null } : l)),
    })),
  };
}

const pick = (e: ReturnType<typeof engine.evaluate>) => ({
  verdict: e.result.code,
  variant: e.result.variant,
  typicalIncome: e.month.typicalIncome,
  typicalLeft: e.month.typicalLeft,
  moneyIn: e.month.moneyIn,
  e: e.month.e,
  incomePicture: e.month.incomePicture ?? null,
  notices: e.result.notices,
  reasons: e.result.reasons,
  monthNotices: e.month.notices,
  monthReasons: e.month.reasons,
  split: e.result.split,
});

describe('F-10 before / after: the series income type on the engine line', () => {
  const source = fixture();
  const cases: [string, ReturnType<typeof v3s>][] = [
    ['pattern unset', v3s()],
    ['pattern variable', v3s({ income_pattern: 'variable', income_pattern_confirmed: true })],
  ];
  for (const [name, v3] of cases) {
    for (const price of [50000, 500000]) {
      it(`${name}, price ${price}: no answer changes`, () => {
        seen.length = 0;
        computeV3(source, v3, sofaInputs);
        const check = { ...seen[0]!, price: price as CheckV2['price'] } as CheckV2;
        const after = buildV3Inputs(source, v3);
        const beforeInputs = before(source, after);
        // the fixture really does exercise the change: some income line differs between before and after
        const differs = after.months.some((m, i) => m.lines.some((l, j) => l.incomeKind !== beforeInputs.months[i]!.lines[j]!.incomeKind));
        expect(differs).toBe(true);
        expect(pick(engine.evaluate(after, check))).toEqual(pick(engine.evaluate(beforeInputs, check)));
      });
    }
  }
});
