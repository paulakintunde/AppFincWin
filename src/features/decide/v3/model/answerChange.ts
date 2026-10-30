/**
 * 05.3-20. PURE. "Changed since you opened it / saved" tiles: shown only when the code or variant differs.
 */
import { changeSinceLooked, verdictRowFor } from '@/engine/decide/v3';
import type { Code, Result, Variant } from '@/engine/decide/v3';
import type { StoredSeenV3 } from '@/db/decideChecks';

export interface ChangeTile {
  readonly show: boolean;
  readonly fromKey: string;
  readonly toKey: string;
}

export function changedSinceOpened(fromCode: Code, fromVariant: Variant | null, toCode: Code, toVariant: Variant | null): ChangeTile {
  const from = verdictRowFor(fromCode, fromVariant);
  const to = verdictRowFor(toCode, toVariant);
  return { show: from.chipKey !== to.chipKey, fromKey: from.chipKey, toKey: to.chipKey };
}

export function changedSinceSaved(stored: StoredSeenV3 | null, live: Result): ChangeTile {
  const to = verdictRowFor(live.code, live.variant);
  if (stored === null) return { show: false, fromKey: to.chipKey, toKey: to.chipKey };
  const from = verdictRowFor(stored.code, stored.variant);
  const { changed } = changeSinceLooked(stored, live);
  return { show: changed, fromKey: from.chipKey, toKey: to.chipKey };
}
