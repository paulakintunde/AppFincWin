import { aboutTens, debtLineModel, estimatedMinimumOf } from '../debtLineModel';

describe('debtLineModel', () => {
  it('LEDGER: 312 a month on 3200 pay is 10% against a rule of 36', () => {
    expect(debtLineModel(31200, 320000, '36')).toEqual({ sharePercent: 10, line: 36, over: false });
  });
  it('is over when the whole percent is above the rule', () => {
    expect(debtLineModel(124800, 320000, '36')).toEqual({ sharePercent: 39, line: 36, over: true });
  });
  it('rounds the share half up and does not call equal over', () => {
    expect(debtLineModel(1150, 10000, '36')?.sharePercent).toBe(12); // 11.5 -> 12
    expect(debtLineModel(1149, 10000, '36')?.sharePercent).toBe(11);
    expect(debtLineModel(36000, 100000, '36')?.over).toBe(false);
  });
  it('is null without usual pay or with a rule that is not a number', () => {
    expect(debtLineModel(100, 0, '36')).toBeNull();
    expect(debtLineModel(100, 1000, 'x')).toBeNull();
  });
});

describe('aboutTens', () => {
  it('rounds to the nearest ten of the major unit, half up (LEDGER)', () => {
    expect(aboutTens(75636)).toBe(76000);
    expect(aboutTens(64491)).toBe(64000);
    expect(aboutTens(58204)).toBe(58000);
    expect(aboutTens(11145)).toBe(11000);
    expect(aboutTens(500)).toBe(1000);
    expect(aboutTens(499)).toBe(0);
  });
  it('works for a currency with no decimals', () => {
    expect(aboutTens(765, 0)).toBe(770);
    expect(aboutTens(764, 0)).toBe(760);
  });
});

describe('estimatedMinimumOf (D-28)', () => {
  it('LEDGER: 4200 at 21.9% is 118.65', () => {
    expect(estimatedMinimumOf(420000, '21.9')).toBe(11865);
  });
  it('is null without a balance or with a rate that is not valid', () => {
    expect(estimatedMinimumOf(null, '21.9')).toBeNull();
    expect(estimatedMinimumOf(0, '21.9')).toBeNull();
    expect(estimatedMinimumOf(420000, '21.999')).toBeNull();
  });
});
