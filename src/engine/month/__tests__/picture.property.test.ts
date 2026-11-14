/**
 * 05.5-08 (ARC-05, ENG-22, D-04): the month picture is the one owner of "left after the month's plans". Its leftAfterPlans is always
 * homeFigure(prepared) (the lower month figure), for every generated input, and the usual bar adds up (goes out = comes in - left).
 */
import * as fc from 'fast-check';
import { homeFigure } from '../../decide/v3/afterBuy';
import { prepare } from '../../decide/v3/prepare';
import { fcRuns } from '../../decide/v3/__tests__/helpers/fcRuns';
import { inputsArb } from '../../decide/v3/__tests__/invariants/arbitraries';
import { monthPicture } from '../picture';

const SEED = 0x0555;

describe('month picture identity (D-04)', () => {
  it('leftAfterPlans equals homeFigure(prepared) for every generated input', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const p = prepare(inputs);
        expect(monthPicture(p).leftAfterPlans).toBe(homeFigure(p));
      }),
      { numRuns: fcRuns(200), seed: SEED },
    );
  });

  it('the usual bar always adds up: goes out = comes in - left', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const usual = monthPicture(prepare(inputs)).usual;
        if (usual === null) return;
        expect(Number(usual.goesOut)).toBe(Number(usual.comesIn) - Number(usual.left));
      }),
      { numRuns: fcRuns(200), seed: SEED },
    );
  });
});
