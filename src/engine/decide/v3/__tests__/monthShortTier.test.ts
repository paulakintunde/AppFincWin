/**
 * 05.4 D-65 / D-66: the three headlines when the usual month is already short, and the locked net never in the answer.
 * Unit tests on every branch of monthShortTier, then Riley-like people through evaluate (hand figures in the comments).
 */
import { minorUnits } from '../../../money/types';
import { monthShortTier, type TierInput } from '../depletion';
import { evaluate } from '../evaluate';
import type { Code, Result } from '../types';
import { corpus } from './reviewed/corpus';
import { TIER_CASES, rileyTier } from './helpers/tierFixtures';

const mu = minorUnits;

describe('monthShortTier (every branch)', () => {
  const base: TierInput = {
    code: 'fits_unspent',
    monthly: mu(0),
    typicalLeft: mu(-30_000),
    spare: mu(400_000),
    monthLeft: mu(-30_000),
    aboveSize: mu(0),
    used: mu(6_000),
    fromExtra: mu(0),
  };

  it('Large on any code but a cash fit, and on a cash fit with a monthly cost', () => {
    for (const code of ['not_yet', 'monthly_short', 'fits_uses_net', 'fits_uses_overdraft'] as Code[]) {
      expect(monthShortTier({ ...base, code })).toEqual({ variant: 'month_already_short', fact: null });
    }
    expect(monthShortTier({ ...base, monthly: mu(1) })).toEqual({ variant: 'month_already_short', fact: null });
  });

  it('Small when it uses less than one month of the shortfall', () => {
    expect(monthShortTier(base)).toEqual({ variant: 'month_short_small', fact: { code: 'month_short_fits', values: { price: 6_000, money: 400_000, short: 30_000 } } });
    expect(monthShortTier({ ...base, code: 'fits_month', used: mu(29_999) }).variant).toBe('month_short_small');
  });

  it('Moderate at exactly one month or more; from extra savings when the split takes some', () => {
    // R 400,000 / 30,000 = 13; (400,000 - 30,000) / 30,000 = 12
    expect(monthShortTier({ ...base, used: mu(30_000) })).toEqual({
      variant: 'month_short_moderate',
      fact: { code: 'money_lasts_shorter', values: { months: 13, monthsAfter: 12 } },
    });
    expect(monthShortTier({ ...base, used: mu(100_000), fromExtra: mu(1) }).variant).toBe('month_short_moderate_extra');
  });

  it('R adds extra savings, never counts below 0, is never below what is used, and falls back to the month with no figure', () => {
    // spare 10,000 + extra 50,000 = 60,000: 2 months, 1 after
    expect(monthShortTier({ ...base, spare: mu(10_000), aboveSize: mu(50_000), used: mu(30_000) }).fact?.values).toEqual({ months: 2, monthsAfter: 1 });
    // spare below 0 and extra below 0 count 0; R floored at used (45,000): 1 month, 0 after
    expect(monthShortTier({ ...base, spare: mu(-5_000), aboveSize: mu(-1), used: mu(45_000) }).fact?.values).toEqual({ months: 1, monthsAfter: 0 });
    // no confirmed figure: this month's left, here 70,000
    expect(monthShortTier({ ...base, spare: null, monthLeft: mu(70_000), used: mu(1_000) }).fact?.values).toEqual({ price: 1_000, money: 70_000, short: 30_000 });
    // no confirmed figure and a month below 0: 0, floored at used
    expect(monthShortTier({ ...base, spare: null, used: mu(1_000) }).fact?.values).toEqual({ price: 1_000, money: 1_000, short: 30_000 });
  });

  it('throws when the usual month is not short', () => {
    expect(() => monthShortTier({ ...base, typicalLeft: mu(0) })).toThrow(RangeError);
    expect(() => monthShortTier({ ...base, typicalLeft: mu(5) })).toThrow(RangeError);
  });
});

const fact = (r: Result, code: string) => r.facts.find((f) => f.code === code)?.values;
const codes = (r: Result) => r.facts.map((f) => f.code);
const NET_LINES = ['net_lasts', 'net_lasts_without'];
const run = (o: Parameters<typeof rileyTier>[0]) => {
  const { inputs, check } = rileyTier(o);
  return evaluate(inputs, check);
};

describe('the D-65 tiers through evaluate (Riley-like: usual month 300 short, net 2,000 of 2,000 locked)', () => {
  it('Small: $60 cash reads "Fits, but your month is already short" with month_short_fits first', () => {
    const ev = run(TIER_CASES.small);
    const r = ev.result;
    expect(r.code).toBe('fits_unspent');
    expect(r.variant).toBe('month_short_small');
    // R = the spare money judged against (Evaluation.spare): 5,000 balance - 650 still to spend this month = 4,350; extra savings 0
    expect(ev.spare).toBe(435_000);
    expect(ev.net?.aboveSize).toBe(0);
    expect(r.facts[0]).toEqual({ code: 'month_short_fits', values: { price: 6_000, money: 435_000, short: 30_000 } });
  });

  it('Moderate: $1,000 cash shortens how long the money lasts, from 14 months to 11', () => {
    // R = 435,000; N = floor(435,000 / 30,000) = 14; M = floor(335,000 / 30,000) = 11
    const ev = run(TIER_CASES.moderate);
    const r = ev.result;
    expect(r.code).toBe('fits_unspent');
    expect(r.variant).toBe('month_short_moderate');
    const R = (ev.spare as number) + (ev.net?.aboveSize as number);
    expect(R).toBe(435_000);
    expect(r.facts[0]).toEqual({ code: 'money_lasts_shorter', values: { months: Math.floor(R / 30_000), monthsAfter: Math.floor((R - 100_000) / 30_000) } });
    expect(fact(r, 'money_lasts_shorter')).toEqual({ months: 14, monthsAfter: 11 });
  });

  it('Moderate from extra savings: $2,000 cash with 4,000 above the net, split holds extra savings', () => {
    // spare 350 + extra savings 4,000 = R 4,350 (435,000); N = 14; M = floor(235,000 / 30,000) = 7
    const ev = run(TIER_CASES.moderateExtra);
    const r = ev.result;
    expect(r.code).toBe('fits_unspent');
    expect(r.variant).toBe('month_short_moderate_extra');
    expect(r.split.find((s) => s.source === 'extra_savings')?.amount).toBe(165_000);
    expect((ev.spare as number) + (ev.net?.aboveSize as number)).toBe(435_000);
    expect(r.facts[0]).toEqual({ code: 'money_lasts_shorter', values: { months: 14, monthsAfter: 7 } });
  });

  it('Large: $1,500 cash that only the locked net could pay is Not yet, "No: your month is already short", net_locked, no net_lasts', () => {
    const r = run(TIER_CASES.large).result;
    expect(r.code).toBe('not_yet');
    expect(r.variant).toBe('month_already_short');
    expect(codes(r)).toContain('net_locked');
    for (const c of NET_LINES) expect(codes(r)).not.toContain(c);
    expect(codes(r)).not.toContain('month_short_fits');
    expect(codes(r)).not.toContain('money_lasts_shorter');
  });

  it('Large: Riley’s 48-month plan (a plan payment makes the month more short)', () => {
    const c = corpus().find((x) => x.key === 'persona:riley:900000:plan');
    if (c === undefined) throw new RangeError('riley plan');
    const r = evaluate(c.inputs, c.check).result;
    expect(r.variant).toBe('month_already_short');
    expect(r.readyBy).toBeNull();
  });

  it('every tier: no ready-by date, the shortfall line, balanced_month_room and month_balance_gap', () => {
    for (const k of Object.keys(TIER_CASES) as (keyof typeof TIER_CASES)[]) {
      const r = run(TIER_CASES[k]).result;
      expect(r.readyBy).toBeNull();
      expect(codes(r).some((c) => c === 'usual_month_short' || c === 'depletion_payment')).toBe(true);
      expect(codes(r)).toEqual(expect.arrayContaining(['balanced_month_room', 'month_balance_gap']));
    }
  });

  it('D-66: while the net is locked no tier shows net_lasts or net_lasts_without; unlocking the Small case adds net_lasts', () => {
    for (const k of Object.keys(TIER_CASES) as (keyof typeof TIER_CASES)[]) {
      const r = run(TIER_CASES[k]).result;
      for (const c of NET_LINES) expect(codes(r)).not.toContain(c);
    }
    const open = run({ ...TIER_CASES.small, locked: false }).result;
    expect(open.variant).toBe('month_short_small');
    expect(fact(open, 'net_lasts')).toEqual({ shortfall: 30_000, months: 6 });
  });
});
