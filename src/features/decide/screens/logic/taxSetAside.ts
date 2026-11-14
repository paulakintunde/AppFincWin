// 06.1-29 FIN-20 (owner D-26, 2026-11-12): the pay setup row "Set aside for tax, % of freelance pay". PURE. A whole percent from 0
// to 60 (decide_settings.tax_set_aside_bp holds 0 .. 6000 basis points). Empty by default and never pre-filled: no rate is ever
// suggested (T-06.1-29-01). Shown only when the income profile includes freelance.
import { engineIncomeTypes } from '@/features/decide/snapshot/v3/settingsSource';
import { parseWholeInRange } from '@/ui/wholeNumberField';

/** The most the field takes, in whole percent. */
export const MAX_SET_ASIDE_PERCENT = 60;

export type SetAsideParse = { readonly kind: 'empty' } | { readonly kind: 'ok'; readonly bp: number } | { readonly kind: 'bad' };

/** The typed text as basis points: empty is none, a whole percent from 0 to 60 is its share, anything else is bad. */
export function setAsideFromText(text: string): SetAsideParse {
  const p = parseWholeInRange(text.trim(), 0, MAX_SET_ASIDE_PERCENT);
  if (p.kind === 'empty') return { kind: 'empty' };
  return p.kind === 'ok' ? { kind: 'ok', bp: p.value * 100 } : { kind: 'bad' };
}

/** The stored share as the field's text: empty when none; a share that is not a whole percent shows to two places. */
export function setAsideText(bp: number | null | undefined): string {
  if (bp == null) return '';
  return bp % 100 === 0 ? String(bp / 100) : (bp / 100).toFixed(2);
}

/** The row shows only when the person's income types include freelance (own business maps to freelance, D-17). */
export function showsSetAside(types: readonly string[] | null | undefined): boolean {
  return engineIncomeTypes(types ?? null).includes('freelance');
}

/** What Save pay details writes: the new share when it changed and is valid; undefined when there is nothing to write. */
export function setAsidePatch(text: string, stored: number | null | undefined): number | null | undefined {
  const p = setAsideFromText(text);
  if (p.kind === 'bad') return undefined;
  const next = p.kind === 'empty' ? null : p.bp;
  return next === (stored ?? null) ? undefined : next;
}
