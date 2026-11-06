/**
 * 05.4 ENG-14 (QE-07, UX-29, APP-06 engine side): on the first days of a new month with no records yet, recently synced
 * records give an answer with the reason records_synced instead of asking for more records; the result carries the
 * records date. Built on the approved QE-07 fixture (Lucy, 1 December, synced 29 November).
 */
import { minorUnits } from '../../../money/types';
import { evaluate } from '../evaluate';
import type { V3Inputs } from '../types';
import { toEngineInputs } from './rightAnswers/fixture';
import { loadCases } from './rightAnswers/loader';

const lucy = loadCases().find((c) => c.id === 'QE-07')!;

function run(recordsAsOf: string | null | undefined, price = 50_000) {
  const { inputs, check } = toEngineInputs({ ...lucy.fixture, check: { ...lucy.fixture.check, price } });
  const { recordsAsOf: _drop, ...rest } = inputs;
  const i: V3Inputs = recordsAsOf === undefined ? rest : { ...rest, recordsAsOf };
  return evaluate(i, { ...check, price: minorUnits(price) }).result;
}

describe('records synced (ENG-14)', () => {
  it('QE-07: answered from last month, reason records_synced, ready, records date on the result', () => {
    const r = run('2026-11-29');
    expect(r.code).toBe('fits_month');
    expect(r.reasons).toContain('records_synced');
    expect(r.readiness?.ready).toBe(true);
    expect(r.recordsAsOf).toBe('2026-11-29');
  });

  it('records older than the freshness limit: no records_synced, readiness asks for this month', () => {
    const r = run('2026-11-27');
    expect(r.reasons).not.toContain('records_synced');
    expect(r.readiness?.missing).toEqual(['activity_not_current']);
    expect(r.recordsAsOf).toBe('2026-11-27');
  });

  it('a purchase from band 5 up: fresh records answer, stale records still ask (records_look_behind)', () => {
    const fresh = run('2026-11-29', 150_000);
    expect(fresh.code).not.toBe('needs_input');
    expect(fresh.reasons).toContain('records_synced');
    const stale = run('2026-11-27', 150_000);
    expect(stale.code).toBe('needs_input');
    expect(stale.missing).toContain('records_look_behind');
  });

  it('no records date given: the result carries none, and null passes through as null', () => {
    const none = run(undefined);
    expect('recordsAsOf' in none).toBe(false);
    expect(none.reasons).not.toContain('records_synced');
    expect(run(null).recordsAsOf).toBeNull();
  });
});
