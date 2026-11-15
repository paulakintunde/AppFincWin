/**
 * 06.1 (UX-03, UX-09, D-16, CMP-F14): which of the seven state colours and symbols an answer shows. The engine gives four tones
 * per row (VERDICT_TABLE: fits | caution | short | input); four cannot carry seven states, so the screen layer maps from the code
 * and variant (06.1-UI-SPEC "Tone to state mapping") and falls back to the engine tone for any row not listed. The engine tone
 * table is never changed here.
 */
import { VERDICT_TABLE } from '@/engine/decide/v3';

import type { StateTone } from '@/theme/tokens';

export type { StateTone };
export type StateGlyph = 'sCheck' | 'sOver' | 'lock' | 'sUp' | 'sDown' | 'sHalf' | 'sClock';

export interface VerdictState {
  readonly tone: StateTone;
  readonly glyph: StateGlyph;
}

/** One symbol per state, so colour is never the only signal (UX-09). Badges read it too. */
export const STATE_GLYPH: Readonly<Record<StateTone, StateGlyph>> = Object.freeze({
  fits: 'sCheck',
  extra: 'sUp',
  tight: 'sOver',
  net: 'lock',
  cond: 'sHalf',
  short: 'sDown',
  notYet: 'sClock',
});

type EngineTone = (typeof VERDICT_TABLE)[keyof typeof VERDICT_TABLE]['tone'];

const BY_ENGINE_TONE: Readonly<Record<EngineTone, StateTone>> = Object.freeze({
  fits: 'fits',
  caution: 'tight',
  short: 'short',
  input: 'notYet',
});

/** Keyed `code` or `code.variant`. tight_once / tight_plan are the one-off and plan rows of the tight variant. */
const BY_KEY: Readonly<Record<string, StateTone>> = Object.freeze({
  fits_month: 'fits',
  fits_unspent: 'fits',
  'fits_unspent.extra_savings': 'extra',
  'fits_month.tight': 'tight',
  'fits_month.tight_once': 'tight',
  'fits_unspent.tight': 'tight',
  'fits_unspent.tight_plan': 'tight',
  'fits_month.low_month': 'tight',
  'fits_unspent.low_month': 'tight',
  'fits_month.no_net': 'tight',
  'fits_unspent.no_net': 'tight',
  'fits_month.small_net': 'tight',
  'fits_unspent.small_net': 'tight',
  'fits_unspent.costly_debt': 'tight',
  'fits_month.month_short_small': 'tight',
  'fits_unspent.month_short_small': 'tight',
  'fits_by_borrowing.month_short_small': 'tight',
  'fits_month.month_short_moderate': 'tight',
  'fits_unspent.month_short_moderate': 'tight',
  'fits_by_borrowing.month_short_moderate': 'tight',
  'fits_unspent.month_short_moderate_extra': 'tight',
  'fits_by_borrowing.month_short_moderate_extra': 'tight',
  'not_yet.payday': 'tight',
  fits_uses_overdraft: 'tight',
  'fits_uses_overdraft.not_cleared': 'tight',
  fits_uses_net: 'net',
  'fits_uses_net.protection_off': 'net',
  emergency_use: 'net',
  fits_by_borrowing: 'cond',
  'fits_by_borrowing.borrowing_costs_more': 'cond',
  fits_on_your_answer: 'cond',
  monthly_short: 'short',
  not_yet: 'notYet',
  'not_yet.not_covered': 'notYet',
  needs_input: 'notYet',
});

const TABLE: Readonly<Record<string, { readonly tone: EngineTone }>> = VERDICT_TABLE;

function state(tone: StateTone): VerdictState {
  return { tone, glyph: STATE_GLYPH[tone] };
}

/**
 * The state for an engine answer. Order: any month_already_short variant is Short (D-63); then the UI-SPEC row; then the engine
 * tone of the code's base row; a code the screens do not know yet reads as Not yet, never as a fit.
 */
export function stateForVerdict(code: string, variant: string | null): VerdictState {
  if (variant === 'month_already_short') return state('short');
  const key = variant === null ? code : `${code}.${variant}`;
  const mapped = BY_KEY[key];
  if (mapped !== undefined) return state(mapped);
  const row = TABLE[code]; // every VERDICT_TABLE key is listed above, so only the base row is left to read
  return state(row === undefined ? 'notYet' : BY_ENGINE_TONE[row.tone]);
}
