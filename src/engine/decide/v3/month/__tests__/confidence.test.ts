import { minorUnits as mu } from '../../../../money/types';
import { capConfidence, confidenceOf, type ConfidenceInput } from '../confidence';

const firmInput: ConfidenceInput = {
  monthsUsed: 6,
  day: 20,
  everydayLogged: mu(100000),
  e: mu(150000),
  unsavedWrites: 0,
  roughUsed: false,
  provisionalRates: false,
};

describe('confidenceOf', () => {
  it('otherwise firm with no reasons', () => {
    expect(confidenceOf(firmInput)).toEqual({ level: 'firm', reasons: [] });
  });

  it('I5 few months: under 3 months is rough', () => {
    expect(confidenceOf({ ...firmInput, monthsUsed: 2 })).toEqual({ level: 'rough', reasons: ['few_months'] });
    expect(confidenceOf({ ...firmInput, monthsUsed: 3 }).level).toBe('firm');
  });

  it('I7 unsaved writes are never firm', () => {
    expect(confidenceOf({ ...firmInput, unsavedWrites: 1 })).toEqual({ level: 'fair', reasons: ['unsaved_changes'] });
  });

  it('I8 never firm early in the month or when under-logged', () => {
    expect(confidenceOf({ ...firmInput, day: 19 })).toEqual({ level: 'fair', reasons: ['early_in_month'] });
    expect(confidenceOf({ ...firmInput, everydayLogged: mu(74999) })).toEqual({ level: 'fair', reasons: ['under_logged'] });
    expect(confidenceOf({ ...firmInput, everydayLogged: mu(75000) }).level).toBe('firm');
  });

  it('no E means nothing to be under-logged against', () => {
    expect(confidenceOf({ ...firmInput, e: null, everydayLogged: mu(0) }).level).toBe('firm');
  });

  it('rough figures are rough; provisional rates are at most fair', () => {
    expect(confidenceOf({ ...firmInput, roughUsed: true })).toEqual({ level: 'rough', reasons: ['rough_figures'] });
    expect(confidenceOf({ ...firmInput, provisionalRates: true })).toEqual({ level: 'fair', reasons: ['provisional_rates'] });
  });

  it('a fair cause never lifts a rough level, and reasons keep a fixed order', () => {
    const c = confidenceOf({ ...firmInput, monthsUsed: 1, day: 3, unsavedWrites: 2, provisionalRates: true });
    expect(c.level).toBe('rough');
    expect(c.reasons).toEqual(['few_months', 'early_in_month', 'unsaved_changes', 'provisional_rates']);
  });
});

describe('capConfidence', () => {
  it('I35 lowers firm to fair and appends the reason', () => {
    expect(capConfidence({ level: 'firm', reasons: [] }, 'unspent_stale')).toEqual({ level: 'fair', reasons: ['unspent_stale'] });
  });

  it('never raises a level and does not duplicate a reason', () => {
    const rough = capConfidence({ level: 'rough', reasons: ['few_months'] }, 'unspent_drifted');
    expect(rough).toEqual({ level: 'rough', reasons: ['few_months', 'unspent_drifted'] });
    const again = capConfidence(rough, 'unspent_drifted');
    expect(again).toEqual(rough);
    expect(capConfidence({ level: 'fair', reasons: [] }, 'no_setup', 'firm').level).toBe('fair');
    expect(capConfidence({ level: 'firm', reasons: [] }, 'no_setup', 'rough').level).toBe('rough');
  });
});
