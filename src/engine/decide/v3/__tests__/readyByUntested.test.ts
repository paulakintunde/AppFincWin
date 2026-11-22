/**
 * 08.1-14 (owner answer 5, 2026-11-21): the D-05 90-day sentence shows only where plan 06's ready-date search read the date. The
 * result carries `readyByUntested` on a Not yet date the search never read: a sale or replace, pay worked out from history, and capped
 * or seasonal pay. A date the search read carries nothing.
 */
import { evaluate } from '../evaluate';
import { loadAllVariableCases } from './golden/variableIncomeLoader';
import { corpus } from './reviewed/corpus';
import { toEngineInputs } from './rightAnswers/fixture';
import { loadCases } from './rightAnswers/loader';

const soCase = (id: string) => {
  const c = loadCases().find((x) => x.topic === 'selling-the-old-one' && x.id === id);
  if (c === undefined) throw new RangeError(id);
  return toEngineInputs(c.fixture);
};
const corpusCase = (key: string) => {
  const c = corpus().find((x) => x.key === key);
  if (c === undefined) throw new RangeError(key);
  return c;
};
const variableCase = (id: string) => {
  const c = loadAllVariableCases().find((x) => x.id === id);
  if (c === undefined) throw new RangeError(id);
  return c;
};

describe('readyByUntested (08.1-14, owner answer 5)', () => {
  it('a sale that replaces the old one (SO-02): Not yet with a date the search did not read', () => {
    const { inputs, check } = soCase('SO-02');
    const r = evaluate(inputs, check).result;
    expect(r).toMatchObject({ code: 'not_yet', variant: 'not_covered', readyBy: { kind: 'month', month: '2026-12' } });
    expect(r.readyByUntested).toBe(true);
  });

  it('pay worked out from history (Maya, $2,000): Not yet with a date the search did not read', () => {
    const c = corpusCase('persona:maya:200000:cash');
    const r = evaluate(c.inputs, c.check).result;
    expect(r.code).toBe('not_yet');
    expect(r.readyBy).not.toBeNull();
    expect(r.notices.map((n) => n.code)).toContain('pay_expected_from_history');
    expect(r.readyByUntested).toBe(true);
  });

  it('seasonal pay judged against the same season (capped by the expected income): Not yet with a date the search did not read', () => {
    const c = variableCase('ines-ready-by');
    const r = evaluate(c.inputs, c.check).result;
    expect(r).toMatchObject({ code: 'not_yet', variant: 'not_covered' });
    expect(r.readyBy).not.toBeNull();
    expect(r.notices.map((n) => n.code)).toContain('same_season_compared');
    expect(r.notices.map((n) => n.code)).not.toContain('pay_expected_from_history');
    expect(r.readyByUntested).toBe(true);
  });

  it('steady pay with nothing replaced: the search read the date, so nothing is carried', () => {
    const c = variableCase('dee-dedicated-emergency');
    const r = evaluate(c.inputs, c.check).result;
    expect(r).toMatchObject({ code: 'not_yet', variant: 'not_covered' });
    expect(r.readyBy).not.toBeNull();
    expect(r.readyByUntested).toBeUndefined();
  });

  it('a fits answer never carries it', () => {
    const { inputs, check } = soCase('SO-01');
    expect(evaluate(inputs, check).result.readyByUntested).toBeUndefined();
  });
});
