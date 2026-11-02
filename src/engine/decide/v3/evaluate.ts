/**
 * The single v3 entry point (05.1). Home, the check and saved plans all call this through computeV3 (05.1-30); there is no second path.
 * Since 05.4-13 it is prepare once, judge the check: see prepare.ts. Callers that judge many checks on one account
 * (a key press) hold the Prepared and call judgeCheck.
 */
import { judgeCheck, prepare, type Evaluation } from './prepare';
import type { CheckV2, V3Inputs } from './types';

export { stricterOf } from './prepare';
export type { Evaluation } from './prepare';

export function evaluate(raw: V3Inputs, check: CheckV2): Evaluation {
  return judgeCheck(prepare(raw), check);
}
