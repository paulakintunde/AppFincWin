// 06.1-18 (D-25): the version of the 'How Decide answers' card. A short stable hash (djb2, hex) of the card's strings, so a changed
// text gives a new version and the card shows again on a phone that saw the old one. Pure.
import { INTRO_KEYS } from '@/engine/decide/v3/copy/verdictTable';

export function introKeysOf(): string[] {
  return [INTRO_KEYS.title, ...INTRO_KEYS.lines, INTRO_KEYS.gotIt];
}

/** djb2 over the UTF-16 units, as an unsigned 32-bit hex string. */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export function introVersion(t: (key: string) => string): string {
  return hashText(introKeysOf().map((key) => t(key)).join('\n'));
}
