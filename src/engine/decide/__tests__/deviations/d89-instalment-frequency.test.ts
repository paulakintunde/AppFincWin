/**
 * D-89 (05-CONTEXT, UI-SPEC R16.5, R16.11 E3, R16.16 M6): an instalment plan may fall weekly, fortnightly, monthly or
 * quarterly. With a rate the payment is worked out at APR / periodsPerYear; the plan's monthly figure is the level
 * payment's monthly equivalent, rounded half-up once; paymentSteps are indexed by payment period (Plan.freq), and
 * month-indexed consumers read monthlyStepsOf(plan). Monthly plans are exactly as they were.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { minorUnits } from '../../../money/types';
import { amortise, amortiseDue, percent } from '../../../payoff';
import { MAX_INSTALMENTS } from '../../constants';
import { monthlyStepsOf, resolvePlan } from '../../plan';
import { monthlyEquivalent } from '../../series';
import type { BuyCheck, BuyPayment, InstalmentFreq, Plan } from '../../types';
import { USD } from '../helpers/fixtures';

const m = minorUnits;
type Instalment = Extract<BuyPayment, { method: 'instalment' }>;

function check(price: number, payment: Omit<Instalment, 'method'>, dayFees = 0): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(price),
    dayFees: m(dayFees),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: { method: 'instalment', ...payment },
  };
}

function plan(c: BuyCheck): Plan {
  const r = resolvePlan(c);
  if (r.status !== 'resolved') throw new Error(`expected a resolved plan, got ${r.reasons.join(',')}`);
  return r.plan;
}

const sum = (steps: readonly { fromMonth: number; toMonth: number; amount: number }[]): bigint =>
  steps.reduce((t, s) => t + BigInt(s.amount) * BigInt(s.toMonth - s.fromMonth + 1), 0n);

describe('D-89 instalment frequency', () => {
  it('D-89 a weekly plan counts its monthly equivalent in the month', () => {
    const p = plan(
      check(260_000, { instalmentAmount: m(10_000), instalmentCount: 26, freq: 'weekly', firstPayment: 'next_period' })
    );
    expect(p.monthly).toBe(43_333); // 10,000 x 52 / 12 = 43,333.33, half-up once
    expect(p.months).toBe(6); // ceil(26 x 12 / 52)
    expect(p.freq).toBe('weekly');
    expect(p.paymentSteps).toEqual([{ fromMonth: 1, toMonth: 26, amount: 10_000 }]);
    expect(p.dayOne).toBe(0);
    expect(p.total).toBe(260_000);
  });

  it('D-89 a weekly plan paying today puts the first payment on the day', () => {
    const p = plan(check(50_000, { instalmentAmount: m(10_000), instalmentCount: 5, freq: 'weekly' }));
    expect(p.dayOne).toBe(10_000);
    expect(p.paymentSteps).toEqual([{ fromMonth: 1, toMonth: 4, amount: 10_000 }]);
  });

  it('D-89 every 2 weeks and quarterly use their per-period rate', () => {
    const apr = percent('12');
    const cases: [InstalmentFreq, 26 | 4, number][] = [
      ['fortnightly', 26, 52],
      ['quarterly', 4, 8],
    ];
    for (const [freq, ppy, count] of cases) {
      const ordinary = plan(check(100_000, { instalmentAmount: null, instalmentCount: count, apr, freq, firstPayment: 'next_period' }));
      const expected = amortise(m(100_000), apr, count, ppy);
      expect(ordinary.computedPayment).toBe(expected.payment);
      expect(ordinary.monthly).toBe(monthlyEquivalent(expected.payment, freq));
      expect(ordinary.freq).toBe(freq);
      expect(ordinary.months).toBe(Math.ceil((expected.months * 12) / ppy));
      const due = plan(check(100_000, { instalmentAmount: null, instalmentCount: count, apr, freq }));
      expect(due.computedPayment).toBe(amortiseDue(m(100_000), apr, count, ppy).payment);
    }
  });

  it('D-89 the rate with no payment typed is worked out per period, so a weekly payment differs from a monthly one', () => {
    const apr = percent('20');
    const weekly = plan(check(100_000, { instalmentAmount: null, instalmentCount: 52, apr, freq: 'weekly', firstPayment: 'next_period' }));
    const monthly = plan(check(100_000, { instalmentAmount: null, instalmentCount: 12, apr, firstPayment: 'next_period' }));
    expect(weekly.computedPayment).toBe(amortise(m(100_000), apr, 52, 52).payment);
    expect(weekly.monthly).toBeGreaterThan(0);
    expect(Math.abs(weekly.monthly - monthly.monthly)).toBeLessThan(monthly.monthly / 20);
  });

  it('D-89 the flat implied rate uses the frequency (4 quarterly payments over a year)', () => {
    const p = plan(
      check(100_000, { instalmentAmount: m(26_000), instalmentCount: 4, freq: 'quarterly', firstPayment: 'next_period' })
    );
    expect(p.impliedAnnualRate).toBe(percent('4'));
  });

  it('D-89 a stored count up to 600 is scored, 601 throws', () => {
    expect(MAX_INSTALMENTS).toBe(500);
    for (const count of [500, 501, 600]) {
      const p = plan(check(count * 100, { instalmentAmount: m(100), instalmentCount: count, freq: 'weekly', firstPayment: 'next_period' }));
      expect(p.months).toBe(Math.ceil((count * 12) / 52));
    }
    expect(() => resolvePlan(check(100, { instalmentAmount: m(100), instalmentCount: 601, freq: 'weekly' }))).toThrow(RangeError);
  });

  it('D-89 next_month is read as next_period', () => {
    const base = { instalmentAmount: m(10_000), instalmentCount: 12, freq: 'fortnightly' as const };
    const a = plan(check(120_000, { ...base, firstPayment: 'next_month' }));
    const b = plan(check(120_000, { ...base, firstPayment: 'next_period' }));
    expect(a).toEqual(b);
    expect(a.dayOne).toBe(0);
  });

  it('D-89 monthlyStepsOf sums to the instalments after day one', () => {
    const cases: [number, Omit<Instalment, 'method'>][] = [
      [260_000, { instalmentAmount: m(10_000), instalmentCount: 26, freq: 'weekly', firstPayment: 'next_period' }],
      [50_000, { instalmentAmount: m(10_000), instalmentCount: 5, freq: 'weekly' }], // the equivalent exceeds what is left
      [120_000, { instalmentAmount: m(10_000), instalmentCount: 12, freq: 'fortnightly' }],
      [100_000, { instalmentAmount: m(25_000), instalmentCount: 4, freq: 'quarterly', firstPayment: 'next_period' }],
      [10_000, { instalmentAmount: m(10_000), instalmentCount: 1, freq: 'weekly' }], // all on the day: no steps
    ];
    for (const [price, payment] of cases) {
      const p = plan(check(price, payment));
      const steps = monthlyStepsOf(p);
      expect(sum(steps)).toBe(sum(p.paymentSteps));
      expect(sum(steps)).toBe(BigInt(p.total!) - BigInt(p.dayOne));
      for (const s of steps) expect(s.toMonth).toBeLessThanOrEqual(p.months);
    }
    const w = plan(check(260_000, { instalmentAmount: m(10_000), instalmentCount: 26, freq: 'weekly', firstPayment: 'next_period' }));
    expect(monthlyStepsOf(w)).toEqual([
      { fromMonth: 1, toMonth: 5, amount: 43_333 },
      { fromMonth: 6, toMonth: 6, amount: 260_000 - 5 * 43_333 },
    ]);
  });

  it('D-89 monthly plans are unchanged', () => {
    const base = { instalmentAmount: m(10_000), instalmentCount: 12 };
    const absent = plan(check(120_000, base));
    const explicit = plan(check(120_000, { ...base, freq: 'monthly' }));
    expect(explicit).toEqual({ ...absent, freq: 'monthly' });
    expect(absent.freq).toBeUndefined();
    expect(absent.monthly).toBe(10_000);
    expect(absent.months).toBe(12);
    expect(monthlyStepsOf(absent)).toBe(absent.paymentSteps);
    expect(monthlyStepsOf(explicit)).toBe(explicit.paymentSteps);
  });

  it('D-89 month-indexed consumers read monthlyStepsOf', () => {
    // paymentSteps are period-indexed for a weekly/fortnightly/quarterly plan. Only plan.ts (the producer and
    // monthlyStepsOf), cashPath.ts (period-aware in 05-92) may read `.paymentSteps`; the series writer lives outside the
    // engine (decideGoAhead, 05-103). Comments are stripped first.
    const allowed = new Set(['plan.ts', 'cashPath.ts']);
    const dir = join(__dirname, '..', '..');
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const code = readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (/\.paymentSteps\b/.test(code) && !allowed.has(file)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
