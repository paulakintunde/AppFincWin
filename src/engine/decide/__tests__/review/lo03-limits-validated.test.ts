/**
 * 04-REVIEW LO-03 regression: snapshot limits were not validated. A negative reserve passed silently when there was no
 * cash path and threw only deep inside cashPath.ts when there was one. Every non-null limit is now checked by
 * prepareContext, with the same contract-violation RangeError as the other snapshot fields.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { percentFromScaled, type Percent } from '../../../payoff';
import { prepareContext } from '../../assess';
import type { DecideLimits } from '../../types';
import { snapshotOf } from '../helpers/fixtures';

const BASE: DecideLimits = {
  reserve: null,
  dsrLine: null,
  housingLine: null,
  unsecuredIncomeMultiple: null,
  investingFloor: null,
  savingFloor: null,
  spareFloor: null,
};

describe('04-REVIEW LO-03: snapshot limits are validated', () => {
  it.each(['reserve', 'investingFloor', 'savingFloor', 'spareFloor'] as const)('rejects a negative %s', (key) => {
    const limits = { ...BASE, [key]: -1 as MinorUnits };
    expect(() => prepareContext(snapshotOf({ limits }))).toThrow(new RegExp(`^prepareContext: limits\.${key} -1`));
    const fractional = { ...BASE, [key]: 1.5 as MinorUnits };
    expect(() => prepareContext(snapshotOf({ limits: fractional }))).toThrow(/^prepareContext: /);
  });

  it('rejects a negative dsr line', () => {
    const limits = { ...BASE, dsrLine: -1n as Percent };
    expect(() => prepareContext(snapshotOf({ limits }))).toThrow(/^prepareContext: limits\.dsrLine/);
  });

  it('accepts 0 for every limit', () => {
    const zero = minorUnits(0);
    const limits: DecideLimits = {
      ...BASE,
      reserve: zero,
      investingFloor: zero,
      savingFloor: zero,
      spareFloor: zero,
      dsrLine: percentFromScaled(0n),
      housingLine: null,
    };
    expect(prepareContext(snapshotOf({ limits })).ok).toBe(true);
  });
});
