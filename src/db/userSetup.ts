// 09-13 (D-30): the person's private level, onboarding answers and per-feature switches. Own rows only (RLS); not lock-gated,
// so they work while the household is locked (D-03).
import type { OnboardingAnswers } from '@/features/levels/onboardingAnswers';
import { toDbError } from './errors';
import type { DbClient } from './rows';

export type UserLevel = 1 | 2 | 3 | 4;

export interface UserSetup {
  userId: string;
  level: UserLevel | null;
  levelSource: 'answers' | 'skipped' | 'existing' | 'manual' | null;
  answers: OnboardingAnswers;
  resumeStep: string | null;
  completedAt: string | null;
  partnerVersion: boolean;
  existingCard: 'pending' | 'dismissed' | 'done' | null;
  recordsAppliedAt: string | null;
  version: number;
}

/** What a caller may change; the user id and version are set by the layer. */
export type UserSetupPatch = Partial<Omit<UserSetup, 'userId' | 'version'>>;

interface UserSetupDb {
  user_id: string;
  level: number | null;
  level_source: UserSetup['levelSource'];
  answers: OnboardingAnswers | null;
  resume_step: string | null;
  completed_at: string | null;
  partner_version: boolean;
  existing_card: UserSetup['existingCard'];
  records_applied_at: string | null;
  version: number;
}

const SETUP_COLUMNS =
  'user_id, level, level_source, answers, resume_step, completed_at, partner_version, existing_card, records_applied_at, version';

function levelOf(n: number | null): UserLevel | null {
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
}

function fromDb(r: UserSetupDb): UserSetup {
  return {
    userId: r.user_id,
    level: levelOf(r.level),
    levelSource: r.level_source,
    answers: r.answers ?? {},
    resumeStep: r.resume_step,
    completedAt: r.completed_at,
    partnerVersion: r.partner_version,
    existingCard: r.existing_card,
    recordsAppliedAt: r.records_applied_at,
    version: r.version,
  };
}

const PATCH_COLUMNS: Record<keyof UserSetupPatch, string> = {
  level: 'level',
  levelSource: 'level_source',
  answers: 'answers',
  resumeStep: 'resume_step',
  completedAt: 'completed_at',
  partnerVersion: 'partner_version',
  existingCard: 'existing_card',
  recordsAppliedAt: 'records_applied_at',
};

export async function fetchUserSetup(client: DbClient, userId: string): Promise<UserSetup | null> {
  const { data, error, status } = await client
    .from('user_setup')
    .select(SETUP_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw toDbError(error, status);
  return data ? fromDb(data as UserSetupDb) : null;
}

/** Upsert on user_id. `nextVersion` is the cached version plus one (the first write is 1). */
export async function upsertUserSetup(
  client: DbClient,
  userId: string,
  patch: UserSetupPatch,
  nextVersion: number
): Promise<UserSetup> {
  const row: Record<string, unknown> = { user_id: userId, version: nextVersion, updated_at: new Date().toISOString() };
  for (const key of Object.keys(patch) as (keyof UserSetupPatch)[]) {
    const col = PATCH_COLUMNS[key];
    if (col === undefined) throw new TypeError(`user_setup: unknown column ${String(key)}`);
    row[col] = patch[key];
  }
  const { data, error, status } = await client
    .from('user_setup')
    .upsert(row, { onConflict: 'user_id' })
    .select(SETUP_COLUMNS)
    .single();
  if (error) throw toDbError(error, status);
  return fromDb(data as UserSetupDb);
}

export async function fetchFeatureSwitches(client: DbClient, userId: string): Promise<Record<string, boolean>> {
  const { data, error, status } = await client
    .from('feature_switches')
    .select('feature_id, is_on')
    .eq('user_id', userId);
  if (error) throw toDbError(error, status);
  const out: Record<string, boolean> = {};
  for (const r of (data ?? []) as { feature_id: string; is_on: boolean }[]) out[r.feature_id] = r.is_on;
  return out;
}

export async function upsertFeatureSwitch(
  client: DbClient,
  userId: string,
  featureId: string,
  isOn: boolean
): Promise<void> {
  const { error, status } = await client
    .from('feature_switches')
    .upsert(
      { user_id: userId, feature_id: featureId, is_on: isOn, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,feature_id' }
    );
  if (error) throw toDbError(error, status);
}

/**
 * Onboarding Apply: delete every switch, then insert the new map (two calls, in that order). A partial failure (delete done,
 * insert not) is retried by the write queue, and replaying both steps is safe: the delete is idempotent and the insert is an upsert.
 */
export async function replaceFeatureSwitches(
  client: DbClient,
  userId: string,
  map: Readonly<Record<string, boolean>>
): Promise<void> {
  const del = await client.from('feature_switches').delete().eq('user_id', userId);
  if (del.error) throw toDbError(del.error, del.status);
  const now = new Date().toISOString();
  const rows = Object.entries(map).map(([feature_id, is_on]) => ({ user_id: userId, feature_id, is_on, updated_at: now }));
  if (rows.length === 0) return;
  const ins = await client.from('feature_switches').upsert(rows, { onConflict: 'user_id,feature_id' });
  if (ins.error) throw toDbError(ins.error, ins.status);
}
