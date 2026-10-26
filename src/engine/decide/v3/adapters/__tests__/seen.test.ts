import * as fs from 'fs';
import * as path from 'path';
import type { Fact, ReadyBy, Result } from '../../types';
import { changeSinceLooked, seenOf } from '../seen';

function result(over: Partial<Result> = {}): Result {
  return {
    code: 'fits_month', variant: null, legacyState: 'fits', split: [], facts: [], notices: [], missing: [], reasons: [], readyBy: null,
    band: 5, layers: [], confidence: { level: 'fair', reasons: [] }, parts: { oneOff: 'fits_month', monthly: null }, ...over,
  };
}
const after = (n: number): Fact => ({ code: 'unspent_before_after', values: { before: 0, after: n } });
const line = (id: string): Fact => ({ code: 'line_crossed', values: { id } });

describe('changeSinceLooked', () => {
  it('C7 re-baseline once', () => {
    for (const prev of ['fits', 'adjust', 'no', 'missing'] as const) {
      const r = changeSinceLooked(prev, result({ code: 'not_yet' }));
      expect(r.changed).toBe(false);
      expect(r.reasons).toEqual([]);
      expect(r.seen).toEqual(seenOf(result({ code: 'not_yet' })));
    }
    expect(changeSinceLooked(null, result()).changed).toBe(false);
    expect(changeSinceLooked({ junk: 1 } as never, result()).changed).toBe(false);
  });

  it('D-20 code change', () => {
    const prev = seenOf(result({ code: 'not_yet', legacyState: 'no' }));
    const r = changeSinceLooked(prev, result({ code: 'fits_unspent' }));
    expect(r.changed).toBe(true);
    expect(r.reasons).toEqual(['code_changed']);
    expect(r.seen.code).toBe('fits_unspent');
  });

  it('D-20 figure changes', () => {
    const date = (d: string): ReadyBy => ({ kind: 'date', date: d });
    const base = seenOf(result({ code: 'not_yet', readyBy: date('2026-12-01'), facts: [after(10_000), line('debt_share')] }));
    const same = changeSinceLooked(base, result({ code: 'not_yet', readyBy: date('2026-12-01'), facts: [after(10_001), line('debt_share')] }));
    expect(same).toMatchObject({ changed: false, reasons: [] });
    expect(changeSinceLooked(base, result({ code: 'not_yet', readyBy: date('2027-01-01'), facts: [after(10_000), line('debt_share')] })).reasons).toEqual(['ready_by_changed']);
    expect(changeSinceLooked(base, result({ code: 'not_yet', readyBy: { kind: 'month', month: '2026-12' }, facts: [after(10_000), line('debt_share')] })).reasons).toEqual(['ready_by_changed']);
    expect(changeSinceLooked(base, result({ code: 'not_yet', readyBy: null, facts: [after(10_000), line('debt_share')] })).reasons).toEqual(['ready_by_changed']);
    expect(changeSinceLooked(base, result({ code: 'not_yet', readyBy: date('2026-12-01'), facts: [after(10_002), line('debt_share')] })).reasons).toEqual(['unspent_changed']);
    expect(changeSinceLooked(base, result({ code: 'not_yet', readyBy: date('2026-12-01'), facts: [line('debt_share')] })).reasons).toEqual(['unspent_changed']);
    expect(changeSinceLooked(base, result({ code: 'not_yet', readyBy: date('2026-12-01'), facts: [after(10_000)] })).reasons).toEqual(['line_changed']);
    expect(changeSinceLooked(base, result({ code: 'not_yet', readyBy: date('2026-12-01'), facts: [after(10_000), line('debt_share'), line('housing_share')] })).reasons).toEqual(['line_changed']);
    expect(changeSinceLooked(base, result({ code: 'not_yet', readyBy: date('2026-12-01'), facts: [after(10_000), line('housing_share')] })).reasons).toEqual(['line_changed']);
  });

  it('seenOf sorts line ids and reads the after value', () => {
    expect(seenOf(result({ facts: [line('b'), line('a'), after(7)] }))).toMatchObject({ v: 3, unspentAfter: 7, lineFacts: ['a', 'b'] });
    expect(seenOf(result({ facts: [{ code: 'unspent_before_after', values: { after: 'x' } }, { code: 'line_crossed', values: {} }] }))).toMatchObject({ unspentAfter: null, lineFacts: [] });
  });

  it('I42 verdict_at_decision untouched', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'seen.ts'), 'utf8');
    expect(src).not.toMatch(/verdict_at_decision/);
    expect(changeSinceLooked.length).toBe(2);
  });
});
