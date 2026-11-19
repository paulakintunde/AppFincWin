import { evaluateAccess, type AccessInput } from '../evaluateAccess';
import { featureById, type FeatureDef } from '../featureRegistry';

const caps = featureById('caps') as FeatureDef; // level 2, holds categoryCaps
const calc = featureById('calculators') as FeatureDef; // level 3
const hhSplit = featureById('hh.weightSplit') as FeatureDef; // needsHousehold

function input(over: Partial<AccessInput> & { def: FeatureDef }): AccessInput {
  return { level: 4, switchOn: undefined, planWritable: true, sharesInHousehold: true, holdsData: false, ...over };
}

describe('evaluateAccess (D-35 order: plan, household, level)', () => {
  it('reports plan when the plan is not writable, and the lock hides nothing', () => {
    const a = evaluateAccess(input({ def: calc, planWritable: false }));
    expect(a.reason).toBe('plan');
    expect(a.switchable).toBe(false);
    expect(a.visible).toBe(true);
  });

  it('plan comes before household and level', () => {
    const a = evaluateAccess(input({ def: hhSplit, planWritable: false, sharesInHousehold: false, level: 1 }));
    expect(a.reason).toBe('plan');
    expect(a.visible).toBe(false);
  });

  it('hides a household feature when the person shares with no one, even if the switch is on', () => {
    const a = evaluateAccess(input({ def: hhSplit, sharesInHousehold: false, switchOn: true }));
    expect(a).toMatchObject({ visible: false, on: false, reason: 'household', switchable: false });
  });

  it('household features ignore the level once the person shares', () => {
    const a = evaluateAccess(input({ def: hhSplit, level: 1 }));
    expect(a).toMatchObject({ visible: true, on: true, reason: null });
  });

  it('hides a feature above the level when the switch is untouched', () => {
    const a = evaluateAccess(input({ def: calc, level: 1 }));
    expect(a).toMatchObject({ visible: false, on: false, reason: 'level', switchable: true });
  });

  it('shows a feature above the level when the person switched it on, and still says level', () => {
    const a = evaluateAccess(input({ def: calc, level: 1, switchOn: true }));
    expect(a).toMatchObject({ visible: true, on: true, reason: 'level', switchable: true });
  });

  it('hides a feature at or below the level when the person switched it off', () => {
    const a = evaluateAccess(input({ def: calc, level: 3, switchOn: false }));
    expect(a).toMatchObject({ visible: false, on: false, reason: null });
  });

  it('shows a feature at the level by default', () => {
    expect(evaluateAccess(input({ def: calc, level: 3 }))).toMatchObject({ visible: true, reason: null, switchable: true });
  });

  it('never hides a feature that holds records, and the switch is fixed', () => {
    const a = evaluateAccess(input({ def: caps, level: 1, switchOn: false, holdsData: true }));
    expect(a).toMatchObject({ visible: true, on: true, switchable: false, reason: null, holdsData: true });
  });

  it('household and plan outrank holds-data', () => {
    expect(evaluateAccess(input({ def: hhSplit, sharesInHousehold: false, holdsData: true })).reason).toBe('household');
    expect(evaluateAccess(input({ def: caps, planWritable: false, holdsData: true })).reason).toBe('plan');
  });
});
