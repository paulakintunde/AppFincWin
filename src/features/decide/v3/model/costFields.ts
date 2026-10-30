/**
 * 05.3-17: the item-cost field list for a preset item type, and which L6 major-asset fields are still needed.
 * M-08: sales_tax and deposit (role modelled_elsewhere) are left out; they render as the tax percent field and in the plan card.
 * D-18: L6 "Legal and closing costs" / "Moving costs" are hidden when the preset already asks closing_costs / moving_costs.
 */
import { PRESET_QUESTIONS, questionSpec } from '@/engine/decide/v3';
import type { QuestionId, V3PresetItemType } from '@/engine/decide/v3';

export interface CostField {
  readonly id: QuestionId;
  readonly role: 'cost' | 'credit';
  readonly answer: 'amount' | 'yes_no' | 'date';
  readonly cadence: 'monthly' | 'yearly' | 'one_off' | 'none';
}

export function costFields(itemType: V3PresetItemType): readonly CostField[] {
  const out: CostField[] = [];
  for (const id of PRESET_QUESTIONS[itemType]) {
    const s = questionSpec(id);
    if (s === null || s.role === 'modelled_elsewhere') continue;
    out.push({ id, role: s.role, answer: s.answer, cadence: s.cadence });
  }
  return out;
}

export function majorAssetFields(itemType: V3PresetItemType): { legal: boolean; moving: boolean } {
  const ids = PRESET_QUESTIONS[itemType];
  return { legal: !ids.includes('closing_costs'), moving: !ids.includes('moving_costs') };
}
