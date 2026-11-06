import { judgeCheck, prepare } from '@/engine/decide/v3';
import { buildBoughtWrite } from '@/data/mutations/boughtWrite';
import { HEAVY_LINES_PER_MONTH, HEAVY_MONTHS, heavyAccount, heavyChecks } from '../heavyAccount';
import { SAMPLE_NAME, SAMPLE_RUNNING, samplePurchase } from '../sampleBought';

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

describe('05.4-34 Record-as-bought sample (BO-03)', () => {
  it.each(['USD', 'GBP', 'EUR'])('writes a day-one row, a payment series, a running cost and a debt in %s', (currency) => {
    const today = '2026-11-05';
    const { purchase, result } = samplePurchase(today, currency);
    expect(purchase).not.toBeNull();
    let n = 0;
    const w = buildBoughtWrite({
      purchase,
      result,
      ctx: {
        householdId: 'h',
        currency,
        timeZone: 'UTC',
        today,
        cashAccountId: 'acc',
        debtCategoryId: 'debt',
        runningCostCategoryId: 'ins',
        name: SAMPLE_NAME,
      },
      mint: () => `id-${++n}`,
    });
    expect(w.rows.filter((r) => r.local_date === today)).toHaveLength(1);
    expect(w.series.map((s) => s.category_id).sort()).toEqual(['debt', 'ins']);
    expect(w.series.find((s) => s.category_id === 'ins')?.amount).toBe(-SAMPLE_RUNNING);
    expect(w.debt).not.toBeNull();
  });
});
