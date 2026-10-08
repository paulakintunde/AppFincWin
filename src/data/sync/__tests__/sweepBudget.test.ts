import { createSweepBudget, SWEEP_MAX_CALLS } from '../sweepBudget';

describe('sweepBudget', () => {
  it('take() returns true SWEEP_MAX_CALLS times then false', () => {
    const b = createSweepBudget();
    for (let i = 0; i < SWEEP_MAX_CALLS; i++) expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
    expect(b.remaining).toBe(0);
  });

  it('spend(3) leaves 7 and never goes below 0', () => {
    const b = createSweepBudget();
    b.spend(3);
    expect(b.remaining).toBe(7);
    b.spend(100);
    expect(b.remaining).toBe(0);
  });

  it('honours a custom max', () => {
    expect(createSweepBudget(2).remaining).toBe(2);
  });
});
