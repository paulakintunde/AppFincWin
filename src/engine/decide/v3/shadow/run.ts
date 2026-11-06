/**
 * 05.4 BO-08 (D-11, D-12): one shadow run on the phone. The inputs are prepared once and each of the 6 samples is judged on
 * them, then rounded for sending (round.ts). `ready` is false when the records are not up to date (D-52); the phone then waits
 * (D-145). Pure: the phone-side runner (features/decide/shadow) and the revision hash test both call this one function.
 */
import { judgeCheck, prepare } from '../prepare';
import type { V3Inputs } from '../types';
import { roundForShadow, type ShadowRound } from './round';
import { shadowSamples, type ShadowSampleId } from './samples';

export interface ShadowAnswer {
  readonly sampleId: ShadowSampleId;
  readonly round: ShadowRound;
}

export interface ShadowRun {
  readonly ready: boolean;
  readonly answers: readonly ShadowAnswer[];
}

export function shadowRun(inputs: V3Inputs): ShadowRun {
  const p = prepare(inputs);
  const answers = shadowSamples(inputs.currency).map((s) => ({
    sampleId: s.id,
    round: roundForShadow(judgeCheck(p, s.check).result, inputs.asOf),
  }));
  return { ready: p.readiness.ready, answers };
}
