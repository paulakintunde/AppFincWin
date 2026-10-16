import { ZERO_PERCENT, percent } from '../../payoff/types';
import { resolveProjectionRates } from '../projectionRates';

describe('resolveProjectionRates', () => {
  it('is 0% alone when the user entered no rate', () => {
    expect(resolveProjectionRates([], 'prepareContext')).toEqual([
      { rate: ZERO_PERCENT, userEntered: false, label: 'held_not_grown' },
    ]);
  });

  it('puts 0% first and then the entered rate', () => {
    expect(resolveProjectionRates([percent('5')], 'prepareContext')).toEqual([
      { rate: ZERO_PERCENT, userEntered: false, label: 'held_not_grown' },
      { rate: percent('5'), userEntered: true, label: 'projection_at_entered_rate' },
    ]);
  });

  it('drops duplicates and keeps entry order', () => {
    const rates = resolveProjectionRates([percent('5'), percent('5'), percent('7')], 'prepareContext');
    expect(rates.map((r) => r.rate)).toEqual([ZERO_PERCENT, percent('5'), percent('7')]);
  });

  it('lists a user-entered 0% once, marked as entered', () => {
    expect(resolveProjectionRates([ZERO_PERCENT, percent('5')], 'prepareContext')).toEqual([
      { rate: ZERO_PERCENT, userEntered: true, label: 'held_not_grown' },
      { rate: percent('5'), userEntered: true, label: 'projection_at_entered_rate' },
    ]);
  });

  it('rejects more than the maximum number of rates', () => {
    const four = [percent('1'), percent('2'), percent('3'), percent('4')];
    expect(() => resolveProjectionRates(four, 'prepareContext')).toThrow(/^prepareContext: /);
  });

  it('accepts the maximum number of rates', () => {
    const three = [percent('1'), percent('2'), percent('3')];
    expect(resolveProjectionRates(three, 'prepareContext')).toHaveLength(4);
  });

  it('rejects a negative rate', () => {
    expect(() => resolveProjectionRates([-1n as never], 'prepareContext')).toThrow(/^prepareContext: /);
  });
});
