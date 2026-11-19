import { PLAN_SIZES, changeRule, offeringFor, packageIdFor, plansThatFit } from '../store/catalog';

const base = { plan: 'duo', period: 'month', inTrial: false, billingIssue: false } as const;

describe('catalog', () => {
  it('builds package ids', () => {
    expect(packageIdFor('duo', 'year')).toBe('duo_year');
    expect(packageIdFor('extended', 'month')).toBe('extended_month');
  });

  it('knows the plan sizes', () => {
    expect(PLAN_SIZES).toEqual({ solo: 1, duo: 2, household: 6, extended: 12 });
  });

  it('uses the no_trial offering on iPhone when the trial is used, for solo and duo only', () => {
    expect(offeringFor({ platform: 'ios', trialAvailable: false, plan: 'solo' })).toBe('no_trial');
    expect(offeringFor({ platform: 'ios', trialAvailable: false, plan: 'duo' })).toBe('no_trial');
    expect(offeringFor({ platform: 'ios', trialAvailable: false, plan: 'household' })).toBe('default');
    expect(offeringFor({ platform: 'ios', trialAvailable: true, plan: 'duo' })).toBe('default');
    expect(offeringFor({ platform: 'android', trialAvailable: false, plan: 'duo' })).toBe('default');
  });

  it('plansThatFit drops plans smaller than the member count', () => {
    expect(plansThatFit(1)).toEqual(['solo', 'duo', 'household', 'extended']);
    expect(plansThatFit(2)).toEqual(['duo', 'household', 'extended']);
    expect(plansThatFit(3)).toEqual(['household', 'extended']);
    expect(plansThatFit(7)).toEqual(['extended']);
    expect(plansThatFit(13)).toEqual([]);
  });

  describe('changeRule', () => {
    it('in trial Duo to Household: now at full price', () => {
      expect(changeRule({ from: { ...base, inTrial: true }, to: { plan: 'household', period: 'month' }, platform: 'android' })).toEqual({
        timing: 'now',
        googleMode: 'CHARGE_FULL_PRICE',
      });
    });
    it('in trial Solo to Duo: the trial continues', () => {
      expect(changeRule({ from: { ...base, plan: 'solo', inTrial: true }, to: { plan: 'duo', period: 'month' }, platform: 'android' })).toEqual({
        timing: 'trialContinues',
        googleMode: 'WITHOUT_PRORATION',
      });
    });
    it('paid upgrade in the same period is prorated now', () => {
      expect(changeRule({ from: { ...base, plan: 'solo' }, to: { plan: 'household', period: 'month' }, platform: 'android' })).toEqual({
        timing: 'now',
        googleMode: 'CHARGE_PRORATED_PRICE',
      });
    });
    it('paid upgrade from month to year is now at full price', () => {
      expect(changeRule({ from: base, to: { plan: 'household', period: 'year' }, platform: 'android' })).toEqual({
        timing: 'now',
        googleMode: 'CHARGE_FULL_PRICE',
      });
      expect(changeRule({ from: base, to: { plan: 'duo', period: 'year' }, platform: 'android' })).toEqual({
        timing: 'now',
        googleMode: 'CHARGE_FULL_PRICE',
      });
    });
    it('any downgrade waits for renewal', () => {
      expect(changeRule({ from: { ...base, plan: 'household' }, to: { plan: 'duo', period: 'month' }, platform: 'android' })).toEqual({
        timing: 'renewal',
        googleMode: 'DEFERRED',
      });
      expect(changeRule({ from: { ...base, inTrial: true }, to: { plan: 'solo', period: 'month' }, platform: 'ios' })).toMatchObject({
        timing: 'renewal',
      });
    });
    it('same plan, month to year or back, on Apple waits for renewal', () => {
      expect(changeRule({ from: base, to: { plan: 'duo', period: 'year' }, platform: 'ios' })).toEqual({ timing: 'renewal' });
      expect(changeRule({ from: { ...base, period: 'year' }, to: { plan: 'duo', period: 'month' }, platform: 'ios' })).toEqual({
        timing: 'renewal',
      });
    });
    it('a billing issue blocks the change', () => {
      expect(
        changeRule({ from: { ...base, billingIssue: true }, to: { plan: 'household', period: 'month' }, platform: 'ios' }),
      ).toEqual({ blocked: 'fixPaymentFirst' });
    });
  });
});
