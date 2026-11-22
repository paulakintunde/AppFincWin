import { minorUnits as mu } from '../../money/types';
import { healthScore, HEALTH_SHORT_CAP } from '../score';
import type { HealthInputs } from '../types';

const base: HealthInputs = {
  moneyIn: mu(300000),
  left: mu(90000),
  emergency: mu(600000),
  monthlyEssential: mu(200000),
  debtTotal: mu(0),
  typicalIncome: mu(300000),
  billsDue: mu(0),
  moneyOut: mu(210000),
  hasBalance: true,
  short: false,
};
const over = (o: Partial<HealthInputs>): HealthInputs => ({ ...base, ...o });
function scored(i: HealthInputs) {
  const r = healthScore(i);
  if (r.kind !== 'score') throw new Error('expected score');
  return r;
}

describe('healthScore', () => {
  it('maxes every part at 100', () => {
    const r = scored(base);
    expect(r.parts.map((p) => p.id)).toEqual(['kept', 'cover', 'debt', 'billsToPay']);
    expect(r.parts.map((p) => p.points)).toEqual([35, 30, 20, 15]);
    expect(r.score).toBe(100);
    expect(r.capped).toBe(false);
    expect(r.parts.map((p) => p.figure)).toEqual([30, 30, 0, 0]);
  });
  it('rounds the kept part half-up on its own', () => {
    const r = scored(over({ left: mu(45000) }));
    expect(r.parts[0]).toMatchObject({ points: 18, figure: 15 });
    expect(r.score).toBe(83);
  });
  it('negative left keeps nothing', () => {
    expect(scored(over({ left: mu(-10000) })).parts[0]).toMatchObject({ points: 0, figure: 0 });
  });
  it('null emergency is zero cover, not thin', () => {
    expect(scored(over({ emergency: null })).parts[1]).toMatchObject({ points: 0, figure: 0 });
  });
  it('negative emergency counts as zero', () => {
    expect(scored(over({ emergency: mu(-5) })).parts[1].points).toBe(0);
  });
  it('cover falls back to money out when essential is zero', () => {
    const r = scored(over({ monthlyEssential: mu(0), emergency: mu(105000), moneyOut: mu(210000) }));
    expect(r.parts[1]).toMatchObject({ points: 5, figure: 5 });
  });
  it('caps a short month at 74', () => {
    const r = scored(over({ short: true }));
    expect(r.score).toBe(HEALTH_SHORT_CAP);
    expect(r.capped).toBe(true);
    expect(r.short).toBe(true);
  });
  it('a short month already under the cap is not capped', () => {
    const r = scored(over({ short: true, left: mu(0), emergency: null }));
    expect(r.capped).toBe(false);
    expect(r.score).toBe(35);
  });
  it('thin data is named in order', () => {
    expect(healthScore(over({ moneyIn: mu(0), moneyOut: mu(0), hasBalance: false }))).toEqual({ kind: 'thin', missing: 'income' });
    expect(healthScore(over({ moneyOut: mu(0), hasBalance: false }))).toEqual({ kind: 'thin', missing: 'spending' });
    expect(healthScore(over({ hasBalance: false }))).toEqual({ kind: 'thin', missing: 'balance' });
  });
  it('debt falls back to money in when typical income is zero', () => {
    const r = scored(over({ typicalIncome: mu(0), debtTotal: mu(1080000) }));
    expect(r.parts[2]).toMatchObject({ points: 10, figure: 30 });
  });
  it('debt zero gives full points', () => {
    expect(scored(base).parts[2]).toMatchObject({ points: 20, figure: 0 });
  });
  it('negative debt counts as zero and huge debt floors at zero points', () => {
    expect(scored(over({ debtTotal: mu(-9) })).parts[2].points).toBe(20);
    expect(scored(over({ debtTotal: mu(99999999) })).parts[2].points).toBe(0);
  });
  it('bills still to pay lowers part four', () => {
    const r = scored(over({ billsDue: mu(63000) }));
    expect(r.parts[3]).toMatchObject({ points: 8, figure: 30 });
    expect(scored(over({ billsDue: mu(-4) })).parts[3].points).toBe(15);
    expect(scored(over({ billsDue: mu(999999) })).parts[3].points).toBe(0);
  });
});
