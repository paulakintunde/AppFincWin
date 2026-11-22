import { judgeCheck, prepare } from '@/engine/decide/v3';
import { goAheadInputOfV3 } from '@/data/mutations/decideGoAhead';
import { HEAVY_LINES_PER_MONTH, HEAVY_MONTHS, heavyAccount, heavyChecks } from '../heavyAccount';
import { SAMPLE_NAME, SAMPLE_RUNNING, sampleEvaluation } from '../sampleBought';

describe('05.4-34 heavy account (APP-04 device timing input)', () => {
  it('has the prepare.test.ts shape', () => {
    const a = heavyAccount();
    expect(a.months).toHaveLength(HEAVY_MONTHS);
    for (const m of a.months) expect(m.lines).toHaveLength(HEAVY_LINES_PER_MONTH);
    expect(a.series.filter((s) => s.role === 'pay')).toHaveLength(2);
    expect(a.series.filter((s) => s.role === 'debt_payment')).toHaveLength(4);
    expect(a.series.filter((s) => s.role === 'bill')).toHaveLength(14);
    expect(a.debts).toHaveLength(6);
    expect(a.accounts).toHaveLength(4);
  });

  it('prepares once and judges every sample check', () => {
    const p = prepare(heavyAccount());
    for (const c of heavyChecks()) expect(judgeCheck(p, c).result.code).toEqual(expect.any(String));
  });
});

describe('05.4-34 Record-as-bought sample (BO-03, one writer since 08.1-09)', () => {
  it.each(['USD', 'GBP', 'EUR'])('writes a day-one row, a payment series and a running cost in %s', (currency) => {
    const today = '2026-11-05';
    const { check, evaluation } = sampleEvaluation(today, currency);
    expect(evaluation.purchase).not.toBeNull();
    let n = 0;
    const w = goAheadInputOfV3(
      check,
      evaluation,
      'acc',
      { householdId: 'h', currency, timeZone: 'UTC', today, name: SAMPLE_NAME, debtCategoryId: 'debt', mint: () => `id-${++n}` },
      { runningCosts: (check.runningCosts ?? []).map((line) => ({ line, name: 'Insurance' })) }
    );
    expect(w.rows.filter((r) => r.local_date === today)).toHaveLength(1);
    expect(w.series.filter((s) => s.category_id === 'debt')).toHaveLength(1);
    expect(w.series.find((s) => s.name.endsWith('Insurance'))?.amount).toBe(-SAMPLE_RUNNING);
    expect(w.debt).toBeNull(); // Grow records debts; Record as bought never makes one
  });
});
