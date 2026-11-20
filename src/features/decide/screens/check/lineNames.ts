/**
 * 08.1-09: the names of the lines a user added to a check (a RunningCostLine and a StoppedCost carry no name), by line id. Pure, so the
 * Bought screen can read them without pulling in the stepper's data hooks. useStepCheck re-exports both.
 */
import type { CheckV2 } from '@/engine/decide/v3';

/** Names of the lines the user added, by line id (layerAnswers key). */
export const KEY_NAMES = 'L0.line_names';

export function lineNamesOf(check: CheckV2): Record<string, string> {
  const raw = check.layerAnswers[KEY_NAMES];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
  return out;
}
