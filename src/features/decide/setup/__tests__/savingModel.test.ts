import { bucketReadiness, bucketTotalLine, splitMonths } from '../steps/savingModel';

describe('bucketTotalLine', () => {
  it('is empty when no bucket has an amount', () => {
    expect(bucketTotalLine([], 30000, 1)).toEqual({ kind: 'empty' });
    expect(bucketTotalLine([0, 0], 30000, 1)).toEqual({ kind: 'empty' });
  });

  it('is equal when the buckets match regular saving', () => {
    expect(bucketTotalLine([30000], 30000, 1)).toEqual({ kind: 'equal', total: 30000, regular: 30000 });
  });

  it('is less with the general remainder', () => {
    expect(bucketTotalLine([30000], 40000, 1)).toEqual({ kind: 'less', total: 30000, regular: 40000, general: 10000 });
  });

  it('is more with the overshoot, the raise amount and Raise offered for one series', () => {
    expect(bucketTotalLine([20000, 30000], 30000, 1)).toEqual({
      kind: 'more',
      total: 50000,
      regular: 30000,
      over: 20000,
      raiseTo: 50000,
      canRaise: true,
    });
  });

  it('does not offer Raise with two saving series or none', () => {
    const two = bucketTotalLine([20000, 30000], 30000, 2);
    const none = bucketTotalLine([20000], 0, 0);
    expect(two.kind === 'more' && two.canRaise).toBe(false);
    expect(none.kind === 'more' && none.canRaise).toBe(false);
  });
});

describe('bucketReadiness', () => {
  it('gives whole months to the goal', () => {
    expect(bucketReadiness(0, 20000, 3000000)).toEqual({ kind: 'eta', months: 150, monthly: 20000, target: 3000000 });
    expect(splitMonths(150)).toEqual({ years: 12, months: 6 });
  });

  it('rounds up and counts what is already saved', () => {
    expect(bucketReadiness(1000, 20000, 50000)).toMatchObject({ kind: 'eta', months: 3 });
    expect(bucketReadiness(60000, 20000, 50000)).toMatchObject({ kind: 'eta', months: 0 });
  });

  it('asks for a goal when there is none', () => {
    expect(bucketReadiness(0, 20000, null)).toEqual({ kind: 'addGoal' });
  });

  it('asks for a monthly amount when it is zero', () => {
    expect(bucketReadiness(0, 0, 3000000)).toEqual({ kind: 'addMonthly' });
    expect(bucketReadiness(0, 0, null)).toEqual({ kind: 'addMonthly' });
  });
});
