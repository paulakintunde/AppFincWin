// PURE. 05.3-113 (UAT gap 32): the preset a kind of purchase counts like, so the cards show the same fields and notes the
// engine judges with. Re-states engine/decide/v3/judge/options.ts resolveItemType (not exported from the barrel): a preset is
// itself; an own kind is its stored base; an id the rows do not hold is General. The rows hold live own kinds only (deleted
// entries are filtered out by liveCustomOptions and useOwnOptions), so a removed own kind is General, as in the engine.
import type { ItemTypeRef, V3PresetItemType } from '@/engine/decide/v3';

export interface ItemBaseRow {
  readonly id: string;
  readonly base: V3PresetItemType;
}

export function itemBaseOf(ref: ItemTypeRef, own: readonly ItemBaseRow[]): V3PresetItemType {
  if (ref.kind === 'preset') return ref.value;
  return own.find((t) => t.id === ref.id)?.base ?? 'general';
}
