/**
 * prepare / judgeCheck (05.4-13, ENG-12). Purity, one Prepared for many checks, and an indicative Node timing for one
 * judgeCheck on a heavy account. Node is not the device: the 8 ms budget is checked on the Pixel 6 in 05.4-34.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { evaluate } from '../evaluate';
import { judgeCheck, prepare } from '../prepare';
import type { V3Inputs, V3Line, V3Month, V3Series } from '../types';
import { checkOnce, checkPlan, inputsOf, monthOf, v3Line, v3Series } from './helpers/fixtures';
import { loadPersons, toV3Inputs } from './golden/adapter';

const mu = minorUnits;

function heavyInputs(): V3Inputs {
  const months: V3Month[] = [];
  for (let m = 0; m < 12; m++) {
    const ym = `2026-${String(m < 10 ? m + 1 : m - 9).padStart(2, '0')}`;
    const lines: V3Line[] = [];
    for (let i = 0; i < 120; i++) {
      lines.push(v3Line({ id: `l-${ym}-${i}`, date: `${ym}-${String((i % 27) + 1).padStart(2, '0')}`, amount: 1500 + ((i * 37) % 900), categoryId: `c${i % 12}` }));
    }
    months.push(monthOf(ym, lines));
  }
  const series: V3Series[] = [];
  for (let i = 0; i < 20; i++) {
    series.push(
      v3Series({
        id: `s${i}`,
        role: i < 2 ? 'pay' : i < 6 ? 'debt_payment' : 'bill',
        cadence: { unit: 'month', every: 1 },
        anchorDate: `2026-01-${String((i % 27) + 1).padStart(2, '0')}`,
        amount: i < 2 ? 250_000 : 5000 + i * 300,
      })
    );
  }
  const debts = Array.from({ length: 6 }, (_, i) => ({
    id: `d${i}`,
    kind: 'loan' as const,
    balance: mu(500_000 + i * 10_000),
    minimum: mu(5000),
    apr: percent('12'),
    secured: false,
    isHousing: false,
  }));
  const accounts = Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, balance: mu(300_000), use: { kind: 'everyday' as const } }));
  return inputsOf({ months, series, debts, accounts, balance: mu(1_200_000), asOf: '2026-10-03' });
}

describe('prepare / judgeCheck', () => {
  it('prepare is pure: twice gives deep-equal results', () => {
    const inputs = heavyInputs();
    expect(prepare(inputs)).toEqual(prepare(inputs));
  });

  it('prepares both readings for thin history and one for full history', () => {
    const person = loadPersons().find((p) => p.months.length > 0);
    expect(person).toBeDefined();
    const base = toV3Inputs(person as NonNullable<typeof person>, { custom: { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] } });
    const ym = base.asOf.slice(0, 7);
    const full = { ...base, months: base.months.map((m) => ({ ...m, full: true })) };
    const thin = { ...base, months: base.months.map((m) => (m.month < ym ? { ...m, full: false } : m)) };
    expect(prepare(full).readings).toHaveLength(1);
    if (thin.months.some((m) => m.month < ym)) expect(prepare(thin).readings).toHaveLength(2);
  });

  it('10 prices on one Prepared equal 10 fresh evaluate calls', () => {
    const inputs = heavyInputs();
    const p = prepare(inputs);
    for (let i = 1; i <= 10; i++) {
      const check = i % 2 === 0 ? checkOnce(i * 40_000) : checkPlan(i * 40_000, { count: 12, apr: percent('9') });
      expect(judgeCheck(p, check)).toEqual(evaluate(inputs, check));
    }
  });

  it('judgeCheck on the heavy account is quick (indicative Node timing)', () => {
    const p = prepare(heavyInputs());
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      judgeCheck(p, checkOnce(10_000 + i * 997));
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p50 = times[100] as number;
    const p95 = times[190] as number;
    console.log(`judgeCheck heavy account: p50 ${p50.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms`);
    expect(p95).toBeLessThan(50);
  });
});
