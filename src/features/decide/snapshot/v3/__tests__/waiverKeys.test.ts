import type { DecideAnswerRow } from '@/db/decideAnswers';
import type { ReadinessWaiver } from '@/engine/decide/v3';
import {
  READINESS_WAIVER_KEY_RE,
  READINESS_WAIVER_KIND,
  waiverAnswerFor,
  waiverAnswerShape,
  waiverKeyOf,
  waiversFromAnswers,
} from '../waiverKeys';

const SID = '0b9e3c1a-4d2f-4e8b-9a71-3c5d2e6f7a80';
const AT = '2026-10-30';

const ALL: readonly ReadinessWaiver[] = [
  { kind: 'paid_by_other', seriesId: SID, date: '2026-09-21' },
  { kind: 'didnt_happen', seriesId: SID, date: '2026-09-03' },
  { kind: 'no_pay', seriesId: SID, date: '2026-09-03' },
  { kind: 'always_other', seriesId: SID },
  { kind: 'income_elsewhere' },
  { kind: 'nothing_to_add', month: '2026-10', at: '2026-10-29' },
  { kind: 'month_complete', month: '2026-09', at: '2026-10-02' },
  { kind: 'start_from', month: '2026-10' },
];

function row(over: Partial<DecideAnswerRow> & Pick<DecideAnswerRow, 'key'>): DecideAnswerRow {
  return {
    id: `row-${over.key}`,
    household_id: 'hh',
    created_by: 'me',
    kind: 'readiness_waiver',
    amount: null,
    bool_value: null,
    on_date: AT,
    check_id: null,
    deleted_at: null,
    version: 1,
    created_at: AT,
    updated_at: AT,
    ...over,
  };
}

describe('05.3-54 D-28 readiness waiver keys', () => {
  it('every kind round-trips through waiverAnswerShape and waiversFromAnswers', () => {
    const shapes = ALL.map((w) => waiverAnswerShape(w, AT));
    expect(shapes.map((s) => s.key)).toEqual([
      `paid-by-other:${SID}:2026-09-21`,
      `didnt-happen:${SID}:2026-09-03`,
      `no-pay:${SID}:2026-09-03`,
      `always-other:${SID}`,
      'income-elsewhere',
      'nothing-to-add:2026-10',
      'month-complete:2026-09',
      'start-from:2026-10',
    ]);
    for (const s of shapes) {
      expect(s).toMatchObject({ kind: READINESS_WAIVER_KIND, amount: null, bool_value: null, check_id: null });
      expect(s.key.length).toBeLessThanOrEqual(80);
      expect(READINESS_WAIVER_KEY_RE.test(s.key)).toBe(true);
    }
    expect(shapes.map((s) => s.on_date)).toEqual([AT, AT, AT, AT, AT, '2026-10-29', '2026-10-02', AT]);
    expect(waiversFromAnswers(shapes.map((s) => ({ kind: s.kind, key: s.key, on_date: s.on_date })))).toEqual(ALL);
  });

  it('bad ids, dates and months throw RangeError', () => {
    expect(() => waiverKeyOf({ kind: 'always_other', seriesId: 'Netflix' })).toThrow(RangeError);
    expect(() => waiverKeyOf({ kind: 'paid_by_other', seriesId: SID, date: '2026-9-1' })).toThrow(RangeError);
    expect(() => waiverKeyOf({ kind: 'start_from', month: '2026-10-01' })).toThrow(RangeError);
    expect(() => waiverAnswerShape({ kind: 'income_elsewhere' }, 'today')).toThrow(RangeError);
    expect(() => waiverAnswerShape({ kind: 'nothing_to_add', month: '2026-10', at: 'now' }, AT)).toThrow(RangeError);
  });

  it('deleted rows, other kinds, malformed keys and dateless month answers are dropped, never thrown', () => {
    const rows = [
      { kind: 'readiness_waiver', key: 'income-elsewhere', on_date: AT, deleted_at: AT },
      { kind: 'pay_arrival', key: 'income-elsewhere', on_date: AT },
      { kind: 'readiness_waiver', key: 'income-elsewhere:x', on_date: AT },
      { kind: 'readiness_waiver', key: 'always-other:Netflix', on_date: AT },
      { kind: 'readiness_waiver', key: `paid-by-other:${SID}`, on_date: AT },
      { kind: 'readiness_waiver', key: 'nothing-to-add:2026-10', on_date: null },
      { kind: 'readiness_waiver', key: 'month-complete:2026-10', on_date: 'soon' },
      { kind: 'readiness_waiver', key: 'start-from:2026-10', on_date: null, deleted_at: null },
    ];
    expect(waiversFromAnswers(rows)).toEqual([{ kind: 'start_from', month: '2026-10' }]);
  });

  it('every key fits the 80-character column', () => {
    const longest = waiverAnswerShape({ kind: 'paid_by_other', seriesId: SID, date: '2026-09-21' }, AT).key;
    expect(longest.length).toBeLessThanOrEqual(80);
  });

  it('waiverAnswerFor finds the live row for a waiver, or gives null', () => {
    const w: ReadinessWaiver = { kind: 'always_other', seriesId: SID };
    const live = row({ key: `always-other:${SID}` });
    const rows = [row({ key: `always-other:${SID}`, id: 'gone', deleted_at: AT }), row({ key: `always-other:${SID}`, id: 'other', kind: 'pay_arrival' }), live];
    expect(waiverAnswerFor(rows, w)).toBe(live);
    expect(waiverAnswerFor(rows, { kind: 'income_elsewhere' })).toBeNull();
    expect(waiverAnswerFor([], w)).toBeNull();
  });
});
