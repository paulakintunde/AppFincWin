import type { PayV2 } from '@/engine/decide/v3';
import { laterDateDefault, planNeeds, tomorrowOf } from '../planNeeds';

const TODAY = '2026-10-31';
const base = { mode: 'plan', cadence: { unit: 'month', every: 1 }, count: null, termMonths: 36, apr: 5, fees: { setup: 0, perPeriod: 0, end: 0 }, deposit: 0, tradeIn: 0, quotedPayment: null, firstPayment: { kind: 'one_period' }, deferredInterestTerm: null };
const plan = (over: Record<string, unknown>): PayV2 => ({ ...base, ...over }) as unknown as PayV2;

describe('planNeeds', () => {
  it('needs nothing when paid at once', () => {
    expect(planNeeds({ mode: 'once' } as unknown as PayV2, TODAY)).toEqual([]);
  });
  it('needs nothing for a complete plan', () => {
    expect(planNeeds(plan({}), TODAY)).toEqual([]);
  });
  it('asks for the first payment when it is null', () => {
    expect(planNeeds(plan({ firstPayment: null }), TODAY)).toContain('first_payment_not_chosen');
  });
  it('asks for the rate unless there is a rate or a quoted payment', () => {
    expect(planNeeds(plan({ apr: null }), TODAY)).toContain('plan_rate_missing');
    expect(planNeeds(plan({ apr: 0 }), TODAY)).not.toContain('plan_rate_missing');
    expect(planNeeds(plan({ apr: null, quotedPayment: 50000 }), TODAY)).not.toContain('plan_rate_missing');
  });
  it('asks the pause question when unanswered', () => {
    const fp = { kind: 'deferred', firstDate: '2026-12-01', interestDuringPause: null };
    expect(planNeeds(plan({ firstPayment: fp }), TODAY)).toEqual(['pause_interest_not_answered']);
    expect(planNeeds(plan({ firstPayment: { ...fp, interestDuringPause: false } }), TODAY)).toEqual([]);
  });
  it('flags a passed first date', () => {
    const fp = { kind: 'deferred', firstDate: '2026-10-30', interestDuringPause: null };
    expect(planNeeds(plan({ firstPayment: fp }), TODAY)).toEqual(['pause_interest_not_answered', 'first_payment_passed']);
    expect(planNeeds(plan({ firstPayment: { ...fp, firstDate: TODAY, interestDuringPause: true } }), TODAY)).toEqual([]);
  });
});

describe('date helpers', () => {
  it('laterDateDefault is the same day next month, clamped', () => {
    expect(laterDateDefault('2026-10-31')).toBe('2026-11-30');
    expect(laterDateDefault('2026-01-15')).toBe('2026-02-15');
    expect(laterDateDefault('2026-12-10')).toBe('2027-01-10');
    expect(laterDateDefault('2027-01-31')).toBe('2027-02-28');
  });
  it('tomorrowOf rolls month and year', () => {
    expect(tomorrowOf('2026-10-31')).toBe('2026-11-01');
    expect(tomorrowOf('2026-12-31')).toBe('2027-01-01');
  });
});
