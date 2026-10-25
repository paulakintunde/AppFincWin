/**
 * Copy layer contracts (05-09). The engine emits codes only (04 D-21); these modules turn codes into a catalogue key
 * plus formatted params and the screen calls `t()` (src/state/undoToast.ts convention). No `t()` here, no React.
 */
export interface CopyRef {
  key: string;
  params?: Record<string, string | number>;
  /** param name → catalogue key whose translated text is interpolated (a word like "average" is translated, not hardcoded). */
  keyParams?: Record<string, string>;
}

/** Builds a CopyRef, leaving out empty param bags. */
export function ref(key: string, params?: Record<string, string | number>, keyParams?: Record<string, string>): CopyRef {
  const out: CopyRef = { key };
  if (params) out.params = params;
  if (keyParams) out.keyParams = keyParams;
  return out;
}

/** A whole-unit money formatter bound to the snapshot currency; screens pass `(n) => whole.formatMoney({ amount: n, currency })`. */
export type Fmt = (minor: number) => string;

/** A card shown in the warnings group: title, value and body lines, hard (red) or soft (amber). */
export interface WarnCard {
  title: CopyRef;
  value: CopyRef | null; // null when the card has no value chip (the card remainder)
  body: CopyRef[];
  tone: 'hard' | 'soft';
}
