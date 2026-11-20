// UI-SPEC Typography: the 12.5 `meta` role (disclosure lines, dates, helper lines). textRole has no 'meta', so it is the
// label role at fontSize.meta, the same derivation StatusBadge uses.
import type { FontPairingKey } from '@/theme/fonts';
import { fontSize, textRole } from '@/theme/typography';

export function metaRole(pairing: FontPairingKey) {
  return { ...textRole(pairing, 'body'), fontSize: fontSize.meta, lineHeight: fontSize.meta * 1.4 };
}
