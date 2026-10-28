// 05.2 (DSU-15): the user's answer for a payer's income kind and whether it counts as available or kept. One live row
// per household + payer_key. Key lists mirror the 05.2-03 grants exactly.

import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export interface IncomePayerPromptRow {
  id: string;
  household_id: string;
  payer_key: string;
  income_kind: string;
  counts_as: 'available' | 'kept';
  apply_to_future: boolean;
  created_by: string | null;
  deleted_at: string | null;
  version: number;
}

export type NewPayerPrompt = Pick<
  IncomePayerPromptRow,
  'id' | 'household_id' | 'payer_key' | 'income_kind' | 'counts_as' | 'apply_to_future'
>;
export type PayerPromptPatch = Partial<Pick<IncomePayerPromptRow, 'income_kind' | 'counts_as' | 'apply_to_future' | 'deleted_at'>>;

export const PAYER_PROMPT_COLUMNS =
  'id, household_id, payer_key, income_kind, counts_as, apply_to_future, created_by, deleted_at, version';
export const PAYER_PROMPT_INSERT_KEYS = [
  'id',
  'household_id',
  'payer_key',
  'income_kind',
  'counts_as',
  'apply_to_future',
] as const satisfies readonly (keyof NewPayerPrompt)[];
export const PAYER_PROMPT_PATCH_KEYS = [
  'income_kind',
  'counts_as',
  'apply_to_future',
  'deleted_at',
] as const satisfies readonly (keyof PayerPromptPatch)[];

const ENTITY = 'income_payer_prompts' as const;
const UNIQUE_VIOLATION = '23505';

export async function fetchPayerPrompts(client: DbClient, householdId: string): Promise<IncomePayerPromptRow[]> {
  const { data, error, status } = await client
    .from('income_payer_prompts')
    .select(PAYER_PROMPT_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw toDbError(error, status);
  return (data as IncomePayerPromptRow[] | null) ?? [];
}

async function fetchPayerPrompt(client: DbClient, id: string): Promise<IncomePayerPromptRow | null> {
  const { data, error, status } = await client.from('income_payer_prompts').select(PAYER_PROMPT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as IncomePayerPromptRow | null) ?? null;
}

/** A duplicate client id is read back as landed (MON-08). */
export async function insertPayerPrompt(client: DbClient, row: NewPayerPrompt): Promise<IncomePayerPromptRow> {
  assertAllowedKeys(row as unknown as Record<string, unknown>, PAYER_PROMPT_INSERT_KEYS, 'insertPayerPrompt');
  const { data, error, status } = await client.from('income_payer_prompts').insert(row).select(PAYER_PROMPT_COLUMNS).single();
  if (!error) return data as IncomePayerPromptRow;
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchPayerPrompt(client, row.id);
    if (existing) return existing;
  }
  throw toDbError(error, status);
}

export async function updatePayerPrompt(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: PayerPromptPatch
): Promise<IncomePayerPromptRow> {
  assertAllowedKeys(patch, PAYER_PROMPT_PATCH_KEYS, 'updatePayerPrompt');
  const { data, error, status } = await client
    .from('income_payer_prompts')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(PAYER_PROMPT_COLUMNS);
  if (error) throw toDbError(error, status);
  const rows = (data as IncomePayerPromptRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as IncomePayerPromptRow;
  const serverRow = await fetchPayerPrompt(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
