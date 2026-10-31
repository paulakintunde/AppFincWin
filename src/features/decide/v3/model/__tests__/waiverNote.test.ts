/** 05.3-59 (D-24, D-27, D-31, W8, W9): the user's answers behind a result, as a note and confidence-sheet rows. */
import en from '@/i18n/locales/en';
import { minorUnits } from '@/engine/money/types';
import type { PaidByOtherDue, ReadinessItem, ReadinessWaiver, WaivedItem } from '@/engine/decide/v3';
import { WAIVER_UNNAMED_KEY, waiverNote, waiverRows } from '../waiverNote';

const K = 'decide.v3.ui.confidence.waiver.';
const THIS = '2026-10';

function item(over: Partial<ReadinessItem>): ReadinessItem {
  return { kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: null, envelopeId: null, lineId: null, name: null, amount: null, date: null, ...over };
}
function waived(w: ReadinessWaiver, over: Partial<ReadinessItem> = {}): WaivedItem {
  return { item: item(over), by: w.kind, waiver: w };
}
function due(over: Partial<PaidByOtherDue>): PaidByOtherDue {
  return { seriesId: 'netflix', name: 'Netflix', date: '2026-10-03', amount: minorUnits(1199), by: 'paid_by_other', ...over };
}

function resolve(key: string): string | undefined {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}
function fill(key: string, params: Record<string, unknown>): string {
  return (resolve(key) ?? '').replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(params[n] ?? ''));
}

const PBO_NETFLIX: ReadinessWaiver = { kind: 'paid_by_other', seriesId: 'netflix', date: '2026-10-03' };

describe('waiverRows and waiverNote', () => {
  it('nothing at all: no rows and no note', () => {
    expect(waiverRows(undefined, undefined, undefined, THIS)).toEqual([]);
    expect(waiverRows([], [], [], THIS)).toEqual([]);
    expect(waiverNote([])).toBeNull();
  });

  it('one paid_by_other this month: one row, notCounted, and the note names it (W8)', () => {
    const rows = waiverRows(undefined, [due({})], undefined, THIS);
    expect(rows).toEqual([
      {
        key: 'paid_by_other|netflix|2026-10-03',
        textKey: `${K}paid_by_other`,
        shortKey: `${K}paid_by_other_short`,
        params: { name: 'Netflix', date: '2026-10-03' },
        effectKey: `${K}notCounted`,
        waiver: PBO_NETFLIX,
        name: 'Netflix',
      },
    ]);
    const note = waiverNote(rows)!;
    expect(note.key).toBe(`${K}note_one`);
    const text = note.params.text as { key: string; params: Record<string, unknown> };
    expect(fill(note.key, { text: fill(text.key, text.params) })).toBe('Netflix counted as paid by someone else.');
  });

  it('a paid_by_other in an earlier month has no effect line', () => {
    const rows = waiverRows([waived({ kind: 'paid_by_other', seriesId: 'rent', date: '2026-09-01' }, { name: 'Rent' })], undefined, undefined, THIS);
    expect(rows[0]!.effectKey).toBeNull();
    expect(rows[0]!.name).toBe('Rent');
  });

  it('the same paid_by_other in waived and paidByOther is one row', () => {
    const rows = waiverRows([waived(PBO_NETFLIX, { name: null })], [due({})], undefined, THIS);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Netflix'); // a later source fills a missing name
    expect(rows[0]!.params.name).toBe('Netflix');
  });

  it('Lunch paid by someone else plus October nothing to add: two rows, note_other with count 2', () => {
    const rows = waiverRows(
      [
        waived({ kind: 'paid_by_other', seriesId: 'lunch', date: '2026-09-21' }, { name: 'Lunch' }),
        waived({ kind: 'nothing_to_add', month: '2026-10', at: '2026-10-30' }, { kind: 'spending', code: 'activity_not_current', month: '2026-10' }),
      ],
      [],
      [],
      THIS,
    );
    expect(rows.map((r) => r.textKey)).toEqual([`${K}paid_by_other`, `${K}nothing_to_add`]);
    expect(rows[1]!.params).toEqual({ month: '2026-10' });
    expect(rows[1]!.name).toBeNull();
    expect(waiverNote(rows)).toEqual({ key: `${K}note_other`, params: { count: 2 } });
  });

  it('three September items answered by month_complete are one row', () => {
    const w: ReadinessWaiver = { kind: 'month_complete', month: '2026-09', at: '2026-10-30' };
    const rows = waiverRows([waived(w, { name: 'Income' }), waived(w, { name: 'Netflix' }), waived(w, { name: 'Lunch' })], undefined, undefined, THIS);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textKey).toBe(`${K}month_complete`);
    expect(rows[0]!.params).toEqual({ month: '2026-09' });
    expect(rows[0]!.name).toBeNull();
    expect(rows[0]!.effectKey).toBeNull();
  });

  it('always_other from paidByOther: the always_other waiver and alwaysNotCounted (D-31)', () => {
    const rows = waiverRows(undefined, [due({ by: 'always_other' })], undefined, THIS);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.waiver).toEqual({ kind: 'always_other', seriesId: 'netflix' });
    expect(rows[0]!.effectKey).toBe(`${K}alwaysNotCounted`);
    expect(rows[0]!.textKey).toBe(`${K}always_other`);
    expect(rows[0]!.params).toEqual({ name: 'Netflix' });
  });

  it('blocker: always_other only in alwaysOther (October Netflix recorded paid) is one row, and the note names it', () => {
    const rows = waiverRows([], [], [{ seriesId: 'netflix', name: 'Netflix' }], THIS);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe('always_other|netflix');
    expect(rows[0]!.effectKey).toBe(`${K}alwaysNotCounted`);
    const note = waiverNote(rows)!;
    const text = note.params.text as { key: string; params: Record<string, unknown> };
    expect(fill(note.key, { text: fill(text.key, text.params) })).toBe('Netflix counted as always paid by someone else.');

    const ao: ReadinessWaiver = { kind: 'always_other', seriesId: 'netflix' };
    expect(waiverRows([waived(ao, { name: 'Netflix' })], [due({ by: 'always_other' })], [{ seriesId: 'netflix', name: 'Netflix' }], THIS)).toHaveLength(1);
  });

  it('a null name leaves params.name out; the card uses the unnamed key', () => {
    const rows = waiverRows(undefined, undefined, [{ seriesId: 's1', name: null }], THIS);
    expect(rows[0]!.name).toBeNull();
    expect(rows[0]!.params).toEqual({});
    expect(WAIVER_UNNAMED_KEY).toBe(`${K}unnamed`);
    expect(fill(rows[0]!.textKey, { name: fill(WAIVER_UNNAMED_KEY, {}) })).toBe('A payment: counted as always paid by someone else');
  });

  it('every other kind maps to its key and params', () => {
    const rows = waiverRows(
      [
        waived({ kind: 'didnt_happen', seriesId: 'gym', date: '2026-09-05' }, { name: 'Gym' }),
        waived({ kind: 'no_pay', seriesId: 'pay', date: '2026-09-03' }, { kind: 'pay', name: 'Income' }),
        waived({ kind: 'income_elsewhere' }, { kind: 'pay' }),
        waived({ kind: 'start_from', month: '2026-10' }, { kind: 'late_start' }),
      ],
      undefined,
      undefined,
      THIS,
    );
    expect(rows.map((r) => [r.key, r.textKey, r.shortKey, r.params, r.effectKey])).toEqual([
      ['didnt_happen|gym|2026-09-05', `${K}didnt_happen`, `${K}didnt_happen`, { name: 'Gym', date: '2026-09-05' }, null],
      ['no_pay|pay|2026-09-03', `${K}no_pay`, `${K}no_pay`, { name: 'Income', date: '2026-09-03' }, null],
      ['income_elsewhere', `${K}income_elsewhere`, `${K}income_elsewhere`, {}, null],
      ['start_from|2026-10', `${K}start_from`, `${K}start_from`, { month: '2026-10' }, null],
    ]);
    expect(waiverNote(rows)).toEqual({ key: `${K}note_other`, params: { count: 4 } });
  });

  it('every key resolves and the copy is declarative', () => {
    const keys = ['note_one', 'note_other', 'heading', 'paid_by_other', 'paid_by_other_short', 'always_other', 'always_other_short', 'didnt_happen', 'no_pay', 'income_elsewhere', 'nothing_to_add', 'month_complete', 'start_from', 'notCounted', 'alwaysNotCounted', 'unnamed', 'askAgain', 'askAgainA11y'];
    for (const k of keys) {
      const v = resolve(K + k);
      expect({ k, ok: typeof v === 'string' }).toEqual({ k, ok: true });
      expect(v).not.toMatch(/\bleft\b|\bshort\b|\bfree\b|you can|offer|should|advice/i);
    }
    expect(resolve(`${K}notCounted`)).toBe('Not counted as money going out this month.');
    expect(resolve(`${K}alwaysNotCounted`)).toBe('Not counted against your months, including your typical month.');
    expect(resolve(`${K}note_other`)).toBe('Rests on {{count}} of your answers.');
    expect(Object.values(en.decide.v3.ui.confidence.waiver).join(' ')).not.toMatch(/still include/i);
  });
});
