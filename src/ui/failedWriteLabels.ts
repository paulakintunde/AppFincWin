/**
 * Pure mapping from a parked failed write to the words shown for it. No React, no I/O. The reason is declarative and
 * comes from the failure kind, or from a known Postgres or PostgREST code; anything else reads as the generic line.
 */
import type { WriteEntity } from '@/db/errors';
import type { FailedWrite } from '@/data/sync/failedWrites';

export type FailedEntityKey = `sync.failedSheet.entity.${WriteEntity | 'unknown'}`;
export type FailedReasonKey =
  | 'sync.failedSheet.reason.rejected'
  | 'sync.failedSheet.reason.notFound'
  | 'sync.failedSheet.reason.conflict'
  | 'sync.failedSheet.reason.duplicate'
  | 'sync.failedSheet.reason.missingReference'
  | 'sync.failedSheet.reason.notAllowedValue'
  | 'sync.failedSheet.reason.unknownField'
  | 'sync.failedSheet.reason.generic';

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

export function failedReasonKey(entry: Pick<FailedWrite, 'kind' | 'code'>): FailedReasonKey {
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
