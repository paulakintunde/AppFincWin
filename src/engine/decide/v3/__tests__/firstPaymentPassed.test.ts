import en from '../../../../i18n/locales/en';
import { percent } from '../../../payoff/types';
import { addDays } from '../dates';
import { MISSING_KEYS } from '../copy/verdictTable';
import { evaluate } from '../evaluate';
import { personById, toV3Inputs } from './golden/adapter';
import { checkPlan } from './helpers/fixtures';

describe('W6 a passed deferral asks for a new date', () => {
  it('Sam with a deferred plan whose first date has passed: needs_input with first_payment_passed', () => {
    const inputs = toV3Inputs(personById('sam'));
    const check = checkPlan(120000, {
      count: 12,
      apr: percent('9.9'),
      firstPayment: { kind: 'deferred', firstDate: addDays(inputs.asOf, -30), interestDuringPause: false },
    });
    const ev = evaluate(inputs, check);
    expect(ev.result.code).toBe('needs_input');
    if (ev.result.code !== 'needs_input') throw new Error('expected needs_input');
    expect(ev.result.missing).toContain('first_payment_passed');
    expect(ev.purchase).toBeNull();
    const key = MISSING_KEYS.first_payment_passed;
    const text = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en);
    expect(typeof text).toBe('string');
    expect((text as string).length).toBeGreaterThan(0);
  });
});
