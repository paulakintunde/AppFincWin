// 05.2-14 (D-03, D-04, D-54, D-55): the pure mapping between the engine's AccountUse and the four account columns,
// plus the D-04 rule for what an emergency-fund link does to an account's use. No React, no I/O. Every output
// satisfies the `accounts_use_shape` check (20261028000600).
import type { AccountUse } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';

export interface AccountUseColumns {
  use: 'everyday' | 'mixed' | 'dedicated' | 'untouched' | null;
  use_purpose: 'emergency' | 'envelope' | null;
  use_envelope_id: string | null;
  use_extra_set_aside: number | null;
}

const CLEARED: AccountUseColumns = { use: null, use_purpose: null, use_envelope_id: null, use_extra_set_aside: null };

/** The four columns for a use. null (not stated) clears all four. */
export function accountUsePatch(use: AccountUse | null): AccountUseColumns {
  if (use === null) return { ...CLEARED };
  switch (use.kind) {
    case 'everyday':
      return { ...CLEARED, use: 'everyday' };
    case 'untouched':
      return { ...CLEARED, use: 'untouched' };
    case 'mixed':
      return { ...CLEARED, use: 'mixed', use_extra_set_aside: use.extraSetAside };
    case 'dedicated':
      return use.purpose.kind === 'emergency'
        ? { ...CLEARED, use: 'dedicated', use_purpose: 'emergency' }
        : { ...CLEARED, use: 'dedicated', use_purpose: 'envelope', use_envelope_id: use.purpose.envelopeId };
  }
}

/** Inverse of accountUsePatch. A dedicated-envelope row without an envelope id reads as unanswered (null). */
export function accountUseOfRow(row: AccountUseColumns): AccountUse | null {
  switch (row.use) {
    case 'everyday':
      return { kind: 'everyday' };
    case 'untouched':
      return { kind: 'untouched' };
    case 'mixed':
      return { kind: 'mixed', extraSetAside: row.use_extra_set_aside === null ? null : minorUnits(row.use_extra_set_aside) };
    case 'dedicated':
      if (row.use_purpose === 'emergency') return { kind: 'dedicated', purpose: { kind: 'emergency' } };
      if (row.use_purpose === 'envelope' && row.use_envelope_id !== null) {
        return { kind: 'dedicated', purpose: { kind: 'envelope', envelopeId: row.use_envelope_id } };
      }
      return null;
    default:
      return null;
  }
}

/**
 * D-04: what the account's use becomes when the emergency fund is held there. null = no change needed.
 * Already dedicated-emergency or mixed: unchanged. Also used for spending (`holdsSpending`): mixed.
 * Otherwise (not stated, untouched, a different dedicated purpose, or everyday while it only holds the fund):
 * dedicated emergency.
 */
export function emergencyLinkUse(current: AccountUse | null, holdsSpending: boolean): AccountUse | null {
  if (current !== null) {
    if (current.kind === 'mixed') return null;
    if (current.kind === 'dedicated' && current.purpose.kind === 'emergency') return null;
  }
  return holdsSpending ? { kind: 'mixed', extraSetAside: null } : { kind: 'dedicated', purpose: { kind: 'emergency' } };
}
