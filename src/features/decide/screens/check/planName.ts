/**
 * 06.1-57 (A-ST-7): the name the user gave a plan ("Car loan"). It has no engine field, so it lives in the check's free answers
 * under the always-visible layer. The key carries the 'L0.' prefix because the stored-check reader drops any answer key without a
 * layer prefix (inputsV2 layerAnswersOf). It is never read by the engine's maths. 06.1-68 writes it from the answer the same way.
 */
import type { CheckV2 } from '@/engine/decide/v3';

export const KEY_PLAN_NAME = 'L0.plan_name';
export const PLAN_NAME_MAX = 40;

export function planNameOf(check: CheckV2): string | null {
  const raw = check.layerAnswers[KEY_PLAN_NAME];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

/** The check with the plan's name set (a non-empty name) or taken out (null or blank). */
export function withPlanName(check: CheckV2, name: string | null): CheckV2 {
  const clean = name === null ? '' : name.trim().slice(0, PLAN_NAME_MAX);
  if (clean === '') {
    if (!(KEY_PLAN_NAME in check.layerAnswers)) return check;
    const { [KEY_PLAN_NAME]: _dropped, ...rest } = check.layerAnswers;
    return { ...check, layerAnswers: rest };
  }
  return { ...check, layerAnswers: { ...check.layerAnswers, [KEY_PLAN_NAME]: clean } };
}
