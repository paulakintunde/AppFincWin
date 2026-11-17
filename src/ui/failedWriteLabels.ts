/**
 * Pure mapping from a parked failed write to the words shown for it. No React, no I/O. The reason is declarative and
 * comes from the failure kind, or from a known Postgres or PostgREST code; anything else reads as the generic line.
 */
import type { WriteEntity } from '@/db/errors';
import type { FailedWrite } from '@/data/sync/failedWrites';

/**
 * 08-15: every reason code a household RPC can refuse with, mapped to one copy key. New server reasons must be added here
 * (failedWriteLabels.test.ts scans the 20261122 migrations and fails on a code that is not). Keys come from 08-12
 * (household.sharing.*, household.join.*), 08-16 (household.members.reasons.*), household.settle.* and 08-15
 * (household.reasons.*).
 *
 * Some copy has a parameter: stale_version and version_conflict take {{name}} (who changed it first, from `updated_by`
 * through the member-label resolver); join invalid takes {{inviter}}.
 */
export const HOUSEHOLD_REASON_KEYS = {
  // sharing a line (08-10)
  linked_line_personal: 'household.sharing.reasons.linked_line_personal',
  not_creator: 'household.sharing.reasons.not_creator',
  line_locked: 'household.sharing.reasons.settled_line',
  settled_line: 'household.sharing.reasons.settled_line',
  version_conflict: 'household.sharing.reasons.stale_version',
  stale_version: 'household.sharing.reasons.stale_version',
  no_household: 'household.sharing.reasons.not_in_household',
  not_in_household: 'household.sharing.reasons.not_in_household',
  shared_lines_exist: 'household.sharing.reasons.shared_lines_exist',
  needs_connection: 'household.sharing.reasons.needs_connection',
  offline: 'household.reasons.offline',
  joint_account_line: 'household.reasons.joint_account_line',
  rate_unavailable: 'household.reasons.rate_unavailable',
  split_weights_zero: 'household.reasons.split_weights_zero',
  amounts_not_total: 'household.reasons.amounts_not_total',
  no_other_member: 'household.reasons.no_other_member',
  already_shared: 'household.reasons.already_shared',
  not_shared: 'household.reasons.not_shared',
  invalid_rule: 'household.reasons.invalid_rule',
  invalid_category: 'household.reasons.invalid_category',
  invalid_scope: 'household.reasons.invalid_scope',
  not_in_series: 'household.reasons.not_in_series',
  amount_rule_not_for_series: 'household.reasons.amount_rule_not_for_series',
  not_found: 'household.reasons.not_found',
  // members, weights, currency (08-02, 08-16)
  not_owner: 'household.reasons.not_owner',
  not_allowed: 'household.members.reasons.not_allowed',
  not_member: 'household.members.reasons.not_member',
  colour_taken: 'household.members.reasons.colour_taken',
  invalid_name: 'household.members.reasons.invalid_name',
  invalid_role: 'household.members.reasons.invalid_role',
  owner_label_fixed: 'household.members.reasons.owner_label_fixed',
  members_mismatch: 'household.members.reasons.members_mismatch',
  invalid_weight: 'household.members.reasons.weights_invalid',
  not_100: 'household.members.reasons.weights_invalid',
  all_zero: 'household.members.weights.lastHolder',
  unknown_currency: 'household.reasons.unknown_currency',
  // invites (08-03, 08-09)
  invalid: 'household.join.errors.invalid',
  slow_down: 'household.join.errors.rateLimited',
  in_other_household: 'household.join.inAnother.title',
  full: 'household.sharing.reasons.household_full',
  household_full: 'household.sharing.reasons.household_full',
  not_open: 'household.reasons.not_open',
  not_restorable: 'household.reasons.not_restorable',
  try_again: 'household.reasons.try_again',
  // settling up (08-11, 08-14)
  lines_changed: 'household.settle.linesChanged',
  nothing_owed: 'household.reasons.nothing_owed',
  account_not_yours: 'household.reasons.account_not_yours',
  payer_account_gone: 'household.reasons.payer_account_gone',
  not_pending: 'household.reasons.not_pending',
  lapsed: 'household.reasons.lapsed',
  not_confirmed: 'household.reasons.not_confirmed',
  undo_window_closed: 'household.reasons.undo_window_closed',
  party_left: 'household.reasons.party_left',
  member_still_here: 'household.reasons.member_still_here',
  too_soon: 'household.reasons.too_soon',
  already_set: 'household.reasons.already_set',
  not_receiver: 'household.reasons.not_receiver',
  not_payer: 'household.reasons.not_payer',
  not_departed: 'household.reasons.not_departed',
  // leaving, removing, reconnecting (08-14)
  alone: 'household.reasons.alone',
  pick_new_owner: 'household.reasons.pick_new_owner',
  already_restored: 'household.reasons.already_restored',
  window_closed: 'household.reasons.window_closed',
} as const;

export type HouseholdReasonKey = (typeof HOUSEHOLD_REASON_KEYS)[keyof typeof HOUSEHOLD_REASON_KEYS] | 'household.reasons.generic';

/** The copy key for a household refusal code, or null when the code is not one of ours. */
export function householdReasonKey(reason: string): HouseholdReasonKey | null {
  return Object.prototype.hasOwnProperty.call(HOUSEHOLD_REASON_KEYS, reason)
    ? HOUSEHOLD_REASON_KEYS[reason as keyof typeof HOUSEHOLD_REASON_KEYS]
    : null;
}

/** Like householdReasonKey, but an unknown code reads as the generic line instead of nothing (never a blank or a raw code). */
export function householdReasonKeyOrGeneric(reason: string): HouseholdReasonKey {
  return householdReasonKey(reason) ?? 'household.reasons.generic';
}

export type FailedEntityKey = `sync.failedSheet.entity.${WriteEntity | 'unknown'}`;
export type FailedReasonKey =
  | 'sync.failedSheet.reason.rejected'
  | 'sync.failedSheet.reason.notFound'
  | 'sync.failedSheet.reason.conflict'
  | 'sync.failedSheet.reason.duplicate'
  | 'sync.failedSheet.reason.missingReference'
  | 'sync.failedSheet.reason.notAllowedValue'
  | 'sync.failedSheet.reason.unknownField'
  | 'sync.failedSheet.reason.copyNotSaved'
  | 'sync.failedSheet.reason.generic'
  | HouseholdReasonKey;

const ENTITIES: ReadonlySet<string> = new Set<WriteEntity>([
  'transactions',
  'accounts',
  'custom_currencies',
  'profiles',
  'categories',
  'recurring_series',
  'category_rules',
  'undo_log',
  'import_profiles',
  'households',
  'dismissed_series_offers',
  'decide_checks',
  'debts',
  'decide_links',
  'decide_changes',
  'savings_goals',
  'decide_settings',
  'statement_periods',
  'decide_answers',
  'recurring_dismissals',
  'income_payer_prompts',
  'holdings',
  'holding_lots',
  'decide_check_history',
]);

export function failedEntityKey(entity: string): FailedEntityKey {
  return ENTITIES.has(entity) ? (`sync.failedSheet.entity.${entity}` as FailedEntityKey) : 'sync.failedSheet.entity.unknown';
}

const NAME_MAX = 40;

/** The attempted payload's own name or title, when it has one; trimmed and capped. Null otherwise. */
export function failedWriteName(attempted: Record<string, unknown>): string | null {
  for (const field of ['name', 'title', 'label'] as const) {
    const value = attempted[field];
    if (typeof value === 'string' && value.trim() !== '') {
      const trimmed = value.trim();
      return trimmed.length > NAME_MAX ? `${trimmed.slice(0, NAME_MAX - 1)}…` : trimmed;
    }
  }
  return null;
}

export function failedReasonKey(entry: Pick<FailedWrite, 'kind' | 'code'> & Partial<Pick<FailedWrite, 'entity' | 'attempted'>>
): FailedReasonKey {
  if (entry.entity === 'decide_checks' && typeof entry.attempted?.reopenedFrom === 'string') {
    return 'sync.failedSheet.reason.copyNotSaved';
  }
  // 08-15: a household RPC refusal parks the reason code itself (settledWriteErrorCode), so it reads in its own words.
  if (entry.kind === 'rejected' && householdReasonKey(entry.code) !== null) {
    return householdReasonKeyOrGeneric(entry.code);
  }
  if (entry.kind === 'conflict') return 'sync.failedSheet.reason.conflict';
  if (entry.kind === 'not-found') return 'sync.failedSheet.reason.notFound';
  switch (entry.code) {
    case '42501':
      return 'sync.failedSheet.reason.rejected';
    case '23505':
      return 'sync.failedSheet.reason.duplicate';
    case '23503':
      return 'sync.failedSheet.reason.missingReference';
    case '23514':
    case '23502':
    case '22P02':
      return 'sync.failedSheet.reason.notAllowedValue';
    case 'PGRST204':
      return 'sync.failedSheet.reason.unknownField';
    default:
      return entry.code === '' ? 'sync.failedSheet.reason.generic' : 'sync.failedSheet.reason.rejected';
  }
}
