// 05.3-31 (D-17, P-09): "Help me check this" is offered only when no month in the records is fully recorded.
// A month counts as full when V3Month.full is true; buildV3Inputs copies that flag from the same fullMonthFlags rule
// buildSnapshot uses to choose its 'rough' kind, so rough figures are offered exactly where the engine would use them.
import type { V3Inputs } from '@/engine/decide/v3';

export function helpOffered(inputs: V3Inputs): boolean {
  return !inputs.months.some((m) => m.full);
}
