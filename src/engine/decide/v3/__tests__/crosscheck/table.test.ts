/** QA-03: every approved right-answer case with no pending rule also runs through the plain calculator. */
import { loadCases } from '../rightAnswers/loader';
import { PENDING_RULES, pendingFixIds } from './pendingRules';
import { plainAnswer, recordsFresh, recordsLookBehind } from './plain';

const PENDING_IDS = new Set(PENDING_RULES.flatMap((r) => r.fixId.split('/')).filter((id) => id !== 'FIN-09'));

describe('plain calculator vs the approved table', () => {
  const cases = loadCases().filter((c) => c.status === 'approved');
  const live = cases.filter((c) => {
    const pending = pendingFixIds(c.fixture).filter((id) => id !== 'FIN-09');
    return pending.length === 0 && !c.fixIds.some((id) => PENDING_IDS.has(id));
  });
  it(`checks ${live.length} approved cases`, () => {
    for (const c of live) expect({ id: c.id, code: plainAnswer(c.fixture).code }).toEqual({ id: c.id, code: c.expected.code });
  });
});

describe('plain calculator: records synced (QE-07, ENG-14)', () => {
  const lucy = loadCases().find((c) => c.id === 'QE-07')!;
  const f = lucy.fixture;
  it('QE-07 answers as a usual month from fresh records', () => {
    expect(recordsFresh(f)).toBe(true);
    expect(plainAnswer(f)).toEqual({ code: lucy.expected.code, variant: null, afterBuy: 50_000 });
  });
  it('older records, or a record already in the new month: the usual rules, and big purchases ask for records first', () => {
    const big = { ...f, check: { ...f.check, price: 150_000 } };
    expect(plainAnswer(big).code).not.toBe('needs_input');
    expect(plainAnswer({ ...big, recordsAsOf: '2026-11-27' }).code).toBe('needs_input');
    expect(plainAnswer({ ...big, recordsAsOf: null }).code).toBe('needs_input');
    expect(recordsFresh({ ...f, recordsAsOf: '2026-12-02' })).toBe(false);
    expect(recordsFresh({ ...f, asOf: '2026-12-08', recordsAsOf: '2026-12-07' })).toBe(false);
    expect(recordsFresh({ ...f, thisMonth: { ...f.thisMonth, everydaySoFar: 100 } })).toBe(false);
    expect(recordsLookBehind({ ...f, historyMonths: 0 })).toBe(false);
  });
});
