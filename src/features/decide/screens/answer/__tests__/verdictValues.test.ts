// 06.1-23 (owner decision 2026-11-11): the verdict-body placeholders 06.1-14 left out are filled from the engine's matching figures.
// Each test shows the card sentence's figure equals the fact line or after-buy figure it stands for, on engine-run fixtures.
import { judgeCheck, prepare, type Evaluation } from '@/engine/decide/v3';
import { toEngineInputs } from '@/engine/decide/v3/__tests__/rightAnswers/fixture';
import { loadCases } from '@/engine/decide/v3/__tests__/rightAnswers/loader';
import type { SayDeps } from '../../logic/sayResult';
import { isFilled, verdictValues } from '../verdictValues';
import { ledgerRun } from './fixtures';

const money = (m: number): string => `$${(m / 100).toFixed(2)}`;
const deps: SayDeps = {
  t: (key) => key,
  exists: () => true,
  money,
  date: (d) => `on ${d}`,
  currency: 'USD',
  today: '2026-11-05',
  names: { category: () => '', series: () => '', account: () => '', debt: () => '', envelope: () => '', figure: () => '' },
};

const fact = (e: Evaluation, code: string): Readonly<Record<string, unknown>> => {
  const hit = e.result.facts.find((f) => f.code === code);
  if (hit === undefined) throw new RangeError(`no ${code} fact`);
  return hit.values as Readonly<Record<string, unknown>>;
};

describe('fitsUnspent: fromMonth and after', () => {
  it('after is the spare money that stays; fromMonth plus the earlier money is what leaves it', () => {
    const e = ledgerRun('N04').evaluation;
    const v = verdictValues(e.result, deps, { monthly: e.purchase?.monthly ?? null });
    const u = fact(e, 'unspent_before_after');
    const earlier = fact(e, 'earlier_money_from');
    expect(v['after']).toBe(money(u['after'] as number));
    const fromMonth = (u['before'] as number) - (u['after'] as number) - (earlier['amount'] as number);
    expect(v['fromMonth']).toBe(money(fromMonth));
    expect(isFilled('{{month}}’s money covers {{fromMonth}} of it. {{after}} of spare money stays.', v)).toBe(true);
  });

  it('leaves both out when the after figure is not stated', () => {
    const e = ledgerRun('N04').evaluation;
    const bare = { ...e.result, facts: e.result.facts.filter((f) => f.code !== 'unspent_before_after') };
    const v = verdictValues(bare, deps);
    expect(v['after']).toBeUndefined();
    expect(v['fromMonth']).toBeUndefined();
  });
});

describe('monthlyShort: monthly', () => {
  it('reads the depletion fact when the engine states one', () => {
    const e = ledgerRun('N26').evaluation;
    expect(verdictValues(e.result, deps)['monthly']).toBe(money(fact(e, 'depletion_payment')['monthly'] as number));
  });

  it('reads the purchase monthly when no fact states it, and leaves it out with none', () => {
    const e = ledgerRun('N09').evaluation;
    expect(e.result.facts.some((f) => f.code === 'depletion_payment')).toBe(false);
    expect(e.purchase?.monthly).toBeGreaterThan(0);
    expect(verdictValues(e.result, deps, { monthly: e.purchase?.monthly ?? null })['monthly']).toBe(money(e.purchase?.monthly as number));
    expect(verdictValues(e.result, deps)['monthly']).toBeUndefined();
  });
});

describe('notYet not covered: readyMonth and months', () => {
  it('readyMonth is the month of the ready date, months counts to it from the purchase month', () => {
    const e = ledgerRun('N05').evaluation;
    expect(e.result.readyBy).toEqual({ kind: 'month', month: '2027-03' });
    const v = verdictValues(e.result, deps);
    expect(v['readyMonth']).toBe('on 2027-03');
    expect(v['months']).toBe('4'); // November 2026 to March 2027
  });

  it('a ready date reads as its month', () => {
    const e = ledgerRun('N05').evaluation;
    const v = verdictValues({ ...e.result, readyBy: { kind: 'date', date: '2027-02-14' } }, deps);
    expect(v['readyMonth']).toBe('on 2027-02');
    expect(v['months']).toBe('3');
  });

  it('is left out with no ready date', () => {
    const e = ledgerRun('N05').evaluation;
    const v = verdictValues({ ...e.result, readyBy: null }, deps);
    expect(v['readyMonth']).toBeUndefined();
  });
});

describe('low month: lowMonth and short', () => {
  const caseById = (id: string): Evaluation => {
    const found = loadCases().find((c) => c.id === id);
    if (found === undefined) throw new RangeError(`no right-answers case ${id}`);
    const { inputs, check } = toEngineInputs(found.fixture);
    return judgeCheck(prepare(inputs), check);
  };

  it('a one-off: short is what the low month is already short by, as low_month_judged states it', () => {
    const e = caseById('QE-04');
    expect(e.result.variant).toBe('low_month');
    const judged = fact(e, 'low_month_judged');
    const v = verdictValues(e.result, deps, { monthly: e.purchase?.monthly ?? null });
    expect(v['short']).toBe(money((e.purchase?.monthly ?? 0) - (judged['left'] as number)));
    expect(v['lowMonth']).toBe(`on ${judged['month'] as string}`);
    expect(isFilled('In a low month like {{lowMonth}}, this could leave the month {{short}} short.', v)).toBe(true);
  });

  it('a stated low_month fact wins: short is its monthly cost less what the month leaves', () => {
    const e = caseById('QE-04');
    const withFact = { ...e.result, facts: [{ code: 'low_month' as const, values: { month: '2026-09', left: 10000, monthly: 25000 } }, ...e.result.facts] };
    const v = verdictValues(withFact, deps);
    expect(v['short']).toBe(money(15000));
    expect(v['lowMonth']).toBe('on 2026-09');
  });

  it('is left out when the low month still covers the cost', () => {
    const e = caseById('QE-04');
    const roomy = { ...e.result, facts: [{ code: 'low_month' as const, values: { month: '2026-09', left: 30000, monthly: 25000 } }] };
    expect(verdictValues(roomy, deps)['short']).toBeUndefined();
  });
});
