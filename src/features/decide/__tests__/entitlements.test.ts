import * as entitlements from '../entitlements';
import { DECIDE_PARTS, SAFETY_PARTS, canStartDecide } from '../entitlements';

describe('canStartDecide (09 D-04, D-02)', () => {
  it('is false while the plan is read-only', () => {
    expect(canStartDecide({ writable: false })).toBe(false);
  });

  it('is true while the plan is writable', () => {
    expect(canStartDecide({ writable: true })).toBe(true);
  });
});

describe('DECIDE_PARTS', () => {
  it('lists the parts that follow the plan', () => {
    expect([...DECIDE_PARTS]).toEqual(['multipleOpenChecks', 'setbacks', 'decisionJournal', 'payoffComparisons', 'alternatives']);
  });
});

describe('SAFETY_PARTS', () => {
  it('lists the safety items that travel with every answer', () => {
    expect([...SAFETY_PARTS]).toEqual(['safetyNet', 'confidenceSentence', 'answer', 'footer']);
  });

  it('shares no name with the plan parts', () => {
    const parts: readonly string[] = DECIDE_PARTS;
    for (const name of SAFETY_PARTS) expect(parts).not.toContain(name);
  });
});

describe('the old per-feature switches are gone', () => {
  it('exports only the D-04 names', () => {
    expect(Object.keys(entitlements).sort()).toEqual(['DECIDE_PARTS', 'SAFETY_PARTS', 'canStartDecide']);
  });
});
