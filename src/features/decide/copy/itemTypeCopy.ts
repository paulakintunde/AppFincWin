/**
 * 05-86 (D-81, R15.4): how the item type reads wherever it is shown. A custom type shows the user's own name (user text,
 * kept verbatim) and, when "Treat like" is set, the rules type as "treated like {type}". A built-in type shows its label.
 * Pure: keys and strings only, no t(), no React. The name never reaches the engine; only the rules type does.
 */
import type { CheckInputs } from '../snapshot/types';
import { ITEM_TYPE_LABEL } from './codeMaps';
import { ref, type CopyRef } from './types';

export interface ItemTypeDisplay {
  /** The user's own name (a string) or the built-in type's label (a CopyRef). */
  name: string | CopyRef;
  /** "treated like {type}"; null for a built-in type or a custom type with no Treat like. */
  treatedLike: CopyRef | null;
}

export function itemTypeDisplay(inputs: Pick<CheckInputs, 'itemType' | 'customItemType'>): ItemTypeDisplay {
  const custom = inputs.customItemType;
  if (custom === null) return { name: ref(ITEM_TYPE_LABEL[inputs.itemType]), treatedLike: null };
  return {
    name: custom.name,
    treatedLike: custom.treatLike === null ? null : ref('decide.customType.treatedLike', undefined, { type: ITEM_TYPE_LABEL[custom.treatLike] }),
  };
}
